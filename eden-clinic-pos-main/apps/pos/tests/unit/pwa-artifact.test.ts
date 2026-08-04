import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';

type PwaArtifact = {
  cacheVersion: string;
  precacheUrls: string[];
  routeHeaders: Record<string, string>;
  unionHeader: string;
};

type PwaBuilder = {
  buildPwaArtifact(input: { outDir: string; apiBaseUrl: string }): Promise<PwaArtifact>;
};

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const publicRoot = join(appRoot, 'public');
const fixtureRoots: string[] = [];
const workerTemplate = `const CACHE_NAME = 'eden-shell-__EDEN_CACHE_VERSION__';\nconst PRECACHE_URLS = __EDEN_PRECACHE_URLS__;\n`;

afterEach(async () => {
  await Promise.all(fixtureRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function loadBuilder(): Promise<PwaBuilder> {
  const modulePath = '../../scripts/build-pwa.mjs';
  return import(modulePath) as Promise<PwaBuilder>;
}

async function createFixture(): Promise<string> {
  const outDir = await mkdtemp(join(tmpdir(), 'eden-m7-pwa-'));
  fixtureRoots.push(outDir);
  await mkdir(join(outDir, '_next/static/chunks'), { recursive: true });
  await mkdir(join(outDir, 'icons'), { recursive: true });
  await writeFile(join(outDir, 'index.html'), '<!doctype html><html><head><style>body{display:grid}</style><script>window.route="home"</script></head><body>home</body></html>');
  await writeFile(join(outDir, 'login.html'), '<!doctype html><html><head><script>window.route="login"</script></head><body>login</body></html>');
  await writeFile(join(outDir, 'login.txt'), 'RSC payload');
  await writeFile(join(outDir, '_next/static/chunks/app-123.js'), 'export const app = true;');
  await writeFile(join(outDir, 'sw.js'), workerTemplate);
  await writeFile(join(outDir, 'manifest.webmanifest'), JSON.stringify({ icons: [{ src: '/icons/eden-192.png' }] }));
  await writeFile(join(outDir, 'icons/eden-192.png'), Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return outDir;
}

async function restoreWorker(outDir: string): Promise<void> {
  await writeFile(join(outDir, 'sw.js'), workerTemplate);
}

test('stamps a reproducible content-derived shell cache and generated CSP headers', async () => {
  const outDir = await createFixture();
  const { buildPwaArtifact } = await loadBuilder();

  const first = await buildPwaArtifact({ outDir, apiBaseUrl: 'http://127.0.0.1:4010/path-is-not-authorized' });
  await restoreWorker(outDir);
  const identicalRebuild = await buildPwaArtifact({ outDir, apiBaseUrl: 'http://127.0.0.1:4010' });

  expect(first.precacheUrls).toContain('/');
  expect(first.precacheUrls).toContain('/login');
  expect(first.precacheUrls).toContain('/login.txt');
  expect(first.routeHeaders['/login']).toContain("script-src 'self' 'sha256-");
  expect(first.routeHeaders['/']).toContain("style-src 'self' 'sha256-");
  expect(first.routeHeaders['/login']).toContain("connect-src 'self' http://127.0.0.1:4010");
  expect(first.unionHeader).toContain('sha256-');
  expect(first.unionHeader).not.toContain('unsafe-inline');
  expect(first.unionHeader).not.toContain('unsafe-eval');
  expect(first.unionHeader).toContain("form-action 'self'");
  expect(first.cacheVersion).toBe(identicalRebuild.cacheVersion);
  expect(await readFile(join(outDir, 'sw.js'), 'utf8')).not.toContain('__EDEN_');

  await writeFile(join(outDir, 'login.html'), '<!doctype html><html><head><script>window.route="login"</script></head><body>login!</body></html>');
  await restoreWorker(outDir);
  const changed = await buildPwaArtifact({ outDir, apiBaseUrl: 'http://127.0.0.1:4010' });

  expect(changed.cacheVersion).not.toBe(first.cacheVersion);
});

test('rejects inline style attributes rather than weakening the CSP', async () => {
  const outDir = await createFixture();
  await writeFile(join(outDir, 'login.html'), '<!doctype html><html><body style="width:1px">login</body></html>');
  const { buildPwaArtifact } = await loadBuilder();

  await expect(buildPwaArtifact({ outDir, apiBaseUrl: 'http://127.0.0.1:4010' })).rejects.toThrow('style attribute');
});

test('committed manifest has stable install identity and readable purpose-specific icons', async () => {
  const manifest = JSON.parse(await readFile(join(publicRoot, 'manifest.webmanifest'), 'utf8')) as {
    id: string;
    start_url: string;
    display: string;
    icons: Array<{ src: string; sizes: string; purpose: string }>;
  };

  expect(manifest.id).toBe('/');
  expect(manifest.start_url).toBe('/login');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
    expect.objectContaining({ sizes: '192x192', purpose: 'maskable' }),
    expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
    expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
  ]));

  for (const icon of manifest.icons) {
    const bytes = await readFile(join(publicRoot, icon.src));
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(bytes.readUInt32BE(16)).toBe(Number.parseInt(icon.sizes, 10));
    expect(bytes.readUInt32BE(20)).toBe(Number.parseInt(icon.sizes, 10));
  }
});

test('the first worker activation does not claim or reload an existing client', async () => {
  const worker = await readFile(join(publicRoot, 'sw.js'), 'utf8');

  expect(worker).not.toContain('clients.claim');
});
