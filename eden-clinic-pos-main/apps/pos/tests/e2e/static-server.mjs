import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';

const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
};

const root = resolve(process.cwd(), argumentValue('--root', 'out'));
const host = '127.0.0.1';
const port = Number(argumentValue('--port', '4173'));
const routeHeadersPath = resolve(root, '.eden-csp-routes.json');
const unionHeaderPath = resolve(root, '.eden-csp-union.txt');
const routeHeaders = existsSync(routeHeadersPath) ? JSON.parse(readFileSync(routeHeadersPath, 'utf8')) : {};
const unionHeader = existsSync(unionHeaderPath) ? readFileSync(unionHeaderPath, 'utf8').trim() : undefined;
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/x-component',
  '.woff2': 'font/woff2',
};

const sha256Source = (source) => `'sha256-${createHash('sha256').update(source).digest('base64')}'`;
const routeForFile = (relativeName) => {
  if (relativeName === 'index.html') return '/';
  if (relativeName.endsWith('/index.html')) return `/${relativeName.slice(0, -'/index.html'.length)}`;
  return `/${relativeName.slice(0, -'.html'.length)}`;
};

const sendTripwire = (response) => {
  if (unionHeader === undefined) {
    send(response, 503, 'CSP artifacts unavailable');
    return;
  }
  const probe = "try { eval('1 + 1'); document.documentElement.dataset.evalBlocked = 'false'; } catch { document.documentElement.dataset.evalBlocked = 'true'; }";
  const policy = unionHeader.replace('script-src ', `script-src ${sha256Source(probe)} `);
  response.writeHead(200, {
    'cache-control': 'no-cache',
    'content-security-policy': policy,
    'content-type': 'text/html; charset=utf-8',
  });
  response.end(`<!doctype html><html><body><script>${probe}</script><script>document.documentElement.dataset.unhashedScript = 'ran';</script></body></html>`);
};

const send = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
};

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);
  if (url.pathname === '/__csp-tripwire') {
    sendTripwire(response);
    return;
  }
  const pathname = decodeURIComponent(url.pathname).replace(/^[/\\]+/, '');
  let filePath = resolve(root, pathname || 'index.html');

  const relativePath = relative(root, filePath);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    send(response, 403, 'Forbidden');
    return;
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    const indexPath = resolve(filePath, 'index.html');
    const htmlSibling = filePath + '.html';
    filePath = existsSync(indexPath) ? indexPath : htmlSibling;
  } else if (!existsSync(filePath) && extname(filePath) === '') {
    filePath = filePath + '.html';
  }

  let status = 200;
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // Serve the exported not-found page the way a production static host would.
    const notFoundPath = resolve(root, '404.html');
    if (!existsSync(notFoundPath)) {
      send(response, 404, 'Not found');
      return;
    }
    filePath = notFoundPath;
    status = 404;
  }

  const relativeName = relative(root, filePath).replaceAll('\\', '/');
  const headers = {
    'content-type': types[extname(filePath)] ?? 'application/octet-stream',
  };
  if (relativeName.endsWith('.html')) {
    const policy = routeHeaders[routeForFile(relativeName)];
    if (policy !== undefined) headers['content-security-policy'] = policy;
  }
  if (relativeName.endsWith('.html') || relativeName.endsWith('.txt') || relativeName === 'sw.js' || relativeName === 'manifest.webmanifest') {
    headers['cache-control'] = 'no-cache';
  }
  if (relativeName.startsWith('_next/static/')) {
    headers['cache-control'] = 'public, max-age=31536000, immutable';
  }
  response.writeHead(status, headers);
  createReadStream(filePath).pipe(response);
}).listen(port, host);
