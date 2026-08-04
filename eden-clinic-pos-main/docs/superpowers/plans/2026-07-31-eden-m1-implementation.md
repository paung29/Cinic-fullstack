# Eden Clinic OS M1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M0 token sanity page with a statically exported, three-locale UI component demo containing reusable M1 primitives and the v4 two-bar shell.

**Architecture:** Build a memory-only i18n boundary first, then expose tokenized primitives from `src/ui/` and compose them in `AppShell` and the root demo. One `playwright test` invocation starts a static-export project and a separate development-locale project.

**Tech Stack:** Next.js 16.2.12, React 19.2.8, TypeScript 5.9.3 strict mode, CSS Modules, Vitest 4.1.10, Playwright 1.62.1, and `lucide-react` 1.28.0.

## Global Constraints

- The authority is `docs/eden-frontend-build-spec-v1.1.md` version 1.2 and verified v4 demo SHA-256 prefix `5990a868150eab64`.
- Add only exact `lucide-react@1.28.0`; do not change held TypeScript 5.x, ESLint 9.x, or any existing root pin.
- Keep `tokens.css` byte-identical: 597 bytes, SHA-256 `8d39f41e6710fa1edce202af74f118e76547a4172f5dc8073135e0f76eb09e82`.
- Component CSS uses tokens only—no literal colors. Modal overlay is the approved `color-mix(in srgb, var(--ink) 40%, transparent)` equivalent to `rgba(18,23,34,.4)`.
- All component copy and accessible labels use `useT()`. Locale is exactly `my | en | zh`; English is complete and falls back for missing Burmese/Chinese values.
- Product-facing demo copy is drafted in all three locales, each non-English drafted entry marked `// TODO(native-review)`. Only the demo-only `demo.fallbackProbe` is deliberately absent from shipping Burmese/Chinese dictionaries, with an adjacent `// TODO(native-review)` marker.
- LAW-6 applies everywhere: React memory only for locale; no module-scope browser/global storage access.
- M1 adds no data layer, feature modules, product screens, service worker, manifest, or customer language switcher.
- Do not perform Git operations. Dan commits and pushes from the owner session.

---

### Task 1: Add the sole approved M1 dependency without drifting M0 pins

**Files:**
- Modify: `apps/pos/package.json`
- Modify: `apps/pos/package-lock.json`
- Modify: `.gitignore`
- Verify: `apps/pos/node_modules/lucide-react/package.json`

**Interfaces:**
- Consumes: owner-approved registry version `lucide-react@1.28.0`.
- Produces: the only new M1 import, for example `import { Check } from 'lucide-react'`.

- [ ] **Step 1: Capture the current root pins**

Run from `apps/pos`:

```powershell
node -e "const p=require('./package.json'); console.log(JSON.stringify({dependencies:p.dependencies,devDependencies:p.devDependencies},null,2))"
```

Expected: no Lucide dependency and the M0 root versions are exact.

- [ ] **Step 2: Create and ignore the regeneratable npm cache, then add Lucide**

Add this root ignore entry with `apply_patch` before running npm:

```text
work/m1-npm-registry-cache/
```

Run from `apps/pos`:

```powershell
$cachePath = Join-Path $PWD '..\..\work\m1-npm-registry-cache'
New-Item -ItemType Directory -Force -Path $cachePath | Out-Null
$cache = (Resolve-Path $cachePath).Path
npm.cmd --cache $cache install --save-exact lucide-react@1.28.0
```

Expected: `dependencies.lucide-react` is exactly `1.28.0`; the lockfile updates only to resolve that dependency tree.

- [ ] **Step 3: Verify the installed and declared version plus held pins**

Run from `apps/pos`:

```powershell
node -e "const p=require('./package.json'); const l=require('./node_modules/lucide-react/package.json'); if(p.dependencies['lucide-react']!=='1.28.0'||l.version!=='1.28.0') throw new Error('bad Lucide pin'); const held={next:'16.2.12',react:'19.2.8','react-dom':'19.2.8',typescript:'5.9.3',eslint:'9.39.5','eslint-config-next':'16.2.12',vitest:'4.1.10','@playwright/test':'1.62.1'}; for(const [k,v] of Object.entries(held)){if((p.dependencies[k]??p.devDependencies[k])!==v) throw new Error(k+' drifted')} console.log('pins verified')"
```

Expected: `pins verified`.

### Task 2: Create the pure, independently typed three-locale translation core

**Files:**
- Create: `apps/pos/src/i18n/types.ts`
- Create: `apps/pos/src/i18n/dict.en.ts`
- Create: `apps/pos/src/i18n/dict.my.ts`
- Create: `apps/pos/src/i18n/dict.zh.ts`
- Create: `apps/pos/src/i18n/translate.ts`
- Create: `apps/pos/tests/unit/i18n.test.ts`

**Interfaces:**
- Produces: `Locale`, `translationKeys`, `TranslationKey`, `TranslationDictionary`, `LocaleDictionaries`, `dictionaries`, and `translate(locale, key, source?)`.
- Consumes: no DOM or browser/storage APIs.

- [ ] **Step 1: Write the failing fallback and completeness tests**

Create `tests/unit/i18n.test.ts` with:

```ts
import { expect, test } from 'vitest';
import { dictionaries, translate } from '@/i18n/translate';
import { translationKeys } from '@/i18n/types';

test('English exactly covers the declared key tuple', () => {
  expect(Object.keys(dictionaries.en).sort()).toEqual([...translationKeys].sort());
});

test('test-local missing Burmese and Chinese entries fall back to English', () => {
  const fixture = { ...dictionaries, my: { ...dictionaries.my }, zh: { ...dictionaries.zh } };
  delete fixture.my['shell.tab.home'];
  delete fixture.zh['shell.tab.home'];
  expect(translate('my', 'shell.tab.home', fixture)).toBe(dictionaries.en['shell.tab.home']);
  expect(translate('zh', 'shell.tab.home', fixture)).toBe(dictionaries.en['shell.tab.home']);
});

function typecheckOnlyUnknownKeyFixture(): void {
  // @ts-expect-error unknown translation keys must be rejected by TypeScript.
  translate('en', 'demo.notDeclared');
}
```

Run:

```powershell
npm run test:unit -- i18n.test.ts
npm run typecheck -- --listFiles | Select-String 'tests[\\/]unit[\\/]i18n.test.ts'
```

Expected: the unit command fails because no i18n modules exist; the second command confirms the existing `apps/pos/tsconfig.json` `**/*.ts` include covers the compile-time fixture without executing it.

- [ ] **Step 2: Define an independent key tuple and dictionary types**

In `src/i18n/types.ts`, declare a flat `translationKeys` `as const` tuple covering every M1 heading, label, placeholder, aria label, tab, SyncChip state, PinPad action, toast, modal, dev override string, and `demo.fallbackProbe`. Derive and export:

```ts
export type Locale = 'my' | 'en' | 'zh';
export type TranslationKey = (typeof translationKeys)[number];
export type TranslationDictionary = Record<TranslationKey, string>;
export type LocaleDictionaries = Readonly<{
  en: TranslationDictionary;
  my: Partial<TranslationDictionary>;
  zh: Partial<TranslationDictionary>;
}>;
```

- [ ] **Step 3: Implement complete English and drafted Burmese/Chinese dictionaries**

Make `dict.en.ts` satisfy `TranslationDictionary`. Use `Partial<TranslationDictionary>` in both non-English dictionaries. Every drafted Burmese/Chinese property gets an adjacent `// TODO(native-review)` comment. Omit only `demo.fallbackProbe` from both shipping non-English objects and place this adjacent comment in each:

```ts
// TODO(native-review): intentionally omitted M1 dev-only fallback fixture.
```

Implement the Node-safe pure translator:

```ts
export function translate(locale: Locale, key: TranslationKey, source: LocaleDictionaries = dictionaries): string {
  return source[locale][key] ?? source.en[key];
}
```

- [ ] **Step 4: Prove the pure contract and LAW-6-safe import**

Run from `apps/pos`:

```powershell
npm run test:unit -- i18n.test.ts import-source-modules.test.ts
npm run typecheck
```

Expected: both focused unit tests and strict typecheck pass.

### Task 3: Add the memory-only React i18n boundary

**Files:**
- Create: `apps/pos/src/i18n/I18nProvider.tsx`
- Create: `apps/pos/src/i18n/useT.ts`
- Create: `apps/pos/src/i18n/index.ts`
- Modify: `apps/pos/tests/unit/i18n.test.ts`

**Interfaces:**
- Consumes: Task 2 types and `translate()`.
- Produces: `<I18nProvider initialLocale?: Locale>`, `useT()`, and `useLocaleControl()`.

- [ ] **Step 1: Add a failing public-module import test**

Append:

```ts
test('the public i18n module imports without browser storage globals', async () => {
  expect(Reflect.get(globalThis, 'window')).toBeUndefined();
  await expect(import('@/i18n')).resolves.toBeDefined();
});
```

Run `npm run test:unit -- i18n.test.ts`. Expected: FAIL because `@/i18n` does not exist.

- [ ] **Step 2: Implement provider and hooks without persistence**

Create a React context with `{ locale, setLocale }`; `<I18nProvider>` owns `useState<Locale>(initialLocale ?? 'my')`. `useT()` returns `{ locale, t(key: TranslationKey) }`; `useLocaleControl()` returns the context only for Task 7's development override. Throw a developer-facing error outside the provider. Do not access URL, `window`, cookies, IndexedDB, or storage in these modules.

- [ ] **Step 3: Export the stable API and verify it under Node**

`src/i18n/index.ts` re-exports the provider, both hooks, translation functions/dictionaries, and locale/key types. Run:

```powershell
npm run typecheck
npm run test:unit -- i18n.test.ts import-source-modules.test.ts
```

Expected: pass, including the M0 import-everything LAW-6 guard.

### Task 4: Build display and form primitives with token-only CSS Modules

**Files:**
- Create: `apps/pos/src/ui/{Button,Card,StatTile,Tag,Input,Select,Field,EmptyState,Skeleton}.tsx`
- Create: `apps/pos/src/ui/{Button,Card,StatTile,Tag,Input,Select,Field,EmptyState,Skeleton}.module.css`
- Create: `apps/pos/src/ui/index.ts`
- Modify: `apps/pos/src/app/globals.css`

**Interfaces:**
- Produces: public native-wrapper components for Tasks 5–7; no component owns app copy.
- Consumes: React native attributes and globally imported tokens.

- [ ] **Step 1: Add failing export-demo locators before component implementation**

Create `apps/pos/tests/e2e/demo.export.spec.ts` and retain the M0 request listener. Add expectations for `primary-button`, `button-danger`, `button-ai`, `tag-ok`, `demo-input`, `demo-select`, `empty-state`, and `skeleton`. The project filter arrives in Task 8; until then, running this named file against the existing static test server must fail on missing locators.

Run from `apps/pos` after `npm run build`:

```powershell
npx playwright test tests/e2e/demo.export.spec.ts
```

Expected: FAIL because the M0 route has none of the M1 locators.

- [ ] **Step 2: Implement the exact public props**

Implement these common contracts:

```ts
export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'ai';
export type ButtonSize = 'md' | 'sm';
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pill?: boolean;
};
export type TagTone = 'ok' | 'low' | 'amber' | 'blue' | 'ai';
```

`Input` and `Select` forward their native props/ref. `Field` accepts `label`, `htmlFor`, `hint?`, `error?`, and `children`. `Card` accepts children and `compact?`; `StatTile` accepts `label`, `value`, and `valueTone?`; `EmptyState` accepts translated heading, body, and optional action; `Skeleton` accepts `width?`, `height?`, and an `aria-label`. All interactive elements have a 40px minimum target.

- [ ] **Step 3: Implement v4 density from tokens only**

Cards use `var(--panel)`, `var(--line)`, `var(--r-card)`, and `var(--sh-subtle)`. Button md/sm use 11×22px and 8×15px padding, `var(--brand)`/`var(--brand-dk)` primary treatment, `var(--red)` danger, `var(--ai)` AI, and a tokenized ghost. Tags use 8px radius with the approved token pairs. Inputs/Selects use `var(--panel)`, `var(--r-input)`, `var(--steel)` placeholder text, and cobalt focus. Skeleton uses two surface tokens, not a literal color.

Extend `globals.css` without changing the existing font faces or focus rule:

```css
[data-locale='my'] { font-family: 'Padauk', 'Noto Sans Myanmar', sans-serif; line-height: 1.7; }
[data-locale='zh'] { font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif; }
```

- [ ] **Step 4: Export primitives and verify strict compilation**

Export every component from `src/ui/index.ts`, then run:

```powershell
npm run typecheck
npm run lint
npm run build
```

Expected: all three pass; the E2E locator test remains red until Task 7 composes the page.

### Task 5: Build controlled interactive primitives and overlay behavior

**Files:**
- Create: `apps/pos/src/ui/{Modal,Toast,Switch,PinPad,SyncChip,Tabs}.tsx`
- Create: `apps/pos/src/ui/{Modal,Toast,Switch,PinPad,SyncChip,Tabs}.module.css`
- Modify: `apps/pos/src/ui/index.ts`
- Modify: `apps/pos/tests/e2e/demo.export.spec.ts`

**Interfaces:**
- Produces: controlled interactions for the demo and future screen reuse.
- Consumes: Button conventions, token CSS, caller-provided translated labels, and Lucide icons.

- [ ] **Step 1: Write failing behavioral expectations**

Extend the export spec to exercise `demo-tabs`, `demo-modal-trigger`, `demo-modal`, `demo-toast-trigger`, `toast-viewport`, and `demo-pinpad`: select a second tab; close a modal with Escape and backdrop click; enqueue two toasts and prove only the first is visible before dismissal; enter `1234` and submit.

Run:

```powershell
npx playwright test tests/e2e/demo.export.spec.ts
```

Expected: FAIL because the interactive primitives do not exist.

- [ ] **Step 2: Implement controlled public APIs**

Use these shapes:

```ts
type ModalProps = { open: boolean; title: string; onClose(): void; children: ReactNode };
type SwitchProps = { checked: boolean; onCheckedChange(checked: boolean): void; label: string };
type PinPadProps = { value: string; maxLength?: number; onChange(value: string): void; onSubmit(): void; backspaceLabel: string; submitLabel: string };
type SyncChipProps = { state: 'synced' | 'syncing' | 'offline' | 'attention'; label: string; count?: number; progress?: number };
type TabsProps = { tabs: readonly { id: string; label: string }[]; activeId: string; onChange(id: string): void; label: string };
```

`Modal` uses `role="dialog"`, `aria-modal="true"`, and an Escape listener inside an effect only while open. Backdrop close checks `event.currentTarget === event.target`. `ToastProvider` owns a React `ToastEntry[]`; `useToast()` exposes `enqueue(message)` and `dismiss()`, while the viewport renders exactly one head message. `Switch` is a 42×24px `role="switch"` button. `PinPad` is controlled/numeric only. `Tabs` uses `tablist`, `tab`, and `aria-selected`. `SyncChip` stays presentational.

- [ ] **Step 3: Implement the approved visual language**

Modal overlay CSS is exactly `color-mix(in srgb, var(--ink) 40%, transparent)`. Toast is `var(--ink)` with `var(--panel)` text. Use `var(--brand)` for active switches/tabs, status tokens only for SyncChip dots, and only `var(--sh-subtle)`/`var(--sh-lg)` shadows. Use Lucide `Check`, `CloudOff`, `RefreshCw`, `TriangleAlert`, `Delete`, `CheckCircle2`, `X`, and `LogOut` only with translated caller-supplied accessible labels.

- [ ] **Step 4: Verify source safety before composition**

Run:

```powershell
npm run typecheck
npm run lint
npm run test:unit -- import-source-modules.test.ts
```

Expected: pass; no module-scope browser access enters the growing source tree.

### Task 6: Compose the reusable two-bar AppShell

**Files:**
- Create: `apps/pos/src/ui/AppShell.tsx`
- Create: `apps/pos/src/ui/AppShell.module.css`
- Modify: `apps/pos/src/ui/index.ts`
- Modify: `apps/pos/tests/e2e/demo.export.spec.ts`

**Interfaces:**
- Produces: `<AppShell>` with props `brand`, `location`, `tabs`, `activeTab`, `onTabChange`, `sync`, `userName`, `userRole`, `logoutLabel`, `onLogout`, and `children`.
- Consumes: Task 5 `Tabs`, `SyncChip`, Button, and Lucide `LogOut`.

- [ ] **Step 1: Add shell assertions that fail first**

Assert `app-shell`, `brand-bar`, `tab-rail`, `sync-chip`, and `shell-tab-home`. Check brand-bar computed height is `56px` and an active tab has a panel background. Run `npx playwright test tests/e2e/demo.export.spec.ts`; expected: FAIL because no AppShell exists.

- [ ] **Step 2: Implement composition without route/data ownership**

Render the white brand bar with brand/location props, grow spacer, optional complication slot, SyncChip, user identity, and a translated logout affordance. Render a cream rail with Tabs. AppShell accepts tab data and callbacks as props; it performs no navigation, fetch, storage access, or domain lookup.

- [ ] **Step 3: Implement exact v4 shell spacing**

Use 20px horizontal top-bar padding, 12px control gaps, 10px/14px/2px rail padding, 4px tab gaps, horizontal overflow for narrow widths, `var(--panel)` plus a `var(--line)` hairline for the 56px brand bar, and `var(--bg)` with white micro-shadowed active pills for the rail.

- [ ] **Step 4: Verify strict type and lint gates**

Run `npm run typecheck` and `npm run lint`. Expected: both pass; Task 7 will make AppShell observable in the export demo.

### Task 7: Replace M0 with the static component sheet and compile-time-gated dev override

**Files:**
- Modify: `apps/pos/src/app/page.tsx`
- Modify: `apps/pos/src/app/page.module.css`
- Modify: `apps/pos/src/app/layout.tsx`
- Modify: `apps/pos/tests/e2e/demo.export.spec.ts`
- Create: `apps/pos/tests/e2e/demo.locales.spec.ts`

**Interfaces:**
- Consumes: public APIs from `@/ui` and `@/i18n` only.
- Produces: the M1 root demo, M1 test IDs, default Burmese rendering, and a production-inert development override.

- [ ] **Step 1: Complete both failing E2E specs before composing the route**

In `demo.export.spec.ts`, retain the M0 request listener and exact baseline checks:

```ts
await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 249, 247)');
await expect(page.getByTestId('primary-button')).toHaveCSS('background-color', 'rgb(0, 104, 249)');
await expect(page.getByTestId('burmese-sample')).toHaveCSS('font-family', /Padauk/);
expect(externalRequests).toEqual([]);
```

Add `data-locale="my"`, Burmese default, Tabs/Modal/Toast/PinPad interactions, then visit `/?__devLocale=en` and assert locale remains `my` and `dev-locale-override` is absent.

Create `demo.locales.spec.ts`. It visits `/?__devLocale=my`, `en`, and `zh`; waits for the client effect; asserts Burmese Padauk and line-height at least 1.7, English fallback for the demo-only fallback probe in Burmese/Chinese, and a computed Chinese font-family declaration containing the required CJK system stack.

Run:

```powershell
npx playwright test tests/e2e/demo.export.spec.ts tests/e2e/demo.locales.spec.ts
```

Expected: FAIL because the root route and project setup are still M0.

- [ ] **Step 2: Compose the root route only from public components**

Keep `'use client'` in `page.tsx`. Wrap an inner demo in `<I18nProvider initialLocale="my">`; the inner component calls `useT()`. Render `<main data-testid="demo-root" data-locale={locale}>` with AppShell and a responsive component sheet. Pass `t(...)` into every visible label, placeholder, aria label, title, SyncChip label, and demo string.

Use React state only for active shell/demo tabs, Switch, controlled PIN, modal visibility, and Toast queue. Render every component, every Button/Tag/SyncChip variant, default/disabled/focusable states, and required IDs: `primary-button`, `burmese-sample`, `demo-modal-trigger`, `demo-toast-trigger`, `demo-pinpad`, `demo-tabs`, `demo-input`, `demo-select`, `empty-state`, `skeleton`, and `demo-fallback-probe`.

- [ ] **Step 3: Implement the production-inert override exactly once**

Declare in the route module:

```ts
const showDevLocaleOverride = process.env.NODE_ENV === 'development';
```

Only when that condition is true, render `DevLocaleOverride`. In that child only, use `useLocaleControl()` and parse `window.location.search` inside a post-mount `useEffect`; accept only `my`, `en`, and `zh` before calling `setLocale`. Render translated `<select data-testid="dev-locale-override">` controls for review. Production static output must neither render the control nor parse `__devLocale`.

- [ ] **Step 4: Replace M0 styles with the component-sheet layout**

Set 20px workspace padding, 10–14px component grids, Card groups, and a readable desktop component sheet at 1280px. Include capturable hover-equivalent, disabled, and focus-visible examples without inline component styling. Use CSS variables only. Render the root as `<main data-locale={locale} lang={locale === 'zh' ? 'zh-Hans' : locale}>` so CSS hooks and assistive technology both receive the active locale. Update M0-specific metadata to describe the component demo without introducing runtime component copy outside the dictionaries.

- [ ] **Step 5: Verify the static deployment path before configuring visual capture**

Run from `apps/pos`:

```powershell
npm run build
npx playwright test --project=e2e-export
```

Expected: once Task 8 config exists, the static project passes all M0 baseline checks and M1 interactions; production ignores `?__devLocale=en`.

### Task 8: Configure both Playwright projects and produce the screenshot evidence

**Files:**
- Modify: `apps/pos/playwright.config.ts`
- Modify: `apps/pos/tests/e2e/static-server.mjs`
- Modify: `apps/pos/tests/e2e/demo.export.spec.ts`
- Modify: `apps/pos/tests/e2e/demo.locales.spec.ts`
- Create: `apps/pos/tests/e2e/visuals.ts`
- Modify: `.gitignore`
- Create at runtime: `outputs/m1/*.png`

**Interfaces:**
- Consumes: Task 7 static export (`out/`), the Next dev server, and the local v4 HTML reference.
- Produces: one reliable E2E gate with `e2e-export` and `e2e-dev-locales`, plus review artifacts.

- [ ] **Step 1: Make the static test server accept deterministic arguments**

Extend `static-server.mjs` to parse `--root` and `--port`, defaulting to `out` and `4173`; retain the current path-traversal protection and MIME map. Run:

```powershell
node tests/e2e/static-server.mjs --root out --port 4173
```

Expected: server listens at `127.0.0.1:4173`; stop it after checking the root response.

- [ ] **Step 2: Declare a two-entry Playwright `webServer` array and two projects**

Import `fileURLToPath` from `node:url`, define `const appRoot = fileURLToPath(new URL('.', import.meta.url));`, set both server entries to `cwd: appRoot`, `reuseExistingServer: false`, and `timeout: 120_000`, then configure:

```ts
webServer: [
  {
    command: 'node tests/e2e/static-server.mjs --root out --port 4173',
    url: 'http://127.0.0.1:4173',
    cwd: appRoot,
    timeout: 120_000,
    reuseExistingServer: false,
  },
  {
    command: 'node ./node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 4174',
    url: 'http://127.0.0.1:4174',
    cwd: appRoot,
    timeout: 120_000,
    reuseExistingServer: false,
  },
],
projects: [
  {
    name: 'e2e-export',
    testMatch: /.*\.export\.spec\.ts/,
    use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 800 } },
  },
  {
    name: 'e2e-dev-locales',
    testMatch: /.*\.locales\.spec\.ts/,
    use: { baseURL: 'http://127.0.0.1:4174', viewport: { width: 1280, height: 800 } },
  },
],
```

The existing CI workflow already runs `npm run build` before exactly one `npm run test:e2e`; this configuration makes that one command start both servers and both projects. Do not add a CI job or a sixth gate.

- [ ] **Step 3: Capture the mandatory application screenshots at fixed viewport**

In `visuals.ts`, create `../../outputs/m1` from the app working directory and write stable images—not only transient `testInfo.outputPath` files:

```text
outputs/m1/app-shell-my.png
outputs/m1/component-sheet-states.png
outputs/m1/app-shell-en.png
outputs/m1/app-shell-zh.png
outputs/m1/modal-open.png
outputs/m1/comparison-shell.png
outputs/m1/comparison-components.png
```

The export project captures default Burmese shell, component-sheet default/hover-equivalent/disabled/focus-visible states, and modal-open. The dev project captures English and Chinese shell screens after the override resolves. All use the 1280×800 viewport; `component-sheet-states.png` may be a full-page screenshot at that viewport.

- [ ] **Step 4: Produce typographically faithful v4 side-by-side images with no live network**

Read `docs/reference/demo-v4.html` and the six local WOFF2 files from `apps/pos/public/fonts/`. In an isolated reference page, route the `fonts.googleapis.com/css2` request and fulfill it with an in-memory `@font-face` stylesheet mapping Inter 400/500/600/700 and Padauk 400/700 to deterministic virtual `fonts.gstatic.com` URLs. Route each virtual font URL and fulfill it with matching local font bytes and `font/woff2` content type. Then use `setContent`, set the demo state to a signed-in Home screen, and capture the reference shell/component images. Capture M1 counterpart buffers in a second page. Build each comparison in a third page with two data-URL PNG images in a two-column document, then screenshot it as `comparison-shell.png` or `comparison-components.png`. Reference typography is faithful while CI makes no live network request.

- [ ] **Step 5: Verify topology, both projects, and artifact existence**

Before the screenshot run, add this root ignore entry with `apply_patch`:

```text
outputs/m1/
```

Run from `apps/pos`:

```powershell
npm run build
npx playwright test --list
npm run test:e2e
Get-ChildItem '..\..\outputs\m1' -File | Select-Object Name,Length
```

Expected: the list names both projects, one E2E command passes both, and all seven non-empty PNGs exist.

### Task 9: Run all five gates and prepare Dan's M1 handoff

**Files:**
- Verify: `apps/pos/src/**`, `apps/pos/package.json`, `apps/pos/package-lock.json`, `apps/pos/tests/**`, `apps/pos/playwright.config.ts`
- Verify: `outputs/m1/*.png`
- Do not modify: `apps/pos/tokens.css`, `apps/pos/public/sw.js`, `apps/pos/public/manifest.webmanifest`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: every prior task and the existing five package scripts.
- Produces: M1's raw gate evidence and visual evidence; Dan performs the local commit and remote push.

- [ ] **Step 1: Re-prove immutable M0 token bytes**

Run from `apps/pos`:

```powershell
npm run test:unit -- tokens.test.ts
```

Expected: unchanged 597-byte checksum guard passes.

- [ ] **Step 2: Run the five gates in the required order and preserve raw output**

Run from `apps/pos`:

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run test:e2e
```

Expected: every command exits 0; E2E starts both servers, passes both projects, preserves zero external requests for export, and leaves the seven M1 PNGs.

- [ ] **Step 3: Audit scope and dependency drift**

Run from repository root:

```powershell
git diff -- apps/pos/tokens.css
rg -n -e '#[0-9a-fA-F]{3,8}' -e 'rgba?\(' apps/pos/src
node -e "const p=require('./apps/pos/package.json'); console.log(p.dependencies); console.log(p.devDependencies)"
```

Expected: no token diff; the literal-color search produces no matches in `apps/pos/src`; Lucide is the sole new exact dependency; all held pins remain unchanged.

- [ ] **Step 4: Send the owner handoff without Git commands**

Report file inventory, unabridged output for all five gates, seven paths under `outputs/m1`, and known gaps limited to deliberate M1 exclusions. Propose `ui: add component library and shell (M1)` as Dan's commit message. Do not commit or push.
