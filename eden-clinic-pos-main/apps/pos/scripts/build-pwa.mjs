import { createHash } from 'node:crypto';
import { access, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCspArtifacts } from './generate-csp.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = join(scriptDir, '..');
const ignoredArtifacts = new Set(['sw.js', '.eden-csp-routes.json', '.eden-csp-union.txt']);

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

function exportUrl(relativePath) {
  if (relativePath === 'index.html') return '/';
  if (relativePath.endsWith('/index.html')) return `/${relativePath.slice(0, -'/index.html'.length)}`;
  if (relativePath.endsWith('.html')) return `/${relativePath.slice(0, -'.html'.length)}`;
  return `/${relativePath}`;
}

function hash(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function assertManifestIcons(outDir) {
  const manifestPath = join(outDir, 'manifest.webmanifest');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    throw new Error('manifest.webmanifest must declare icons');
  }
  await Promise.all(manifest.icons.map(async ({ src }) => {
    if (typeof src !== 'string' || !src.startsWith('/')) throw new Error('manifest icon source must be root-relative');
    await access(join(outDir, src));
  }));
}

/**
 * Stamp the worker from a completed static export. The version deliberately
 * covers the bytes (not merely URLs) of all precached files so route-shell
 * changes always install a new worker.
 */
export async function buildPwaArtifact({ outDir, apiBaseUrl }) {
  const { routeHeaders, unionHeader } = await generateCspArtifacts({ outDir, apiBaseUrl });
  await assertManifestIcons(outDir);

  const assets = (await walkFiles(outDir))
    .filter((file) => !ignoredArtifacts.has(file.relativePath))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const filesWithHashes = await Promise.all(assets.map(async (file) => ({
    ...file,
    contentHash: hash(await readFile(file.path)),
  })));
  const cacheVersion = hash(filesWithHashes.map(({ relativePath, contentHash }) => `${relativePath}\0${contentHash}`).join('\n'));
  const precacheUrls = filesWithHashes.map(({ relativePath }) => exportUrl(relativePath));

  const workerPath = join(outDir, 'sw.js');
  const workerTemplate = await readFile(workerPath, 'utf8');
  const stampedWorker = workerTemplate
    .replaceAll('__EDEN_CACHE_VERSION__', cacheVersion)
    .replaceAll('__EDEN_PRECACHE_URLS__', JSON.stringify(precacheUrls));
  if (stampedWorker.includes('__EDEN_')) throw new Error('Service worker has unresolved __EDEN_ placeholder');
  await writeFile(workerPath, stampedWorker);

  return { cacheVersion, precacheUrls, routeHeaders, unionHeader };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outDir = join(appRoot, 'out');
  const apiBaseUrl = process.env.NEXT_PUBLIC_EDEN_API_BASE_URL;
  if (!apiBaseUrl) throw new Error('NEXT_PUBLIC_EDEN_API_BASE_URL is required for the production build');
  await buildPwaArtifact({ outDir, apiBaseUrl });
}
