// Live smoke verification of the deployed static host. Asserts every M7 host
// rule at the real URL. Usage: node deploy/cloudflare/verify.mjs https://eden.fluffyswag.com
const base = process.argv[2];
if (base === undefined) {
  console.error('usage: node verify.mjs <base-url>');
  process.exit(1);
}
let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? ' — ' + detail : ''));
  if (!ok) failures += 1;
};
const get = (path) => fetch(new URL(path, base), { redirect: 'manual' });

const login = await get('/login');
const csp = login.headers.get('content-security-policy') ?? '';
check('/login 200', login.status === 200, String(login.status));
check("/login CSP hash-based", csp.includes("script-src 'self' 'sha256-"));
check('/login CSP strict (no unsafe-inline/unsafe-eval)', !csp.includes('unsafe-inline') && !csp.includes('unsafe-eval'));
check('/login no-cache', (login.headers.get('cache-control') ?? '').includes('no-cache'));
const html = await login.text();

const root = await get('/');
check('/ CSP present', (root.headers.get('content-security-policy') ?? '').includes('sha256-'));

const rsc = await get('/login.txt');
check('/login.txt text/x-component', (rsc.headers.get('content-type') ?? '').includes('text/x-component'), rsc.headers.get('content-type') ?? 'none');
check('/login.txt no-cache', (rsc.headers.get('cache-control') ?? '').includes('no-cache'));

const sw = await get('/sw.js');
check('/sw.js 200', sw.status === 200, String(sw.status));
check('/sw.js no-cache', (sw.headers.get('cache-control') ?? '').includes('no-cache'));

const manifest = await get('/manifest.webmanifest');
check('/manifest.webmanifest 200', manifest.status === 200, String(manifest.status));
check('/manifest.webmanifest type', (manifest.headers.get('content-type') ?? '').includes('application/manifest+json'), manifest.headers.get('content-type') ?? 'none');
check('/manifest.webmanifest no-cache', (manifest.headers.get('cache-control') ?? '').includes('no-cache'));

const assetMatch = html.match(/\/_next\/static\/[^"']+?\.(?:js|css)/);
check('hashed asset referenced by /login', assetMatch !== null);
if (assetMatch !== null) {
  const asset = await get(assetMatch[0]);
  check('hashed asset 200', asset.status === 200, String(asset.status));
  check('hashed asset immutable', (asset.headers.get('cache-control') ?? '').includes('immutable'), asset.headers.get('cache-control') ?? 'none');
}

const missing = await get('/definitely-not-a-route-9f2c');
check('unknown route 404', missing.status === 404, String(missing.status));
check('404 page carries CSP', (missing.headers.get('content-security-policy') ?? '').includes('sha256-'));

const artifact = await get('/.eden-csp-routes.json');
check('CSP artifact not publicly served', artifact.status === 404, String(artifact.status));

console.log(failures === 0 ? 'ALL CHECKS PASSED' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
