# Eden Clinic OS — M6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. M6 is intentionally sequential: data invariants → session/shell policy → diagnostics and renderer → product surfaces → exported-output proof.

**Goal:** Deliver the authenticated Today screen, local admin shift close, canonical A4 Switch user handover, persistent browser-storage diagnostics with secure support export, and COPY-marked receipt reprints.

**Architecture:** `data/todaySummary.ts` owns injected-clock business-day selection and all operational selectors; `data/shiftClose.ts` records a local immutable close audit without creating an API contract or outbox item. `SessionController` exposes a separate memory-only `switchUser()` seam while `AppShell` receives distinct cart and drain policy inputs. Browser storage is composed only after mount in the provider, and print reuses the one M5 raster renderer through a shared `ReceiptViewer`.

**Tech Stack:** Next.js static export, React 19, TypeScript 5.9, Dexie, Zod 4, Vitest/fake-indexeddb, Playwright, self-hosted Inter/Padauk/Lora/Playfair fonts. No dependency changes.

## Global Constraints

- Work only inside M6 scope; do not add an OpenAPI route, outbox kind, service worker, CSP, manifest, Hub, Analytics, refund, pay-in/pay-out, physical printer protocol, or dependency.
- Preserve `tokens.css` exactly (597 bytes; SHA-256 `8d39f41e6710fa1edce202af74f118e76547a4172f5dc8073135e0f76eb09e82`).
- Use exact pinned packages already in `package.json`/`package-lock.json`; M6 leaves both files byte-identical.
- All new visible copy is a typed `useT()` key; `dict.en.ts` is complete and every drafted `dict.my.ts`/`dict.zh.ts` value has `// TODO(native-review)`.
- LAW-5: every new MMK calculation lives in `src/data/money.ts`; do not calculate money in a component.
- LAW-6: no browser/storage read at module scope. `navigator.storage`, `document`, Blob download, and `URL.createObjectURL` occur only in effects or user handlers.
- LAW-8: support export always performs a fresh online password elevation; a PIN is never an export credential.
- LAW-9: reprint transport is fire-and-forget and failure leaves the receipt/sale intact.
- LAW-10: logout and shift close are drain-gated; A4 Switch user is never drain-gated and has only the explicit in-memory cart/tender guard.
- Every new E2E test ID must appear in the renderer before its spec is written. E2E continues to use the static export at `4173`, dev locales at `4174`, mock at `4010`, and `workers: 1`.
- Git writes are owner-session only. During implementation use read-only `git status`/`git diff`; do not stage, commit, pull, or push. Regeneratable captures stay under ignored `outputs/m6/`.

## File structure and ownership

| File | Responsibility |
|---|---|
| `src/data/money.ts` | Pure MMK helpers for payment-method reconciliation, expected cash, and cash difference. |
| `src/data/todaySummary.ts` | One device-local business-day window plus pure Today selectors and aging bands. |
| `src/data/shiftClose.ts` | Admin/drain validation and transactional device-local shift-close audit records. |
| `src/data/storageDiagnostics.ts` | Browser-storage capability controller, with injected `StorageManager`-like API. |
| `src/data/supportExport.ts` | Redacted non-done outbox export document only; no DOM download side effect. |
| `src/modules/setup/supportExport.ts` | Fresh-elevation export orchestration with injected download callback. |
| `src/modules/auth/sessionController.ts` | Separate memory-only `switchUser()` operation. |
| `src/app/providers.tsx` | Post-mount storage controller composition and state publication. |
| `src/ui/AppShell.*` | Header switch action and one compact persistent storage attention line. |
| `src/print/receipt.ts` | Optional translated `copy-marker` layout/raster run. |
| `src/print/ReceiptViewer.tsx` | Shared receipt image/print/share presentation for Sale and Today. |
| `src/modules/today/TodayScreen.*` | Today composition, close modal, history/reprint workflow. |
| `src/modules/setup/SetupScreen.*` | Storage diagnostics card and fresh-elevation support-export flow. |
| `src/app/page.tsx` | Authenticated Today entry route, with cold-load redirect to `/login`. |
| existing screen modules | Today tab, explicit A4 action, separate logout drain guard, and compact storage state prop. |
| `src/i18n/*` | Typed copy for every M6 surface in all locales. |
| `mock/mock-server.mjs`, `tests/e2e/mock.ts` | `/__state` test-harness-only sale-state reader and its typed helper. |
| `tests/unit/*`, `tests/e2e/m6.export.spec.ts`, `tests/e2e/visuals.ts` | TDD coverage, static-export workflow proof, and M6 evidence captures. |

---

### Task 1: Reconciled Today selectors and injected business-day math

**Files:**
- Create: `apps/pos/src/data/todaySummary.ts`
- Create: `apps/pos/tests/unit/today-summary.test.ts`
- Modify: `apps/pos/src/data/money.ts`
- Modify: `apps/pos/tests/unit/money.test.ts`

**Consumes:** existing `SaleRow`, `PatientRow`, `ProductRow`, `StaffRow`, `OutboxStatusView`, `patientOutstanding()`, and integer-MMK conventions.

**Produces:**

```ts
export type BusinessDayWindow = { day: string; startMs: number; endMs: number };
export function businessDayWindow(now: number): BusinessDayWindow;
export type MethodTotals = {
  cash: number; kbzpay: number; wave: number; otherMethods: number;
  totalCollected: number; credit: number;
};
export function paymentMethodTotals(sales: readonly SaleRow[]): MethodTotals;
export function expectedCash(openingCash: number, cashSales: number): number;
export function cashDifference(countedCash: number, expected: number): number;
export function summarizeToday(input: TodaySummaryInput): TodaySummary;
```

- [ ] **Step 1: Add failing money tests for method reconciliation and close arithmetic.**

  Add sales containing cash, KBZPay, Wave, bank, other, write-off, credit, and a voided sale. Assert completed payment rows produce the exact named buckets, `credit` is not included in collected money, and `cash + kbzpay + wave + otherMethods === totalCollected`. Add a deterministic 1,000-case loop that generates integer payment amounts and asserts the same invariant. Add exact `expectedCash(100_000, 55_000) === 155_000` and `cashDifference(160_000, 155_000) === 5_000` examples.

- [ ] **Step 2: Run the money test before implementation.**

  Run: `npm.cmd run test:unit -- money.test.ts`  
  Expected: FAIL because the M6 exports do not exist.

- [ ] **Step 3: Add the minimal money helpers.**

  In `money.ts`, filter voided rows once, sum integer payment amounts by method, aggregate `bank|other|writeoff` into `otherMethods`, and calculate `totalCollected` from the four collected buckets. Keep `credit` separate. Implement `expectedCash()` and `cashDifference()` as direct integer additions/subtractions with names that state their cash-drawer meaning.

- [ ] **Step 4: Add failing `todaySummary` boundary and grouping tests.**

  Use an injected `now` immediately after local midnight. Create one sale at `23:59` and one at `00:01`; assert `businessDayWindow()` includes only the latter. Assert a staff grouping uses immutable `sale.staffId`, low-stock includes `stockQty <= lowStockAt`, and each debtor’s oldest positive-credit completed sale yields bands `0–7`, `8–30`, `31–60`, and `61+`. Explicitly check the edges: days 7/8, 30/31, and 60/61. Assert `needsReview` and `OutboxStatusView` pending/attention counts are returned independently.

- [ ] **Step 5: Implement `todaySummary.ts` without browser globals.**

  Use one `businessDayWindow(now)` implementation based on device-local `Date` midnight and a next-midnight-exclusive end. `summarizeToday()` accepts all rows plus `now`, invokes that window exactly once, sends only current-day completed sales to `paymentMethodTotals()`, groups staff totals by row `staffId`, derives debtors from all completed credit sales, and returns a recent-sale list sorted newest-first. Do not call `Date.now()` or read Dexie inside the selector.

- [ ] **Step 6: Run the focused unit tests.**

  Run: `npm.cmd run test:unit -- money.test.ts today-summary.test.ts`  
  Expected: PASS, including the reconciliation property loop and all midnight/aging edges.

---

### Task 2: Transactional local shift-close record

**Files:**
- Create: `apps/pos/src/data/shiftClose.ts`
- Create: `apps/pos/tests/unit/shift-close.test.ts`
- Modify: `apps/pos/src/data/db.ts` only if a typed key helper belongs beside existing meta-key helpers

**Consumes:** `BusinessDayWindow`/`summarizeToday` data shape from Task 1, Dexie `sales`, `outbox`, and `meta` tables, and active session identity supplied by the caller.

**Produces:**

```ts
export type ShiftCloseRecord = {
  version: 1; id: string; deviceId: string; day: string; closedAt: string;
  closedByStaffId: string; openingCash: number; cashSales: number;
  expectedCash: number; countedCash: number; difference: number;
  pendingCount: number; attentionCount: number;
};
export class ShiftCloseAdminRequiredError extends Error {}
export class ShiftCloseSyncRequiredError extends Error {}
export function shiftCloseAuditMetaKey(id: string): string;
export function currentShiftMetaKey(deviceId: string, day: string): string;
export async function closeShift(input: CloseShiftInput): Promise<ShiftCloseRecord>;
```

- [ ] **Step 1: Write failing transaction tests using fake IndexedDB.**

  Seed same-day and prior-day cash sales plus a pending row, an attention row, and a done row. Assert staff role rejects with `ShiftCloseAdminRequiredError`; pending or attention rejects with `ShiftCloseSyncRequiredError`; done alone does not block. On success assert one immutable `shift-close:v1:<uuid>` audit has exactly the opening, cash-sales, expected, counted, difference, device, actor, day, and status snapshot values. Assert its current-day key retains the opening and latest close ID. Add a mutation test that inserts a pending outbox row immediately before the transactional write and expects refusal.

- [ ] **Step 2: Run the new test before implementation.**

  Run: `npm.cmd run test:unit -- shift-close.test.ts`  
  Expected: FAIL because `shiftClose.ts` does not exist.

- [ ] **Step 3: Implement `closeShift()` as one Dexie read/write transaction.**

  Begin a transaction across `sales`, `outbox`, and `meta`. Validate `actorRole === 'admin'`, derive the window through Task 1’s `businessDayWindow(now)`, re-read current-day sales, and reject if an outbox row has `pending`, `inflight`, or `attention` status. Calculate cash sales exclusively with Task 1’s method totals and MMK helpers. Put a new immutable audit key and update only the typed current-shift summary key. Do not modify sales/outbox rows and do not dispatch any request.

- [ ] **Step 4: Run focused data tests.**

  Run: `npm.cmd run test:unit -- today-summary.test.ts shift-close.test.ts`  
  Expected: PASS, including the pre-write drain recheck.

---

### Task 3: Canonical A4 session seam, typed copy, and shell policy

**Files:**
- Modify: `apps/pos/src/modules/auth/sessionController.ts`
- Modify: `apps/pos/tests/unit/session-controller.test.ts`
- Modify: `apps/pos/src/ui/AppShell.tsx`
- Modify: `apps/pos/src/ui/AppShell.module.css`
- Modify: `apps/pos/src/modules/sale/SaleScreen.tsx`
- Modify: `apps/pos/src/modules/calendar/CalendarScreen.tsx`
- Modify: `apps/pos/src/modules/patients/ClientsScreen.tsx`
- Modify: `apps/pos/src/modules/inventory/StocksScreen.tsx`
- Modify: `apps/pos/src/modules/setup/SetupScreen.tsx`
- Modify: `apps/pos/src/i18n/types.ts`, `apps/pos/src/i18n/dict.en.ts`, `apps/pos/src/i18n/dict.my.ts`, `apps/pos/src/i18n/dict.zh.ts`, `apps/pos/tests/unit/i18n.test.ts`

**Consumes:** Task 1 has no UI dependency. This task establishes the named session and shell contracts that Tasks 4–7 use.

**Produces:**

```ts
export type SessionController = {
  // existing members
  switchUser(): void;
};

export type AppShellProps = {
  // existing members
  switchUserLabel: string;
  switchUserDisabled: boolean;
  onSwitchUser(): void;
  storageAttention?: string;
};

// SaleScreen only; do not export or reuse as a sync gate.
const hasUncommittedCart = draft.lines.length > 0 || tenderOpen;
```

- [ ] **Step 1: Add failing A4 unit tests.**

  In `session-controller.test.ts`, create two committed envelopes and an outbox row. Call `switchUser()` on the active staff and assert: state is `signed-out`; access token, active secret, retained key, and elevation subscription outcome are cleared; `auth-envelope:*`, existing queue row bytes, staff rows, and device meta bytes are unchanged. Assert a fresh offline unlock of the switched-out staff still succeeds. Keep the existing logout test unchanged so the two semantics remain independently named.

- [ ] **Step 2: Run the session test before implementation.**

  Run: `npm.cmd run test:unit -- session-controller.test.ts`  
  Expected: FAIL because `switchUser()` is absent.

- [ ] **Step 3: Implement the session seam and shell controls.**

  Add `switchUser()` to the controller interface and implementation. It clears only memory and emits signed-out state; it never queries or writes `db`. Add a compact header Switch user button with `data-testid="switch-user"`; add its disabled prop and a compact, optional storage-attention line to `AppShell`. Use self-hosted Lucide only if an already-installed icon is needed; no literal colours.

  Update every current `AppShell` caller to provide the new props, add a Today tab (`id: 'today'`, route `/`), and route `onSwitchUser` directly to `runtime.session.switchUser(); router.push('/login')`. Implement separately named `hasDrainBlockingSyncWork(status)` logic at each logout decision using only `pendingCount`/`attentionCount`; do not call it from the switch action. In Sale define the local `hasUncommittedCart` expression above and pass it as `switchUserDisabled`; every non-sale module passes `false`.

- [ ] **Step 4: Add all M6 translation keys before using them in later JSX.**

  Add English entries to the `translationKeys` tuple in `types.ts` for Today labels, cash-method names, total/other reconciliation, staff/review/pending/debt/low-stock states, shift-close inputs/status/errors, switch user, storage warning/diagnostics/support export/internet-required state, sale history/reprint, and receipt COPY marker. Add draft Burmese and Simplified Chinese values for each with the required native-review comments. Extend `i18n.test.ts` so its explicit draft-locale assertion covers the M6 key set. Keep `translationKeys` as the authoritative union so an omitted English key fails typecheck.

- [ ] **Step 5: Run focused tests and static checks.**

  Run: `npm.cmd run test:unit -- session-controller.test.ts i18n.test.ts`  
  Run: `npm.cmd run typecheck`  
  Expected: PASS. Verify no module imports another feature module and no session/outbox persistence changed.

---

### Task 4: Post-mount storage controller and redacted export document

**Files:**
- Create: `apps/pos/src/data/storageDiagnostics.ts`
- Create: `apps/pos/src/data/supportExport.ts`
- Create: `apps/pos/tests/unit/storage-diagnostics.test.ts`
- Create: `apps/pos/tests/unit/support-export.test.ts`
- Modify: `apps/pos/src/app/providers.tsx`

**Consumes:** existing provider composition root, `OutboxStatusView`, and typed outbox rows. Task 3 supplies the shell storage-attention prop.

**Produces:**

```ts
export type StorageStatus =
  | { kind: 'granted'; usage?: number; quota?: number }
  | { kind: 'not-granted'; usage?: number; quota?: number }
  | { kind: 'unavailable' };
export type StorageDiagnostics = {
  state(): StorageStatus;
  requestPersistence(): Promise<StorageStatus>;
  refresh(): Promise<StorageStatus>;
};
export function createStorageDiagnostics(storage: StorageManagerLike | undefined): StorageDiagnostics;

// Added to ClinicRuntime; it exposes the already-injected provider clock.
now(): number;

export type SupportOutboxExport = {
  version: 1; exportedAt: string; deviceId: string; status: OutboxStatusView;
  rows: readonly OutboxRow[];
};
export function buildSupportOutboxExport(input: BuildSupportOutboxExportInput): SupportOutboxExport;
```

- [ ] **Step 1: Write failing injected-API storage tests.**

  Test a fake `StorageManagerLike` that grants, one that returns `false`, one whose `persist()` rejects, and `undefined`. In each case assert no throw, correct status kind, and optional usage/quota values. Assert `persist()` is called once only by `requestPersistence()` and `refresh()` never asks again.

- [ ] **Step 2: Write failing export-document tests.**

  Pass pending, inflight, attention, and done outbox rows. Assert the document retains only the three non-done rows and contains the supplied version/timestamp/device/status. Serialize it and assert it has no `auth-envelope`, refresh token, elevation token, printer profile, locale profile, or unrelated meta value.

- [ ] **Step 3: Run both tests before implementation.**

  Run: `npm.cmd run test:unit -- storage-diagnostics.test.ts support-export.test.ts`  
  Expected: FAIL because both data modules are absent.

- [ ] **Step 4: Implement the pure controllers and compose them after mount.**

  `storageDiagnostics.ts` accepts only an injected API; it has no global `navigator` reference. In `ClinicRuntimeProvider` after `clinicDb.open()` and runtime creation, read `navigator.storage` inside the existing effect, instantiate the controller, request persistence once, and bump provider revision when its promise settles. Add the controller and `now: () => clock.now()` to `ClinicRuntime` so screens can refresh/read browser state and pass one injected clock to data helpers. An unavailable/rejected result is non-fatal. Do not add a `navigator.onLine` listener or a service worker.

  `supportExport.ts` builds the plain redacted document only. Blob creation, anchor clicking, and URL revocation remain UI event-handler work in Task 7.

- [ ] **Step 5: Run focused data tests plus the LAW-6 module import guard.**

  Run: `npm.cmd run test:unit -- storage-diagnostics.test.ts support-export.test.ts import-source-modules.test.ts`  
  Expected: PASS. Confirm the source-module guard imports the new data files without DOM globals.

---

### Task 5: One renderer, COPY raster run, and reusable receipt viewer

**Files:**
- Create: `apps/pos/src/print/ReceiptViewer.tsx`
- Create: `apps/pos/src/print/ReceiptViewer.module.css`
- Modify: `apps/pos/src/print/receipt.ts`
- Modify: `apps/pos/src/modules/sale/SaleScreen.tsx`
- Modify: `apps/pos/src/modules/sale/SaleScreen.module.css`
- Modify: `apps/pos/tests/unit/receipt.test.ts`
- Modify: `apps/pos/tests/unit/sale-receipt.test.ts` if it owns the existing modal assertions

**Consumes:** M5 `renderReceipt()`, `RenderedReceipt`, selected `PrinterProfile`, `PrinterTransport`, and Task 3's translated copy key.

**Produces:**

```ts
export type ReceiptRenderInput = {
  sale: SaleRow; clinic: ClinicRow; width: 576 | 384; palette: ReceiptPalette;
  copyMarker?: string;
};
export type ReceiptRun['kind'] = /* existing */ | 'copy-marker';
export function ReceiptViewer(props: {
  rendered: RenderedReceipt | undefined; imageUrl: string | undefined;
  printerProfile: PrinterProfile | undefined; isCopy: boolean;
  labels: ReceiptViewerLabels; onDone(): void; onTransportError(): void;
}): JSX.Element;
```

- [ ] **Step 1: Add failing renderer tests.**

  Build a normal input and a `copyMarker: 'COPY'` input. Assert only the latter layout contains one `kind: 'copy-marker'` run with that text; assert height expands; render through a fake canvas and verify the marker is drawn before raster bytes return. Re-run the M5 font-rejection case so the new run does not alter the `Promise.allSettled` offline guarantee.

- [ ] **Step 2: Run receipt tests before implementation.**

  Run: `npm.cmd run test:unit -- receipt.test.ts sale-receipt.test.ts`  
  Expected: FAIL because `copyMarker`/`copy-marker` is absent.

- [ ] **Step 3: Extend only the existing renderer.**

  Add optional `copyMarker` to `ReceiptRenderInput`, append its strongly typed raster run with high-visibility brand/ink treatment, and keep all original receipt inputs marker-free. Do not add a second canvas path, CSS overlay, or a different print byte format.

- [ ] **Step 4: Extract `ReceiptViewer` and migrate Sale without behavior drift.**

  Move the existing image, print, share, skeleton, done, Blob URL lifecycle inputs, and fire-and-forget transport error path into `print/ReceiptViewer`. Preserve `receipt-canvas`, `receipt-print`, `receipt-share`, `sale-complete`, and the M3 no-orphan-backdrop behavior. The image receives `data-copy-mode="true|false"`; it is a truthful invocation signal, while Task 1's renderer test proves the marker is actually rasterized.

- [ ] **Step 5: Run focused receipt checks.**

  Run: `npm.cmd run test:unit -- receipt.test.ts sale-receipt.test.ts transport.test.ts`  
  Expected: PASS, including font-rejection and original-receipt regression coverage.

---

### Task 6: Today route, close modal, history reprint, and evidence-ready layout

**Files:**
- Create: `apps/pos/src/modules/today/TodayScreen.tsx`
- Create: `apps/pos/src/modules/today/TodayScreen.module.css`
- Modify: `apps/pos/src/app/page.tsx`
- Modify: `apps/pos/src/app/providers.tsx` only for the `ClinicRuntime.now()` clock seam from Task 4
- Modify: `apps/pos/src/app/globals.css` only if an existing tokenized utility is insufficient
- Modify: `apps/pos/src/modules/sale/SaleScreen.tsx` only for the shared-viewer integration already defined in Task 5

**Consumes:** Tasks 1–5, `useClinicRuntimeStatus()`, `ReceiptViewer`, and the existing shell contract.

**Produces:** authenticated `today-root`; `today-method-cash|kbzpay|wave|credit`; `today-total-collected`; conditional `today-other-methods`; `today-staff-<staffId>`; `today-debtors`; `today-low-stock`; shift-close controls; `sale-history-row-<saleId>`; and `reprint-receipt-canvas`.

- [ ] **Step 1: Write the component-level test seam before JSX.**

  Add a small pure test in `today-summary.test.ts` that binds a summary with non-zero `otherMethods` and one with zero `otherMethods`; assert the view-model exposes `showOtherMethods` only in the former. Add `shift-close.test.ts` assertions that Today can show the saved opening and latest immutable close values without changing the audit record. This prevents a component from reimplementing selector rules.

- [ ] **Step 2: Implement the authenticated route boundary.**

  Replace the root redirect page with `TodayScreen`. While runtime initializes, use the existing tokenized skeleton. If the session is not `active` or `auth-required`, use a post-mount router replacement to `/login`; do not render local staff/patient/sale data first. Do not change `returnToAfterSignIn()` or M4 `/clients?patient=` handling.

- [ ] **Step 3: Implement Today from local replica data.**

  On runtime revision, load sales, patients, products, staff, and `runtime.outbox.status()`; call `summarizeToday()` with `runtime.now()`. Render total collected, four ink-default StatTiles, and the conditional other-method row so every displayed collected number reconciles. Render staff totals, review/sync counts, aging debtors, and low stock using existing `Card`, `StatTile`, `Tag`, and `EmptyState` components. Use existing routed navigation for client/stock links; do not add module imports between features.

- [ ] **Step 4: Implement the close and reprint workflows.**

  Show the shift-close control only to an active admin. Before opening and immediately before confirming, refresh `OutboxStatusView`; disable/refuse for pending or attention with the translated LAW-10 reason. Bind opening/counted integer inputs, derive expected/difference solely from Task 1 helpers, and invoke Task 2’s `closeShift()` with `runtime.deviceId`, injected `now`, and a fresh UUID. Show the saved close snapshot without pretending it was sent remotely.

  Render recent completed sale rows. Selecting Reprint loads confirmed clinic/profile in an effect, calls `renderReceipt(buildConfirmedReceiptInput({ ..., copyMarker: t('receipt.copy') }))`, and supplies the generated image to `ReceiptViewer` with `isCopy`. A renderer/transport failure keeps the modal open and uses the existing toast/PNG fallback; it never mutates the sale.

- [ ] **Step 5: Run focused static checks.**

  Run: `npm.cmd run typecheck`  
  Run: `npm.cmd run lint`  
  Run: `npm.cmd run test:unit -- today-summary.test.ts shift-close.test.ts receipt.test.ts`  
  Expected: PASS. Audit `rg -n -e '#[0-9a-fA-F]{3,8}' -e 'rgba?\(' apps/pos/src/modules/today apps/pos/src/print` and expect zero literal colour hits.

---

### Task 7: Set-up diagnostics card and fresh-elevation support download

**Files:**
- Create: `apps/pos/src/modules/setup/supportExport.ts`
- Modify: `apps/pos/src/modules/setup/SetupScreen.tsx`
- Modify: `apps/pos/src/modules/setup/SetupScreen.module.css`
- Modify: `apps/pos/tests/unit/support-export.test.ts`
- Create: `apps/pos/tests/unit/setup-support-export.test.ts`
- Modify: `apps/pos/tests/unit/elevation.test.ts` only if a fresh-call assertion needs the controller fake

**Consumes:** Task 3 translations/shell props and Task 4 storage/export data contracts.

**Produces:** `storage-diagnostics`, `storage-persistence-banner`, `storage-refresh`, `storage-export`, `storage-export-password`, and `storage-export-confirm` renderers.

```ts
export type SupportExportOutcome = 'downloaded' | 'internet-required' | 'failed';
export async function exportSupportOutbox(input: {
  db: Pick<ClinicDb, 'outbox'>; deviceId: string; now: number;
  status: OutboxStatusView; password: string;
  elevate(password: string, screen: string): Promise<void>;
  download(filename: string, json: string): void;
}): Promise<SupportExportOutcome>;
```

- [ ] **Step 1: Add failing support-flow tests.**

  Test `exportSupportOutbox()` with fakes: when status is `offline`, it returns `internet-required` without calling the injected download; when elevation rejects with `ApiNetworkError`, it does the same; when elevation resolves, it calls `buildSupportOutboxExport()` with only non-done rows and invokes one download with JSON that excludes credential/profile values. Assert an already-active elevation is not reused: `elevate(password, 'support-export')` is called every time.

- [ ] **Step 2: Run the support test before UI implementation.**

  Run: `npm.cmd run test:unit -- support-export.test.ts elevation.test.ts`  
  Expected: FAIL for the new handler contract.

- [ ] **Step 3: Add the compact shell warning and diagnostics card.**

  Pass `storageAttention` to every authenticated `AppShell`: granted is absent; denied/unavailable is exactly one compact translated line. In Set-up show status, usage/quota when available, and a refresh action invoking `runtime.storageDiagnostics.refresh()` then provider revision. Do not read `navigator.storage` from `SetupScreen`.

- [ ] **Step 4: Implement the export confirmation.**

  Add a separate password modal/field from clinic-config save. It calls `exportSupportOutbox()` with `runtime.elevation.elevate`, current status, and a UI-local `download()` callback. That callback alone creates/clicks a local `application/json` Blob anchor and revokes its object URL after click. The orchestration helper never reuses an active elevation. Map `internet-required` to the specific translated copy; map `failed` to the existing generic attention toast; create no file in either case.

- [ ] **Step 5: Run focused diagnostics checks.**

  Run: `npm.cmd run test:unit -- storage-diagnostics.test.ts support-export.test.ts elevation.test.ts`  
  Run: `npm.cmd run typecheck`  
  Expected: PASS. Confirm no new module-scope `navigator`, `document`, `indexedDB`, or storage reference with the import-everything test.

---

### Task 8: Static-export E2E, mock inspection hook, and screenshot evidence

**Files:**
- Create: `apps/pos/tests/e2e/m6.export.spec.ts`
- Modify: `mock/mock-server.mjs`
- Modify: `apps/pos/tests/e2e/mock.ts`
- Modify: `apps/pos/tests/e2e/visuals.ts`
- Modify: `.gitignore` only if `outputs/m6/` is not already ignored by the root rule

**Consumes:** all M6 renderers and existing `resetMock()`/port topology. `/__state` is a test-harness route only; `openapi.yaml` is unchanged.

**Produces:** M6 exported-output tests and `outputs/m6/` evidence: `today.png`, `shift-close-modal.png`, `setup-storage-diagnostics.png`, `receipt-copy.png`, `comparison-home.png`, and `comparison-hub-money.png`.

- [ ] **Step 1: Add the minimal mock state reader under the existing test-only namespace.**

  Write a failing E2E-helper test or direct mock request assertion for `GET /__state`. Implement it under `/__` only, returning a clone of current mock state sufficient to inspect sales. Add `readMockSales(request)` in `tests/e2e/mock.ts`, and never add the route to `openapi.yaml`.

- [ ] **Step 2: Write the M6 export spec before running it.**

  First test: attach the retained external-request listener, visit cold `/`, assert `login-root`/staff picker appears, and retain cream/cobalt/Padauk/Burmese, `lang`/`data-locale`, `.txt` MIME, and zero-non-localhost assertions. Keep the existing M5 locale-reload assertion targeted at `login-root` unchanged and retain the M4 client deep-link workflow verbatim.

  Second test: seed/provision online envelopes for s2 Aye Aye and s3 Su Su, then abort only `127.0.0.1:4010` API requests. Offline, log in as Aye Aye, capture/dismiss two sales, assert non-done IndexedDB count is two and `switch-user` is enabled, then switch to staff picker. Log in Su Su, capture/dismiss two sales, and assert queue depth four. Remove the route abort, drain via SyncChip, use `readMockSales()` to assert exactly two completed sale IDs have `staff_id: 's2'` and two have `staff_id: 's3'`, and verify both envelopes remain and both staff unlock afterward. Add the negative cart test: a catalog item disables Switch user; removing it re-enables Switch user; opening tender disables it and closing tender re-enables it while queued rows remain.

  Third test: create method-diverse sales plus a debtor/low-stock condition in local test state, assert Today’s total/other reconciliation, shift close refuses with pending then attention state, then succeeds only as admin after drain and exposes exact expected/difference values. Capture Today and close modal.

  Fourth test: stub `navigator.storage` before provider initialization for denied and granted cases, assert the compact persistent banner/card state, assert support export refuses offline with internet-required copy, then elevates freshly online and downloads JSON without envelope/credential fields. Capture Set-up diagnostics.

  Fifth test: select a completed sale in history, assert `reprint-receipt-canvas[data-copy-mode='true']` appears, capture the copy receipt, and ensure no modal backdrop remains after dismissal.

- [ ] **Step 3: Add M6 visual capture helpers.**

  Extend `visuals.ts` with a dedicated ignored `outputs/m6` directory and `captureM6State()`. Reuse the local-font fulfillment method for reference pages. Capture the implementation Today against v4 `home`, and close/history composition against v4 `hub` Money with the reference state seeded as in M3/M5; never abort the reference Google Fonts — fulfill them locally.

- [ ] **Step 4: Run E2E in the owner session against a fresh export.**

  Run: `npm.cmd run build`  
  Run: `npm.cmd run test:e2e`  
  Expected: both Playwright projects pass from one invocation; export tests use only `4173`, dev locale tests only `4174`, mock only `4010`, and no test depends on a dev-server-only route.

---

### Task 9: M6 verification, scope audit, and owner handoff

**Files:**
- Modify only if verification exposes a concrete defect in the files named above.

- [ ] **Step 1: Run the four in-sandbox gates in order.**

  Run:

  ```powershell
  npm.cmd run typecheck
  npm.cmd run lint
  npm.cmd run test:unit
  npm.cmd run build
  ```

  Expected: all four commands exit `0`. Preserve unabridged output for the M6 report.

- [ ] **Step 2: Run the fixed regressions and source audits.**

  Run:

  ```powershell
  npm.cmd run test:unit -- tokens.test.ts import-source-modules.test.ts module-boundary.test.ts receipt.test.ts today-summary.test.ts shift-close.test.ts storage-diagnostics.test.ts support-export.test.ts session-controller.test.ts
  rg -n -e '#[0-9a-fA-F]{3,8}' -e 'rgba?\(' apps/pos/src/modules/today apps/pos/src/ui/AppShell.module.css apps/pos/src/print
  git diff -- package.json package-lock.json
  ```

  Expected: focused tests pass; colour audit has zero matches; package/lock diff is empty. Use `git status --short` to inventory only M6 source, test, and documentation changes; `outputs/m6/` must not appear.

- [ ] **Step 3: Owner-session E2E and visual review.**

  The owner runs the sole `npm.cmd run test:e2e` gate against the exported output, checks all new `outputs/m6/` images fresh rather than cached, and judges Today/close against v4 Home/Hub Money. Required evidence is Today 1280×800, close modal, persistent storage warning + Set-up diagnostics, COPY reprint, and both side-by-side reference comparisons.

- [ ] **Step 4: Report without a Git write.**

  Report the file inventory, exact dependency audit result, unabridged four local gate outputs, owner-session E2E result, screenshot paths, and known gaps. State explicitly that no API contract changed, no config/shift action enters the outbox, support export remains online-only by design, and M7 still owns service worker/CSP/reboot recovery. Propose the owner-session commit message: `today: deliver shift close, handover, diagnostics, and reprint (M6)`.
