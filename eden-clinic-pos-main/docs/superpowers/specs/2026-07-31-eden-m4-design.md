# Eden Clinic OS — M4 Clients, Calendar, and Offline-Approval Device Policy

**Status:** proposed for Dan's review  
**Scope:** M4 only — Clients (§8.4), Calendar (§8.3), and the deferred M3 policy for device-local admin envelopes. M4 retains the completed M3 login and sale flows; it does not start Stocks, Set-up, Home, Hub, Analytics, printing, a service worker, or the idle-lock configuration.

## 1. Authorities and fixed constraints

The binding authorities are `docs/eden-frontend-build-spec-v1.1.md` (v1.2 content), `docs/reference/demo-v4.html`, `docs/reference/LUSA-design-system.md`, `docs/reference/openapi.yaml`, and `mock/mock-server.mjs`. M4 adds no dependency and does not change the pinned TypeScript 5.x or ESLint 9.x holds. It keeps static export, self-hosted fonts, the token checksum, CSS Modules, and the M0–M3 gates intact.

The counter/clinical split is a safety boundary, not a layout choice:

- Counter information — patient identity, phone, balance, follow-up, visit summary, and every allergy/alert — is always visible. LAW-7 prohibits hiding an allergy or alert under elevation, a flag, a tab, or a collapse.
- Clinical history and the optional Recall card require a live, server-issued admin-password elevation. Offline staff can still use the counter view but cannot unlock clinical information.
- `StatTile` values are ink by default. Only a genuinely semantic status, such as an outstanding balance, may opt into a semantic tone.

Every new label, warning, empty state, and action is a typed `useT()` key: English complete; Burmese and Simplified Chinese drafted with `// TODO(native-review)`. No component contains user-facing literals. All new controls retain the 40px touch floor and cobalt focus ring, and all color styling consumes existing `tokens.css` variables.

M4 keeps the static-export deployment requirement recorded in M3: extensionless paths must resolve to their exported HTML and Next `_next/**/*.txt` RSC payloads must be served as `text/x-component`. A wrong `.txt` MIME type forces full navigation and destroys the intentionally memory-only session.

## 2. Static routes, module ownership, and data seams

M4 adds static `/clients` and `/calendar` artifacts. A selected patient is represented as client state in the static `/clients?patient=<uuid>` route rather than a generated dynamic page: a newly created offline UUID must be addressable without rebuilding the exported artifact. This preserves the intended list/profile navigation while remaining compatible with `output: 'export'`.

| Area | Responsibility | Permitted dependencies |
|---|---|---|
| `modules/patients/` | Client list, local search, create-patient form, counter profile, clinical gate, Recall card. | `data/`, `ui/`, `i18n/`, `flags/` |
| `modules/calendar/` | Day grid, booking and appointment-detail modals, local duplicate guard, appointment lifecycle actions, and handoff state. | `data/`, `ui/`, `i18n/` |
| `modules/auth/` | Online elevation state, fresh-PIN removal proof, envelope manager UI, and deferred revocation of the active session. | `data/`, `ui/`, `i18n/` |
| `data/patientRecords.ts` | Transactional patient creation plus a typed entity-backed outbox row. | `db`, `outbox`, `types` |
| `data/appointmentRecords.ts` | Transactional appointment creation/status writes, parent dependencies, and typed outbox rows. | `db`, `outbox`, `types` |
| `data/adminEnvelopes.ts` | Envelope presence, local-removal invariant, server-offboarding purge, and typed meta audit entries. | `db`, `types` |
| `data/elevation.ts` | Validated `/auth/elevate` transport and memory-only 15-minute elevation state. | `api`, `types` |
| `data/salePrefill.ts` | Typed, short-lived meta handoff from an appointment to the existing sale route. | `db`, `types` |

Feature modules never import one another. Calendar’s “new patient” path calls the data-layer patient command and receives a typed result; it never imports the patient feature. Calendar’s charge action writes a typed sale-prefill record, which the existing sale feature consumes and removes only after it has installed the prefill. The provider is the only composition root that connects the session controller, elevation controller, data commands, revocation notifications, and shell state.

## 3. Clients: local-first records and the counter/clinical split

### 3.1 List and creation

`ClientsScreen` reads only Dexie/Query data. Its name/phone search is case-insensitive, available without connectivity, and has loading, empty, and no-match states. The v4-style list shows code, name, phone, a visible allergy marker, outstanding balance, follow-up, and latest locally available visit/outcome summary. Selecting a row navigates to the static selected-profile state.

The new-patient modal requires name and phone; sex, Telegram link, allergies, and alert note are optional. On Save, `createPatient()` generates the UUID before persistence, writes the local `PatientRow` with `code: null`, and enqueues an entity-backed `patient` row in the same Dexie transaction (LAW-2 and LAW-3). It returns the patient ID and the parent outbox UUID immediately; the UI never waits for the network.

The server remains the phone-deduplication authority. A new offline patient may temporarily coexist locally with a matching existing phone. When the patient POST receives `merged_into`, the existing M2 success hook atomically rewrites all non-done references — including appointments and sale prefill references — before a dependent row can dispatch (LAW-4), then removes the provisional patient. The profile follows the authoritative ID after reconciliation.

### 3.2 Counter profile

The counter profile follows the v4 hierarchy: name/code and contact row, Book and New Sale actions, then an unconditional red allergy/alert banner. Its three `StatTile`s are Outstanding, Next follow-up, and Visits. The normal value color is ink; Outstanding becomes red only when its computed balance is non-zero. All MMK aggregation, including patient outstanding balance, is centralized in an added `money.ts` helper rather than performed in a component (LAW-5).

The visits list is a local projection of the patient’s immutable sale snapshots. It deliberately exposes only counter-safe summary data. “Book” opens the calendar booking state with the patient already selected. “New Sale” writes the typed sale-prefill meta record and goes to `/sale`; it does not import or manipulate sale-module state.

### 3.3 Clinical gate and Recall flag

The locked clinical card is visible as an explanation, not as concealed data masquerading as an empty state. Unlocking it requires an online admin-password call to `POST /auth/elevate`; the returned token and expiry live only in the elevation controller’s memory. The controller clears its state on session end or expiry. A non-admin, an offline session, a failed password, or a network failure cannot unlock the clinical surface.

After elevation, the profile renders the available clinical visit detail from local sale-line history (notes, traceability detail, and treatment context); M4 does not invent photos, consents, or an undocumented clinical-write schema. If the local `recall` add-on flag is true, it also renders the violet, local-data-only Recall card. If the flag is false, the Recall card is absent while the clinical record remains available. No model call is added (LAW-12).

## 4. Calendar: local day grid and durable booking

`CalendarScreen` is a v4 day grid. Columns are active staff with `takesBookings`; rows use the approved clinic time slots. Appointments are read from Dexie for the selected local clinic day. The screen renders skeleton and empty states, booked/here/done/cancelled appointment treatments, and an appointment card with mark-arrived, charge-to-sale, and cancel actions.

An empty slot opens Booking prefilled with day, staff, and time. Patient, service, staff, and time are all required. Before persistence, a pure local selector rejects an occupied active slot and shows the translated double-booking toast. This prevents the common same-device mistake; it does not claim to solve a concurrent offline device race.

Booking creates the appointment UUID at the command boundary and, in one transaction, writes the row and its entity-backed `appointment` outbox row. If the selected patient was just created locally, the booking row depends on that patient’s outbox UUID and protects both entity references. This guarantees the patient drains first and that a phone merge rewrites the dependent appointment before send (LAW-2/3/4). A server-side race is accepted per the documented contract and retained as a visible appointment sync-conflict status rather than discarded.

Mark-arrived and cancel persist the local status first, then enqueue a distinct, replay-safe appointment-status PATCH item. If a create is still pending, that PATCH depends on the create row. The item is re-read immediately before dispatch, so later merge or delta reconciliation cannot cause it to target stale data. This is an extension of M2’s typed outbox boundary, not a direct browser fetch from the calendar module.

The booking modal’s “New patient” action opens the shared-form behavior through `data/patientRecords.ts`. A successful local save returns directly to the same open booking with the new patient selected; abandoning the booking leaves the explicitly saved patient intact. Appointment charge stages `{ appointmentId, patientId, serviceId }` through `data/salePrefill.ts`; Sale consumes it to attach the patient and service exactly once, then removes the stage. No module imports another module to accomplish either round-trip.

## 5. Device-local admin envelopes and offboarding

### 5.1 Construction, not policy preference

An envelope is encrypted with a key derived from its owner’s PIN. Therefore only its owner can create or renew it through a successful online PIN sign-in: another admin has neither the target PIN nor the derived key material. “Admin creates a staff envelope” is not a future feature switch; it would require a forbidden local PIN verifier or equivalent secret material and is architecturally excluded.

The device stores no local admin-password verifier — ever. The password remains the stronger secret because it is verified only by the server and never persisted on the device. Storing a verifier would let an attacker with copied IndexedDB brute-force the credential that protects reports, exports, and account management, collapsing the two-secret model merely to support an offline confirmation dialog.

### 5.2 Automatic server-authoritative hygiene

`StaffWire` and `StaffRow` gain an `active` field, defaulting to true for the existing contract data. During bootstrap or delta, an `active: false` staff upsert or a staff delete invokes `purgeOffboardedEnvelope()` in the same Dexie transaction that updates/removes the staff row. The staff picker filters inactive rows, so an offboarded identity disappears immediately. A typed local meta audit entry records the action, target, server-authoritative reason, and time; the server’s staff state remains the source of truth.

Server offboarding always purges, including the final admin envelope. This is deliberate: keeping a revoked administrator’s offline credential would be a standing security hole, whereas zero local approvers is a recoverable, honest degradation. Capture remains available under LAW-1; only rare gated actions lose their offline approval path until an admin next signs in online. A server purge can only arrive over a live connection, so a corrected or replacement administrator can remedy the state at the moment the update lands.

If the offboarded ID is the current session, the provider asks the session controller to revoke it. The controller waits for any active sale-capture transaction to finish or roll back, then clears the memory-only session and returns to login. It never interrupts the atomic capture boundary.

### 5.3 Manual removal, proof regimes, and the invariant

M4 adds only a narrow device-security manager, reachable by a current admin; it is not a general staff-account surface. It lists local envelopes and supports removal for a compromise or correction. Every removal writes a typed local audit entry.

Online removal always makes a fresh `POST /auth/elevate` password request, even inside a live 15-minute elevation window. On successful server proof, it may remove the chosen local envelope. If that request fails because of a network error, the dialog explicitly changes to the offline-removal regime and shows the warning that re-provisioning requires a later online sign-in.

Offline removal requires a freshly entered PIN for the removing active admin. The controller must decrypt that admin’s envelope again through `verifyOfflineAdmin()`; its retained memory `CryptoKey`, kept only for refresh-token rotation, is never sufficient proof. A bad PIN is treated as the existing generic failed-PIN condition. No local password comparison or verifier is added.

For a locally initiated removal, `removeLocalEnvelope()` counts active admin staff that still have an envelope before deleting. It refuses if the target is the final such admin, with translated explanatory copy. This preserves offline approval capability through an outage and applies to both online-password and offline-PIN manual paths.

**The last-admin invariant applies only to locally-initiated removal; server-authoritative offboarding always purges, and the device then advertises its degraded-approvals state until an admin signs in online.**

The shell computes this state from active staff plus stored envelopes and displays a persistent attention-level indicator, not a transient toast: “No admin is set up for offline approvals on this device. An admin must sign in online once.” It clears immediately after an active admin’s successful online envelope commit. The indicator is present on every product route so the degradation is visible before a counter reaches an approval gate.

Threat-model addition: an attacker with a compromised admin PIN can use the offline path to remove other local staff envelopes. This is a bounded denial of service — re-provisioning needs one online sign-in — not an escalation, and is weaker than the approval powers that PIN already grants. The local last-admin invariant limits the damage; a server-authoritative revocation still takes precedence.

## 6. Elevation, session boundaries, and the remaining idle-lock decision

`data/elevation.ts` owns only memory state: token, expiry, and elevated identity. The documented `/auth/elevate` transport and response validation live on `data/api.ts` so the request uses the existing bearer and single-flight path; this is the approved implementation-level deviation from the earlier placement. Neither file makes module-scope browser or storage access. The provider owns the controller and clears it whenever the M3 session becomes signed out, auth-required, invalid, or expired. Clinical unlock is online-only; unlike manual envelope removal, it has no PIN fallback because clinical data must keep the server-password gate.

The existing M3 wrong-PIN delay remains memory-only. M4 does not choose an auto-lock interval or write a tablet-idle setting. Whether the tablet returns to the staff picker after _N_ idle minutes remains a Dan/clinic configuration decision for a later milestone; neither the envelope policy nor the M4 UI implies an automatic lock.

## 7. Visual implementation and test-ID discipline

The clients list/profile and calendar reproduce the v4 white-card-on-cream composition, hairline borders, subtle token shadows, pill controls, and compact data density. Calendar uses status Tags rather than filled semantic buttons. Recall is the only violet AI surface. No raw color, RGB/RGBA, or non-token shadow enters source styling.

Every E2E `data-testid` must be traced before the spec is written. The M4 record maps the new contract as follows:

| Test ID family | Renderer |
|---|---|
| `clients-root`, `client-row-<id>`, `client-search`, `new-patient-*` | `ClientsScreen` / native form controls |
| `patient-profile`, `allergy-banner`, `clinical-locked`, `clinical-record`, `recall-card` | `PatientProfileScreen` |
| `calendar-root`, `calendar-slot-<staff>-<time>`, `appointment-<id>` | `CalendarScreen` |
| `booking-modal`, `booking-patient`, `booking-save`, `booking-new-patient` | `Modal` plus calendar-owned controls |
| `offline-admin-attention`, `offline-admin-manager`, `remove-envelope-<id>` | `AppShell` / `OfflineAdminEnvelopeManager` |

The new test IDs are native elements or explicit component props; no E2E selector relies on an ID a component cannot render. Existing M3 baseline IDs and the receipt no-backdrop assertion remain unchanged.

## 8. Verification plan and evidence

Unit tests add coverage for:

- patient creation’s UUID/code-null/outbox transaction; parent dependency and merge rewrite for a booking with a newly created patient;
- local calendar collision refusal; durable create/update rows; update-after-create dependency; and retained server conflict status;
- counter outstanding calculation through `money.ts`, allergy visibility, elevation expiry, and Recall absent while clinical history remains;
- staff `active:false` and delete processing that atomically remove the envelope, write an audit entry, stop picker visibility, and defer active-session sign-out until a capture boundary completes;
- manual removal’s fresh-PIN requirement, no-retained-key shortcut, last-admin refusal, online fresh-password path, and network-failure fallback; and zero-admin persistent-attention calculation;
- static route/query patient selection and sale-prefill one-time consumption.

The exported-output Playwright project retains every M0–M3 baseline: cream background, cobalt primary action, Burmese Padauk resolution and line height, locale/lang attributes, static export behavior, correct RSC MIME server, and zero non-localhost requests. It adds offline client creation followed by online phone merge/rewrite; counter allergy visibility; locked-then-elevated clinical view; Recall-off absence with clinical history still present; booking from a slot; local double-book refusal; and the new-patient-inside-booking return path. It also exercises automatic offboarding, persistent no-admin attention, and active-session revocation after a completed capture boundary.

The development-locale Playwright project remains part of the same invocation and continues to render all three locales. The mock gains narrowly scoped test-reset configuration/hooks for recall-off and staff offboarding; these are test fixtures, not product API endpoints. Each E2E test resets mock state before execution and stays single-worker.

The M4 visual evidence set contains Clients list, counter profile with allergy, locked and elevated clinical states, Calendar day grid, booking modal, no-admin attention state, and side-by-side v4 comparisons at 1280×800. Owner-session visual review — using live or freshly generated artifacts — remains authoritative.

## 9. Explicit exclusions and handoffs

M4 does not add patient edit PATCH UI, photos, consents, clinical data entry, general account administration, staff creation, device activation, an idle-lock timeout, Stocks, Set-up, receipt rendering, Home, Hub, Analytics, Care-loop simulation, service worker, manifest, or CSP. It does not weaken the M3 envelope threat model, add a password verifier, persist an elevation token, or change the API/outbox single-flight session seam.

The service-worker milestone retains both deployment requirements: serve RSC `.txt` payloads as `text/x-component` and set the strict CSP with the static application. The unresolved device-ergonomics choice remains the Dan/clinic idle-lock configuration; M4 records it but does not decide it.

**Open product question — offline clinical history:** M4 intentionally makes clinical history online-elevation-only. During a multi-week outage, nobody — including Dr. Hkawn Mai — can view treatment notes on this tablet. This is the correct security default because there is no local password verifier and a PIN is too weak a clinical-data gate. The clinic owner must consciously accept that trade-off or later request and approve a weaker offline gate; it is not an accidental limitation.
