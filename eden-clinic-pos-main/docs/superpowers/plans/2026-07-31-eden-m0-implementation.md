# Eden Clinic OS M0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the M0 offline-safe, static-export foundation for Eden Clinic OS, with no M1 or later functionality.

**Architecture:** A single Next.js App Router static-export app lives in `apps/pos`. A temporary token sanity page consumes only the global token sheet and a page-local CSS Module. Node-only test helpers serve the production export and audit every source module, letting M0 prove visual tokens, local font loading, and static-export safety without a data layer or shared component library.

**Tech Stack:** Registry-resolved, exact versions of Next.js, React, React DOM, TypeScript, ESLint plus eslint-config-next, Vitest, and Playwright; the current official Node 24 LTS patch; CSS Modules; local Inter and Padauk WOFF2 assets.

## Global Constraints

- M0 only: do not build M1 UI components, navigation, data, sync, API, product behavior, manifest, or service worker.
- Use `apps/pos` exactly as the project surface. Before `package.json` exists, resolve every M0 dependency with `npm view <package> version`; inspect `eslint-config-next` peer dependencies against the resolved ESLint version; record the registry table in the M0 report; then use no `^` or `~` range and commit `package-lock.json`.
- M0 dependencies are only `next`, `react`, `react-dom`, `typescript`, `eslint`, `eslint-config-next`, `vitest`, and `@playwright/test`. Do not install React Query, Dexie, Zod, fake IndexedDB, or Lucide.
- Preserve the §5.1 token file byte-for-byte as UTF-8 without a BOM, LF endings, and one trailing newline. It must be 597 bytes and its SHA-256 must be `8d39f41e6710fa1edce202af74f118e76547a4172f5dc8073135e0f76eb09e82`.
- Bundle Inter 400/500/600/700 and Padauk 400/700 as WOFF2 files under `public/fonts`, each with `font-display: swap`. Runtime requests must remain localhost-only.
- Keep user-visible temporary sanity-page copy in the page’s developer-only scaffold; never create `ui/` components before M1. All future production copy remains subject to LAW-11.
- Enforce LAW-6 with both ESLint best-effort selectors and the Node-environment source-import test.
- Create every §3 directory in M0, using `.gitkeep` where M0 owns no implementation. `src/ui` and every feature module remain implementation-empty.
- `.nvmrc` and CI use the current Node 24 LTS patch verified from the official release page; `package.json` declares `"node": "24.x"`. CI runs `npm ci`, then typecheck, lint, unit test, build, and production-export E2E test. A clean M0 commit uses `scaffold: establish offline-safe frontend foundation (M0)`.

## File Map

| Path | Responsibility |
|---|---|
| `.gitattributes`, `.gitignore`, `.nvmrc`, `.github/workflows/ci.yml` | Reproducible repository behavior and the five-gate CI workflow. |
| `apps/pos/package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts` | Exact package pins, static export, and test/lint configuration. |
| `apps/pos/tokens.css` | Verbatim §5.1 global design tokens, protected by checksum. |
| `apps/pos/src/app/layout.tsx`, `page.tsx`, `page.module.css`, `globals.css` | The temporary, page-local token sanity page and its local font definitions. |
| `apps/pos/public/fonts/*.woff2` | Six local OFL font assets. |
| `apps/pos/tests/unit/tokens.test.ts` | Token checksum drift guard. |
| `apps/pos/tests/unit/import-source-modules.test.ts` | LAW-6 Node-only import guard for every source module. |
| `apps/pos/tests/unit/module-boundary.test.ts` | Proves that the future module-boundary matrix rejects a sibling-module import. |
| `apps/pos/tests/e2e/static-server.mjs`, `sanity-page.spec.ts` | Serves `out/` and verifies the production export, fonts, colors, and request origins. |

---

### Task 1: Create the reproducible M0 project and complete empty structure

**Files:**

- Create: `.gitattributes`, `.gitignore`, `.nvmrc`, `.github/workflows/ci.yml`
- Create: `apps/pos/package.json`, `apps/pos/next.config.ts`, `apps/pos/tsconfig.json`, `apps/pos/vitest.config.ts`, `apps/pos/playwright.config.ts`
- Create: every directory in §3, with `.gitkeep` for each M0-empty future directory

**Consumes:** The approved M0 design and binding riders.

**Produces:** An exact, static-export-capable project root for later M0 tasks.

- [ ] **Step 1: Initialize the repository and lock line endings**

Run:

```powershell
git init
Set-Content -NoNewline .gitattributes "* text=auto eol=lf`n"
```

- [ ] **Step 2: Resolve package and Node versions before writing project configuration**

Run from the workspace with the local npm cache, then save the observed package table for the M0 report:

```powershell
$npmCache = "$PWD\work\npm-cache"
$packages = @('next', 'react', 'react-dom', 'typescript', 'eslint', 'eslint-config-next', 'vitest', '@playwright/test')
$resolved = foreach ($package in $packages) {
  [pscustomobject]@{ package = $package; version = (npm.cmd view "$package@latest" version --cache $npmCache).Trim() }
}
$resolved | Format-Table -AutoSize
$resolved | ConvertTo-Json | Set-Content -Encoding utf8NoBOM work/m0-registry-versions.json
$eslintConfig = ($resolved | Where-Object package -eq 'eslint-config-next').version
npm.cmd view "eslint-config-next@$eslintConfig" peerDependencies --json --cache $npmCache
```

Check the Node.js release page for the latest 24.x LTS patch, compare it to `node.exe --version`, then write that exact patch to `.nvmrc`. The compatibility declaration in `package.json` must remain `"node": "24.x"`, not a patch lock.

- [ ] **Step 3: Create the full prescribed directory structure**

Run:

```powershell
$dirs = @(
  'apps/pos/public/fonts', 'apps/pos/src/app/login', 'apps/pos/src/app/home',
  'apps/pos/src/app/calendar', 'apps/pos/src/app/clients/[id]', 'apps/pos/src/app/sale',
  'apps/pos/src/app/stocks', 'apps/pos/src/app/analytics', 'apps/pos/src/app/hub',
  'apps/pos/src/app/setup', 'apps/pos/src/modules/auth', 'apps/pos/src/modules/sale',
  'apps/pos/src/modules/calendar', 'apps/pos/src/modules/patients',
  'apps/pos/src/modules/inventory', 'apps/pos/src/modules/analytics',
  'apps/pos/src/modules/hub', 'apps/pos/src/modules/setup', 'apps/pos/src/data',
  'apps/pos/src/ui', 'apps/pos/src/i18n', 'apps/pos/src/print', 'apps/pos/src/flags',
  'apps/pos/tests/unit', 'apps/pos/tests/e2e', '.github/workflows'
)
$dirs | ForEach-Object { New-Item -ItemType Directory -Force $_ | Out-Null }
```

Create `.gitkeep` in every listed folder that has no real M0 file after this task. Do not add a service worker or manifest.

- [ ] **Step 4: Add registry-resolved package pins and static-export configuration**

Create `apps/pos/package.json` from the real values in `work/m0-registry-versions.json`. The following construction is the complete manifest contract; it cannot produce a version that was not returned by the registry query:

```powershell
$pins = @{}
(Get-Content work/m0-registry-versions.json | ConvertFrom-Json) | ForEach-Object { $pins[$_.package] = $_.version }
$manifest = [ordered]@{
  name = 'eden-clinic-pos'; private = $true; version = '0.0.0'; engines = @{ node = '24.x' }
  scripts = [ordered]@{
    dev = 'next dev'; build = 'next build'; typecheck = 'tsc --noEmit'; lint = 'eslint .'
    'test:unit' = 'vitest run'; 'test:e2e' = 'playwright test'
    verify = 'npm run typecheck && npm run lint && npm run test:unit && npm run build && npm run test:e2e'
  }
  dependencies = [ordered]@{ next = $pins['next']; react = $pins['react']; 'react-dom' = $pins['react-dom'] }
  devDependencies = [ordered]@{
    '@playwright/test' = $pins['@playwright/test']; eslint = $pins['eslint']
    'eslint-config-next' = $pins['eslint-config-next']; typescript = $pins['typescript']; vitest = $pins['vitest']
  }
}
[System.IO.File]::WriteAllText(
  (Join-Path $PWD 'apps/pos/package.json'),
  (($manifest | ConvertTo-Json -Depth 4) + "`n"),
  [System.Text.UTF8Encoding]::new($false)
)
```

Create `next.config.ts` as:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
```

Add `.npmrc` containing `save-exact=true` and `engine-strict=true`.

- [ ] **Step 5: Install the locked M0 packages and Playwright browser**

Run from `apps/pos`, keeping npm’s cache inside the workspace:

```powershell
$env:npm_config_cache = "$PWD\..\..\work\npm-cache"
npm.cmd install
npx.cmd playwright install chromium
```

Confirm `package.json` has no caret or tilde range and `package-lock.json` is present. Do not install any later-milestone library.

- [ ] **Step 6: Add TypeScript and test-runner configuration**

Create `tsconfig.json` with strict mode, `baseUrl: "."`, and the alias `"@/*": ["src/*"]`. Create `vitest.config.ts` with `test.environment: 'node'`, `include: ['tests/unit/**/*.test.ts']`, and no browser globals. Create `playwright.config.ts` with `testDir: './tests/e2e'`, `baseURL: 'http://127.0.0.1:4173'`, and a `webServer` command of `node tests/e2e/static-server.mjs` that does not reuse an existing server.

- [ ] **Step 7: Prove the bootstrap configuration parses**

Run:

```powershell
npm.cmd run typecheck
```

Expected: the command completes with zero TypeScript diagnostics before the first source file is introduced.

### Task 2: Add the exact tokens and its checksum-first test

**Files:**

- Create: `apps/pos/tokens.css`
- Create: `apps/pos/tests/unit/tokens.test.ts`

**Consumes:** LF-normalized repository behavior from Task 1.

**Produces:** A single immutable token source with an executable drift guard.

- [ ] **Step 1: Write the failing checksum test**

Create `tests/unit/tokens.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

// Changes to tokens.css require Dan's explicit approval.
test('tokens.css is byte-identical to build spec section 5.1', () => {
  const tokens = readFileSync(resolve(process.cwd(), 'tokens.css'));
  const checksum = createHash('sha256').update(tokens).digest('hex');
  expect(tokens.byteLength).toBe(597);
  expect(checksum).toBe('8d39f41e6710fa1edce202af74f118e76547a4172f5dc8073135e0f76eb09e82');
});
```

- [ ] **Step 2: Run the test and confirm the missing-file failure**

Run: `npm.cmd run test:unit -- tests/unit/tokens.test.ts`

Expected: FAIL because `tokens.css` does not exist.

- [ ] **Step 3: Create the verbatim token file**

Create `tokens.css` with exactly this LF-terminated content:

```css
:root{
  --bg:#faf9f7; --ivory:#fbfaf7; --panel:#ffffff;
  --ink:#121722; --mut:#777c86; --steel:#a5a5a5;
  --brand:#0068f9; --brand-dk:#024bb1;
  --accent:#e8f1fd; --powder:#d6e4f1; --lav:#f4f0ff;
  --line:#efefef; --chip:#f3f2ef;
  --red:#c0392b; --redbg:#fdecec; --amber:#a97a10; --amberbg:#faf1dc;
  --forest:#046645; --forestbg:#e6f2ec;
  --ai:#6736eb; --aibg:#f4f0ff;
  --sh-subtle:rgba(0,0,0,.07) 0 1px 1px 0, rgba(0,0,0,.04) 0 -1px 1px 0 inset, rgba(0,0,0,.14) 0 0 0 .5px inset;
  --sh-lg:rgba(0,0,0,.04) 0 20px 20px -8px;
  --r-card:16px; --r-btn:999px; --r-input:12px; --r-modal:20px;
}
```

- [ ] **Step 4: Re-run the checksum test**

Run: `npm.cmd run test:unit -- tests/unit/tokens.test.ts`

Expected: PASS with the required SHA-256.

### Task 3: Build the page-local token sanity page and bundle fonts

**Files:**

- Create: `apps/pos/public/fonts/inter-{400,500,600,700}.woff2`, `padauk-{400,700}.woff2`
- Create: `apps/pos/src/app/layout.tsx`, `page.tsx`, `page.module.css`, `globals.css`

**Consumes:** The protected token sheet from Task 2.

**Produces:** A static, accessible M0 page whose controls are not reusable UI components.

- [ ] **Step 1: Fetch the six OFL WOFF2 assets without adding a dependency**

Use only `@fontsource/inter@5.3.0` and `@fontsource/padauk@5.3.0` as one-time asset sources; do not add either package to `package.json` or the lockfile. Run:

```powershell
$fontWork = "$PWD\..\..\work\font-sources"
$cache = "$PWD\..\..\work\npm-cache"
New-Item -ItemType Directory -Force $fontWork | Out-Null
New-Item -ItemType Directory -Force "$fontWork\inter" | Out-Null
New-Item -ItemType Directory -Force "$fontWork\padauk" | Out-Null
npm.cmd pack @fontsource/inter@5.3.0 --pack-destination $fontWork --cache $cache
npm.cmd pack @fontsource/padauk@5.3.0 --pack-destination $fontWork --cache $cache
tar.exe -xf "$fontWork\fontsource-inter-5.3.0.tgz" -C "$fontWork\inter"
Copy-Item "$fontWork\inter\package\files\inter-latin-400-normal.woff2" public/fonts/inter-400.woff2
Copy-Item "$fontWork\inter\package\files\inter-latin-500-normal.woff2" public/fonts/inter-500.woff2
Copy-Item "$fontWork\inter\package\files\inter-latin-600-normal.woff2" public/fonts/inter-600.woff2
Copy-Item "$fontWork\inter\package\files\inter-latin-700-normal.woff2" public/fonts/inter-700.woff2
tar.exe -xf "$fontWork\fontsource-padauk-5.3.0.tgz" -C "$fontWork\padauk"
Copy-Item "$fontWork\padauk\package\files\padauk-myanmar-400-normal.woff2" public/fonts/padauk-400.woff2
Copy-Item "$fontWork\padauk\package\files\padauk-myanmar-700-normal.woff2" public/fonts/padauk-700.woff2
```

Create `public/fonts/NOTICE.md` stating that the six files come from those two versioned Fontsource packages and are distributed under the Open Font License. The tarballs remain outside the project surface and neither Fontsource package is a runtime or lockfile dependency.

- [ ] **Step 2: Implement root styles and local `@font-face` rules**

Create `src/app/globals.css` with the single root import `@import '../../tokens.css';`, six `@font-face` declarations using `font-display:swap`, baseline `body` styles using `var(--bg)` and Inter, and this focus rule:

```css
:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
```

Give the Padauk face `font-family: 'Padauk'`; `page.module.css` must apply it at `line-height: 1.7` to the Burmese element.

- [ ] **Step 3: Implement the minimal static layout and page**

Use this page structure in `src/app/page.tsx`; keep every class in `page.module.css`, not `src/ui`:

```tsx
'use client';

import styles from './page.module.css';

const swatches = ['--bg', '--ivory', '--panel', '--brand', '--ai'] as const;
const variants = ['Primary', 'Ghost', 'Danger', 'AI'] as const;

export default function TokenSanityPage() {
  return (
    <main className={styles.page}>
      <h1>Eden Clinic OS · M0 token sanity</h1>
      <div aria-label="Design token swatches" className={styles.swatches}>
        {swatches.map((token) => <span className={styles.swatch} key={token} style={{ background: `var(${token})` }}>{token}</span>)}
      </div>
      <div className={styles.actions}>
        {variants.map((variant) => <button className={styles[variant.toLowerCase()]} data-testid={`${variant.toLowerCase()}-button`} key={variant} type="button">{variant}</button>)}
      </div>
      <p className={styles.burmese} data-testid="burmese-sample">ကျေးဇူးတင်ပါသည်</p>
    </main>
  );
}
```

`layout.tsx` imports `./globals.css`, supplies `metadata` for the temporary sanity page, and renders `children`. The local module must give the primary button `background: var(--brand)`, retain 40px minimum height for all four controls, and use only allowed token colors.

- [ ] **Step 4: Build the static export**

Run: `npm.cmd run build`

Expected: `apps/pos/out/index.html` exists and no build warning is emitted.

### Task 4: Enforce module boundaries and LAW-6 with tests first

**Files:**

- Create: `apps/pos/eslint.config.mjs`
- Create: `apps/pos/tests/unit/module-boundary.test.ts`, `import-source-modules.test.ts`

**Consumes:** The complete empty module tree from Task 1 and source page from Task 3.

**Produces:** An exercised feature-boundary matrix and source-wide Node import guard.

- [ ] **Step 1: Write the failing boundary test**

Create `tests/unit/module-boundary.test.ts` to lint the text below as `src/modules/auth/canary.ts` and require a `no-restricted-imports` message:

```ts
import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

test('auth module cannot import sale module', async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(
    "import { checkout } from '@/modules/sale/checkout';",
    { filePath: 'src/modules/auth/canary.ts' },
  );
  expect(result.messages.some((message) => message.ruleId === 'no-restricted-imports')).toBe(true);
});
```

- [ ] **Step 2: Write the failing source-import guard**

Create `tests/unit/import-source-modules.test.ts`:

```ts
import { expect, test } from 'vitest';

const modules = import.meta.glob('/src/**/*.{ts,tsx}', { eager: false });

test('every source module imports without browser globals at module scope', async () => {
  expect(Object.keys(modules).length).toBeGreaterThan(0);
  for (const [path, load] of Object.entries(modules)) {
    await expect(load()).resolves.toBeDefined();
  }
});
```

- [ ] **Step 3: Run both tests and confirm they fail before lint configuration exists**

Run:

```powershell
npm.cmd run test:unit -- tests/unit/module-boundary.test.ts tests/unit/import-source-modules.test.ts
```

Expected: the boundary test fails because no module restriction is configured. The source-import test may pass; preserve it as the growing LAW-6 guard.

- [ ] **Step 4: Implement the flat ESLint configuration**

Create `eslint.config.mjs` using `eslint-config-next` and one generated override per module name. Each module’s override rejects aliases and relative imports to every other module, for example auth must reject `@/modules/sale/**`, `../sale/**`, and `../../modules/sale/**`. Add best-effort `no-restricted-syntax` selectors for top-level `window`, `document`, `indexedDB`, `localStorage`, and `sessionStorage` member or identifier expressions. The selector messages must name LAW-6 and direct code into an effect, handler, or data function.

Generate the per-module restrictions from this constant so every M0 folder is covered:

```js
const moduleNames = ['auth', 'sale', 'calendar', 'patients', 'inventory', 'analytics', 'hub', 'setup'];
```

- [ ] **Step 5: Re-run lint and the two fence tests**

Run:

```powershell
npm.cmd run lint
npm.cmd run test:unit -- tests/unit/module-boundary.test.ts tests/unit/import-source-modules.test.ts
```

Expected: lint passes, the boundary test observes `no-restricted-imports`, and every source module imports under the Node-only Vitest environment.

### Task 5: Test the exported page, colors, fonts, and request supply chain

**Files:**

- Create: `apps/pos/tests/e2e/static-server.mjs`, `sanity-page.spec.ts`

**Consumes:** The built static export from Task 3.

**Produces:** The strict M0 production-output E2E gate.

- [ ] **Step 1: Write the failing E2E specification**

Create `tests/e2e/sanity-page.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('exported token page is local-only and renders the required visual baseline', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const { hostname } = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(hostname)) externalRequests.push(request.url());
  });

  await page.goto('/');
  await expect.poll(() => page.evaluate(() => document.fonts.check('16px Padauk'))).toBe(true);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 249, 247)');
  await expect(page.getByTestId('primary-button')).toHaveCSS('background-color', 'rgb(0, 104, 249)');
  await expect(page.getByTestId('burmese-sample')).toHaveCSS('font-family', /Padauk/);
  expect(externalRequests).toEqual([]);
});
```

- [ ] **Step 2: Implement the dependency-free static server**

Create `tests/e2e/static-server.mjs` with Node’s `http`, `fs`, and `path` modules only. Serve `out/` on `127.0.0.1:4173`, map `/` to `index.html`, map directory paths to `index.html`, and return MIME types for `.html`, `.css`, `.js`, `.woff2`, `.svg`, `.png`, `.jpg`, and `.ico`. Reject paths that resolve outside `out/` with 403. This server must never proxy or contact another host.

- [ ] **Step 3: Run the E2E test against the production export**

Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e
```

Expected: the browser requests only `127.0.0.1`, resolves the Padauk font, and observes the exact cream and cobalt computed colors.

### Task 6: Add CI, run all five gates, and create the M0 commit

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: all final M0 files to resolve verification failures only

**Consumes:** Tasks 1–5.

**Produces:** A reproducible five-gate M0 baseline and one milestone commit.

- [ ] **Step 1: Create the pinned CI workflow**

Create `.github/workflows/ci.yml` to run on `push` and `pull_request`, use `actions/checkout@v4` and `actions/setup-node@v4` with `node-version-file: .nvmrc`, run from `apps/pos`, execute `npm ci`, `npx playwright install --with-deps chromium`, then run these commands in order:

```yaml
- run: npm run typecheck
- run: npm run lint
- run: npm run test:unit
- run: npm run build
- run: npm run test:e2e
```

- [ ] **Step 2: Run the five gates locally and preserve their complete output**

Run from `apps/pos`:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run build
npm.cmd run test:e2e
```

Expected: all commands exit 0. Capture their unabridged output for the M0 report; do not report a green milestone if any gate fails.

- [ ] **Step 3: Confirm pinning and M0-only scope**

Run:

```powershell
node.exe -e "const p=require('./package.json'); const all={...p.dependencies,...p.devDependencies}; if(Object.values(all).some(v=>/[~^]/.test(v))) process.exit(1); console.log(all)"
Test-Path public/sw.js
Test-Path public/manifest.webmanifest
```

Expected: the package list contains only the eight approved M0 direct packages; both final commands print `False`.

- [ ] **Step 4: Commit the completed M0 foundation**

Run from the repository root only after every gate is green:

```powershell
git add .
git commit -m "scaffold: establish offline-safe frontend foundation (M0)"
git status --short
```

Expected: the commit succeeds and `git status --short` prints no remaining changes.

## Plan Self-Review

**Spec coverage:** Task 1 establishes the exact tree, static export, strict pins, locked dependencies, and pinned Node. Task 2 implements the byte-identical token file and checksum. Task 3 implements the page-local sanity page and all six local fonts without creating M1 UI components. Task 4 supplies both LAW-6 enforcers and an exercised module-boundary matrix. Task 5 serves only the production export and tests required colors, Padauk, and every request destination. Task 6 runs every required gate, confirms M7 work is absent, and commits M0. No M1–M7 feature is included.

**Placeholder scan:** No deferred implementation instruction or unspecified interface is present. The asset retrieval source is intentionally not a runtime or package dependency and the required destination files are named explicitly.

**Type consistency:** All test paths and scripts use `apps/pos` as their working root; Playwright’s fixed `127.0.0.1:4173` base URL matches the static server and request-origin assertion.
