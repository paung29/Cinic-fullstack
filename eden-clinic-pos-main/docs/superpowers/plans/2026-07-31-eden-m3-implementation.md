# Eden Clinic OS — M3 Login and Sale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the static-exported, offline-first login and sale path: provision a device online once, unlock a staff session offline with a PIN-derived envelope, capture a sale in one Dexie transaction, and later drain it safely.

**Architecture:** M3 keeps the M2 data and outbox seams intact. A mounted application runtime creates the concrete session controller and injects its `SessionProvider` into the existing API client; `modules/auth` and `modules/sale` remain isolated feature owners. Authentication material is persisted only as a per-staff, Zod-validated AES-GCM envelope in `meta`; sales and their typed outbox rows are committed in one transaction.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript 5.9, Dexie 4, Zod 4, TanStack Query 5, Vitest 4/fake-indexeddb, Playwright 1.62, CSS Modules, self-hosted Inter and Padauk.

## Global constraints

- Do not add, upgrade, or remove dependencies. Keep TypeScript `5.9.3`, ESLint `9.39.5`, and every package-lock pin exactly governed by the existing lockfile.
- The deployment seam is `NEXT_PUBLIC_EDEN_API_BASE_URL`: it is a required build-time environment variable, read inside a function after mount. CI and E2E build with `http://127.0.0.1:4010`; the production build pipeline supplies the real Singapore API origin. There is no committed fallback production URL and no runtime external-config fetch.
- `NEXT_PUBLIC_*` is embedded in each static build. The source is one application; its static output is environment-configured at build time. The E2E request watcher must prove the mock build talks only to `127.0.0.1`/`localhost` and fetches no other destination.
- Retain `output: 'export'`, self-hosted fonts, token-only CSS, no server actions/routes/components that fetch, and no service worker or manifest.
- All new visible text goes through typed `useT()` keys. English is complete; machine-drafted Burmese and Simplified Chinese values carry the required native-review comment. `my` remains the default, English remains fallback, and the development override remains absent/inert from production output.
- All browser storage, IndexedDB, Web Crypto, timers, and event listeners are invoked only in handlers or post-mount effects. The import-under-Node LAW-6 guard must continue to import every source module cleanly.
- `data/api.ts` and `data/outbox.ts` are not modified for session ownership. The M3 controller is passed into `createApiClient` as the pre-existing `SessionProvider` seam.
- LAW-1 sale capture makes no request and waits for no print/share work. LAW-2 UUIDs are generated at creation. LAW-5 money computations and formatting use only `data/money.ts`. LAW-7 allergy visibility is unconditional. LAW-8 stores a separately verified admin approver. LAW-10 blocks logout while the outbox is non-empty.
- The PIN-throttle counter is deliberately in memory. A reboot resets it; this counter deters shoulder-surfing at the counter, not an attacker with a copied device, and must never be "fixed" into persistent lockout state.
- Git writes remain owner-session work. Do not commit, push, or attempt a `.git` workaround; use read-only Git checks only.

## File structure and ownership

| File or directory | Responsibility |
|---|---|
| `apps/pos/src/data/runtimeConfig.ts` | Validates and returns the build-inlined public API origin. |
| `apps/pos/src/data/auth.ts` | Validated unauthenticated login and refresh transport; no session state. |
| `apps/pos/src/data/types.ts` | Refresh request/response Zod schemas and inferred wire types. |
| `apps/pos/src/modules/auth/sessionEnvelope.ts` | Version-1 envelope Zod validation, base64 shape checks, Web Crypto adapter, encryption/decryption, and typed error distinction. |
| `apps/pos/src/modules/auth/sessionController.ts` | In-memory access/session state, injected `SessionProvider`, online login, offline unlock, refresh rotation, logout, and offline admin proof. |
| `apps/pos/src/modules/auth/LoginScreen.tsx` + CSS | Device setup, staff picker, PIN state, in-memory delay, and accessible test selectors. |
| `apps/pos/src/app/providers.tsx` | Post-mount runtime composition, device ID, bootstrap, Query provider, drain wake-up, real SyncChip status, and route-facing context. |
| `apps/pos/src/modules/sale/{types,cart,tickets,capture}.ts` | Pure cart/tender state, durable tickets, and the LAW-1 capture transaction. |
| `apps/pos/src/modules/sale/*.tsx` + CSS | Split sale workspace, catalogue/cart, lot/line/tender/approval modals, receipt confirmation. |
| `apps/pos/src/app/{page,login/page,sale/page}.tsx` | Static client route entry points only. |
| `apps/pos/src/i18n/*` | Typed M3 auth/sale copy in all locales. |
| `apps/pos/src/ui/{PinPad,Modal,SyncChip}.*` | Small general prop extensions needed for traceable product test IDs and SyncChip tap-to-drain. |
| `apps/pos/tests/unit/{runtime-config,auth,session-envelope,session-controller,sale-capture,sale-tickets}.test.ts` | Deterministic new behavior coverage. |
| `apps/pos/tests/e2e/{m3.export,m3.locales}.spec.ts`, `mock.ts`, `visuals.ts` | Export/static workflow, locale proof, mock reset, zero-external check, and M3 screenshots. |
| `apps/pos/playwright.config.ts`, `.github/workflows/ci.yml`, `.gitignore` | Mock server topology, CI build environment, and generated M3-output exclusion. |

---

### Task 1: Establish the API-origin and deterministic E2E topology

**Files:**

- Create: `apps/pos/src/data/runtimeConfig.ts`
- Create: `apps/pos/tests/unit/runtime-config.test.ts`
- Create: `apps/pos/tests/e2e/mock.ts`
- Modify: `apps/pos/playwright.config.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**

```ts
export function readApiBaseUrl(value?: string): string;
export async function resetMock(request: APIRequestContext): Promise<void>;
```

`readApiBaseUrl()` consumes `process.env.NEXT_PUBLIC_EDEN_API_BASE_URL` when no argument is supplied. It returns a normalized origin without a trailing slash and rejects a missing value, non-HTTP(S) URL, credentials, query string, or hash.

- [ ] **Step 1: Write the red runtime-config tests.**

```ts
expect(readApiBaseUrl('http://127.0.0.1:4010/')).toBe('http://127.0.0.1:4010');
expect(readApiBaseUrl('https://api.eden.example')).toBe('https://api.eden.example');
expect(() => readApiBaseUrl()).toThrow('NEXT_PUBLIC_EDEN_API_BASE_URL');
expect(() => readApiBaseUrl('ftp://example.test')).toThrow('HTTP');
expect(() => readApiBaseUrl('https://user:pass@example.test')).toThrow('credentials');
```

- [ ] **Step 2: Run the focused test and confirm it is red.**

Run from `apps/pos`:

```powershell
npm.cmd run test:unit -- runtime-config.test.ts
```

Expected: FAIL because `@/data/runtimeConfig` does not exist.

- [ ] **Step 3: Implement the origin reader without a source fallback.**

Use `new URL()` inside `readApiBaseUrl()`. Permit only `http:` and `https:`, require `username === ''`, `password === ''`, `search === ''`, and `hash === ''`; return `url.origin`. The caller invokes this function from the mounted runtime, never at module scope. Do not place a Singapore hostname or test URL in application source.

- [ ] **Step 4: Add the local mock server to the one Playwright invocation.**

In `playwright.config.ts`, retain the two projects and add a first `webServer` entry:

```ts
{
  command: 'node ../../mock/mock-server.mjs',
  cwd: appRoot,
  env: { ...process.env, PORT: '4010', NEXT_PUBLIC_EDEN_API_BASE_URL: 'http://127.0.0.1:4010' },
  url: 'http://127.0.0.1:4010/health',
  timeout: 120_000,
  reuseExistingServer: false,
}
```

Pass the same `NEXT_PUBLIC_EDEN_API_BASE_URL` value in the static-server and Next-dev `webServer` environments. Set `workers: 1` so resettable mock state cannot race across test cases. Keep ports `4010`, `4173`, and `4174` explicit.

Create `resetMock()` with `request.post('http://127.0.0.1:4010/__reset')`; throw if the response is not OK. Task 7 adds `test.beforeEach(({ request }) => resetMock(request))` to every replacement M3 export and locale spec. This reset runs before each test case, including future cases that add replay or merge state.

- [ ] **Step 5: Make CI build the mock-configured static artifact.**

Set this job-level environment in `.github/workflows/ci.yml`:

```yaml
env:
  NEXT_PUBLIC_EDEN_API_BASE_URL: http://127.0.0.1:4010
```

It applies to the build, the static-output E2E server, and the dev-locale server. The production deployment workflow, which is outside this repository CI file, must set the same required variable to the real API origin before `next build`.

- [ ] **Step 6: Verify configuration and topology.**

```powershell
npm.cmd run test:unit -- runtime-config.test.ts
$env:NEXT_PUBLIC_EDEN_API_BASE_URL = 'http://127.0.0.1:4010'
npm.cmd run typecheck
npm.cmd run lint
```

Expected: the config test passes; source imports remain free of module-scope browser access; no page behavior has changed yet.

---

### Task 2: Add validated auth transport and versioned envelope cryptography

**Files:**

- Create: `apps/pos/src/data/auth.ts`
- Create: `apps/pos/src/modules/auth/sessionEnvelope.ts`
- Create: `apps/pos/tests/unit/auth.test.ts`
- Create: `apps/pos/tests/unit/session-envelope.test.ts`
- Modify: `apps/pos/src/data/types.ts`

**Interfaces:**

```ts
export type AuthClient = {
  login(input: LoginWire): Promise<LoginResponseWire>;
  refresh(refreshToken: string): Promise<RefreshResponseWire>;
};
export function createAuthClient(options: { baseUrl: string; fetchFn?: typeof fetch }): AuthClient;

export class InvalidSessionEnvelopeError extends Error {}
export class WrongPinError extends Error {}
export type SessionIdentity = { staffId: string; name: string; role: 'admin' | 'staff'; validUntil: string };
export type SessionSecret = { identity: SessionIdentity; credential: { refreshToken: string; refreshedAt: string } };
export function encryptSessionSecret(input: EncryptSessionSecretInput): Promise<StoredSessionEnvelope>;
export function decryptSessionSecret(input: DecryptSessionSecretInput): Promise<SessionSecret>;
```

- [ ] **Step 1: Write red auth-transport tests against the executable mock.**

Use the existing `startMockServer()` unit helper. Assert that `login({ staff_id: 's1', pin: '1234' })` returns a validated token, refresh, staff, clinic, and server time. Refresh that exact returned token and assert the new token/refresh pair validates. Assert a fabricated refresh token throws `ApiHttpError` with status `401`, and a rejected `fetchFn` becomes `ApiNetworkError`.

- [ ] **Step 2: Add the documented Zod wire types, then implement the transport.**

In `data/types.ts`, add exact schemas and inferred types for:

```ts
z.object({ refresh: z.string() })
z.object({ token: z.string(), refresh: z.string() })
```

`data/auth.ts` sends only `POST /auth/login` and `POST /auth/refresh`, parses every success with these schemas, and parses every non-success with the existing `apiErrorSchema` before throwing `ApiHttpError`. It may reuse `ApiHttpError` and `ApiNetworkError` from `data/api.ts`, but it does not change `data/api.ts` or create token state.

- [ ] **Step 3: Write red envelope tests before the codec.**

Use an injected deterministic crypto driver for most tests and one Web Crypto round-trip test. Cover these exact cases:

1. Encrypting a secret creates a `version: 1`, `PBKDF2-HMAC-SHA-256`, `iterations: 600_000` envelope with a 16-byte salt, 12-byte IV, and base64 ciphertext; its serialized JSON contains neither the PIN, access token, nor a PIN hash.
2. The correct PIN returns the identical identity and refresh credential; a wrong PIN throws `WrongPinError`.
3. A malformed base64 field, incorrect salt/IV decoded length, wrong KDF, wrong iteration count, or `version: 2` throws `InvalidSessionEnvelopeError` **before** the crypto driver's decrypt method is called.
4. A malformed decrypted plaintext also throws `InvalidSessionEnvelopeError` before its fields are consumed.
5. Re-encrypting a rotated credential changes IV/ciphertext while preserving the selected staff identity.

- [ ] **Step 4: Implement validation-before-decryption.**

`sessionEnvelope.ts` owns two strict Zod schemas: the stored envelope and the decrypted secret. The stored schema accepts only:

```ts
{
  version: z.literal(1),
  kdf: z.literal('PBKDF2-HMAC-SHA-256'),
  iterations: z.literal(600_000),
  saltBase64: base64String,
  ivBase64: base64String,
  ciphertextBase64: base64String,
}
```

Decode and length-check base64 after schema parsing but before key derivation or `subtle.decrypt`. The Web Crypto implementation imports the PIN as PBKDF2 base material, derives a non-extractable AES-GCM-256 `CryptoKey` with 600,000 HMAC-SHA-256 iterations, and encrypts/decrypts with a new 12-byte IV. Catch an authentication failure from decrypt and map it to `WrongPinError`; map schema/version/shape/decrypted-content failures to `InvalidSessionEnvelopeError`.

This is a code-level distinction. The login screen maps `InvalidSessionEnvelopeError` to the translated online-repair state, while a wrong PIN still clears and shakes the PIN pad. A future version therefore has a repair path instead of inviting futile PIN retries.

- [ ] **Step 5: Verify the new isolated boundary.**

```powershell
npm.cmd run test:unit -- auth.test.ts session-envelope.test.ts
npm.cmd run test:unit -- import-source-modules.test.ts
npm.cmd run typecheck
npm.cmd run lint
```

Expected: all envelope parsing precedes decrypt calls, the production iteration value is exactly 600,000, and no new module requires DOM globals on import.

---

### Task 3: Implement the injected session controller and durable-envelope semantics

**Files:**

- Create: `apps/pos/src/modules/auth/sessionController.ts`
- Create: `apps/pos/tests/unit/session-controller.test.ts`
- Modify: `apps/pos/src/data/db.ts` only if a typed meta-key helper belongs beside existing meta helpers

**Interfaces:**

```ts
export type SessionController = {
  provider: SessionProvider;
  state(): SessionState;
  subscribe(listener: () => void): () => void;
  beginOnlineSignIn(input: LoginWire): Promise<PendingOnlineSignIn>;
  unlockOffline(staffId: string, pin: string): Promise<SessionIdentity>;
  verifyOfflineAdmin(staffId: string, pin: string): Promise<SessionIdentity>;
  logout(): void;
};

export type PendingOnlineSignIn = {
  identity: SessionIdentity;
  commit(): Promise<void>;
  abandon(): void;
};

export function createSessionController(options: {
  db: ClinicDb;
  auth: AuthClient;
  clock: Clock;
  crypto: SessionCrypto;
}): SessionController;
```

`commit()` persists the envelope only after the caller's bootstrap completes. The controller retains the derived `CryptoKey` in closure memory to re-encrypt a refresh-token rotation without re-prompting for the PIN.

- [ ] **Step 1: Write failing state tests using fake IndexedDB and a fake auth transport.**

Cover all of the following with injected clock and crypto:

1. `beginOnlineSignIn()` sets an in-memory access token for the forthcoming bootstrap but writes no envelope until `commit()`; `abandon()` clears that memory state.
2. `commit()` stores the opaque meta envelope under `auth-envelope:<staffId>` and a later `unlockOffline()` returns the identity with no network call.
3. A provider refresh receives the stored refresh token, exposes the new access token before resolving, re-encrypts the returned replacement refresh token with the retained key, and reanchors `validUntil` from `clock.now() + serverTimeOffset + 90 days`.
4. A refresh rejection triggers `onAuthFailure`, clears only in-memory access state, retains the raw envelope, and leaves a before/after outbox snapshot identical.
5. `logout()` clears in-memory state without deleting the envelope.
6. `verifyOfflineAdmin()` succeeds only when the chosen decrypted identity is role `admin`; it returns that admin identity without replacing the current cashier identity.
7. A `validUntil` beyond the injected server-adjusted time unlocks; one before it produces an identity-expired state. A credential failure never converts a still-valid identity into an expired one.
8. A corrupted/future envelope returns the distinct invalid-envelope code, and controller code does not treat it as a valid wrong PIN.

- [ ] **Step 2: Run the controller test red.**

```powershell
npm.cmd run test:unit -- session-controller.test.ts
```

Expected: FAIL because `@/modules/auth/sessionController` does not exist.

- [ ] **Step 3: Implement per-staff meta persistence and refresh rotation.**

Use only `db.meta` keys:

```ts
auth-envelope:<staffId>
```

The table already stores JSON values, so do not add a new Dexie table or schema version. Keep the access token, active identity, derived key, and listeners in the controller closure only. Read `serverTimeOffset` from `meta` through a typed helper and derive every identity deadline from the injected clock; do not call `Date.now()`.

`provider.refresh()` calls `auth.refresh(refreshToken)`, replaces the access token, updates the secret's refresh token and timestamp, encrypts with the retained derived key and fresh IV, persists it, then notifies listeners. It rejects if no refresh token/key is available. `provider.onAuthFailure()` must notify session state but must neither remove the envelope nor touch outbox rows.

- [ ] **Step 4: Keep PIN throttle deliberately ephemeral.**

Export a pure helper:

```ts
export function pinDelayMs(failedAttempts: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, failedAttempts - 1));
}
```

Unit-test the sequence `1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000`. The login component owns its in-memory counter and `setTimeout`; the controller persists no failed-attempt state. Document this exact choice beside the helper.

- [ ] **Step 5: Verify the session seam.**

```powershell
npm.cmd run test:unit -- session-controller.test.ts api.test.ts outbox.test.ts
npm.cmd run test:unit -- import-source-modules.test.ts
npm.cmd run typecheck
npm.cmd run lint
```

Expected: existing API/outbox tests remain unchanged and green, proving M3 swapped in the real provider without editing either M2 boundary.

---

### Task 4: Compose the client runtime and build provisioning/daily login

**Files:**

- Create: `apps/pos/src/app/providers.tsx`
- Create: `apps/pos/src/app/login/page.tsx`
- Create: `apps/pos/src/modules/auth/LoginScreen.tsx`
- Create: `apps/pos/src/modules/auth/LoginScreen.module.css`
- Create: `apps/pos/src/app/page.tsx`
- Modify: `apps/pos/src/app/layout.tsx`
- Modify: `apps/pos/src/i18n/{types,dict.en,dict.my,dict.zh,I18nProvider}.ts*`
- Modify: `apps/pos/src/ui/PinPad.tsx`
- Modify: `apps/pos/src/ui/Modal.tsx`
- Modify: `apps/pos/src/ui/SyncChip.tsx` and its CSS module
- Modify: `apps/pos/src/ui/AppShell.tsx`

**Interfaces:**

```ts
export type ClinicRuntime = {
  db: ClinicDb;
  api: ApiClient;
  outbox: ReturnType<typeof createOutbox>;
  session: SessionController;
  deviceId: string;
  refreshSync(): Promise<OutboxStatusView>;
};
export function useClinicRuntime(): ClinicRuntime;
```

- [ ] **Step 1: Add the English auth/runtime dictionary contract first.**

Add the exact English keys and make the English dictionary satisfy the expanded key union before JSX uses them:

```text
auth.setup.title = Set up this device
auth.setup.staffId = Installer staff ID
auth.setup.internetRequired = This device must be set up once with an internet connection.
auth.setup.repair = This session needs an online sign-in to repair this device.
auth.login.who = Who is working?
auth.login.pin = Enter PIN
auth.login.wrongPin = Incorrect PIN
auth.login.wait = Please wait before trying again
auth.login.loading = Preparing this device
auth.logout.blocked = Sync the queued work before logging out
```

Add drafted Burmese and Chinese entries with the required native-review marker. Extend the dev-only `I18nProvider` effect so it reads `__devLocale` only after mount and only in development. Render the existing dev override control in the development login root; production builds must render no control and ignore the query parameter.

- [ ] **Step 2: Extend general UI primitives before adding product selectors.**

Keep M1 behavior as default while adding these explicit capabilities:

```ts
type PinPadProps = {
  // existing props
  testId?: string;
  displayTestId?: string;
};
type ModalProps = {
  // existing props
  testId?: string;
};
type SyncChipProps = {
  // existing props
  onClick?(): void;
};
```

`PinPad` renders these passed IDs on its existing section/output, defaulting to `demo-pinpad`/`pin-display` for M1 compatibility. `Modal` defaults to `demo-modal` but renders an explicit dialog test ID when passed. `SyncChip` remains a noninteractive span without `onClick`; with `onClick`, it renders a keyboard-accessible button styled identically and keeps `data-testid="sync-chip"`. Update `AppShell` to pass a SyncChip click handler and retain its existing logout handler.

- [ ] **Step 3: Implement mounted runtime composition.**

Inside a `'use client'` provider effect, create the DB with `createClinicDb()`, establish a stable device UUID in `meta` if missing, call `readApiBaseUrl()`, construct `createAuthClient`, `createSessionController`, `createApiClient({ baseUrl, session: controller.provider })`, `createOutbox`, and a QueryClient. No object is created at module scope.

Expose `provision()` as: begin online sign-in → bootstrap with the controller-backed API and device ID → pending sign-in `commit()` → navigate to `/sale`. If bootstrap fails, call `abandon()` and leave the staff table empty. Expose daily online sign-in with the same sequence, and offline unlock without a bootstrap. On session unlock, call `outbox.drain()` fire-and-forget; in an effect, add and clean up the `online` listener that calls the same drain. Do not let the listener set an online flag.

- [ ] **Step 4: Implement the two intentionally separate login states.**

`LoginScreen` reads the local staff table after runtime readiness:

1. When it is empty, render `data-testid="device-setup"`, translated setup copy, staff-ID `Input`, and `PinPad`. The screen permanently displays that internet is required. `ApiNetworkError` repeats the online-required state; it never uses `navigator.onLine`.
2. When it is nonempty, render `data-testid="staff-picker"` with native `data-testid="staff-option-<id>"` buttons, then the selected staff's PinPad with `testId="login-pinpad"` and `displayTestId="login-pin-display"`.

For a selected staff without an envelope, use online sign-in when the request succeeds; a network failure uses the same generic wrong-PIN UI. For `WrongPinError`, clear and shake. For `InvalidSessionEnvelopeError`, show the translated online-repair message in code-distinct state. Set the in-memory delay from `pinDelayMs`; clear it with a cleanup-safe timer. A reload restarts the count by design.

- [ ] **Step 5: Route, locale, and shell proof.**

Make `/` a client-side redirect to `/login`; `/login` renders the same provider-backed screen. Update the layout to wrap routes in the runtime and i18n providers. Put `data-locale` and `lang` (`my`, `en`, `zh-Hans`) on the route root. No locale persistence is added. Use `AppShell` only after an active session; its logout checks `outbox.status()` and invokes `session.logout()` only with no pending/attention work.

- [ ] **Step 6: Run focused structural checks.**

```powershell
npm.cmd run test:unit -- i18n.test.ts session-controller.test.ts import-source-modules.test.ts
npm.cmd run typecheck
npm.cmd run lint
```

Expected: English completeness covers all new copy, source imports cleanly under Node, no hard-coded user text appears in the new components, and every test ID in this task maps to an actual component prop or native element.

---

### Task 5: Build cart/ticket state and the LAW-1 capture command test-first

**Files:**

- Create: `apps/pos/src/modules/sale/types.ts`
- Create: `apps/pos/src/modules/sale/cart.ts`
- Create: `apps/pos/src/modules/sale/tickets.ts`
- Create: `apps/pos/src/modules/sale/capture.ts`
- Create: `apps/pos/tests/unit/sale-capture.test.ts`
- Create: `apps/pos/tests/unit/sale-tickets.test.ts`

**Interfaces:**

```ts
export type CartLineDraft = {
  id: string; kind: 'service' | 'product'; itemId: string; nameSnapshot: string;
  qty: number; unitPrice: number; discountPct: number | null;
  note: string | null; lotNo: string | null; lotExpiry: string | null;
};
export type TenderDraft = { id: string; method: PaymentRow['method']; amount: number };
export type SaleDraft = { patientId: string | null; lines: CartLineDraft[]; discountPct: number; discountApprovedBy: string | null };
export async function saveTicket(db: ClinicDb, ticket: SaleTicket): Promise<void>;
export async function resumeTicket(db: ClinicDb, ticketId: string): Promise<SaleTicket>;
export async function captureSale(input: CaptureSaleInput): Promise<SaleRow>;
```

`CaptureSaleInput` includes `db`, active staff ID, draft, tenders, credit approver, an explicit `createdOffline` value derived from the last real outbox status, injected `clock`, injected `uuid`, and optional resumed ticket ID. It deliberately has no API, fetch, printer, or session-token parameter.

- [ ] **Step 1: Write red ticket and sale-capture tests.**

Create fake-IndexedDB fixtures with one service, one retail product, one weight product, a clinic rounding step of 500, and a known patient with an allergy. Assert:

1. Saving a ticket persists cart/patient/discount/acting-staff/time under a typed `sale-ticket:<uuid>` meta key and clears only the calling UI's in-memory draft; resuming returns the snapshot and deletes that key only after reading it.
2. A line total, subtotal, cart total, paid amount, change, and credit match calls through `lineTotal`, `cartSubtotal`, `cartTotal`, `change`, and `fmtMMK`; the test never independently recomputes money values.
3. A capture creates UUIDs for sale/lines/payments/outbox, writes an entity-backed protected sale row, decrements only product stock, preserves service stock, and is immediately drainable by M2's outbox.
4. A duplicate injected sale UUID forces the transaction to reject; the product quantity, ticket, and outbox count remain exactly as before, proving atomic rollback.
5. A named-patient credit sale persists the separately supplied admin approver; a walk-in pay-later draft and an over-limit credit without approver reject before beginning the transaction.

- [ ] **Step 2: Run the focused tests red.**

```powershell
npm.cmd run test:unit -- sale-capture.test.ts sale-tickets.test.ts
```

Expected: FAIL because the sale module does not exist.

- [ ] **Step 3: Implement cart derivation without arithmetic outside `money.ts`.**

Use `lineTotal`, `cartSubtotal`, and `cartTotal` directly for every sale amount. To total a split tender without adding a new money export, map each tender to `{ qty: 1, unitPrice: tender.amount }` and pass that list to `cartSubtotal(..., 1)`. Use `change(total, paidAmount)` for balance due and `change(paidAmount, total)` for change. Cash quick buttons are the calculated total plus fixed cash denominations `50,000`, `100,000`, and `500,000`; no UI rounding formula is introduced.

Keep ticket payloads typed JSON-compatible and confined to `meta`; they never enter outbox.

- [ ] **Step 4: Implement the single Dexie transaction.**

`captureSale()` validates required local business inputs before starting the transaction, reads the rounding step and server-time offset, then performs this exact transaction over `sales`, `products`, `outbox`, and `meta`:

```ts
await db.transaction('rw', db.sales, db.products, db.outbox, db.meta, async () => {
  await db.sales.add(saleRow);
  await applyProductStockDecrements(db, saleRow.lines);
  await enqueueOutbox(db, {
    kind: 'sale', uuid: outboxUuid, now: clock.now(),
    payloadRef: { source: 'entity', entity: { table: 'sales', id: saleRow.id },
      protectedEntities: [{ table: 'sales', id: saleRow.id }] },
  });
  if (resumedTicketId) await db.meta.delete(ticketMetaKey(resumedTicketId));
});
```

Set the sale business time from injected clock plus stored server offset. Persist the caller-provided `createdOffline`, which comes only from `outbox.status().state === 'offline'` after an `ApiNetworkError`; never query `navigator`. The command returns only after Dexie commits. The caller opens the receipt and clears the cart only on that success.

- [ ] **Step 5: Verify capture plus existing outbox behavior.**

```powershell
npm.cmd run test:unit -- sale-capture.test.ts sale-tickets.test.ts outbox.test.ts money.test.ts
npm.cmd run typecheck
npm.cmd run lint
```

Expected: the sale is captured atomically with a drainable M2 row; no fetch or printing path can block it.

---

### Task 6: Render the sale workspace and every M3 interaction

**Files:**

- Create: `apps/pos/src/app/sale/page.tsx`
- Create: `apps/pos/src/modules/sale/SaleScreen.tsx`
- Create: `apps/pos/src/modules/sale/{CataloguePanel,CartPanel,TenderModal,ApprovalModal,ReceiptConfirmation}.tsx`
- Create: `apps/pos/src/modules/sale/SaleScreen.module.css`
- Modify: `apps/pos/src/i18n/{types,dict.en,dict.my,dict.zh}.ts`
- Modify: `apps/pos/src/app/page.tsx`, `apps/pos/src/app/page.module.css`
- Modify: `apps/pos/src/ui/index.ts`

**Interfaces:**

```ts
export function SaleScreen(): JSX.Element;
export type ApprovalRequest =
  | { kind: 'discount'; percent: number }
  | { kind: 'credit'; projectedCredit: number; patientId: string };
```

- [ ] **Step 1: Add complete English sale copy before rendering it.**

Add typed English values for these concrete groups, then drafted Burmese/Chinese values with native-review markers: sale/cart/catalogue headings; Services/Products; search and scanner labels; unknown/restricted scan toasts; quantity, lot, expiry, note, remove, save-ticket, resume-ticket; discount chips/custom discount; cash/KBZPay/Wave/split/pay later/change/balance; credit approval; allergy banner; complete/receipt/print/share/done; and sync/logout status. Do not use text literals in JSX other than test IDs and data values.

- [ ] **Step 2: Build the reference split workspace from local data.**

`SaleScreen` renders `data-testid="sale-root"` under the real `AppShell`. Query services/products/patients from the mounted runtime DB, show skeleton/empty states while appropriate, and make `CartPanel` (`data-testid="sale-cart"`) sit left of `CataloguePanel` on wide screens. CSS uses only token variables; products and services stack responsively on narrow displays.

Catalogue requirements:

- `Tabs` exposes Services and Products, category chips, and tokenized search.
- `Input data-testid="catalogue-search"` filters only local rows.
- `Input data-testid="scanner-input"` dispatches lookup on Enter.
- A known retail barcode adds a line. A `professional` or `injectable` scan emits the singleton Toast and never adds a line. An unknown barcode opens the reference handoff modal retaining the scanned value, without building the M5 catalogue editor.
- Weight products open a quantity keypad. A `requiresLot` service opens `Modal testId="lot-modal"`, requires lot and expiry, and its demo DataMatrix control fills `BTX-2311`/`2027-01` exactly. No unspecifed GS1 parser is introduced.

- [ ] **Step 3: Implement cart safety and line controls.**

Each native line owner renders `data-testid="cart-line-<lineId>"`. The selected patient's `allergies` or `alertNote` produces `data-testid="allergy-banner"` above every cart action; it is never conditional on a modal, tab, elevation, or flag. Line edit opens the typed modal with plus/minus quantity, note, and remove actions. Ticket actions use Task 5 persistence. Use default-ink StatTiles only; show a semantic value tone only for real outstanding credit.

- [ ] **Step 4: Implement tender and separate approval identity.**

`TenderModal` is `testId="tender-modal"` and offers cash, KBZPay, Wave, and a split payment list. Cash uses the Task 5 derived total/change. Pay later is disabled until a local patient is attached. If discount exceeds 20% or projected credit exceeds `clinic.creditLimitMmk`, open `ApprovalModal testId="approval-modal"`; it lists only provisioned admin envelope identities and calls `verifyOfflineAdmin()`. On success, record that admin ID in the draft without changing the cashier session. On failure, clear the approval PIN and retain the sale draft.

- [ ] **Step 5: Complete and confirm without blocking.**

The Complete action calls only `captureSale()`. On resolve it clears the live cart and opens `ReceiptConfirmation data-testid="receipt-view"` with `data-testid="sale-complete"` on its Done action. Render the v4 receipt hierarchy from the committed sale, including waiting-to-sync status. Print and Share invoke browser actions only fire-and-forget; unsupported/failing actions enqueue a translated Toast. They never influence the already committed sale. Do not create M5's canvas renderer, PNG raster, or printer transport.

- [ ] **Step 6: Check test-ID traceability and source boundaries.**

Before adding any E2E assertion, verify it matches this implementation map:

```text
login-root/device-setup/staff-picker/staff-option-* -> LoginScreen native elements
login-pinpad/login-pin-display -> PinPad explicit props
sale-root/catalogue-search/scanner-input/catalogue-item-* -> SaleScreen/CataloguePanel native elements
sale-cart/cart-line-*/allergy-banner -> CartPanel native elements
lot-modal/tender-modal/approval-modal -> Modal explicit testId prop
receipt-view/sale-complete -> ReceiptConfirmation native elements
sync-chip -> SyncChip rendered root/button
```

Run:

```powershell
npm.cmd run test:unit -- sale-capture.test.ts i18n.test.ts import-source-modules.test.ts
npm.cmd run typecheck
npm.cmd run lint
```

Expected: no cross-module import, no literal colors under `src`, and every planned E2E test ID is renderable.

---

### Task 7: Replace the demo E2E with M3 offline/online workflow and screenshot evidence

**Files:**

- Create: `apps/pos/tests/e2e/m3.export.spec.ts`
- Create: `apps/pos/tests/e2e/m3.locales.spec.ts`
- Modify: `apps/pos/tests/e2e/visuals.ts`
- Delete: `apps/pos/tests/e2e/demo.export.spec.ts`
- Delete: `apps/pos/tests/e2e/demo.locales.spec.ts`
- Modify: `.gitignore`

**Interfaces:**

```ts
export async function resetMock(request: APIRequestContext): Promise<void>;
export async function captureM3Screenshots(page: Page): Promise<void>;
export async function captureM3ReferenceComparison(page: Page): Promise<void>;
```

- [ ] **Step 1: Preserve baseline assertions in the red export spec.**

Before `page.goto('/login')`, collect every request whose hostname is not `127.0.0.1` or `localhost`. Assert at the end that the list is empty. Assert the static output retains body `rgb(250, 249, 247)`, the primary login/complete action `rgb(0, 104, 249)`, Padauk loaded via `document.fonts.check`, Burmese `font-family` containing Padauk, `data-locale="my"`, and `lang="my"`. Navigate to `/?__devLocale=en` and assert the export remains Burmese with no dev override control.

- [ ] **Step 2: Write the deterministic export workflow.**

In a test that begins with `resetMock()`:

1. Complete first-device setup online as mock admin `s1`/`1234`; assert the staff picker appears after bootstrap.
2. Sign out with an empty outbox, sign in online once as staff `s2`/`0000`, then sign in online once as admin `s1`/`1234` to provision both envelopes. Sign back in as staff.
3. Save/resume a ticket, attach patient `c1`, and assert the allergy banner. Add a normal product/service, enter the known barcode, scan a restricted injectable and assert its toast, add the weight product through its keypad, and add the lot-required service through the lot modal's demo prefill.
4. Assert the catalogue Tabs switch correctly, close the lot modal once with Escape and once through its backdrop, and assert the scanner Toast remains singleton. The login and approval PinPads assert their rendered digit lengths.
5. Call `context.setOffline(true)`. Apply a custom discount above 20% through the offline admin envelope, choose split tender, and retain the receipt-ready cart.
6. Complete the sale, assert receipt and pending/offline SyncChip state, snapshot local product stock through UI, and attempt logout; assert it is refused because the outbox is non-empty.
7. Call `context.setOffline(false)`, tap `sync-chip`, wait for the queued count to become zero, and assert the sale's captured ID/total/line/payment values in the accepted `POST /sales` response match the receipt/local visible data. The test records the response body on the outgoing request; it never introduces a non-contract mock inspection endpoint.

Use `test.beforeEach` reset, not a one-time reset. This is mandatory even when the workflow later splits into several test cases.

- [ ] **Step 3: Keep locale proof as the second project.**

The dev-locale spec resets the mock before each test, goes to `/login?__devLocale=my|en|zh`, and asserts all three values render. It asserts Burmese Padauk and line-height ≥1.7, English fallback text where a deliberately sparse translation remains, and the declared Chinese system font stack plus `lang="zh-Hans"`. It captures all three renderings. It does not perform live font requests.

- [ ] **Step 4: Capture the M3 visual-review set.**

Update `visuals.ts` to write under `outputs/m3/` and retain its local fulfilment of Google font CSS/font bytes for reference capture. Capture at 1280×800:

```text
login-staff-picker.png
login-pin.png
sale-workspace-my.png
tender-approval.png
receipt-confirmation.png
sync-pending.png
locale-my.png
locale-en.png
locale-zh.png
comparison-login.png
comparison-sale.png
```

Load the v4 reference in a separate page and move it to its login and sale states for the two comparison pairs. Add `outputs/m3/` to root `.gitignore`; generated screenshots are report artifacts, never source changes.

- [ ] **Step 5: Build the export and run the two-project gate.**

```powershell
$env:NEXT_PUBLIC_EDEN_API_BASE_URL = 'http://127.0.0.1:4010'
npm.cmd run build
npm.cmd run test:e2e
```

Expected: one Playwright invocation starts mock/static/dev servers, runs `e2e-export` and `e2e-dev-locales`, resets mock state before every case, and leaves no external request unaccounted for.

---

### Task 8: Perform the M3 five-gate audit and owner handoff

**Files:**

- Verify: all M3 source, unit, E2E, and CSS files above
- Verify: `apps/pos/tokens.css`, `apps/pos/package.json`, `apps/pos/package-lock.json`, `apps/pos/public/{manifest.webmanifest,sw.js}`
- Verify: `.github/workflows/ci.yml`, `.gitignore`

- [ ] **Step 1: Re-prove immutable M0–M2 boundaries.**

Run from `apps/pos`:

```powershell
npm.cmd run test:unit -- tokens.test.ts import-source-modules.test.ts module-boundary.test.ts money.test.ts outbox.test.ts
Get-FileHash tokens.css -Algorithm SHA256 | Select-Object -ExpandProperty Hash
(Get-Item tokens.css).Length
rg -n -e '#[0-9a-fA-F]{3,8}' -e 'rgba?\(' src
rg -n 'Date\.now|navigator|localStorage|sessionStorage|indexedDB' src/data
git diff --check
```

Expected: the token hash is `8D39F41E6710FA1EDCE202AF74F118E76547A4172F5DC8073135E0F76EB09E82`, byte count is `597`, the color-literal search has no matches under `src`, the data-layer audit contains none of the forbidden access terms, and Git reports no whitespace error.

- [ ] **Step 2: Run every gate with the static mock build configuration.**

Run from `apps/pos`, preserving unabridged output for the report:

```powershell
$env:NEXT_PUBLIC_EDEN_API_BASE_URL = 'http://127.0.0.1:4010'
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:unit
npm.cmd run build
npm.cmd run test:e2e
```

Expected: types, lint, units, static export, and both Playwright projects are green. The export E2E proves only local requests; the dev project proves all three locales.

- [ ] **Step 3: Audit scope, dependencies, and generated files.**

Run from repository root:

```powershell
git diff -- apps/pos/tokens.css apps/pos/public/sw.js apps/pos/public/manifest.webmanifest apps/pos/package.json apps/pos/package-lock.json
git diff -- .github/workflows/ci.yml apps/pos/playwright.config.ts .gitignore
npm.cmd --prefix apps/pos ls --depth=0
git status --short
```

Expected: no dependency delta, no token/service-worker/manifest delta, CI only gains the required mock API environment, Playwright only gains the documented three-server topology, and `outputs/m3/` is ignored.

- [ ] **Step 4: Prepare the owner-session M3 report.**

Report all of the following before asking for the milestone commit:

1. File inventory grouped by runtime config, auth/session, sale capture, UI, tests, and E2E artifacts.
2. The exact API base-url deployment rule: local/CI build `NEXT_PUBLIC_EDEN_API_BASE_URL=http://127.0.0.1:4010`; production build receives the real Singapore API origin from deployment configuration; no runtime config fetch exists.
3. Unabridged output from the five gates, total unit count, and both Playwright project results.
4. The M3 screenshot inventory and side-by-side v4 comparisons for Dan's visual judgment.
5. Confirmed security behavior: 600,000-iteration validated envelope; corrupt/future versions route to online repair; PIN delay is in-memory; logout preserves envelope; server credential expiry only blocks drain; the 90-day identity window permits outage capture.
6. Known limits: device activation pairing code is backend debt; no idle-lock policy; no broader M4 admin-envelope policy; no general GS1 parser; no M5 receipt renderer/transport.

Propose this owner-session commit message:

```text
sale: deliver offline login and money path (M3)
```

## Plan self-review

| Requirement | Implemented by |
|---|---|
| Build/deployment API seam and no external leakage | Tasks 1 and 7 |
| Per-staff PIN envelope, validation before decryption, rotation, honest threat model | Tasks 2 and 3 |
| Device setup fallback, offline staff picker, no hard lockout, logout behavior | Tasks 3 and 4 |
| SessionProvider seam, single-flight compatibility, outbox preservation | Task 3 with existing M2 tests |
| Sale UI behaviors, allergy rule, gates, tickets, tenders, receipt | Tasks 5 and 6 |
| One-transaction capture plus stock decrement/outbox enqueue | Task 5 |
| E2E reset, export/dev topology, baseline retention, offline drain parity, screenshots | Task 7 |
| Token/dependency/scope audit and full five gates | Task 8 |

The plan contains no dependency change, runtime API shape invention, persistent PIN throttle, product-module cross import, or test selector without a rendering owner. Implementation begins only after Dan approves this plan; it is then executed inline under the established owner-session commit workflow.
