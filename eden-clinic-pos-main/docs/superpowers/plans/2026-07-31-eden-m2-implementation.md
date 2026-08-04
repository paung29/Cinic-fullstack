# Eden Clinic OS M2 Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the validated, offline-first data layer—Dexie persistence, money utilities, API/session seam, bootstrap/delta, and transactional outbox—without adding a product screen.

**Architecture:** Data modules are factory-based and dependency-injected: no database, Query client, token state, timer, browser listener, or request is created at module scope. API wire schemas retain documented snake_case fields; normalizers produce the camelCase local rows specified in §6.1. The outbox re-reads durable payload sources before dispatch, protects local operations from inbound-sync collisions through deferred meta records, and never loses a row on auth failure.

**Tech Stack:** Next.js 16.2.12 static export, TypeScript 5.9.3 strict, Dexie, Zod, TanStack Query, fake-indexeddb, Vitest, Playwright, and the local Node mock server.

## Global Constraints

- M2 adds only `@tanstack/react-query`, `dexie`, `zod`, and `fake-indexeddb`; resolve and pin exact registry versions before writing `package.json`.
- TypeScript remains 5.x and ESLint remains 9.x. Do not change M0/M1 dependency pins, `tokens.css`, PWA files, or CI workflow.
- Every `src/data/` module imports cleanly under Node with `window`, `document`, `indexedDB`, and storage globals absent (LAW-6).
- API request/response shapes come solely from `docs/reference/openapi.yaml` and `mock/mock-server.mjs`; do not invent endpoints or wire fields.
- Money is integer MMK and all arithmetic lives in `data/money.ts` (LAW-5).
- Tokens are memory-only in M2. `api.ts` and `outbox.ts` receive an injected `SessionProvider`, never import a concrete auth/session module, and store no token in `meta` or Dexie.
- No `navigator.onLine` listener: offline state is reported only when a drain-pass request throws a network failure. A client component may later trigger drains from an event handler/effect.
- No product routes, providers, login UI, language switcher, service worker, manifest, or new user-facing strings in M2. Preserve the M1 demo and its E2E selectors.
- Future product StatTiles default to ink. Use a semantic value tone only for an actual status, such as outstanding credit.
- Owner-session commits and pushes happen only at review points. Do not write inside `.git`.

## File Structure

```text
apps/pos/
├── src/data/
│   ├── api.ts             # factory API client, typed errors, SessionProvider seam
│   ├── bootstrap.ts       # bootstrap/delta, injected-clock server-time helpers
│   ├── db.ts              # Dexie v1 factory and protected/deferred-record persistence helpers
│   ├── money.ts           # complete LAW-5 arithmetic API
│   ├── outbox.ts          # sequential injected transport drain and success hooks
│   ├── query.ts           # QueryClient factory with staleTime Infinity
│   └── types.ts           # Zod wire/local schemas, normalizers, outbox discriminants
└── tests/unit/
    ├── api.test.ts
    ├── bootstrap.test.ts
    ├── db.test.ts
    ├── money.test.ts
    ├── mock-server.ts     # start/reset/stop helper for the local executable contract
    ├── outbox.test.ts
    ├── query.test.ts
    └── types.test.ts
```

---

### Task 1: Admit only the M2 dependencies and retain the Node-only test boundary

**Files:**
- Modify: `.gitignore`
- Modify: `apps/pos/package.json`
- Modify: `apps/pos/package-lock.json`
- Verify: `apps/pos/vitest.config.ts`, `apps/pos/tests/unit/import-source-modules.test.ts`

**Interfaces:**
- Consumes: M0 exact-pin rule and the dependency whitelist in §2.
- Produces: a deterministic M2 lockfile with the only permitted runtime/dev dependencies and an unchanged LAW-6 import test.

- [ ] **Step 1: Create the registry cache before resolving it**

Run from the repository root:

```powershell
New-Item -ItemType Directory -Force 'work/m2-npm-registry-cache' | Out-Null
$m2RegistryCache = (Resolve-Path 'work/m2-npm-registry-cache').Path
$m2RegistryCache
```

Add this explicit ignore entry with `apply_patch`, even though `work/` is already ignored:

```text
work/m2-npm-registry-cache/
```

- [ ] **Step 2: Resolve real package versions before editing the manifest**

In the same PowerShell session, resolve each actual version once, display the table, and save its literal output for the M2 report:

```powershell
$m2QueryVersion = (npm.cmd --cache $m2RegistryCache view @tanstack/react-query version).Trim()
$m2DexieVersion = (npm.cmd --cache $m2RegistryCache view dexie version).Trim()
$m2ZodVersion = (npm.cmd --cache $m2RegistryCache view zod version).Trim()
$m2FakeIndexedDbVersion = (npm.cmd --cache $m2RegistryCache view fake-indexeddb version).Trim()

[PSCustomObject]@{
  '@tanstack/react-query' = $m2QueryVersion
  dexie = $m2DexieVersion
  zod = $m2ZodVersion
  fake_indexeddb = $m2FakeIndexedDbVersion
}
```

Do not put a placeholder version in `package.json`. If a returned version could conflict with Next 16, React 19, or TypeScript 5.9.3, inspect the captured packages’ peer dependencies and stop for Dan’s direction rather than selecting another version silently:

```powershell
@(
  @{ Name = '@tanstack/react-query'; Version = $m2QueryVersion }
  @{ Name = 'dexie'; Version = $m2DexieVersion }
  @{ Name = 'zod'; Version = $m2ZodVersion }
  @{ Name = 'fake-indexeddb'; Version = $m2FakeIndexedDbVersion }
) | ForEach-Object {
  npm.cmd --cache $m2RegistryCache view "$($_.Name)@$($_.Version)" peerDependencies
}
```

- [ ] **Step 3: Install exactly the resolved versions**

Without re-querying the registry, install the three application dependencies under `dependencies` and fake IndexedDB under `devDependencies`, all with exact captured `@version` suffixes and no range prefix:

```powershell
npm.cmd --cache $m2RegistryCache install --save-exact "@tanstack/react-query@$m2QueryVersion" "dexie@$m2DexieVersion" "zod@$m2ZodVersion"
npm.cmd --cache $m2RegistryCache install --save-dev --save-exact "fake-indexeddb@$m2FakeIndexedDbVersion"
```

Do not use `npm audit fix`.

- [ ] **Step 4: Verify the lockfile scope and the existing import guard**

Run:

```powershell
npm.cmd ls @tanstack/react-query dexie zod fake-indexeddb --depth=0
npm.cmd run test:unit -- import-source-modules.test.ts
npm.cmd run typecheck
```

Expected: all four packages show the exact resolved versions; no extra M2 dependency appears; the import guard still proves `window`, `document`, and `indexedDB` are absent before source imports.

- [ ] **Step 5: Owner checkpoint**

Provide Dan the registry-version table and the focused command output. Do not commit from the sandbox.

---

### Task 2: Establish the complete LAW-5 money API with deterministic property coverage

**Files:**
- Create: `apps/pos/src/data/money.ts`
- Create: `apps/pos/tests/unit/money.test.ts`

**Interfaces:**
- Produces:

```ts
export type MoneyLine = { qty: number; unitPrice: number; discountPct?: number | null };
export function roundToStep(n: number, step: number): number;
export function lineTotal(line: MoneyLine, step: number): number;
export function cartSubtotal(lines: readonly MoneyLine[], step: number): number;
export function cartTotal(lines: readonly MoneyLine[], cartDiscPct: number, step: number): number;
export function change(tendered: number, total: number): number;
export function marginPct(cost: number, price: number): number | null;
export function fmtMMK(n: number): string;
```

- Consumed later by M3 sale capture, M5 Stocks, and outbox payload construction.

- [ ] **Step 1: Write examples and seeded property tests first**

Create `money.test.ts` with exact example assertions:

```ts
expect(roundToStep(12_249, 500)).toBe(12_000);
expect(roundToStep(12_250, 500)).toBe(12_500);
expect(lineTotal({ qty: 2, unitPrice: 12_000, discountPct: 10 }, 500)).toBe(21_500);
expect(cartSubtotal([{ qty: 1, unitPrice: 12_000 }, { qty: 2, unitPrice: 6_000 }], 500)).toBe(24_000);
expect(cartTotal([{ qty: 1, unitPrice: 12_000 }], 10, 500)).toBe(11_000);
expect(change(15_000, 12_500)).toBe(2_500);
expect(marginPct(9_000, 18_000)).toBe(50);
expect(marginPct(180_000, 0)).toBeNull();
expect(fmtMMK(12_500)).toBe('12,500 Ks');
```

Add a small deterministic linear-congruential generator and exactly 1,000 generated carts. For each cart, independently calculate each rounded line and final rounded cart total; assert the public functions match, every result is an integer, and a tender at or above the total yields non-negative change.

- [ ] **Step 2: Run the focused test to prove it is red**

```powershell
npm.cmd run test:unit -- money.test.ts
```

Expected: FAIL because `@/data/money` does not exist.

- [ ] **Step 3: Implement only the specified money functions**

Use `Math.round(n / step) * step`. `lineTotal` rounds `qty * unitPrice * (1 - discountPct / 100)` at the line. `cartSubtotal` sums already-rounded line totals. `cartTotal` rounds the subtotal after the cart discount. `change` is direct subtraction and callers must gate insufficient tender. `marginPct` returns `null` unless both inputs are positive; otherwise return `Math.round((price - cost) / price * 100)`, matching the v4 unpriced-injectable display. Format via `Intl.NumberFormat('en-US')` and append ` Ks`.

- [ ] **Step 4: Verify the focused and global gates**

```powershell
npm.cmd run test:unit -- money.test.ts
npm.cmd run typecheck
npm.cmd run lint
```

Expected: 1,000+ property cases and all examples pass; no arithmetic is introduced outside `money.ts`.

---

### Task 3: Define validated wire/local types and a LAW-6-safe Dexie v1 factory

**Files:**
- Create: `apps/pos/src/data/types.ts`
- Create: `apps/pos/src/data/db.ts`
- Create: `apps/pos/tests/unit/types.test.ts`
- Create: `apps/pos/tests/unit/db.test.ts`
- Modify: `apps/pos/tests/unit/import-source-modules.test.ts`

**Interfaces:**
- Produces API-wire schemas, local-row schemas, normalizers, `ClinicDb`, `createClinicDb(name?: string)`, and durable protected/deferred-record helpers.
- Consumes: `zod`, `dexie`, `fake-indexeddb` in test code only, and the OpenAPI/mock contract.

- [ ] **Step 1: Write failing schema and no-singleton tests**

In `types.test.ts`, parse one valid mock service, product, patient, and bootstrap response; reject a sale line with a non-integer `unit_price`; and assert a normalized product exposes `stockQty`, `lowStockAt`, `stockType`, `soldBy`, `unitLabel`, `photoKey`, and `lots` while the wire payload retains snake_case.

In `db.test.ts`, install `fake-indexeddb` inside `beforeEach`, create two named databases with `createClinicDb`, insert a patient into the first, and assert the second has no row. Assert the declared tables are exactly:

```ts
['appointments', 'clinic', 'contacts', 'leads', 'meta', 'outbox', 'patients', 'products', 'sales', 'services', 'staff']
```

Add an import-guard assertion that `createClinicDb` is a function and that importing `@/data/db` did not create a database instance. Keep the existing import-everything guard’s assertions that `indexedDB` is undefined before loading source modules; do not add fake IndexedDB as a global setup file.

- [ ] **Step 2: Run the red tests**

```powershell
npm.cmd run test:unit -- types.test.ts db.test.ts import-source-modules.test.ts
```

Expected: FAIL on missing `@/data/types` and `@/data/db` exports.

- [ ] **Step 3: Implement explicit wire-to-local normalizers**

In `types.ts`, define Zod schemas for every documented response/input row and exact response wrappers. Export inferred wire and local types plus pure normalizers such as:

```ts
export function toLocalProduct(wire: ProductWire): ProductRow;
export function toLocalPatient(wire: PatientWire): PatientRow;
export function toLocalAppointment(wire: AppointmentWire): AppointmentRow;
export function toWireSale(row: SaleRow): SaleWire;
```

Local table rows must use §6.1 names such as `patientId`, `staffId`, `stockQty`, `lowStockAt`, `stockType`, `soldBy`, `unitLabel`, `photoKey`, `telegramLinked`, and `followupDate`. Only these normalizers translate names; no component or future module accesses wire names directly.

Define durable outbox types exactly:

```ts
export type EntityRef = { table: 'patients' | 'products' | 'sales' | 'appointments' | 'contacts'; id: string };
export type PayloadRef =
  | { source: 'entity'; entity: EntityRef; protectedEntities: readonly EntityRef[] }
  | { source: 'inline'; payload: Record<string, unknown>; protectedEntities: readonly EntityRef[] };
export type OutboxStatus = 'pending' | 'inflight' | 'attention' | 'done';
```

`OutboxRow` includes `seq`, `kind`, `uuid`, `payloadRef`, `dependsOnUuid`, `attempts`, `nextAt`, `status`, and nullable error fields. `MetaRow.value` is a validated JSON value so deferred remote changes can live under `meta` without adding a table beyond §6.1.

- [ ] **Step 4: Implement the database factory and persistence helpers**

`db.ts` defines `class ClinicDb extends Dexie` and configures this exact v1 store map inside its constructor, but exports no constructed value. `createClinicDb(name = 'eden-clinic')` constructs the database only when called:

```ts
{
  services: 'id, category',
  products: 'id, barcode, category',
  patients: 'id, phone, name',
  sales: 'id, at, patientId',
  appointments: 'id, [date+staffId], patientId',
  leads: 'id, status',
  contacts: 'id, patientId',
  staff: 'id',
  clinic: 'id',
  outbox: '++seq, status',
  meta: 'key',
}
```

Export helpers with these exact responsibilities:

```ts
export function entityKey(ref: EntityRef): string;
export function deferredMetaKey(ref: EntityRef): string;
export async function activeProtectedKeys(db: ClinicDb): Promise<Set<string>>;
export async function deferInboundChange(db: ClinicDb, ref: EntityRef, change: DeferredRemoteChange): Promise<void>;
export async function clearDeferredChange(db: ClinicDb, ref: EntityRef): Promise<void>;
```

`activeProtectedKeys` reads only outbox rows whose status is not `done` and returns all `payloadRef.protectedEntities`. It is a called function, not an observed module-level query.

- [ ] **Step 5: Verify isolation and LAW-6**

```powershell
npm.cmd run test:unit -- types.test.ts db.test.ts import-source-modules.test.ts
npm.cmd run typecheck
npm.cmd run lint
```

Expected: each test creates its own fake IndexedDB only after module import; every source module continues to import under plain Node with no DOM globals.

---

### Task 4: Implement the injected-session API client and executable-contract test harness

**Files:**
- Create: `apps/pos/src/data/api.ts`
- Create: `apps/pos/tests/unit/mock-server.ts`
- Create: `apps/pos/tests/unit/api.test.ts`

**Interfaces:**
- Produces:

```ts
export interface SessionProvider {
  getAccessToken(): string | undefined | Promise<string | undefined>;
  refresh(): Promise<void>;
  onAuthFailure(): void | Promise<void>;
}
export interface ApiClient {
  login(input: LoginWire): Promise<LoginResponseWire>;
  bootstrap(): Promise<BootstrapWire>;
  delta(since: number): Promise<DeltaWire>;
  dispatch(item: OutboxDispatch): Promise<OutboxDispatchResult>;
}
export function createApiClient(options: { baseUrl: string; fetchFn?: typeof fetch; session: SessionProvider }): ApiClient;
export class ApiAuthError extends Error {}
export class ApiNetworkError extends Error {}
export class ApiHttpError extends Error { readonly status: number; readonly code: string; }
```

- Consumed by bootstrap/delta and the injected outbox transport. M3 supplies a real `SessionProvider` without changing this file or `outbox.ts`.

- [ ] **Step 1: Write red session-seam tests before the client**

In `api.test.ts`, use a fake `fetchFn` that returns `401` for N initial protected requests and `200` only after the fake provider’s `refresh()` changes its token. Start N concurrent `bootstrap()` calls and assert:

```ts
expect(refresh).toHaveBeenCalledTimes(1);
expect(getAccessToken).toHaveBeenCalled();
await expect(Promise.all(requests)).resolves.toHaveLength(N);
```

Add a failed-refresh case: `refresh()` rejects, all callers reject with `ApiAuthError`, and `onAuthFailure()` is called once. Add a second-401-after-refresh case that also rejects rather than refreshing twice.

Write `mock-server.ts` to spawn `mock/mock-server.mjs` with an injected free port, wait for `/health`, post `/__reset` before each integration case, and stop the exact child in `afterAll`. Use it to prove a real `/auth/login` + `/bootstrap` request validates and a duplicate patient POST returns `merged_into` exactly as the mock specifies.

- [ ] **Step 2: Run the API tests red**

```powershell
npm.cmd run test:unit -- api.test.ts
```

Expected: FAIL because `@/data/api` and the mock helper do not exist.

- [ ] **Step 3: Implement one validated request path**

Implement an internal `request()` that adds `Authorization: Bearer <token>` only for protected calls, parses JSON once, validates successes with the endpoint’s Zod schema, and validates all non-2xx responses with `apiErrorSchema`. A thrown fetch error becomes `ApiNetworkError`.

For a first `401`, await one instance-owned refresh promise, read a replacement token from `getAccessToken()`, then retry once. A missing replacement token, rejected refresh, or retry `401` goes through one instance-owned auth-failure promise and throws `ApiAuthError`. Do not create a module-level `refreshPromise`, token, or provider.

`dispatch()` maps only offline-capable kinds to documented endpoints: sale → `/sales`, patient → `/patients`, product → `/products`, stock receive → `/stock/receive`, appointment → `/appointments`, contact → `/contact-log`, and sale payment → `/sales/{saleId}/payments`. Elevation-only patches/voids remain out of the M2 outbox.

- [ ] **Step 4: Verify the mock and single-flight contract**

```powershell
npm.cmd run test:unit -- api.test.ts
npm.cmd run typecheck
npm.cmd run lint
```

Expected: mock integration validates the documented payloads; concurrent 401s perform one refresh; failures become a typed auth error.

---

### Task 5: Add bootstrap, delta, Query factory, and the collision-preservation policy

**Files:**
- Create: `apps/pos/src/data/bootstrap.ts`
- Create: `apps/pos/src/data/query.ts`
- Create: `apps/pos/tests/unit/bootstrap.test.ts`
- Create: `apps/pos/tests/unit/query.test.ts`

**Interfaces:**
- Produces:

```ts
export type Clock = { now(): number };
export function serverTimeOffset(serverTime: string, clock: Clock): number;
export async function bootstrap(options: { db: ClinicDb; api: ApiClient; deviceId: string; clock: Clock }): Promise<void>;
export async function pullDelta(options: { db: ClinicDb; api: ApiClient; clock: Clock }): Promise<void>;
export function createClinicQueryClient(): QueryClient;
```

- Consumes: Task 3 local rows/deferred helpers, Task 4 client, and Query from Task 1.

- [ ] **Step 1: Write red bootstrap and collision tests**

In `bootstrap.test.ts`, inject `{ now: () => 1_000 }` and a fake API response whose `server_time` parses to `2_500`; assert `serverTimeOffset` saves `1_500`, `sinceCursor` saves the documented cursor, and `deviceId` is saved unchanged.

Create the required collision race deliberately:

1. Insert local patient `patient-local` with a pending entity-backed outbox row whose `protectedEntities` contains `{ table: 'patients', id: 'patient-local' }`.
2. Return a delta upsert for the same ID with a different server name and cursor 8.
3. Call `pullDelta()`.
4. Assert the patient remains the local version, `sinceCursor` becomes 8, and `meta[deferred:patients:patient-local]` stores the server change.
5. Simulate later successful dispatch by applying the authoritative response through the exported reconciliation helper; assert that response becomes the local row and the deferred meta entry is removed.

Add a matching bootstrap-snapshot collision test. In `query.test.ts`, assert the created client’s default query `staleTime` is `Infinity` and the factory returns distinct client instances.

- [ ] **Step 2: Run the focused tests red**

```powershell
npm.cmd run test:unit -- bootstrap.test.ts query.test.ts
```

Expected: FAIL because the factories and sync functions do not exist.

- [ ] **Step 3: Implement inbound-data protection without losing the cursor**

Use this explicit policy: **an inbound bootstrap/delta record whose `{ table, id }` is protected by a non-done outbox item never overwrites the local row; instead, save that validated inbound change under a deterministic `meta` key and still advance the global cursor.** This is chosen over a simple skip because advancing the cursor after discarding the remote record would silently lose server state.

Implement table-specific upsert/delete dispatch in one internal function. Before each inbound change, query `activeProtectedKeys(db)`. On collision call `deferInboundChange`; otherwise apply the normalized row/delete. Bootstrap and delta perform all row writes, deferred writes, and meta updates inside one Dexie transaction.

Use the injected `clock.now()` for every server-time offset computation. Do not call `Date.now()` in `bootstrap.ts` or `pullDelta()`. Export a reconciliation helper used by the outbox after a successful authoritative response; it upserts that response and clears any deferred meta record for that entity. A row in `attention` remains protected and retains its deferred remote change until a future explicit resolution; M2 does not invent that UI.

- [ ] **Step 4: Implement the Query factory with no provider**

`createClinicQueryClient()` constructs a new `QueryClient` inside the function with:

```ts
defaultOptions: { queries: { staleTime: Infinity } }
```

Do not add a React provider, hook, or module singleton in M2.

- [ ] **Step 5: Verify deterministic synchronization**

```powershell
npm.cmd run test:unit -- bootstrap.test.ts query.test.ts import-source-modules.test.ts
npm.cmd run typecheck
npm.cmd run lint
```

Expected: the collision race retains local pending intent and durable deferred remote data; both bootstrap and delta use only the injected clock.

---

### Task 6: Build the injected, sequential outbox with merge, backoff, auth, and collision reconciliation

**Files:**
- Create: `apps/pos/src/data/outbox.ts`
- Create: `apps/pos/tests/unit/outbox.test.ts`
- Modify: `apps/pos/tests/unit/bootstrap.test.ts`

**Interfaces:**
- Produces:

```ts
export type OutboxStatusView = {
  state: 'synced' | 'syncing' | 'offline' | 'attention';
  pendingCount: number;
  attentionCount: number;
  drainProgress: number;
};
export function createOutbox(options: {
  db: ClinicDb;
  api: Pick<ApiClient, 'dispatch'>;
  clock: Clock;
  jitter: (baseMs: number) => number;
}): { drain(): Promise<OutboxStatusView>; status(): Promise<OutboxStatusView> };
```

- Consumes: Task 3 outbox records, Task 4 typed API failures, Task 5 reconciliation helper and shared `Clock`.

- [ ] **Step 1: Write failing state-machine tests**

Create fixture builders for pending rows and local source rows. Add these exact cases:

1. **Replay success:** a sale item whose transport returns `{ replayed: true, sale }` becomes `done` and keeps its local sale.
2. **5xx retry:** transport throws `ApiHttpError(500, ...)`; with `clock.now() === 10_000` and `jitter(base) => base`, first retry sets `attempts: 1`, `nextAt: 40_000`, `status: 'pending'`, and stops the pass.
3. **Non-auth 4xx:** `ApiHttpError(400, 'MALFORMED', ...)` sets only that row to `attention`, retains it, stores error detail, and allows an independent due row to continue.
4. **Dependency gate:** child `dependsOnUuid` waits while its parent is pending; if parent is attention, child remains pending and untouched.
5. **Merge-mid-drain:** a patient create returns `{ patient, merged_into: 'patient-server' }`; assert local child sale `patientId`, its protected reference, and its serialized outbound wire payload all reference `patient-server` before the child sends.
6. **Auth failure invariant:** snapshot all outbox rows, make `dispatch()` throw `ApiAuthError`, run `drain()`, then assert the post-drain rows equal the snapshot byte-for-byte and the status is not `attention`.
7. **Re-read invariant:** mutate the local sale between enqueue and drain; assert the dispatched payload contains the latest local values, not a captured stale copy.
8. **Offline health probe:** make `dispatch()` throw `ApiNetworkError`; assert the row remains `pending` with its calculated retry, the pass stops, and the returned status is `offline`. This is the sole M2 source of offline stateâ€”not a `navigator.onLine` observation or listener.

- [ ] **Step 2: Run the state-machine test red**

```powershell
npm.cmd run test:unit -- outbox.test.ts
```

Expected: FAIL because `@/data/outbox` does not exist.

- [ ] **Step 3: Implement a single-flight, oldest-first drain**

Keep the in-flight `drainPromise` inside `createOutbox`, never at module scope. Select due pending items ordered by `seq`; defer children with incomplete parents. Read the current outbox row and resolve its `payloadRef` from Dexie immediately before each request. Mark an item `inflight` only for the request duration and restore the prior pending row on network/auth failure as required by the design record.

For a successful response, use a Dexie transaction to mark `done`, normalize/upsert the authoritative response, reconcile and clear the related deferred inbound record, and run the merge hook before allowing dependents to proceed. For network failures, derive exponential base delay as `min(30_000 * 2 ** attempts, 900_000)` and call injected `jitter(base)`; production wiring later supplies ±20%, tests supply exact values. Do not access `navigator`, register an `online` listener, or infer offline status outside an actual transport failure.

- [ ] **Step 4: Add the bootstrap/outbox collision integration assertion**

Extend the Task 5 collision test so the deferred inbound row exists before drain, the matching pending item drains successfully, and the success response—not the stale deferred inbound row—becomes canonical. Assert the deferred key is gone and no cursor regression occurs.

- [ ] **Step 5: Verify the full outbox suite**

```powershell
npm.cmd run test:unit -- outbox.test.ts bootstrap.test.ts api.test.ts
npm.cmd run test:unit -- import-source-modules.test.ts
npm.cmd run typecheck
npm.cmd run lint
```

Expected: all LAW-2/3/4 cases pass; auth failure changes no outbox bytes; no data module introduces module-scope browser access.

---

### Task 7: Run the M2 acceptance gates and prepare the owner handoff

**Files:**
- Verify: `apps/pos/src/data/**`, `apps/pos/tests/unit/**`, `apps/pos/package.json`, `apps/pos/package-lock.json`
- Verify only: `apps/pos/tokens.css`, `apps/pos/src/ui/**`, `apps/pos/tests/e2e/**`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: all prior tasks and the existing M1 static-export E2E projects.
- Produces: the M2 report for Dan’s commit and owner-session CI run.

- [ ] **Step 1: Re-prove immutable M0/M1 boundaries**

Run from `apps/pos`:

```powershell
npm.cmd run test:unit -- tokens.test.ts import-source-modules.test.ts module-boundary.test.ts
Get-FileHash tokens.css -Algorithm SHA256 | Select-Object -ExpandProperty Hash
(Get-Item tokens.css).Length
rg -n -e '#[0-9a-fA-F]{3,8}' -e 'rgba?\(' src
git diff --check
```

Expected: token hash is `8D39F41E6710FA1EDCE202AF74F118E76547A4172F5DC8073135E0F76EB09E82`, length is 597, the source color-literal audit has no output, and no whitespace errors appear.

- [ ] **Step 2: Run all five gates in order**

Run from `apps/pos`, preserving unabridged output for the report:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run build
npm.cmd run test:e2e
```

Expected: unit output includes the 1,000+ money cases, executable mock integration, session seam, collision race, and outbox suite. The E2E command remains one invocation running `e2e-export` and `e2e-dev-locales`; it retains zero-external-request, Padauk, production-inert override, and M1 component behavior assertions.

- [ ] **Step 3: Perform scope and dependency checks**

Run from the repository root:

```powershell
git diff -- apps/pos/tokens.css apps/pos/public/sw.js apps/pos/public/manifest.webmanifest .github/workflows/ci.yml
git diff -- apps/pos/package.json apps/pos/package-lock.json
npm.cmd --prefix apps/pos ls --depth=0
git status --short
```

Expected: immutable files have no diff; only the four registry-resolved M2 dependencies enter the lockfile; M2 contains no screen route or user-facing copy changes.

- [ ] **Step 4: Report and owner commit checkpoint**

Report: file inventory; registry-resolved version table; unabridged output for all five gates; test count; confirmation that the current M1 E2E screenshots remain owner-session artifacts; collision policy; no-navigator offline derivation; and the M3 offline-session persistence/security question.

Propose the owner-session commit message:

```text
data: establish offline data layer and transactional outbox (M2)
```
