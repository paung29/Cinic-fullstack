# Eden Clinic OS — M2 Data Layer Design Record

**Status:** proposed for Dan's review  
**Scope:** M2 only — the local data layer and its tests. No product screens, login flow, service worker, manifest, or user-facing controls.

## 1. Purpose and constraints

M2 establishes the durable, offline-first boundary that M3's login and sale flows will consume. It creates `src/data/` around the M1 UI without making that UI data-aware. The design implements LAW-1 through LAW-6 where applicable, preserves the M1 demo route, and uses `docs/reference/openapi.yaml` plus `mock/mock-server.mjs` as the only API-shape authority.

The only M2 dependencies are the already-whitelisted `@tanstack/react-query`, `dexie`, `zod`, and `fake-indexeddb`. Immediately before editing `package.json`, their exact compatible versions will be resolved from the registry, pinned without range prefixes, and recorded in the M2 report. No other package enters the lockfile.

## 2. Module map and ownership

| Module | Responsibility | Dependencies |
|---|---|---|
| `data/types.ts` | Zod schemas and inferred types for API wire rows, local Dexie rows, API responses, and outbox records. | `zod` only |
| `data/money.ts` | The complete LAW-5 arithmetic and formatting API. | none |
| `data/db.ts` | Version-1 Dexie schema and an explicit database factory. | `dexie`, `types` |
| `data/api.ts` | Validated HTTP client, typed errors, bearer retry, and injected session seam. | `zod`, `types` |
| `data/outbox.ts` | Sequential drain state machine and merge/dependency hooks. | `db`, `api` interfaces, `types` |
| `data/bootstrap.ts` | Bootstrap/delta application and meta bookkeeping. | `db`, `api`, `types` |
| `data/query.ts` | A factory for the M3 Query client, configured with `staleTime: Infinity`. | `@tanstack/react-query` |

No `data/` module creates a database, Query client, token store, timer, browser listener, or network request at module scope. Factories and functions receive their dependencies explicitly. This preserves LAW-6 and lets the M0 Node import-everything test keep protecting the boundary.

## 3. Domain validation and local schema

`types.ts` owns two explicit layers: Zod wire schemas that mirror the documented API’s snake_case fields, and local row schemas that use the exact §6.1 table names. Named normalizers are the only translation point between them; outbound requests translate back to the validated wire shape. It owns schemas for clinic config, staff, service, product, patient, sale line, payment, sale, appointment, contact, bootstrap, delta changes, success wrappers, and the mandatory `{ status, code, message }` error shape. Fields that the OpenAPI document leaves structurally open (for example receipt configuration) remain validated records rather than guessed M5-specific structures.

The local schema is Dexie version 1 with the exact M2 tables and primary/indexed fields from §6.1:

- `services`: `id`, indexed `category`
- `products`: `id`, indexed `barcode` and `category`; local rows include §6.1’s `stockQty`, `lowStockAt`, `stockType`, `soldBy`, `unitLabel`, and `photoKey`
- `patients`: `id`, indexed `phone` and `name`; local rows include `telegramLinked` and `followupDate`
- `sales`: `id`, indexed `at` and `patientId`
- `appointments`: `id`, indexed compound `[date+staffId]` and `patientId`
- `leads`: `id`, indexed `status`
- `contacts`: `id`, indexed `patientId`
- `staff`: `id`
- `clinic`: singleton `id`
- `outbox`: auto-incrementing `seq`, indexed `status`
- `meta`: `key`

`outbox.payloadRef` is a typed discriminated reference. Entity-backed operations refer to a current local row; operation-only records retain their durable request payload in the outbox row itself. Either way, the drainer reads the source from Dexie immediately before dispatch. This keeps stock-receive and debt-payment requests durable without adding an unsanctioned table, while still allowing a patient merge to rewrite a child sale before it is sent.

The factory `createClinicDb()` is the sole construction point. Callers create it from a client effect or handler; tests create it after installing fake IndexedDB. There is no exported singleton.

## 4. Money contract

`money.ts` exposes only the §5.3 API:

```ts
roundToStep(n, step)
lineTotal(line, step)
cartSubtotal(lines, step)
cartTotal(lines, cartDiscPct, step)
change(tendered, total)
marginPct(cost, price)
fmtMMK(n)
```

All public inputs and outputs are integer MMK, except quantity, percentage, and margin percentage where the contract requires a ratio. `marginPct` returns `null` unless both cost and price are positive; otherwise it returns `Math.round((price - cost) / price * 100)`, matching the v4 reference’s unpriced-injectable behavior. No UI or feature module performs monetary arithmetic. `fmtMMK` is the sole formatting path for values such as `12,500 Ks`.

M2 includes deterministic property tests over at least 1,000 generated carts, using a small seeded generator rather than an unapproved property-testing package. The tests cover rounding-step membership, exact subtotal composition, total rounding, change for a sufficient tender, and margin behavior. The M2 product-screen rule is recorded now: future StatTiles use `ink` by default; `valueTone` is reserved for a genuine semantic status, such as outstanding credit.

## 5. API client and the M3 session seam

`createApiClient({ baseUrl, fetchFn, session })` creates a client instance. Its session dependency is an interface, never an import from a concrete login module:

```ts
interface SessionProvider {
  getAccessToken(): string | undefined | Promise<string | undefined>;
  refresh(): Promise<void>;
  onAuthFailure(): void | Promise<void>;
}
```

`refresh()` succeeds only after the provider has made the replacement access token visible through `getAccessToken()`; it rejects on failure. The API client holds its in-flight refresh promise on the client instance, not in module state. On a bearer request’s first `401`, concurrent callers share exactly one `refresh()` invocation, wait for it, obtain the new token, and retry once. A second `401`, a missing replacement token, or a rejected refresh is an `ApiAuthError`; the provider’s `onAuthFailure()` is signalled once for that shared failure. All HTTP success payloads and errors are Zod-validated before reaching the data layer.

This is the M2 acceptance seam: M3 must be able to supply its real login provider without editing `api.ts` or `outbox.ts`. M2 stores no token in `meta`, Dexie, module state, or browser storage.

**M3 open security question:** a tablet that reboots during a prolonged outage cannot obtain a fresh JWT. M3 must make and document a security decision about offline-session survival, including whether anything persists, where it persists, its expiry, and the IndexedDB/XSS exposure trade-off. M2’s memory-only provider is deliberately not precedent that tokens can never be persisted.

## 6. Bootstrap and delta

`bootstrap()` receives a database, API client, and caller-provided device ID. It validates `/bootstrap`, upserts the working set in a single Dexie transaction, and records `sinceCursor`, `serverTimeOffset`, and `deviceId` under `meta`. Server-time offset is `Date.parse(server_time) - now()` at receipt time.

`pullDelta()` reads the current cursor, validates `/delta?since=`, applies ordered upserts/deletes to their owning table in one transaction, then advances both cursor and server-time offset. A UI will later read this durable state through the M3 Query hooks; M2 deliberately renders nothing.

## 7. Outbox state machine

The outbox API is dependency-injected: it receives a database, an API client/transport, a clock, and a jitter source. Its public status is shaped for the existing M1 `SyncChip`: `synced | syncing | offline | attention`, with pending/attention counts and drain progress.

Drain is single-flight, sequential, and oldest-first. A due `pending` row can run only when its parent dependency is `done`; a pending child waits, and a child of an `attention` parent remains waiting. Immediately before send, the drainer re-reads both its outbox row and current payload source from Dexie.

| Result | Row outcome |
|---|---|
| validated success / idempotent replay | mark `done`; run any success hook in the same transaction |
| network failure or 5xx | restore `pending`, increment attempts, set exponential backoff from 30 seconds through 15 minutes with injected ±20% jitter, then stop this drain pass |
| 4xx other than auth | mark `attention`, preserve the row and error detail, then continue eligible independent rows |
| `ApiAuthError` | restore the exact pre-send pending state and stop; never increment, park, delete, or mutate an outbox row because authentication failed |

The patient-merge success hook replaces the provisional patient ID with `merged_into` in local rows and rewrites queued references before a dependent child is eligible. This directly implements LAW-4. An M3 sale will write its sale, embedded lines/payments, and outbox item within one caller-owned Dexie transaction; M2 exposes the transaction-safe primitives but does not invent a sale screen.

## 8. Tests and verification

M2 keeps the five existing gates. The owner-session E2E command still runs both M1 Playwright projects and confirms the exported route remains intact; there is no new product UI or screenshot set in M2.

New unit coverage includes:

- Zod acceptance/rejection for the mock contract and normalized local rows.
- Fake-IndexedDB schema, bootstrap upsert, delta application, and meta updates.
- API integration against `mock/mock-server.mjs`: bearer use, response/error validation, replay behavior, and patient merge response.
- Session seam tests: N concurrent `401`s cause one refresh; all wait and retry once with the fresh token; refresh failure signals auth failure once and leaves a before/after outbox snapshot identical.
- Money examples plus at least 1,000 deterministic property cases.
- Outbox replay idempotency, 5xx backoff schedule, non-auth 4xx attention parking, dependency waiting, parent-attention waiting, and merge-mid-drain rewriting.
- The established Node import-everything LAW-6 test with every new source module.

Every new E2E selector, when M3 adds them, must be traced to a rendered DOM prop at spec-writing time. The M1 EmptyState correction is the standing example: the tested component must explicitly accept and spread the asserted `data-testid`.

## 9. Out of scope and handoff

M2 does not add login/session persistence, user-facing data screens, application providers, service-worker behavior, printing, flags, or new user-facing i18n strings. It does not change the M1 component library except as required to preserve the accepted demo.

M2 completes only after all five gates are green in the owner session and the report lists the registry-resolved dependency pins, full gate output, test counts, and the M3 offline-session question above. The owner performs the milestone commit and push.
