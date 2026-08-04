# Eden Clinic OS — Frontend Build Specification & Agent Instructions
**Version 1.2 · For the code-writing agent (Codex) · Owner: Dan · This document is law; deviations require Dan's written approval.**
**v1.2 (31 Jul): i18n expanded to THREE locales — my (default) / en (complete fallback) / zh Simplified Chinese (Dan's decision; Lashio border-trade clientele). LAW-11 + paragraph 10 updated; M1 now includes the minimal i18n module. This file is the living spec — amendments land at this same path.**
**v1.1 (31 Jul): M0 completed and CI green — §2 version-compatibility amendments recorded from real gate failures; §12 M0 marked done. Reference artifacts now live in-repo (paths below).**

Reference artifacts (in this repository — read before writing any code):
1. `docs/reference/demo-v4.html` — the clickable demo (SHA-256 starts `5990a868150eab64`). **Behavioral and visual reference**: every screen, flow, modal, and interaction must match it unless this spec says otherwise.
2. `docs/reference/LUSA-design-system.md` — design tokens and component rules (Dock-derived). Visual law.
3. `docs/reference/openapi.yaml` + `mock/mock-server.mjs` — the **executable contract** for sync behavior (`node mock/mock-server.mjs` → :4010). Never invent API shapes.

Repository: `github.com/DanSengAwng/eden-clinic-pos` (private). CI: GitHub Actions "M0 verification", five gates. **Workspace note:** the Codex sandbox has no GitHub credentials — commit locally as usual; pushes happen from Dan's session at milestone boundaries. Never treat inability to push as inability to commit.

---

## 0. How you (the agent) must work

1. **Small, single-purpose changes.** One module or one milestone step per PR/commit. Never a 3,000-line drop.
2. **Nothing is "done" until its verification commands pass.** Every milestone below lists them. Run them yourself before reporting done. A task reported done with failing checks is the worst possible outcome.
3. **Never invent.** If the spec, demo, and design doc don't answer a question, STOP and ask Dan. Do not guess API shapes, add fields, rename things, or "improve" flows. **Never precommit to a value (checksum, version, count) you did not derive from real bytes or a real registry.**
4. **Never add a dependency** outside the whitelist (§2) without asking. Justify in one sentence if you ask.
5. **Never delete or weaken a test** to make it pass. If a test seems wrong, ask.
6. **Match the demo pixel-close, not pixel-perfect.** Layout, hierarchy, spacing rhythm, and every token must match; sub-pixel differences are fine.
7. Commit messages: `module: imperative summary` (e.g. `sale: add split payment to tender modal`). Reference the milestone (`M3`).
8. When you finish a milestone, produce a short report: what was built, verification output, known gaps.

---

## 1. Product context (30 seconds)

Offline-first clinic POS + patient CRM for a clinic in Lashio, Myanmar (weeks-long internet outages are normal). PWA on Android (Chrome). Burmese UI default, English fallback. Money is integer Myanmar Kyat. The counter must trade with zero network, forever. A completed sale is **never lost and never blocked** — this is the prime directive; every rule below descends from it.

---

## 2. Stack & dependency whitelist

| Layer | Choice | Version policy |
|---|---|---|
| Framework | **Next.js (App Router) with `output: 'export'`** | Latest stable, pinned exact (16.2.12 at M0) |
| Language | **TypeScript, `strict: true`** — no `any` except in `*.test.ts` with a comment | ⚠ **Pinned to latest 5.x (5.9.3 at M0)** — see compatibility note |
| Type packages | **@types/react, @types/react-dom, @types/node** | pinned exact (whitelist amendment, M0) |
| Server state | **@tanstack/react-query** | pinned; enters lockfile at M2 |
| Local DB | **dexie** (IndexedDB) | pinned; enters at M2 |
| Validation | **zod** (runtime validation of API payloads & forms) | pinned; enters at M2 |
| Styling | **CSS Modules + one global `tokens.css`** — no Tailwind, no styled-components, no UI kit | — |
| Icons | **lucide-react** (monoline; replaces the demo's emoji) | pinned; enters at M1 |
| Linting | **eslint + eslint-config-next** | ⚠ **ESLint pinned to latest 9.x (9.39.5 at M0)** — see compatibility note |
| Unit tests | **vitest** + **fake-indexeddb** (fake-indexeddb enters at M2) | pinned |
| E2E tests | **@playwright/test** | pinned |
| Fonts | **Inter + Padauk, self-hosted in `/public/fonts` via `@font-face`** — NEVER a font CDN (offline-first) | — |

**Version-compatibility amendments (learned from real M0 gate failures — do not "upgrade" these without Dan's approval):**
- **TypeScript stays on 5.x** until typescript-eslint supports TS 7 (it hard-errors today). Also: TS 7 removed `baseUrl` — path aliases use `"paths": {"@/*": ["./src/*"]}` with relative form, which works on both lines.
- **ESLint stays on 9.x** until eslint-config-next's bundled plugins (eslint-plugin-react) support the ESLint 10 rule-context API (`getFilename` crash today).
- **Vitest + Next JSX:** Next requires tsconfig `jsx: "preserve"`; Vitest 4 must transform JSX itself via `oxc: { jsx: { runtime: 'automatic' } }` in `vitest.config.ts`. Tests using `import.meta.glob` need `/// <reference types="vite/client" />`.
- Re-evaluate both holds at each milestone boundary; upgrading is a one-line PR **after** its gates pass, never before.

That is the complete list. `date-fns`? No — use `Intl` and hand utilities. State manager? No — React state + Query + Dexie is the architecture. Anything else: ask.

`next.config`: `output: 'export'`, `images: { unoptimized: true }`. There are **no** Next API routes, **no** server components that fetch, **no** server actions. Every screen file starts with `'use client'`.

---

## 3. Repository layout (exact — created in M0)

```
apps/pos/
├── public/fonts/ …               # Inter 400/500/600/700, Padauk 400/700 (woff2) ✓ M0
├── public/manifest.webmanifest   # M7
├── public/sw.js                  # hand-written service worker — see §6.6 (M7)
├── src/
│   ├── app/                      # Next App Router: one route folder per screen
│   │   ├── layout.tsx            # shell: header (two bars), providers
│   │   ├── login/  home/  calendar/  clients/  clients/[id]/
│   │   ├── sale/  stocks/  analytics/  hub/  setup/
│   ├── modules/                  # ★ feature modules — the unit of ownership
│   │   ├── auth/  sale/  calendar/  patients/
│   │   ├── inventory/  analytics/  hub/  setup/
│   ├── data/                     # ★ the data layer — modules consume, never bypass
│   │   ├── db.ts  outbox.ts  api.ts  bootstrap.ts  types.ts  money.ts
│   ├── ui/                       # design-system components (§5.2) — dumb, tokenized
│   ├── i18n/  print/  flags/
├── tests/unit/                   # vitest
├── tests/e2e/                    # playwright (+ static-server.mjs serving out/)
└── tokens.css                    # imported once via globals.css · SHA-256 8d39f41e6710fa1edce202af74f118e76547a4172f5dc8073135e0f76eb09e82 · 597 bytes · checksum-guarded
```

**Module boundary law:** `modules/*` may import from `data/`, `ui/`, `i18n/`, `flags/`, `print/` — **never from another module**. Cross-module effects go through the data layer. Enforced since M0 by the `no-restricted-imports` matrix (schema note: each pattern object takes `group` as an **array** of strings) plus the lintText canary test, and LAW-6 by the import-everything-under-Node unit test.

---

## 4. Non-negotiable engineering laws

Each law has an ID. Cite the ID in code comments where you implement it.

- **LAW-1 (sale capture).** A completed sale must succeed with zero network. Sale + lines + payments write to Dexie and enqueue to the outbox in **one Dexie transaction**. No code path may block or discard a completed sale — not validation, not printing, not sync.
- **LAW-2 (idempotency).** Every created record (sale, patient, payment, consent, contact, product, stock-receive, appointment) gets a **client-generated UUID at creation**. The outbox may replay any item any number of times safely.
- **LAW-3 (outbox never drops).** 5xx → exponential backoff (30s → 15min, ±20% jitter), retry forever. 4xx → park as `attention`, keep forever, surface to a human. 401 → single-flight token refresh, continue. There is **no code path that deletes an unsynced record.**
- **LAW-4 (dependency gate).** An outbox item referencing another unsynced record (sale → new patient) waits for its parent. Parent parked ⇒ child waits. Re-read every item from Dexie immediately before sending (a patient merge can rewrite payloads mid-drain).
- **LAW-5 (money).** All amounts are **integer MMK** (`number`, whole kyat). All arithmetic lives in `data/money.ts`. Line total = `roundToStep(qty × unitPrice × (1 − lineDisc/100), step)`; receipt total = `roundToStep(subtotal × (1 − cartDisc/100), step)`; `step` from clinic config (100/500/1000, default 500). Derived values (balance due, outstanding, margin) are **computed, never stored**. `money.ts` ships with property-based tests (§11).
- **LAW-6 (no module-scope storage).** Dexie/IndexedDB/`window` are touched only inside client components after mount or inside `data/` functions called from effects/handlers. Never at module top level — static export prerendering executes module scope on Node. Enforced by ESLint selectors + the Node import-everything test (both live since M0).
- **LAW-7 (allergy visibility).** Patient allergies/alerts render at the counter view and in the sale cart **without any gate**. No elevation, no add-on flag, no collapse may ever hide them.
- **LAW-8 (gates).** Discount > 20% / custom price / pay-later over limit / refund → **admin PIN modal** (action stamped with approver, session unchanged). Analytics / clinical view / catalogue & price edits / staff accounts / export → **admin password elevation** (15-min, visible in header). Export and account create/delete always re-prompt.
- **LAW-9 (printing never blocks).** Printing is fire-and-forget from the sale flow. Printer failure → toast + offer PNG share. The receipt renderer takes `width: 576 | 384` dots.
- **LAW-10 (visible sync).** Header chip states: synced / syncing N (with progress during large drains) / offline / N attention. Logout and shift close are **blocked** while the outbox is non-empty.
- **LAW-11 (i18n).** Zero user-facing string literals in components. Everything through `useT()`. Locales: `my` (default) · `en` · `zh` (Simplified). `en` is the complete dictionary; `my` and `zh` fall back to `en` per key, never to the key name. Burmese renders in Padauk at line-height ≥1.7; Chinese renders on the system CJK stack (`"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif`) — no CJK font bundling, CJK fonts ship on every target device. Money formatting via one shared util (`12,500 Ks`).
- **LAW-12 (AI async).** AI add-on surfaces render from synced/cached data and degrade to nothing (or an enable-hint) when the flag is off or the network is down. No AI call may ever sit in a checkout or booking path.

---

## 5. Design system implementation

### 5.1 `tokens.css` (verbatim — do not editorialize; checksum-guarded since M0)

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

Rules: canvas is `--bg`, never pure white; `--brand` is the **only** filled-action color; `--ai` violet appears **exclusively** on AI add-on surfaces; semantic colors are status-only, never buttons (destructive `--red` excepted); borders always 1px `--line`; shadows only the two tokens. Type: Inter, body 15px/1.5, h1 20px/650, stat value 22px/650, caption 12–13px/500 uppercase with letter-spacing; Padauk for `my` strings.

### 5.2 `ui/` components (build in M1, use everywhere, extend never inline)

`Button` (variant: primary/ghost/danger/ai · size md/sm · pill) · `Card` · `StatTile` · `Tag` (ok/low/amber/blue/ai) · `Input`, `Select`, `Field` · `Modal` (20px radius, overlay `rgba(18,23,34,.4)`, ESC + backdrop close) · `Toast` (singleton queue) · `Switch` (cobalt on) · `PinPad` (reused by login + override) · `SyncChip` · `Tabs` (white-pill active) · `EmptyState` · `Skeleton`. Every interactive element ≥40px touch height, visible `:focus-visible` ring (`2px solid var(--brand)`).

### 5.3 `data/money.ts` exports (complete API)

`roundToStep(n, step)` · `lineTotal(line, step)` · `cartSubtotal(lines, step)` · `cartTotal(lines, cartDiscPct, step)` · `change(tendered, total)` · `marginPct(cost, price)` · `fmtMMK(n)`. Nothing else in the codebase does arithmetic on money.

---

## 6. Data layer

### 6.1 Dexie schema (`data/db.ts`, version 1)

| Table | Key | Indexed | Notes |
|---|---|---|---|
| `services` | id | category | name_mm, name_en, price, durationMin, requiresLot, followupDays |
| `products` | id | barcode, category | name, cost, price, stockQty, lowStockAt, stockType `retail|professional|injectable`, soldBy `each|weight`, unitLabel, photoKey, lots[] |
| `patients` | id | phone, name | code, allergies, alertNote, telegramLinked, followupDate |
| `sales` | id | at, patientId | lines[], payments[], totals, status, discounts+approver, followupDate, needsReview |
| `appointments` | id | date+staffId, patientId | time, serviceId, status `booked|here|done|cancelled` |
| `leads` | id | status | name, phone, channel, interest, patientId? |
| `contacts` | id | patientId | care-loop log: channel, direction, outcome incl. `better|same|worse` |
| `staff` | id | — | name, role, takesBookings (PINs never stored client-side) |
| `clinic` | singleton | — | config: roundingStep, creditLimit, receiptDesign, featureFlags, addons |
| `outbox` | seq (auto) | status | kind, payloadRef, uuid, attempts, nextAt, status `pending|inflight|attention|done` |
| `meta` | key | — | sinceCursor, serverTimeOffset, deviceId |

### 6.2 Outbox engine (`data/outbox.ts`) — state machine

Single drain loop, **sequential, oldest-first**. States: `pending → inflight → done | pending(backoff) | attention`. Triggers: app start, network `online` event, chip tap, post-enqueue. Rules: LAW-2/3/4 verbatim; on success run success-hooks (patient merge → rewrite queued payload references **before** their send); network failure aborts the pass and flips the UI offline immediately (a failed send is the health probe). Expose `useOutboxStatus()` → `{state, pendingCount, attentionCount, drainProgress}`.

### 6.3 API client (`data/api.ts`)

Base URL from env. Bearer token + single-flight refresh (concurrent 401s produce exactly one refresh call). Every response validated with zod; the documented error shape `{status, code, message}` drives outbox branching. **The mock server defines truth** — replay-returns-200-with-stored-row, patient merge answers `{merged_into}`.

### 6.4 Bootstrap & delta (`data/bootstrap.ts`)

Login → full bootstrap payload → Dexie upsert → record `serverTimeOffset` and `sinceCursor`. Foreground/interval → delta pull with cursor. Reads for the UI always come from Dexie via Query (`staleTime: Infinity` for catalogue; invalidate on sync writes).

### 6.6 Service worker (`public/sw.js`)

Hand-written, ~60 lines: precache the exported app shell + fonts on install; cache-first for shell/static; **network-only pass-through for `/api/*` — the SW never caches API responses** (the data layer owns data). Version bump busts cache; `skipWaiting` on user consent toast ("Update ready — restart").

---

## 7. Domain types

One `data/types.ts` with zod schemas + inferred TS types for every table row and API payload. IDs are `string` UUIDs. Dates: ISO strings; times: `HH:MM`. Money: integer MMK. The OpenAPI spec (`docs/reference/openapi.yaml`) is the API-shape source; Dexie row types stay owned here.

---

## 8. Screens — build to demo v4, acceptance criteria per screen

Shell: white brand bar (56px, hairline bottom: logo, complication chip when queue>0, SyncChip, user, logout) over cream tab bar (pill-active tabs: Home · Calendar · Clients · Sale · Stocks · Analytics · Hub · Set-up). Every screen ships loading skeleton + empty state.

**8.1 Login.** Staff picker → PinPad. Wrong PIN shakes + clears. Works fully offline after first bootstrap. ✓ e2e: login as staff and as admin.

**8.2 Home.** Morning-brief card (violet, `brief` flag; template-assembled lines from local data — no model calls, LAW-12) · 4 StatTiles (Collected/Delivered/New credit/Outstanding — computed, LAW-5) · today's appointments with Open · follow-ups due + care-loop feed (`careloop` flag) · complication banner with resolve action. ✓ e2e: flags off ⇒ violet surfaces gone, upsell hint shown.

**8.3 Calendar.** Day grid, columns = staff with `takesBookings`. Empty slot tap → booking modal prefilled (staff, time); "+ New patient" inside booking returns with patient selected (demo behavior). Double-booking a staff slot is refused. Appointment card: mark-arrived / charge→Sale prefilled / cancel. Booking enqueues offline. ✓ e2e: book via slot; refuse double-book; new-patient-inside-booking round-trip.

**8.4 Clients.** Search (name/phone, local, offline). New-patient form (name*, phone*, sex, Telegram, allergies) — phone dedupe on sync answers merge (LAW-4 hook). Profile: counter view always (allergy banner LAW-7, balance, follow-up, visits) · clinical view + recall card (`recall` flag) behind elevation (LAW-8). ✓ e2e: create patient offline → sync merge; clinical gate; recall card flag off ⇒ absent while clinical record remains.

**8.5 Sale.** Cart left / catalogue right (Services·Products tabs, category chips, search, scan input — HID scanner is keyboard+Enter; unknown barcode → add-product flow; `professional|injectable` scanned ⇒ refusal toast). Weight items → qty keypad. `requiresLot` → lot modal (DataMatrix prefills lot+expiry). Line edit (qty, note, remove). Discount chips 0–20%, custom >20% → PIN (LAW-8). Save/resume tickets. Tender: cash (quick amounts, change), KBZPay, Wave, **split payment across methods**, pay-later (named patient + PIN when over limit). Complete = one transaction (LAW-1) → receipt view (print + PNG share per LAW-9) → cart resets. Stock decrements locally. ✓ e2e: the full demo smoke flow **with network disabled**, then drain restores parity; property tests green.

**8.6 Stocks.** Table: photo, name, category, type tag, **Buy/Sell/Margin** (margin color-banded ≥40/≥20/<20), stock + low tag + lots, barcode; dead-stock tag under `insights` flag. Add product: barcode-first → server lookup (online-only; offline skips to manual) → manual form (photo, name, barcode, category, sold-by, cost, price + live margin, opening stock) — creates offline, dedupes on barcode at sync. Receive: qty, optional new cost, lot/expiry for injectables — offline-capable. Price/edit of existing = owner-gated. ✓ e2e: add product offline; margin math vs `money.ts`.

**8.7 Analytics.** Entirely behind elevation. Sales card Week/Month toggle (bars + totals from local sales), outcomes table (`outcomes` flag, from `contacts`), staff card, export button (always re-prompts, LAW-8). ✓ e2e: gate; flag-off upsell card.

**8.8 Hub.** Sub-tabs Team / Leads (convert→patient) / Money (shift expected-cash math, pay in/out, debtors + `insights` reminder-draft button, receipts list with reprint + PIN-gated refund that restocks and reverses credit) / Activities feed. ✓ e2e: refund flow; shift close blocked with non-empty outbox (LAW-10).

**8.9 Set-up.** AI add-on toggles (live, whole-app effect) · clinic config (rounding step **feeds money.ts live**, credit limit, language) · hardware (printer transport select, test print) · receipt design (header/sub/phone/footer/logo/QR/next-visit/width 80↔58) with live preview **driving the real renderer** · owner area behind elevation. `print/receipt.ts`: canvas renderer, Padauk-rendered Burmese, width param 576/384 → PNG blob (share) + raster bytes (print transport stub until hardware integration). ✓ unit: renderer snapshot at both widths; e2e: toggle QR off ⇒ next receipt omits it.

**8.10 Care-loop simulator** (demo parity, `careloop` flag): patient-phone modal, 😊😐😟 buttons; 😟 → complication banner + activity, **never bot advice** — human-queue copy verbatim from demo.

---

## 9. Flags & add-ons (`flags/`)

`useFlag(key)` reading clinic config: add-ons `brief · careloop · recall · outcomes · insights` (per-tenant, toggled in Set-up) + rollout flags (`calendar`, `leads` shipped dark in early milestones). A flag off ⇒ surface absent or one-line enable-hint — never a broken layout.

---

## 10. i18n (`i18n/`)

Flat typed dicts: `dict.en.ts` (complete — the fallback), `dict.my.ts` (default locale), `dict.zh.ts` (Simplified). Missing `my`/`zh` keys render `en`, never the key name; `useT()` typed by key union so a missing `en` key is a compile error. Burmese and Chinese copy: mark machine-drafted strings `// TODO(native-review)` — final copy by native speakers (Q41). The in-app language switcher ships with Set-up (M5); until then locale is a build-time default plus a dev-only override on the demo route so all three renderings are testable from M1.

---

## 11. Test gates (CI runs all; you run them before claiming done)

| Gate | Command | Contents |
|---|---|---|
| Types | `tsc --noEmit` | strict, zero errors |
| Lint | `eslint .` | incl. module-boundary + no-module-scope-storage rules |
| Unit | `vitest run` | tokens checksum (8d39f41e… / 597 bytes) · import-under-Node LAW-6 guard · boundary canary · **money property tests** (1,000+ random carts per LAW-5) · **outbox suite** (replay-idempotent, backoff schedule, 4xx→attention, dependency gate, merge-mid-drain rewrite) · renderer snapshots |
| E2E | `playwright test` | serves the static export; zero non-localhost requests; every ✓ line in §8, **plus the Lashio soak**: `context.setOffline(true)` → 30 mixed operations → online → full drain → Dexie state equals mock-server state |
| Build | `next build` (static export) | zero warnings treated as errors |

---

## 12. Milestones (strict order; each ends with all gates green)

| M | Deliverable | Status / done when |
|---|---|---|
| **M0** | Repo scaffold, tsconfig/eslint (boundary rules), tokens.css, fonts self-hosted, CI pipeline, token sanity page | ✅ **DONE 31 Jul** — CI green (`4b354b4`); local five-gate run green; pins: next 16.2.12 / TS 5.9.3 / eslint 9.39.5 / vitest 4.1.10 / playwright 1.62.1 / @types/react 19.2.18 / @types/react-dom 19.2.4 / @types/node (pinned) |
| **M1** | `ui/` component library + shell (two-bar header, tabs, SyncChip stub) rendered in a demo route (+ lucide-react enters, pinned) | visual match vs `docs/reference/demo-v4.html` screenshots |
| **M2** | Data layer: db, types, money, api, bootstrap, outbox — against the mock server (+ query/dexie/zod/fake-indexeddb enter, pinned) | unit gates green incl. property + outbox suites; no screens yet |
| **M3** | Login + Sale (the money path) | §8.1 + §8.5 e2e green **offline and online** |
| **M4** | Clients + Calendar | §8.3 + §8.4 green |
| **M5** | Stocks + Set-up (incl. receipt renderer + design panel) | §8.6 + §8.9 green |
| **M6** | Home + Hub + Analytics + flags | §8.2/8.7/8.8 green; add-on toggles verified |
| **M7** | Service worker + PWA manifest + Lashio soak + care-loop sim | full suite + soak green; installable on Android Chrome |

Do not reorder. Do not start M(n+1) with M(n) gates red.

---

## 13. Forbidden (instant rejection)

Server components fetching / API routes / server actions · Tailwind or any UI kit · font/CDN network dependencies · `localStorage`/`sessionStorage` for app data · floating-point money or arithmetic outside `money.ts` · storage access at module scope · deleting unsynced records · 4xx-driven data loss · cross-module imports · hiding allergies behind anything · unpinned dependencies · `any` outside tests · skipped/weakened tests · new user-facing strings outside i18n dicts · AI calls in capture paths · unapproved major-version upgrades of the §2 held packages.

---

## 14. When unsure

Ask Dan. One precise question with your recommended default. Never block silently; never guess loudly.
