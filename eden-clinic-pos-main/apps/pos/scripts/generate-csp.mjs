import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

function toPosixPath(path) {
  return path.replaceAll('\\', '/');
}

async function walkFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(root, path));
    if (entry.isFile()) files.push({ path, relativePath: toPosixPath(relative(root, path)) });
  }
  return files;
}

function routeForHtml(relativePath) {
  if (relativePath === 'index.html') return '/';
  if (relativePath.endsWith('/index.html')) return `/${relativePath.slice(0, -'/index.html'.length)}`;
  return `/${relativePath.slice(0, -'.html'.length)}`;
}

function sha256(contents) {
  return `sha256-${createHash('sha256').update(contents).digest('base64')}`;
}

function extractHashes(html, route) {
  if (/<[^>]+\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i.test(html)) {
    throw new Error(`CSP generation rejects inline style attribute on ${route}`);
  }

  const scriptHashes = [];
  const styleHashes = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  const stylePattern = new RegExp(`<${'style'}\\b[^>]*>([\\s\\S]*?)<\\/${'style'}\\s*>`, 'gi');

  for (const match of html.matchAll(scriptPattern)) {
    if (!/\bsrc\s*=/i.test(match[1])) scriptHashes.push(sha256(match[2]));
  }
  for (const match of html.matchAll(stylePattern)) styleHashes.push(sha256(match[1]));

  return { scriptHashes, styleHashes };
}

function parseApiOrigin(apiBaseUrl) {
  const url = new URL(apiBaseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('CSP API base URL must be an HTTP(S) origin without credentials');
  }
  return url.origin;
}

function policy({ scriptHashes, styleHashes, apiOrigin }) {
  const scriptSources = ["'self'", ...scriptHashes.map((hash) => `'${hash}'`)];
  const styleSources = ["'self'", ...styleHashes.map((hash) => `'${hash}'`)];
  return [
    "default-src 'self'",
    "form-action 'self'",
    `script-src ${scriptSources.join(' ')}`,
    `style-src ${styleSources.join(' ')}`,
    "img-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Generate deployable strict-CSP maps from the exact exported HTML bytes.
 * The per-route map is preferred; the union header is the portable fallback
 * for hosts which cannot vary headers by route.
 */
export async function generateCspArtifacts({ outDir, apiBaseUrl }) {
  const apiOrigin = parseApiOrigin(apiBaseUrl);
  const htmlFiles = (await walkFiles(outDir))
    .filter((file) => file.relativePath.endsWith('.html'))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  if (htmlFiles.length === 0) throw new Error('CSP generation requires at least one exported HTML route');

  const routeHashes = [];
  for (const file of htmlFiles) {
    const route = routeForHtml(file.relativePath);
    const html = await readFile(file.path, 'utf8');
    routeHashes.push({ route, ...extractHashes(html, route) });
  }

  const routeHeaders = Object.fromEntries(routeHashes.map(({ route, scriptHashes, styleHashes }) => [
    route,
    policy({ scriptHashes, styleHashes, apiOrigin }),
  ]));
  const unionHeader = policy({
    scriptHashes: [...new Set(routeHashes.flatMap(({ scriptHashes }) => scriptHashes))].sort(),
    styleHashes: [...new Set(routeHashes.flatMap(({ styleHashes }) => styleHashes))].sort(),
    apiOrigin,
  });

  await writeFile(join(outDir, '.eden-csp-routes.json'), `${JSON.stringify(routeHeaders, null, 2)}\n`);
  await writeFile(join(outDir, '.eden-csp-union.txt'), `${unionHeader}\n`);
  return { routeHeaders, unionHeader };
}
