# Eden Clinic OS M1 Design Record

**Status:** Architecture approved by Dan; this record is submitted for Dan's design review before implementation planning.

## Purpose and authority

M1 replaces the M0 token sanity page with a temporary, static-export-safe component demo at `/`. It establishes the reusable `src/ui/` component library, the two-bar application shell, a minimal three-locale i18n boundary, and visual evidence for comparison with the v4 reference. It deliberately does not add product screens, feature modules, a data layer, storage, a service worker, a manifest, or dependencies other than the approved icon package.

This record implements the following authorities:

- `docs/eden-frontend-build-spec-v1.1.md`, version **1.2** (the path is stable; the internal version is authoritative).
- `docs/reference/demo-v4.html`, verified before design with SHA-256 `5990A868150EAB64144808365FF1B8D89F076537CC6698D4F5A237537D9238B6`.
- `docs/reference/LUSA-design-system.md`.
- Dan's M1 approval and riders in this task.

## Chosen approach and scope fence

The chosen approach is a reusable primitive library in `src/ui/`, a composed `AppShell`, and a single temporary component-demo route. Each primitive owns its markup, accessibility behavior, and CSS Module; the demo only composes public component APIs and never reimplements their styling inline. Later product screens will use these same public APIs rather than fork controls.

M1 adds only `lucide-react@1.28.0`, pinned exactly. The version was resolved from `registry.npmjs.org` on 31 July and approved by Dan. TypeScript remains `5.9.3`, ESLint remains `9.39.5`, and every existing M0 dependency remains exactly pinned. React Query, Dexie, Zod, fake-indexeddb, a service worker, a manifest, feature modules, product routes, and persistence remain out of scope.

## File ownership

| Area | Files | Responsibility |
|---|---|---|
| i18n | `apps/pos/src/i18n/{types,dict.en,dict.my,dict.zh,I18nProvider,useT}.ts(x)` | Locale types, complete English source dictionary, partial Burmese/Chinese dictionaries, memory-only provider, and typed lookup hook. |
| primitives | `apps/pos/src/ui/<Component>.tsx` plus matching CSS Modules | One tokenized public component each: Button, Card, StatTile, Tag, Input, Select, Field, Modal, Toast, Switch, PinPad, SyncChip, Tabs, EmptyState, Skeleton. |
| UI entry point | `apps/pos/src/ui/index.ts` | Explicit public exports; screens never import primitive internals. |
| composition | `apps/pos/src/ui/AppShell.tsx` and CSS Module | White brand bar, cream tab rail, active pill tabs, static SyncChip, signed-in user affordance, and logout affordance. |
| temporary route | `apps/pos/src/app/{page,page.module}.tsx`, `layout.tsx` | Replace M0 content with the component sheet, demo-local state, and local `I18nProvider`. No dynamic segment or data access. |
| global type | `apps/pos/src/app/globals.css` | Retain the self-hosted Inter and Padauk faces, import checksum-guarded `tokens.css` once, add the Simplified Chinese system stack, and keep the global focus-visible rule. |
| tests/config | `apps/pos/tests/unit/i18n.test.ts`, `apps/pos/tests/e2e/*`, `apps/pos/playwright.config.ts` | I18n contract coverage, exported/static interaction coverage, development-locale visual coverage, and screenshot artifacts. |

`tokens.css` is not changed. It remains exactly 597 UTF-8 bytes with its approved checksum guard.

## Public component contracts

All component colors are CSS custom properties from `tokens.css`; no component CSS contains a literal color. Filled primary actions use `var(--brand)`, hover uses `var(--brand-dk)`, destructive actions use `var(--red)`, and AI actions use `var(--ai)`. Semantic tags use their matching foreground/background token pairs. CSS Modules use only the two specified shadow tokens, 1px `var(--line)` borders, and the established radius tokens.

| Component | Public behavior |
|---|---|
| `Button` | Native button attributes plus `variant: primary | ghost | danger | ai`, `size: md | sm`, and optional pill styling. It is at least 40px high, cobalt-focused, and uses Lucide only where the consumer supplies an icon. |
| `Card` | Tokenized white surface with the 16px radius, hairline, subtle shadow, and an optional padding mode. |
| `StatTile` | A Card-shaped statistic with caption label, value, and optional semantic value tone. |
| `Tag` | `ok | low | amber | blue | ai` status label. Violet is available only through the AI variant. |
| `Input`, `Select`, `Field` | Native form controls with composable label, supporting copy, error/status slot, correct association, 12px radius, and cobalt focus treatment. |
| `Modal` | Controlled `open` state, `title`, children, and `onClose`. It has `role="dialog"`, `aria-modal`, ESC close, and backdrop close. The overlay uses `color-mix(in srgb, var(--ink) 40%, transparent)`: this is an approved token-only equivalent to `rgba(18,23,34,.4)` because `--ink` is `#121722`. |
| `Toast` | A provider-backed singleton queue. Consumers enqueue tokenized message text; only the head toast is visible, then dismissal advances the queue. The viewport is a bottom-centre `var(--ink)` pill with `var(--panel)` text. |
| `Switch` | Controlled checked state, label, and change callback; a 42×24px tokenized control with cobalt on-state and a white thumb. |
| `PinPad` | Controlled numeric PIN input with dots, digits, backspace, and submit actions. It accepts translated accessible labels and callbacks, so it can later be reused by login and approvals. |
| `SyncChip` | Presentational stub with `synced | syncing | offline | attention` state plus optional count/progress. It has no network or storage behavior in M1. |
| `Tabs` | Controlled tab list with tokenized white active pill, keyboard-safe button semantics, and no underline/border active treatment. |
| `EmptyState` and `Skeleton` | Tokenized, accessible loading and zero-data primitives ready for later screens. |

`AppShell` takes translated branding, tab data, active tab, SyncChip state, and user/logout labels as props. Its M1 demo receives static values only. The brand bar is exactly 56px high, white, and hairline-separated; the tab bar is cream, horizontally scrollable on narrow displays, and uses white micro-shadowed active pills. No tab opens a product screen in M1.

## i18n architecture and LAW-6 boundary

`Locale` is exactly `'my' | 'en' | 'zh'`. `types.ts` owns an explicit `translationKeys` tuple and derives `TranslationKey` from it; `dict.en.ts` satisfies `Record<TranslationKey, string>`, making English completeness a compile-time requirement rather than a self-referential type. `dict.my.ts` and `dict.zh.ts` are `Partial<Record<TranslationKey, string>>`; every machine-drafted Burmese and Chinese string receives an adjacent `// TODO(native-review)` comment. `translate(locale, key)` returns the requested non-English entry when supplied, otherwise the English entry. It never returns a key name.

`useT()` exposes `t(key: TranslationKey)`, so an unknown translation key is a TypeScript error. A narrowly scoped `useLocaleControl()` exposes the current locale and `setLocale()` only to the development override; it is not a customer-facing language-switching surface. The route begins in Burmese (`my`). Burmese content applies Padauk and a minimum 1.7 line-height; Chinese applies exactly `"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif`, without bundling or fetching a CJK font. English uses the existing Inter stack.

The provider keeps locale state in React memory only. It does not read or write `window`, IndexedDB, localStorage, sessionStorage, cookies, URL state, or any future data adapter at module scope. This is an explicit LAW-6 constraint. Locale persistence is not part of M1.

### Development-only locale override

The demo supports an explicit `__devLocale=my|en|zh` query parameter and a small local override control only when `process.env.NODE_ENV === 'development'`. Query parsing happens in a client effect after mount; no browser global is read during module evaluation. The same compile-time condition prevents both the control and query behavior from being instantiated in the production static-export path. A production request with `?__devLocale=en` therefore remains Burmese and cannot reveal a switcher.

The in-app customer-facing language switcher remains a Set-up (M5) feature. The M1 override is review tooling only.

## Demo route and interactions

The root route remains statically exported and has no dynamic segment, server fetch, server action, API route, or module-scope storage access. It renders:

- the AppShell with the M1 default Burmese locale and a static synced chip;
- a component sheet containing every primitive, including Button variants/sizes/disabled state, all Tag tones, form controls, Switch, PinPad, SyncChip states, Tabs, EmptyState, Skeleton, and a sample StatTile/Card group;
- local React state for tab selection, switch, controlled PIN, modal open/close, and a multi-message toast enqueue action;
- development-only locale tooling as defined above.

Every visible word, aria label, and development control label is supplied through `useT()`. The route has no domain data and does not prebuild a future product screen.

## Test design and five-gate verification

The existing five gates remain authoritative: `typecheck`, `lint`, `test:unit`, `build`, and `test:e2e`. The E2E invocation remains one `playwright test` command, now with two required projects in the same gate.

### Unit coverage

`i18n.test.ts` verifies all three locale contracts without a browser:

1. The runtime English key set exactly equals the independently declared `translationKeys` tuple, while its `Record<TranslationKey, string>` type enforces completeness at compile time.
2. A deliberately absent Burmese and Chinese key resolves to the English value.
3. An `@ts-expect-error` fixture proves `useT()` rejects an unknown key at type-check time.

Existing M0 checksum, module-boundary, and import-under-Node LAW-6 tests remain unchanged. The new i18n modules must pass the import-under-Node suite with DOM globals absent.

### `e2e-export` Playwright project

This project is the deployed-reality test. It builds first, serves `apps/pos/out` through the existing static server, and retains every M0 baseline assertion:

- body background is `rgb(250, 249, 247)`;
- a primary action is `rgb(0, 104, 249)`;
- default Burmese text resolves to Padauk;
- no request has a destination outside `localhost` or `127.0.0.1`.

It also verifies that the default locale is Burmese; tabs switch; modal closes through ESC and its backdrop; the Toast provider displays one queued toast at a time; and the controlled PIN pad updates and submits. It navigates to `/?__devLocale=en` and asserts that locale remains Burmese and the dev control is absent, proving the override is inert in the static export.

### `e2e-dev-locales` Playwright project

This second mandatory project runs from the same `playwright test` invocation against `next dev`, never as a separate gate. It uses the development-only override to show `my`, `en`, and `zh`. It asserts Burmese Padauk with line-height at least 1.7, verifies English fallback where Burmese/Chinese keys are deliberately absent, and verifies the specified Chinese system CJK family appears in the computed font stack. Its unique purpose is locale visual/rendering proof; unit tests independently guarantee fallback correctness.

## Screenshot evidence for Dan's M1 review

Playwright captures review artifacts at a 1280×800 viewport. The M1 report will include local paths to:

1. AppShell at 1280×800 with the default Burmese locale.
2. The full component sheet, showing all primitives and all capturable default, disabled, hover-equivalent, and focus-visible states.
3. One AppShell image for each `my`, `en`, and `zh` rendering through the dev-only override.
4. An open-modal image demonstrating the approved token-derived overlay.
5. Side-by-side comparison images pairing the shell/component evidence with the same v4 reference elements from `docs/reference/demo-v4.html`.

Visual similarity is not encoded as a passing assertion; Dan judges these images against v4 after all mechanical gates pass.

## Completion and handoff

M1 is complete only when every component above is present in the demo, both Playwright projects pass under the single E2E gate, the remaining four gates pass, the visual evidence exists, and the report lists file inventory, unabridged output, visual paths, and known gaps. The implementation commit is local and follows `ui: imperative summary (M1)`. Dan performs the push and CI run at the milestone boundary; absence of GitHub credentials never blocks local implementation or verification.
