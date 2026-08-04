# Eden Clinic OS — M7 Runtime Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan inline, task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents in this workspace.

**Goal:** Deliver an installable, strict-CSP static export that survives a real browser restart offline, preserves queued sales, and safely updates only with user consent.

**Architecture:** A no-dependency post-build pipeline stamps a hand-written worker with the exact exported shell URLs and a content-derived cache version, then generates both per-route and portable-union CSP headers from the same HTML bytes. The static E2E host consumes those artifacts exactly as production must. A post-mount PWA update controller owns the worker lifecycle and composes with Sale's existing in-memory A4 cart guard; Dexie, the outbox, API client, envelope policy, and money model remain untouched.

**Tech Stack:** Next.js static export, browser Service Worker/Cache Storage/manifest APIs, Node built-ins (`crypto`, `fs`, `path`, `zlib`), React 19, TypeScript 5.9, Vitest/fake IndexedDB, Playwright 1.62, and the existing mock/static servers. No new package enters the project.

## Global Constraints

- M7 is the final v1 milestone: no API/OpenAPI change, background sync, API caching, new outbox kind, data model, session persistence, password verifier, elevation persistence, idle-lock decision, or printer transport.
- The service worker precaches only generated same-origin shell/static resources. It must never cache `/api/*`, the build-injected API origin, bootstrap/delta/outbox responses, or Dexie values.
- `sw.js` is hand-written source with explicit post-build placeholders. It activates only after an enabled, translated user Restart action; it never calls `skipWaiting()` autonomously.
- A4's `hasUncommittedCart = draft.lines.length > 0 || tenderOpen` remains memory-only and independent of queue/sync status. It guards both Switch user and M7 Restart.
- CSP is an HTTP response header, not a meta-tag fallback: no `'unsafe-inline'`, no `'unsafe-eval'`, no wildcard `connect-src`, and no inline style attributes. `connect-src` derives from `NEXT_PUBLIC_EDEN_API_BASE_URL`.
- Headers and `out/` deploy atomically. Host rules are extensionless→`.html`, `.txt`→`text/x-component`, route HTML/RSC `.txt`/`sw.js`/manifest→`Cache-Control: no-cache`, and hashed `/_next/static/**`→`public, max-age=31536000, immutable`.
- Every export E2E selector is a renderer-owned `data-testid`; never select translated text/labels. Toasts are manual-dismiss. Do not `page.goto()` an authenticated route except for the explicit reboot/reload assertions.
- Keep `tokens.css` byte-identical (597 bytes, SHA-256 `8d39f41e6710fa1edce202af74f118e76547a4172f5dc8073135e0f76eb09e82`), CSS token-only, local fonts only, and all visible strings in typed i18n dictionaries with Burmese/Chinese `// TODO(native-review)` drafts.
- Exact package versions remain pinned. M7 adds only exact transitive overrides: `postcss@8.5.25` and `sharp@0.35.3`; no direct `sharp` dependency and no `npm audit fix`.
- Git writes remain owner-session work. The sandbox authors files and runs read-only Git checks only. `outputs/m7/` and `work/m7-npm-registry-cache/` remain ignored.

---

## File structure

| File | M7 responsibility |
|---|---|
| `apps/pos/scripts/generate-csp.mjs` | Pure exported CSP hashing/map/union generator, importable by Node tests. |
| `apps/pos/scripts/build-pwa.mjs` | Walk exported `out/`, derive cache version/extensionless URLs, stamp worker, run CSP generator, validate manifest/icon artifacts. |
| `apps/pos/scripts/create-pwa-icons.mjs` | Dependency-free deterministic PNG writer used once to create the two reviewed icon assets. |
| `apps/pos/public/sw.js` | Hand-written service-worker template with only cache-version and precache placeholders. |
| `apps/pos/public/manifest.webmanifest`, `apps/pos/public/icons/*` | Static install metadata and committed 192/512 PNG app icons. |
| `apps/pos/src/app/pwaUpdate.tsx` | Browser-only registration/update controller, pure cart-safe restart gate, and context hook. |
| `apps/pos/src/app/providers.tsx`, `apps/pos/src/ui/Toast.*`, `apps/pos/src/modules/sale/SaleScreen.tsx` | Provider composition, disabled/reasoned restart toast, and Sale guard registration. |
| `apps/pos/tests/e2e/static-server.mjs` | Generated CSP header host, cache-control/MIME deployment rules, and test-only CSP tripwire. |
| `apps/pos/tests/{unit,e2e}/*m7*`, `apps/pos/tests/e2e/visuals.ts` | Artifact, restart, CSP, persistent-reboot, and target-scroll evidence. |
| `apps/pos/src/print/receipt.ts`, `apps/pos/src/modules/today/*` | Larger raster COPY marker and red negative drawer difference. |
| `apps/pos/package*.json`, `.github/workflows/ci.yml`, `.gitignore` | Exact overrides, audit gate, and M7 evidence/cache ignores. |

### Task 1: Build artifacts, PWA manifest, icons, and supply-chain remediation

**Files:**

- Create: `apps/pos/scripts/create-pwa-icons.mjs`, `apps/pos/scripts/generate-csp.mjs`, `apps/pos/scripts/build-pwa.mjs`, `apps/pos/public/manifest.webmanifest`, `apps/pos/public/icons/eden-192.png`, `apps/pos/public/icons/eden-512.png`, `apps/pos/tests/unit/pwa-artifact.test.ts`
- Modify: `apps/pos/package.json`, `apps/pos/package-lock.json`, `apps/pos/src/app/layout.tsx`, `.github/workflows/ci.yml`, `.gitignore`

**Interfaces:**

```ts
// scripts/generate-csp.mjs
export async function generateCspArtifacts(input: {
  outDir: string;
  apiBaseUrl: string;
}): Promise<{
  routeHeaders: Record<string, string>;
  unionHeader: string;
}>;

// scripts/build-pwa.mjs
export async function buildPwaArtifact(input: {
  outDir: string;
  apiBaseUrl: string;
}): Promise<{
  cacheVersion: string;
  precacheUrls: string[];
  routeHeaders: Record<string, string>;
  unionHeader: string;
}>;
```

- [ ] **Step 1: Write failing artifact tests.**

  Build a temporary `out/` fixture with `index.html`, `login.html`, one RSC `.txt`, a hashed `/_next/static/...js`, and an inline script on each HTML route. Assert that `buildPwaArtifact()`:

  ```ts
  expect(result.precacheUrls).toContain('/');
  expect(result.precacheUrls).toContain('/login');
  expect(result.precacheUrls).toContain('/login.txt');
  expect(result.routeHeaders['/login']).toContain("script-src 'self' 'sha256-");
  expect(result.routeHeaders['/login']).toContain('connect-src \'self\' http://127.0.0.1:4010');
  expect(result.unionHeader).toContain('sha256-');
  expect(result.unionHeader).not.toContain('unsafe-inline');
  expect(result.unionHeader).not.toContain('unsafe-eval');
  ```

  Add a route with `style="width:1px"` and assert generation rejects it. Parse `manifest.webmanifest`; assert stable `id: '/'`, `start_url: '/login'`, `display: 'standalone'`, 192/512 entries for both `any` and `maskable`, and readable PNG signatures/dimensions. Assert a stamped exported `sw.js` has no unresolved `__EDEN_` placeholder. Change one byte of fixture `login.html` and assert the cache version changes; rebuild identical fixture bytes and assert the cache version is identical.

- [ ] **Step 2: Run the artifact test red.**

  Run: `npm.cmd run test:unit -- pwa-artifact`

  Expected: FAIL because the generator, manifest, icons, and post-build outputs do not yet exist.

- [ ] **Step 3: Implement deterministic local icon and manifest assets.**

  `create-pwa-icons.mjs` uses only `node:zlib` and a local CRC-32/chunk writer to generate a cobalt Eden mark on cream at 192×192 and 512×512. Run it once and commit both PNG outputs; do not add an image library. Create this exact manifest shape, with separate entries rather than a dual-purpose entry:

  ```json
  {
    "id": "/",
    "name": "Eden Clinic OS",
    "short_name": "Eden",
    "start_url": "/login",
    "scope": "/",
    "display": "standalone",
    "prefer_related_applications": false,
    "background_color": "#faf9f7",
    "theme_color": "#0068f9",
    "icons": [
      { "src": "/icons/eden-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
      { "src": "/icons/eden-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
      { "src": "/icons/eden-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
      { "src": "/icons/eden-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
    ]
  }
  ```

  Link it through Next metadata and replace the stale M1 document title/description.

- [ ] **Step 4: Implement the post-build pipeline.**

  `generateCspArtifacts()` recursively reads `out/**/*.html`, rejects `style=` attributes, extracts the byte-exact contents of inline script/style elements, and computes `sha256-<base64>` values with `node:crypto`. It validates `apiBaseUrl` with `new URL()`, uses only its origin in `connect-src`, and emits:

  ```text
  out/.eden-csp-routes.json    // { "/": "…", "/login": "…" }
  out/.eden-csp-union.txt      // one complete portable header
  ```

  `buildPwaArtifact()` walks final output after Next, maps `index.html` to `/` and `name.html` to `/name`, includes static assets/fonts/manifest/icons/RSC `.txt` in the precache list, excludes `sw.js` and the CSP deployment artifacts, computes every precached file's SHA-256, then hashes the sorted `path + "\\0" + contentHash` entries into the cache version. It replaces only `__EDEN_CACHE_VERSION__` and `__EDEN_PRECACHE_URLS__` in `out/sw.js`. It throws if either placeholder remains, a manifest icon is absent, or no generated route header exists.

  Set the build script to:

  ```json
  "build": "next build && node scripts/build-pwa.mjs"
  ```

- [ ] **Step 5: Add the exact audited overrides and CI gate.**

  Add this root-level package declaration, regenerate only the lockfile with the workspace-local M7 npm cache, and do not add `sharp` as a dependency:

  ```json
  "overrides": {
    "postcss": "8.5.25",
    "sharp": "0.35.3"
  }
  ```

  Add `npm audit --omit=dev --audit-level=high` after `npm ci` in CI. Add `outputs/m7/` to `.gitignore`; retain the existing ignored `work/` hierarchy.

- [ ] **Step 6: Run artifact and audit verification green.**

  Run:

  ```powershell
  npm.cmd run test:unit -- pwa-artifact
  $env:NEXT_PUBLIC_EDEN_API_BASE_URL='http://127.0.0.1:4010'; npm.cmd run build
  npm.cmd audit --omit=dev --audit-level=high
  ```

  Expected: artifact test passes, including content-byte cache-version sensitivity and reproducibility; `out/sw.js`, both CSP outputs, manifest, and icons exist; production audit reports no high/critical finding.

### Task 2: Hand-written worker cache and offline-fallback contract

**Files:**

- Create: `apps/pos/public/sw.js`, `apps/pos/tests/e2e/m7.export.spec.ts`
- Modify: `apps/pos/tests/e2e/static-server.mjs`

**Interfaces:**

```js
// public/sw.js template values are supplied by build-pwa.mjs.
const CACHE_NAME = 'eden-shell-__EDEN_CACHE_VERSION__';
const PRECACHE_URLS = __EDEN_PRECACHE_URLS__;
```

- [ ] **Step 1: Write failing worker behavior assertions in the export spec.**

  Add a test that waits for `navigator.serviceWorker.ready`, reloads once online to obtain a controller, sets the existing context offline, and requests an unexported navigation URL. Assert the response is the cached login document, the login picker renderer is visible, and no API request was made. Assert a cached RSC route still responds with `content-type` containing `text/x-component`.

- [ ] **Step 2: Run the targeted E2E red in the owner session.**

  Run: `npm.cmd run test:e2e -- m7.export.spec.ts`

  Expected: FAIL before a service worker exists because offline navigation cannot resolve an unexported URL and no controller is installed.

- [ ] **Step 3: Implement only the approved worker behavior.**

  Implement install/activate/message/fetch handlers with this fetch ordering:

  ```js
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached !== undefined) return cached;
    if (request.mode === 'navigate') {
      try { return await fetch(request); }
      catch { return (await cache.match('/login')) ?? Response.error(); }
    }
    return fetch(request);
  })());
  ```

  Install uses `cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' })))` so the new versioned cache bypasses stale HTTP edge entries, and does not call `skipWaiting`; activation deletes only previous `eden-shell-` caches; the message handler calls `self.skipWaiting()` only for `{ type: 'skip-waiting' }`. Keep a comment that `cache.match(request)` deliberately preserves query strings; query-bearing future routes fall through to network then the login fallback rather than serving the wrong shell.

- [ ] **Step 4: Upgrade the static host deployment rules.**

  Load `.eden-csp-routes.json` from `--root` once at server startup. For every served HTML document, set the matching `Content-Security-Policy`. Preserve extensionless `.html` routing and `.txt: text/x-component`; add `.webmanifest: application/manifest+json`. Set cache control exactly as follows:

  ```js
  if (relativeName.endsWith('.html') || relativeName.endsWith('.txt') || relativeName === 'sw.js' || relativeName === 'manifest.webmanifest') {
    headers['cache-control'] = 'no-cache';
  }
  if (relativeName.startsWith('_next/static/')) {
    headers['cache-control'] = 'public, max-age=31536000, immutable';
  }
  ```

  Add the test-only `/__csp-tripwire` branch before normal file resolution; it uses the generated union policy plus one hash for an allowed eval probe and includes a second deliberately unhashed inline script.

- [ ] **Step 5: Re-run the worker assertion green.**

  Run: `npm.cmd run test:e2e -- m7.export.spec.ts`

  Expected: the cached shell controls the page, offline deep-navigation falls back to login, RSC MIME and no-cache rules remain correct, and the test does not select any translated text.

### Task 3: Post-mount update controller and cart-safe Restart

**Files:**

- Create: `apps/pos/src/app/pwaUpdate.tsx`, `apps/pos/tests/unit/pwa-update.test.ts`
- Modify: `apps/pos/src/app/providers.tsx`, `apps/pos/src/ui/Toast.tsx`, `apps/pos/src/ui/Toast.module.css`, `apps/pos/src/ui/index.ts`, `apps/pos/src/modules/sale/SaleScreen.tsx`, `apps/pos/src/i18n/{types,dict.en,dict.my,dict.zh}.ts`

**Interfaces:**

```ts
export type RestartGate = {
  setHasUncommittedCart(value: boolean): void;
  state(): { disabled: boolean };
  requestRestart(): 'blocked' | 'restarting';
};

export function createRestartGate(input: {
  skipWaiting(): void;
}): RestartGate;

export function usePwaUpdate(): {
  setHasUncommittedCart(value: boolean): void;
};
```

- [ ] **Step 1: Write the failing pure restart-gate and Toast-entry tests.**

  Assert a gate calls `skipWaiting()` exactly once when unguarded, returns `blocked` and never calls it when guarded, and returns to enabled when the guard clears. Add Toast model tests for one restart action with `data-testid="pwa-update-restart"`, disabled state, and translated disabled-reason text; retain the existing one-at-a-time manual dismiss behavior.

- [ ] **Step 2: Run the focused tests red.**

  Run: `npm.cmd run test:unit -- pwa-update`

  Expected: FAIL because the gate, update provider, action-capable toast entry, and translation keys do not exist.

- [ ] **Step 3: Implement browser registration and consented activation.**

  Keep every browser reference inside effects/functions. `PwaUpdateProvider` is disabled outside production builds; in production it calls `navigator.serviceWorker.register('/sw.js')`, observes `registration.waiting` and `updatefound`, and places one update toast. It stores the registration in React state only. `requestRestart()` checks `RestartGate` first; only the unguarded path arms its one-shot `controllerchange` reload listener immediately before posting `{ type: 'skip-waiting' }`. There is no mount-time listener, and the worker never claims existing clients, so first install and another tab's consent cannot reload an active sale.

  Extend Toast entries without disturbing ordinary toasts:

  ```ts
  type ToastAction = {
    label: string;
    testId: string;
    disabled: boolean;
    disabledReason?: string;
    onClick(): void;
  };
  type ToastEntry = { id: number; message: string; action?: ToastAction };
  ```

  The viewport renders the action and disabled reason using CSS Module/token styles. `ToastProvider` retains a single visible toast and explicit dismiss button.

- [ ] **Step 4: Compose the Sale guard without creating a shared drain guard.**

  In `SaleScreen`, retain the exact existing predicate and publish it in an effect:

  ```ts
  const hasUncommittedCart = draft.lines.length > 0 || tenderOpen;
  useEffect(() => {
    pwaUpdate.setHasUncommittedCart(hasUncommittedCart);
    return () => pwaUpdate.setHasUncommittedCart(false);
  }, [hasUncommittedCart, pwaUpdate]);
  ```

  The update provider does not import Sale. `AppShell` A4 behavior remains as-is. Add typed English keys for update-ready, restart, and finish-or-abandon; add Burmese/Chinese drafts with `// TODO(native-review)`.

- [ ] **Step 5: Verify the guard green.**

  Run: `npm.cmd run test:unit -- pwa-update i18n`

  Expected: pure guard and typed i18n proof pass; no module-scope navigator/service-worker access appears in the import-everything suite.

### Task 4: CSP enforcement, style-attribute removal, and runtime proof

**Files:**

- Modify: `apps/pos/src/ui/Skeleton.tsx`, `apps/pos/src/ui/Skeleton.module.css`, `apps/pos/tests/e2e/m7.export.spec.ts`, `apps/pos/tests/e2e/static-server.mjs`
- Create: `apps/pos/tests/unit/csp-policy.test.ts`

**Interfaces:**

```ts
export function collectSecurityPolicyViolations(page: import('@playwright/test').Page): Promise<
  Array<{ effectiveDirective: string; blockedURI: string }>
>;
```

- [ ] **Step 1: Write the failing CSP policy and browser-tripwire tests.**

  Unit-test that an inline style attribute causes the generator to throw and that an inline style *element* is hash-listed. In E2E, collect `securitypolicyviolation` events before navigation. Assert all exported application routes send `Content-Security-Policy`, their headers omit `unsafe-inline`/`unsafe-eval`, and the event list stays empty. Visit `/__csp-tripwire`; assert its hashed script records a blocked `eval`, its unhashed script never sets its marker, and the browser reports both violations.

- [ ] **Step 2: Run the focused CSP test red.**

  Run: `npm.cmd run test:unit -- csp-policy`

  Expected: FAIL because `Skeleton` still renders an inline `style` attribute and the host does not send generated CSP headers/tripwire output.

- [ ] **Step 3: Remove the inline style attribute without weakening CSP.**

  Replace `Skeleton`'s React `style={{ height, width }}` API with finite typed size variants/data attributes that map to CSS Module declarations. Update every caller to one of the declared variants. The source audit below must find no `style={` or `<style` under `src/`; do not add `style-src 'unsafe-inline'` or a CSS-literal exception.

- [ ] **Step 4: Implement the tripwire and full route sweep.**

  The allowed probe's exact script bytes are SHA-256-hashed by the static server and appended only to the test response's policy. It registers a violation listener, attempts `eval('1 + 1')`, catches the CSP exception, and records a `data-testid`-independent marker. The following intentionally unhashed script must remain blocked. In the normal route sweep, exercise actual ReceiptViewer reprint and assert its `blob:` image loads with no CSP violation; route-load coverage alone is insufficient.

- [ ] **Step 5: Re-run CSP proof green.**

  Run: `npm.cmd run test:e2e -- m7.export.spec.ts`

  Expected: every application response has a generated header, normal runtime and Blob receipt have zero violations, and the tripwire proves the header actively blocks both unauthorized inline script and eval.

### Task 5: Persistent-profile reboot recovery and update-toast E2E

**Files:**

- Modify: `apps/pos/tests/e2e/m7.export.spec.ts`, `apps/pos/tests/e2e/mock.ts`, `apps/pos/tests/e2e/visuals.ts`

**Interfaces:**

```ts
async function launchOfflineRebootContext(
  browserType: import('@playwright/test').BrowserType,
  userDataDir: string,
): Promise<import('@playwright/test').BrowserContext>;

async function readOutboxDepth(page: import('@playwright/test').Page): Promise<number>;
```

- [ ] **Step 1: Write the failing persistent-context reboot test.**

  Use `mkdtemp()` for a profile path and `browserType.launchPersistentContext(profile, { offline: true, ... })` for the *second* launch. The initial online context provisions `s1/1234`, waits for worker readiness, reloads online for control, sets offline, captures two sales, and asserts depth two. Close that entire context. In the second context, create the page only after launch, navigate to `/login`, unlock through `staff-option-s1` and `pin-key-*` test IDs, assert depth two, set online, drain, and poll `/__state` for exactly two server sales.

- [ ] **Step 2: Run the reboot test red in the owner session.**

  Run: `npm.cmd run test:e2e -- m7.export.spec.ts`

  Expected: FAIL before worker installation because a new offline persistent browser context cannot load the static login route.

- [ ] **Step 3: Add real update/cart-guard coverage without a production test hook.**

  In an isolated persistent E2E profile, mutate only the ignored built `out/sw.js` by appending a test comment, call `registration.update()`, and wait for the real update toast. With a catalogue item in the cart, assert `pwa-update-restart` is disabled and no controller change occurs. Remove the line using `sale-line-remove`, assert restart becomes enabled, invoke it, and assert the intentional reload returns to the staff picker. Restore the original ignored worker bytes in `finally`.

- [ ] **Step 4: Add targeted evidence capture.**

  Change `captureM6State`-style helpers to accept an optional `Locator`; call `await locator.scrollIntoViewIfNeeded()` before screenshotting. Capture the target Set-up diagnostics card, the offline reboot login/picker, the update toast blocked by cart, the negative shift-close modal, and 576-dot COPY reprint under `outputs/m7/`.

- [ ] **Step 5: Re-run reboot/update evidence green.**

  Run: `npm.cmd run test:e2e -- m7.export.spec.ts`

  Expected: second launch begins offline by construction, worker cache serves the login shell, queued rows survive close/reopen, reconnect drains them unchanged, and Restart cannot discard an uncommitted cart.

### Task 6: Receipt/drawer polish and visual evidence

**Files:**

- Modify: `apps/pos/src/print/receipt.ts`, `apps/pos/src/modules/today/TodayScreen.tsx`, `apps/pos/src/modules/today/TodayScreen.module.css`, `apps/pos/tests/unit/receipt.test.ts`, `apps/pos/tests/unit/shift-close.test.ts`, `apps/pos/tests/e2e/m7.export.spec.ts`

**Interfaces:**

```ts
export type ReceiptRun = {
  kind: 'header-latin' | 'header-burmese' | 'body' | 'total' | 'divider' | 'qr' | 'copy-marker';
  // Existing fields plus renderer-owned size/spacing metrics for copy-marker.
};
```

- [ ] **Step 1: Write failing visual-model tests.**

  In `receipt.test.ts`, build 576 and 384 layouts with `copyMarker` and assert the marker has a larger renderer-owned font metric and vertical separation than body text, while a normal receipt has no marker. In `shift-close.test.ts`, expose a display-model assertion that a negative `cashDifference` selects semantic `negative` and zero/positive select `ink`.

- [ ] **Step 2: Run the polish tests red.**

  Run: `npm.cmd run test:unit -- receipt shift-close`

  Expected: FAIL because COPY uses ordinary 16px body-like metrics and no semantic drawer-difference tone exists.

- [ ] **Step 3: Implement tokenized display-only polish.**

  Give `copy-marker` its own larger bold metric and extra vertical space in the canvas layout; use existing brand/ink palette values and preserve the current one-renderer path. In Today, derive only a display tone from the existing computed integer difference and apply a CSS Module class using `var(--red)` solely for values `< 0`; leave zero/positive ink. Do not change `money.ts` arithmetic.

- [ ] **Step 4: Re-run polish tests green.**

  Run: `npm.cmd run test:unit -- receipt shift-close`

  Expected: both widths retain a visibly distinct raster COPY marker, and red is selected only for negative drawer differences.

### Task 7: Full verification, deployment ledger, and owner handoff

**Files:**

- Modify: `docs/superpowers/specs/2026-08-03-eden-m7-design.md`
- Owner acceptance action: update the owner-maintained pilot blocker register §1 to replace `stale-while-revalidate` with: “cache-first, versioned static shell cache; the old worker remains active until the user accepts Restart; no mixed-version shell window.” The register is not present in this checkout, so this exact text is handed to Dan rather than creating a guessed document path.

- [ ] **Step 1: Run the immutable and source-boundary audits.**

  Run from the repository root:

  ```powershell
  (Get-FileHash apps/pos/tokens.css -Algorithm SHA256).Hash
  (Get-Item apps/pos/tokens.css).Length
  rg -n -e '#[0-9a-fA-F]{3,8}' -e 'rgba?\(' apps/pos/src --glob '!tokens.css'
  rg -n 'style=\{|<style|unsafe-inline|unsafe-eval' apps/pos/src apps/pos/public apps/pos/scripts
  git diff --check
  git diff -- apps/pos/package.json apps/pos/package-lock.json
  git status --short
  ```

  Expected: token checksum/length remain exact; no source colour/style violations; only the reviewed M7 files, exact overrides, and ignored regenerated artifacts are present.

- [ ] **Step 2: Run the four in-sandbox gates plus the separate production-audit check from the final tree.**

  Run from `apps/pos`, preserving unabridged output:

  ```powershell
  npm.cmd run typecheck
  npm.cmd run lint
  npm.cmd run test:unit
  $env:NEXT_PUBLIC_EDEN_API_BASE_URL='http://127.0.0.1:4010'; npm.cmd run build
  npm.cmd audit --omit=dev --audit-level=high
  ```

  Expected: all four gates and the separate audit check exit zero; the static artifact contains matching worker/CSP/manifest files.

- [ ] **Step 3: Run the owner-session E2E and visual review.**

  Owner preflight: ensure ports 4010, 4173, and 4174 are free before Playwright starts; stop only identified stale Node mock/static test processes, then let the configured `webServer` entries start fresh services. This prevents stale servers from masking the generated export or blocking the suite.

  Run: `npm.cmd run test:e2e`

  Verify both Playwright projects in one invocation. The export project must retain every M0–M6 baseline plus CSP enforcement, worker/cache headers, tripwire, offline deep-navigation fallback, true persistent-profile reboot recovery, reprint Blob coverage, and cart-safe Restart. The dev-locale project remains unchanged except for retained baseline compliance.

- [ ] **Step 4: Prepare the M7 report.**

  Report file inventory, exact override/lockfile diff, audit output, all five unabridged gate outputs, generated header paths, screenshot paths, owner E2E output, and known limits. State that the deployment handoff requires atomic `out/` + CSP deployment, extensionless/.txt/no-cache/immutable host rules, and an exact future printer LAN `connect-src` amendment only at the physical drill. State the proposed owner commit message:

  ```text
  pwa: harden offline recovery, CSP, and installability (M7)
  ```

## Coverage map

| Approved M7 requirement | Task |
|---|---|
| Manifest, stable id, separate any/maskable icons, atomic worker artifact | Task 1 |
| Exact audit remediation and CI audit gate | Task 1, Task 7 |
| Cache-first precomputed shell, `/login` offline navigation fallback, no API cache | Task 2 |
| `.html`, `.txt`, `sw.js`, manifest, immutable static deployment rules | Task 2, Task 7 |
| User-consented update and A4 cart-safe Restart | Task 3, Task 5 |
| Hash CSP per-route/union, build-env connect source, no inline/eval, active tripwire | Tasks 1, 4, 5 |
| Offline persistent-browser power-cut/reopen/drain proof | Task 5 |
| COPY prominence, red negative difference, scrolled evidence target | Tasks 5, 6 |
| Register §1 stale-while-revalidate reconciliation | Task 7 owner acceptance action |
