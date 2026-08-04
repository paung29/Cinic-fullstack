# Eden Clinic OS — M0 Foundation Design

**Status:** approved in conversation; awaiting review of this written record before implementation  
**Scope:** M0 only. M1 and later milestones are expressly out of scope.

## Purpose

Establish a reproducible, offline-safe frontend foundation for Eden Clinic OS. M0 proves that a static Next.js export can build, load, use the specified visual tokens and local fonts, and pass the project’s core engineering fences before any clinical, sales, sync, or feature-module behavior is introduced.

The implementation must preserve the build specification’s milestone order. M0 does not include the UI component library, application shell, PWA manifest, service worker, IndexedDB schema, sync engine, API client, or product screens.

## Project surface and runtime

Create the exact `apps/pos` project surface prescribed by the build specification. It will use Next.js App Router with static export enabled and unoptimized images. TypeScript runs in strict mode. Before `package.json` is written, resolve every M0 dependency directly from the npm registry and record the resulting table; every dependency then uses that exact version, never a caret or tilde range, and the committed lockfile is authoritative. CI and `.nvmrc` use the current Node LTS patch verified from Node.js release metadata, while `package.json` declares the compatible major line as `node: 24.x`.

Only the allowed stack is permitted: Next.js, TypeScript, React Query, Dexie, Zod, Lucide, Vitest plus fake IndexedDB, and Playwright. M0 installs only `next`, `react`, `react-dom`, TypeScript, ESLint plus its Next configuration, Vitest, and Playwright; React Query, Dexie, Zod, fake IndexedDB, and Lucide first enter the lockfile at their first-use milestones. No extra helper, styling, UI, font, or assertion library is added. Styling uses CSS Modules and a single global `tokens.css`; Tailwind and UI kits are prohibited.

The project contains no API routes, server actions, server-side fetching, service worker, web manifest, product data layer, or feature module implementation in M0. The service worker and manifest remain exclusively M7 work. The full §3 directory tree is nevertheless created in M0: all future module and route folders, plus `data`, `ui`, `i18n`, `print`, `flags`, and both test folders exist with `.gitkeep` placeholders wherever M0 does not yet own a real file. This lets the boundary configuration resolve against the final structure from day one.

## Token sanity page

The initial static route is a temporary token sanity page, not a generic hello-world screen. Its four controls are page-local markup and a page-local CSS Module; it does not create or imply `ui/Button` or any other M1 component. It renders:

- The required cream page canvas and a compact palette swatch set.
- One control for each specified button variant: primary, ghost, danger, and AI.
- A Burmese string, `ကျေးဇူးတင်ပါသည်`, marked as Burmese content and styled through the Padauk font family.

The page is deliberately small and is replaced by the M1 shell. It is nevertheless production-quality in its baseline accessibility: buttons have text labels, controls meet the 40px minimum touch height, and focus-visible uses the cobalt ring.

`tokens.css` contains the exact bytes from §5.1 of the frontend build specification and is imported once at the application root. No token values are restyled, renamed, or supplemented. The sanity page consumes those tokens rather than duplicating color values inline.

## Offline fonts

Bundle Inter weights 400, 500, 600, and 700 and Padauk weights 400 and 700 as local WOFF2 assets below `apps/pos/public/fonts`. Define them with `@font-face` and `font-display: swap`. Inter is the default interface font; Padauk is applied to Burmese content at a line height of at least 1.7.

No font CDN or any other external asset request is allowed. The browser smoke test watches every request from the exported static site and fails on every destination other than the local test server. This is the mechanical proof that the first release has no network dependency for typography.

## Engineering fences

### Module boundaries

M0 configures ESLint’s `no-restricted-imports` matrix before feature code exists. It prevents every `modules/*` folder from importing another feature module while allowing the approved shared layers: `data`, `ui`, `i18n`, `flags`, and `print`. Cross-feature effects must flow through the data layer when those modules are added in later milestones.

### LAW-6: no module-scope browser storage

M0 establishes two complementary protections.

1. Best-effort ESLint restrictions flag top-level references through `window`, `document`, `indexedDB`, `localStorage`, and related browser storage entry points.
2. A unit test discovers and imports every source module under plain Node with DOM globals absent. Any module-scope browser or IndexedDB access throws a `ReferenceError` and fails the suite. Discovery is pattern-based, so newly added source modules are automatically covered.

These fences do not replace careful code review. They make the static-export failure mode visible in CI before it reaches a device.

### Token drift guard

A Vitest test reads `tokens.css` and asserts its canonical UTF-8, no-BOM, LF-only, single-final-newline byte count of 597 plus its fixed SHA-256: `8d39f41e6710fa1edce202af74f118e76547a4172f5dc8073135e0f76eb09e82`. Its source comment says that a token change requires Dan’s approval. This makes unauthorized palette or geometry edits fail CI rather than slipping through review.

## Verification and CI

All five project gates run from M0 onward:

1. **Types:** `tsc --noEmit` succeeds with zero errors.
2. **Lint:** `eslint .` enforces strict TypeScript-adjacent project rules, module boundaries, and the best-effort LAW-6 checks.
3. **Unit:** `vitest run` runs the source-import guard, token checksum guard, and a minimal sanity test suite.
4. **E2E:** `playwright test` serves the output of `next build` statically, never the development server. It asserts the page background resolves to `rgb(250, 249, 247)`, the primary control to `rgb(0, 104, 249)`, and the Burmese element’s resolved font family includes `Padauk`. It also asserts that the page makes zero non-localhost network requests.
5. **Build:** `next build` produces a warning-free static export.

CI executes the same commands against a pinned Node LTS version and uses the committed lockfile for deterministic installation.

## Acceptance criteria

M0 is complete only when the exact repository structure exists, all fonts are local WOFF2 assets, the temporary sanity page renders the prescribed tokens and Burmese content, and all five verification gates pass. A short milestone report will list the files and behaviors created, the outcome of each gate, and the intentional gaps.

## Intentional gaps

The following are deferred by design: reusable UI components and navigation shell (M1); domain types, money functions, IndexedDB, API integration, bootstrap, and outbox behavior (M2); all product workflows (M3–M7); and the manifest, service worker, and installability work (M7). The mock API and OpenAPI contract are retained as M2 inputs; no API shapes are guessed in M0.
