# Eden Clinic OS M4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan inline, task by task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents in this workspace.

**Goal:** Deliver static-export-safe Clients and Calendar product routes, including durable offline patient/appointment workflows and the approved device-local offline-admin-envelope policy.

**Architecture:** M4 keeps each feature module independent. Typed data commands own every Dexie/outbox transaction; `modules/patients` and `modules/calendar` render and coordinate only their own UI. The provider composes memory-only elevation, session-revocation boundaries, and shell-level offline-approval state. Client profile selection uses the static `/clients?patient=<uuid>` query route and survives a reload by returning through login after a fresh offline PIN unlock.

**Tech Stack:** Next.js static export, React 19, TypeScript 5.9, Dexie 4, TanStack Query 5, Zod 4, Vitest 4, Playwright 1.62, self-hosted Inter/Padauk, and the existing Node mock server. No dependency enters `package.json` or the lockfile.

## Global Constraints

- M4 is only Clients (§8.4), Calendar (§8.3), minimal elevation/envelope management, and the required sale-prefill integration. No Home, Stocks, Set-up, service worker, manifest, CSP, idle-lock, patient edit UI, clinical writes, photos, or consents.
- All user-facing copy goes through the typed i18n dictionaries. English is complete; every drafted Burmese/Chinese value has `// TODO(native-review)`.
- Preserve LAW-1 through LAW-12. In particular: UUIDs at record creation, no unsynced-row deletion, outbox dependencies/re-read/merge rewrite, integer money solely in `money.ts`, no module-scope browser/storage access, always-visible allergy data, and admin gating rules.
- `tokens.css` must remain UTF-8/LF/597 bytes with SHA-256 `8d39f41e6710fa1edce202af74f118e76547a4172f5dc8073135e0f76eb09e82`.
- Static output is the deployment truth. The static server must preserve extensionless HTML fallbacks and serve Next `_next/**/*.txt` as `text/x-component`.
- The mock’s test-only operations use the `/__` namespace exclusively. `openapi.yaml` remains unchanged.
- Every asserted E2E test ID must be rendered by the named component or explicitly forwarded prop before the spec is written.
- Keep exact dependency pins and the committed lockfile unchanged. Git writes are owner-session only; use read-only status/diff checks in this sandbox.

---

## File and interface map

| Path | Responsibility |
|---|---|
| `src/data/types.ts` | Add `staff.active`, appointment-status/elevation schemas, local conflict state, and typed audit/pre-fill records. |
| `src/data/api.ts` / `src/data/outbox.ts` | Send validated appointment-status PATCH rows and fresh elevation requests through the existing session/single-flight path. |
| `src/data/patientRecords.ts` | Create a patient and entity-backed outbox row atomically. |
| `src/data/appointmentRecords.ts` | Create/update local appointments and their correctly dependent outbox rows atomically. |
| `src/data/adminEnvelopes.ts` | Count/purge/remove envelope records and write typed audit entries. |
| `src/data/elevation.ts` | Hold online elevation only in memory. |
| `src/data/salePrefill.ts` | One-shot typed appointment-to-sale handoff in `meta`. |
| `src/flags/useClinicAddon.ts` | Read clinic `addons` from the local runtime; `recall` is true only when the bootstrap field is exactly `true`, otherwise false. |
| `src/modules/patients/*` | Local-first Clients list, form, profile, counter/clinical split. |
| `src/modules/calendar/*` | Day grid, booking, lifecycle actions, and new-patient/charge handoffs. |
| `src/modules/auth/OfflineAdminEnvelopeManager.*` | Narrow admin-only envelope-removal dialog with fresh online-password/offline-PIN regimes. |
| `src/app/providers.tsx`, `src/ui/AppShell.*`, `src/modules/auth/sessionController.ts` | Runtime composition, persistent no-admin indicator, safe-boundary revocation, and return-to navigation. |
| `mock/mock-server.mjs`, `tests/e2e/mock.ts` | Contract-consistent `staff.active` seed and `/__` fixture controls only. |

## Task 1: Extend the typed contract, mock fixtures, and outbox dispatch boundary

**Files:**

- Modify: `apps/pos/src/data/types.ts`, `apps/pos/src/data/api.ts`, `apps/pos/src/data/outbox.ts`
- Modify: `mock/mock-server.mjs`, `apps/pos/tests/e2e/mock.ts`
- Modify tests: `apps/pos/tests/unit/types.test.ts`, `apps/pos/tests/unit/api.test.ts`, `apps/pos/tests/unit/outbox.test.ts`

**Interfaces:**

- Produce `StaffWire.active?: boolean` and `StaffRow.active: boolean`, with `toLocalStaff()` defaulting missing wire data to `true`.
- Produce `AppointmentStatus = AppointmentRow['status']`, `AppointmentStatusUpdateWire = { appointment_id: string; status: AppointmentStatus }`, `AppointmentRow.syncConflict: boolean`, and an inline `OutboxKind` variant `appointmentStatus` dispatched as `PATCH /appointments/<id>`.
- Produce `ElevationResponseWire = { elevation_token: string; expires_at: string }` and `ApiClient.elevate({ password, screen }): Promise<ElevationResponseWire>`.
- Make the mock’s `POST /__reset` accept optional `{ addons?: { recall?: boolean } }`; add `POST /__staff/<id>/offboard` as a fixture-only state transition. Both routes are excluded from OpenAPI.

- [x] **Step 1: Write failing typed-contract and fixture tests.**

  Add cases that parse a staff wire with `active: false`, default an omitted `active` to true, dispatch an `appointmentStatus` item as a PATCH with a validated status body, and parse the elevation response. Add mock tests that verify every seed staff row has `active: true`, `POST /__staff/s2/offboard` emits the staff delta with `active: false`, and `POST /__reset` with `{ addons: { recall: false } }` returns bootstrap clinic add-ons with `recall: false`.

  ```ts
  expect(toLocalStaff({ id: 's2', name: 'Aye', role: 'staff' }).active).toBe(true);
  await api.dispatch({ kind: 'appointmentStatus', appointmentId: 'a1', payload: { appointment_id: 'a1', status: 'here' } });
  expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('/appointments/a1'), expect.objectContaining({ method: 'PATCH' }));
  ```

- [x] **Step 2: Run the focused tests and confirm the missing variant/schema failures.**

  Run: `npm.cmd run test:unit -- types api outbox`

  Expected: failures naming the absent `active`, `appointmentStatus`, elevation schema, and mock fixture behavior.

- [x] **Step 3: Add the minimal data contract.**

  Add `active` to Zod/local staff conversions and default `syncConflict` to false in local appointment conversion; add an inline payload schema for appointment status. Extend `RequestOptions.method` to `'GET' | 'POST' | 'PATCH'`, then add the two API-client cases without bypassing `request()` or its 401 single-flight behavior. Extend `resolveDispatch()`, `dispatchFromInline()`, and `applySuccess()` so a status row is replay-safe and an appointment response with `conflict: true` sets the local row’s `syncConflict` to true.

  In the mock, keep product behavior untouched. Seed each staff member with `active: true`; implement only `/__reset` options and `/__staff/<id>/offboard`, both guarded by the existing fixture-only prefix. The offboarding hook sets `active: false` and emits a normal `staff` delta change.

- [x] **Step 4: Re-run focused tests.**

  Run: `npm.cmd run test:unit -- types api outbox`

  Expected: all focused suites pass; regular sale/patient/product dispatch behavior remains unchanged.

## Task 2: Add transactional patient, appointment, and sale-prefill commands

**Files:**

- Create: `apps/pos/src/data/patientRecords.ts`, `apps/pos/src/data/appointmentRecords.ts`, `apps/pos/src/data/salePrefill.ts`
- Modify: `apps/pos/src/data/types.ts`, `apps/pos/src/data/money.ts`
- Create tests: `apps/pos/tests/unit/patient-records.test.ts`, `apps/pos/tests/unit/appointment-records.test.ts`, `apps/pos/tests/unit/sale-prefill.test.ts`

**Interfaces:**

```ts
export type CreatePatientInput = {
  id: string; name: string; phone: string; sex: string | null;
  telegramLinked: boolean; allergies: string | null; alertNote: string | null; now: number;
};
export type CreatedPatient = { patient: PatientRow; outboxUuid: string };
export async function createPatient(db: ClinicDb, input: CreatePatientInput): Promise<CreatedPatient>;

export type CreateAppointmentInput = {
  id: string; date: string; time: string; staffId: string; patientId: string;
  serviceId: string; dependsOnUuid: string | null; now: number;
};
export async function createAppointment(db: ClinicDb, input: CreateAppointmentInput): Promise<{ appointment: AppointmentRow; outboxUuid: string }>;
export async function setAppointmentStatus(db: ClinicDb, input: { appointmentId: string; status: AppointmentStatus; dependsOnUuid: string | null; now: number }): Promise<string>;

export type SalePrefill = { appointmentId: string; patientId: string; serviceId: string };
export async function stageSalePrefill(db: ClinicDb, prefill: SalePrefill): Promise<void>;
export async function consumeSalePrefill(db: ClinicDb): Promise<SalePrefill | undefined>;
```

- [x] **Step 1: Write failing data-command tests.**

  Test that `createPatient()` writes a UUID row with `code: null` and one entity-backed patient outbox row in one transaction. Test that a booking for the returned patient preserves the patient outbox UUID as `dependsOnUuid` and protects the patient reference for M2 merge rewriting. Test same-device conflict selection, appointment status dependency, and one-time prefill consumption. Add money tests for `patientOutstanding(sales)` returning an integer MMK total without component arithmetic.

  ```ts
  const created = await createPatient(db, { id: 'p-local', name: 'Ma Ei', phone: '09 771 234 560', sex: null, telegramLinked: false, allergies: null, alertNote: null, now: 5 });
  const booking = await createAppointment(db, { id: 'a-local', date: '2026-07-31', time: '10:00', staffId: 's1', patientId: created.patient.id, serviceId: 'v1', dependsOnUuid: created.outboxUuid, now: 6 });
  expect((await db.outbox.where('uuid').equals(booking.outboxUuid).first())?.dependsOnUuid).toBe(created.outboxUuid);
  ```

- [x] **Step 2: Run the new suites and confirm they fail.**

  Run: `npm.cmd run test:unit -- patient-records appointment-records sale-prefill money`

  Expected: module-resolution failures for the new command files and missing money helper.

- [x] **Step 3: Implement commands around caller-owned Dexie transactions.**

  Use `buildOutboxRow()`/`enqueueOutbox()` only; do not hand-roll an `OutboxRow`. Patient and appointment creation each write the domain row and outbox row atomically. Appointment creation has an entity source for itself and protects both the appointment and the selected patient. Status changes write the local status then an inline `appointmentStatus` row; when the create row is still non-done, set its UUID as the update dependency. Store a single typed `salePrefill` meta key; `consumeSalePrefill()` reads then deletes it in one transaction.

- [x] **Step 4: Preserve merge and collision behavior.**

  Export a pure `isSlotOccupied(appointments, staffId, date, time)` selector that treats active booked/here slots as occupied and is used by both UI and tests. Ensure `rewritePatientRows()` also rewrites a staged sale-prefill patient ID. Keep a server-reported appointment conflict on the local row; never discard the booking in response to that conflict.

- [x] **Step 5: Re-run all data suites.**

  Run: `npm.cmd run test:unit -- patient-records appointment-records sale-prefill money outbox bootstrap`

  Expected: every test passes, including M2’s existing merge/re-read tests.

## Task 3: Implement elevation, envelope lifecycle, and safe session revocation

**Files:**

- Create: `apps/pos/src/data/adminEnvelopes.ts`, `apps/pos/src/data/elevation.ts`
- Modify: `apps/pos/src/modules/auth/sessionController.ts`, `apps/pos/src/app/providers.tsx`, `apps/pos/src/data/bootstrap.ts`
- Create tests: `apps/pos/tests/unit/admin-envelopes.test.ts`, `apps/pos/tests/unit/elevation.test.ts`
- Modify tests: `apps/pos/tests/unit/session-controller.test.ts`, `apps/pos/tests/unit/bootstrap.test.ts`

**Interfaces:**

```ts
export type EnvelopeAuditEntry = {
  id: string; at: string; action: 'manual-removal' | 'server-offboarding';
  targetStaffId: string; actorStaffId: string | null;
};
export async function offlineApprovalsState(db: ClinicDb): Promise<{ hasAdminEnvelope: boolean }>;
export async function removeLocalEnvelope(db: ClinicDb, input: { targetStaffId: string; actorStaffId: string; now: number }): Promise<void>;
export async function purgeOffboardedEnvelope(db: ClinicDb, input: { targetStaffId: string; now: number }): Promise<void>;

export type ElevationController = {
  state(): { kind: 'none' } | { kind: 'active'; token: string; expiresAt: string };
  elevate(password: string, screen: string): Promise<void>;
  clear(): void;
};

export type SyncStaffResult = { offboardedStaffIds: string[] };
```

- [x] **Step 1: Write failing policy tests before UI.**

  Cover all approved branches: manual removal refuses the final active admin envelope; manual removal of a non-final target writes an audit record; a server `active:false`/delete purge succeeds even for the final admin; no envelope means `hasAdminEnvelope: false`; and all audit values are JSON-safe typed meta values. Test that `verifyOfflineAdmin()` decrypts the actor’s envelope on every call by using a crypto fake that records decryptions, rather than accepting the retained active key. Test a pending session revocation is applied only after `endCaptureBoundary()`.

  Test elevation stores only the server token/expiry in controller memory, clears on session end, and makes no IndexedDB/meta write. Test `ApiNetworkError` is distinguishable from bad-password `ApiHttpError` so only the former can select the offline-removal path.

- [x] **Step 2: Run the focused policy tests and confirm the expected red state.**

  Run: `npm.cmd run test:unit -- admin-envelopes elevation session-controller bootstrap`

  Expected: failures for absent data helpers, capture boundary, and elevation controller.

- [x] **Step 3: Implement envelope data helpers and session boundary.**

  Use `authEnvelopeMetaKey()` and an `envelope-audit:<uuid>` key. `removeLocalEnvelope()` counts only active `role: 'admin'` staff with a stored envelope and throws a typed `LastAdminEnvelopeError` before deleting the final target. `purgeOffboardedEnvelope()` does no such count and records `server-offboarding` in the same transaction as the staff sync change.

  Add `beginCaptureBoundary(): () => void` and `requestRevocation(staffId): void` to the session controller. The returned end function clears the current session only after the capture transaction has completed or rolled back. `verifyOfflineAdmin()` must continue to call fresh envelope decryption and never inspect `activeKey` as proof.

- [x] **Step 4: Integrate server offboarding in the data transaction and compose runtime state.**

  Make `bootstrap()` and `pullDelta()` return `SyncStaffResult`. In their existing data-only Dexie transaction, recognize a staff delete or `active: false` upsert, call `purgeOffboardedEnvelope()` there, and collect the affected IDs. Do not import auth/session code into `bootstrap.ts`. In the provider, create the elevation controller after mount; clear it through the existing session subscription when the session is no longer active. Consume the returned IDs after transaction commit and call `requestRevocation()` for each. Expose `beginCaptureBoundary`, `offlineApprovalsState`, and `elevation` through `ClinicRuntime`; keep all state memory-only.

- [x] **Step 5: Re-run policy tests.**

  Run: `npm.cmd run test:unit -- admin-envelopes elevation session-controller bootstrap`

  Expected: green, including server-authoritative final-admin removal and delayed active-session sign-out.

## Task 4: Add the clinic add-on hook, persistent warning, and admin envelope manager

**Files:**

- Create: `apps/pos/src/flags/useClinicAddon.ts`, `apps/pos/src/modules/auth/OfflineAdminEnvelopeManager.tsx`, `apps/pos/src/modules/auth/OfflineAdminEnvelopeManager.module.css`
- Modify: `apps/pos/src/ui/AppShell.tsx`, `apps/pos/src/ui/AppShell.module.css`, `apps/pos/src/modules/sale/SaleScreen.tsx`, `apps/pos/src/i18n/types.ts`, `apps/pos/src/i18n/dict.en.ts`, `apps/pos/src/i18n/dict.my.ts`, `apps/pos/src/i18n/dict.zh.ts`
- Create tests: `apps/pos/tests/unit/clinic-addon.test.ts`, `apps/pos/tests/unit/offline-admin-manager.test.ts`

**Interfaces:**

```ts
export function useClinicAddon(key: 'recall'): boolean;
export type OfflineAdminEnvelopeManagerProps = {
  currentAdminId: string;
  onRemoved(): void;
};
```

- [x] **Step 1: Write failing hook and manager tests.**

  Test `useClinicAddon('recall')` returns false if the bootstrapped clinic omits the key, true only for the literal boolean true, and reacts to a refreshed local clinic row. Test the manager chooses fresh password elevation first, does not reuse an active elevation, switches to offline PIN only for `ApiNetworkError`, rejects an invalid PIN, and refuses a final-admin target. Test the shell attention state renders the exact translated English fallback message when no active admin envelope exists and clears when an admin envelope is written.

- [x] **Step 2: Run and confirm the missing-hook/component failures.**

  Run: `npm.cmd run test:unit -- clinic-addon offline-admin-manager i18n`

  Expected: failures naming the new hook, component, i18n keys, and shell prop.

- [x] **Step 3: Implement the flag source and persistent shell state.**

  Read `ClinicRow.addons` from the local runtime/reactive revision. `recall` defaults to false by checking `clinic.addons.recall === true`; no separate local meta boolean exists. Extend `AppShell` with a status-level attention prop and render a persistent tokenized Tag/notice with `data-testid="offline-admin-attention"`. The message is exactly the approved copy in every locale. It is not a toast and is visible on Sale, Clients, and Calendar.

- [x] **Step 4: Implement the two removal regimes.**

  Render the narrow manager only for the current active admin. The Online action always opens a fresh password field and calls `runtime.elevation.elevate(password, 'offline-admin-envelope-removal')`; it never accepts an existing elevation token. On success, call `removeLocalEnvelope()`. On `ApiNetworkError`, replace the form with translated offline warning copy and a fresh `PinPad`; call `runtime.session.verifyOfflineAdmin(currentAdminId, pin)` before the same data removal. Wrong password/PIN and final-admin errors stay in their respective visible states; no local password verifier is introduced.

- [x] **Step 5: Re-run focused tests and lint.**

  Run: `npm.cmd run test:unit -- clinic-addon offline-admin-manager i18n; npm.cmd run lint`

  Expected: green. Confirm every new Burmese/Chinese string has its native-review marker.

## Task 5: Build the static Clients list/profile and reload-safe deep link

**Files:**

- Create: `apps/pos/src/app/clients/page.tsx`, `apps/pos/src/modules/patients/ClientsScreen.tsx`, `apps/pos/src/modules/patients/ClientsScreen.module.css`, `apps/pos/src/modules/patients/PatientProfileScreen.tsx`, `apps/pos/src/modules/patients/PatientProfileScreen.module.css`, `apps/pos/src/modules/patients/patientSelectors.ts`
- Modify: `apps/pos/src/modules/auth/LoginScreen.tsx`, `apps/pos/src/modules/auth/sessionController.ts`, `apps/pos/src/data/money.ts`, `apps/pos/src/i18n/types.ts`, `apps/pos/src/i18n/dict.en.ts`, `apps/pos/src/i18n/dict.my.ts`, `apps/pos/src/i18n/dict.zh.ts`
- Create tests: `apps/pos/tests/unit/patient-selectors.test.ts`, `apps/pos/tests/unit/patient-profile.test.ts`

**Interfaces:**

```ts
export function selectPatients(rows: readonly PatientRow[], query: string): PatientRow[];
export function patientOutstanding(sales: readonly SaleRow[]): number;
export function selectedPatientIdFromSearch(search: string): string | undefined;
export function safeReturnTo(value: string | null): '/sale' | `/clients${string}` | '/calendar';
```

- [x] **Step 1: Write failing selector/profile/return tests.**

  Test local name-and-phone search, URL-encoded `?patient=` extraction, bad/missing parameter behavior, counter balance through `patientOutstanding`, and an allergy banner for both allergy and alert-note inputs. Test that clinical information remains locked until elevation and Recall is absent only when the flag is false. Test `safeReturnTo()` accepts only local `/sale`, `/calendar`, and `/clients` paths, preserving the patient query but rejecting external/protocol-relative URLs.

- [x] **Step 2: Run the focused tests to establish the red state.**

  Run: `npm.cmd run test:unit -- patient-selectors patient-profile money`

  Expected: failures for selector/profile modules and return-to parsing.

- [x] **Step 3: Implement the static query profile state.**

  Parse `?patient=` only from a post-mount client effect; never read `window`/`location` at module scope. Render `/clients` as list when no valid selected ID exists and a profile when it resolves locally. Use `router.push('/clients?patient=<encoded id>')` for selection. The page guard sends a reloaded signed-out session to `/login?returnTo=<encoded local path>`; after a fresh offline PIN unlock, `LoginScreen` uses `safeReturnTo()` instead of always pushing `/sale`.

- [x] **Step 4: Implement counter and clinical UI.**

  Build v4 list/profile cards from local Dexie data, with loading/empty/no-match states. Use `StatTile` with ink defaults; request only the red tone for non-zero outstanding balance. Always render the allergy/alert banner before the clinical gate. The clinical unlock modal calls the online elevation controller; display clinical sale-line history only after success. Read Recall solely through `useClinicAddon('recall')`; when false, omit the card but retain clinical history. Book and New Sale actions call data handoff functions, not other modules.

- [x] **Step 5: Re-run focused tests.**

  Run: `npm.cmd run test:unit -- patient-selectors patient-profile clinic-addon i18n`

  Expected: green with no component user-facing literals.

## Task 6: Build Calendar, prefill Sale at the capture boundary, and route the shell

**Files:**

- Create: `apps/pos/src/app/calendar/page.tsx`, `apps/pos/src/modules/calendar/CalendarScreen.tsx`, `apps/pos/src/modules/calendar/CalendarScreen.module.css`, `apps/pos/src/modules/calendar/calendarSelectors.ts`
- Modify: `apps/pos/src/modules/sale/SaleScreen.tsx`, `apps/pos/src/ui/AppShell.tsx`, `apps/pos/src/i18n/types.ts`, `apps/pos/src/i18n/dict.en.ts`, `apps/pos/src/i18n/dict.my.ts`, `apps/pos/src/i18n/dict.zh.ts`
- Create tests: `apps/pos/tests/unit/calendar-selectors.test.ts`, `apps/pos/tests/unit/sale-prefill-consumption.test.ts`

**Interfaces:**

```ts
export function calendarColumns(staff: readonly StaffRow[]): StaffRow[];
export function appointmentsForDay(rows: readonly AppointmentRow[], date: string): AppointmentRow[];
export function isSlotOccupied(rows: readonly AppointmentRow[], staffId: string, date: string, time: string): boolean;
```

- [x] **Step 1: Write failing calendar and prefill-consumption tests.**

  Test that inactive/non-booking staff are absent, a booked/here slot blocks same-device booking, cancelled slots are available, and appointment cards retain their server conflict state. Test that Sale consumes a staged `{ appointmentId, patientId, serviceId }` exactly once, installs the patient/service, and clears the key only after the cart accepts it. Test that a capture boundary is ended in `finally` when capture succeeds or throws.

- [x] **Step 2: Run focused tests and confirm they fail.**

  Run: `npm.cmd run test:unit -- calendar-selectors sale-prefill-consumption sale-capture`

  Expected: missing calendar module/selector and unconsumed prefill failures.

- [x] **Step 3: Implement the calendar UI from local rows.**

  Render the selected-day grid with v4 compact slot cards, then a typed booking modal. Slot click prepopulates staff/time; form save first calls `isSlotOccupied()`, shows the translated refusal toast on conflict, otherwise uses `createAppointment()` and a non-blocking `runtime.refreshSync()`. “New patient” invokes `createPatient()` and returns to the still-open form with `patientId` and `dependsOnUuid` installed. Appointment detail writes `here`/`cancelled` through `setAppointmentStatus()` and stages sale prefill before navigating to `/sale`.

- [x] **Step 4: Consume prefill safely in Sale and wire route tabs.**

  After mount, Sale uses `consumeSalePrefill()` and local Dexie lookup to select the patient, add the documented service line, retain `appointmentId` for the eventual sale, then bump UI state. It must not fetch or import Calendar. Wrap the existing `captureSale()` call in `const endCapture = runtime.beginCaptureBoundary(); try { ... } finally { endCapture(); }` so a server-driven revocation waits for atomic capture completion. Extend shell tab routing for `/clients` and `/calendar`; preserve existing Sale behavior and render the persistent attention control on each product route.

- [x] **Step 5: Re-run calendar and sale tests.**

  Run: `npm.cmd run test:unit -- calendar-selectors appointment-records sale-prefill sale-prefill-consumption sale-capture`

  Expected: green; no module-to-module imports are introduced.

## Task 7: Write static-export and development-locale browser coverage with fresh evidence

**Files:**

- Create: `apps/pos/tests/e2e/m4.export.spec.ts`
- Modify: `apps/pos/tests/e2e/m3.export.spec.ts`, `apps/pos/tests/e2e/m3.locales.spec.ts`, `apps/pos/tests/e2e/mock.ts`, `apps/pos/tests/e2e/visuals.ts`, `apps/pos/playwright.config.ts`
- Output (ignored): `outputs/m4/*.png`

**Interfaces:**

```ts
export async function resetMock(request: APIRequestContext, options?: { addons?: { recall?: boolean } }): Promise<void>;
export async function offboardMockStaff(request: APIRequestContext, staffId: string): Promise<void>;
export async function captureM4State(page: Page, name: string): Promise<void>;
export async function captureM4ReferenceComparison(page: Page, name: 'clients' | 'calendar'): Promise<void>;
```

- [x] **Step 1: Extend the test harness before writing scenarios.**

  Keep `resetMock()` on `POST /__reset`, passing its optional add-on payload only there. Add `offboardMockStaff()` against `POST /__staff/<id>/offboard`. Do not change `openapi.yaml` or call either fixture outside tests. Extend screenshot helpers to create ignored `outputs/m4/` artifacts and to fulfill the reference’s Google Fonts from bundled woff2 bytes as M1/M3 already require.

- [x] **Step 2: Add the first exported-output baseline test.**

  In the first export test, retain the M0 checks: body `rgb(250, 249, 247)`, cobalt primary `rgb(0, 104, 249)`, Padauk readiness/resolved family, Burmese `data-locale`/`lang`, production dev-override inertness, and an empty list of every non-localhost request. Keep this test before all workflow tests.

- [x] **Step 3: Add failing M4 workflow specifications.**

  Cover these independent scenarios, resetting mock state in `beforeEach`:

  ```ts
  test('a static offline client deep link survives reload and PIN re-entry', async ({ page }) => {
    // Provision locally, abort only 127.0.0.1:4010 API requests, visit /clients?patient=c1,
    // reload the static page, use the staff PIN, and assert patient-profile/c1 is rendered again.
  });
  test('offline patient creation merges safely after drain', async ({ context, page }) => {
    // Create a same-phone patient offline, create a dependent booking, restore API access,
    // drain, and assert the provisional ID is gone and appointment.patientId is authoritative.
  });
  test('clinical view requires online elevation and recall may be absent', async ({ page, request }) => {
    // Assert clinical-locked, elevate with s1/eden, then reset with recall:false and assert
    // clinical-record remains while recall-card is absent.
  });
  test('calendar books slots, blocks a duplicate, and returns from new patient', async ({ page }) => {
    // Click a slot, save booking, attempt same slot and assert toast, then create a patient
    // inside a booking modal and assert it remains selected before booking.
  });
  test('server offboarding advertises degradation and ends the active session after capture', async ({ page, request }) => {
    // Complete/roll back a capture boundary, invoke /__staff/s1/offboard, trigger delta,
    // assert offline-admin-attention and then login screen rather than a mid-capture abort.
  });
  ```

  For the deep-link test, do **not** use `context.setOffline(true)`: without the M7 service worker it would also block static HTML/assets. Abort only mock API traffic, which proves that the data and PIN flow are offline while the test server continues to serve the exported artifact.

- [x] **Step 4: Trace each selector and add screenshots.**

  Verify every new `getByTestId()` against its renderer before execution. Capture Clients list, allergy counter profile, locked clinical, elevated clinical, Calendar, booking modal, no-admin attention, and two reference side-by-side pairs at 1280×800. Keep the M3 locale project in the same `playwright test` invocation and retain all three locale screenshots.

- [ ] **Step 5: Run browser suite against the built export.**

  Run: `$env:NEXT_PUBLIC_EDEN_API_BASE_URL='http://127.0.0.1:4010'; npm.cmd run build; npm.cmd run test:e2e`

  Expected: both Playwright projects pass. If the sandbox blocks Windows server teardown after tests report passing, capture that environmental evidence and leave owner-session E2E as the authority; do not alter server topology or weaken assertions.

## Task 8: Final compliance audit and owner-session handoff

**Files:**

- Modify: `docs/superpowers/specs/2026-07-31-eden-m4-design.md` only if implementation exposes a documented contradiction; otherwise leave it unchanged.
- Output (ignored): `outputs/m4/*.png`

- [x] **Step 1: Run the four in-sandbox gates from the final tree.**

  Run:

  ```powershell
  npm.cmd run typecheck
  npm.cmd run lint
  npm.cmd run test:unit
  $env:NEXT_PUBLIC_EDEN_API_BASE_URL='http://127.0.0.1:4010'; npm.cmd run build
  ```

  Expected: zero type/lint failures, all unit files pass, and static output contains `/`, `/login`, `/sale`, `/clients`, and `/calendar`.

- [x] **Step 2: Run exact-source safety audits.**

  Run:

  ```powershell
  rg -n -e '#[0-9a-fA-F]{3,8}' -e 'rgba?\(' apps/pos/src --glob '!tokens.css'
  (Get-FileHash apps/pos/tokens.css -Algorithm SHA256).Hash
  (Get-Item apps/pos/tokens.css).Length
  git diff --check
  git status --short
  ```

  Expected: no raw source color hits; token hash exactly `8D39F41E6710FA1EDCE202AF74F118E76547A4172F5DC8073135E0F76EB09E82`; length `597`; no whitespace errors; only M4 source, tests, docs, and ignored screenshot outputs are changed.

- [x] **Step 3: Prepare the M4 report for the owner session.**

  Include full file inventory, unabridged outputs for typecheck/lint/unit/build, browser-suite output or sandbox teardown evidence, the exact token hash/byte count, mock fixture routes (`/__reset`, `/__staff/<id>/offboard`), all screenshot paths, known gaps, and the owner-facing open question on offline clinical history. State explicitly that no local password verifier, elevation token, or service worker was added.

- [ ] **Step 4: Owner-session review checkpoint.**

  The owner reviews the fresh M4 screenshots against v4, runs the two-project E2E/CI gate, and commits only after review. Proposed commit message: `patients: deliver clients, calendar, and offline approvals (M4)`.

---

## Plan self-review

- **Spec coverage:** Task 1 implements contract/fixture additions; Task 2 enforces patient and appointment durability/dependencies; Task 3 implements envelope/offboarding/elevation boundaries; Task 4 provides the required flag source, warning, and removal UI; Task 5 implements Clients/counter/clinical/deep links; Task 6 implements Calendar and Sale isolation; Task 7 covers both Playwright projects and evidence; Task 8 runs all gates/audits and prepares review.
- **Security coverage:** The plan never writes a password verifier. Manual removal requires fresh server password online or fresh admin-PIN decryption offline; it never accepts retained key material. Local final-admin protection and server-authoritative purge are separate tested branches.
- **Static/export coverage:** `?patient=` parsing is post-mount; reload returns through offline PIN login; tests abort only API traffic for the reload scenario because M4 has no service worker.
- **Hygiene coverage:** mock fixtures are `/__` only, staff seeds have explicit `active: true`, recall derives from bootstrapped clinic add-ons with false-by-default semantics, and OpenAPI remains untouched.
