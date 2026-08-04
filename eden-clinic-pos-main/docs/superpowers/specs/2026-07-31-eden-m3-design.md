# Eden Clinic OS — M3 Login and Sale Design Record

**Status:** proposed for Dan's review  
**Scope:** M3 only — the authentication/session flow and the offline-first sale flow. This replaces the M1 demo route with product routes, but does not begin Clients, Calendar, Stocks, Set-up, printing hardware, service-worker work, or any later milestone.

## 1. Authorities, purpose, and non-negotiable constraints

M3 delivers the money path: a staff member can unlock a provisioned tablet without a network connection, capture a sale locally, and later drain the durable sale to the documented API. The existing M2 data layer remains the only persistence and sync boundary. `data/api.ts` and `data/outbox.ts` are not edited to accommodate the real session provider; M3 supplies the provider through the injected `SessionProvider` interface exactly as M2 designed it.

The visual and behavioral authority is `docs/reference/demo-v4.html`. Its SHA-256 was verified before this record: `5990a868150eab64144808365ff1b8d89f076537cc6698d4f5a237537d9238b6`. `docs/reference/LUSA-design-system.md`, `docs/reference/openapi.yaml`, and `mock/mock-server.mjs` remain the visual, API-shape, and behavioral authorities respectively.

M3 adds no dependency. It retains static export, self-hosted fonts, CSS Modules, token-only colors, strict TypeScript 5.x, ESLint 9.x, and all existing M0–M2 test guards. Every user-facing string is a typed `useT()` key with complete English and drafted Burmese/Chinese translations marked `// TODO(native-review)`. Burmese remains Padauk at line-height at least 1.7; Chinese uses the approved system stack. The dev-only locale override moves from the removed demo surface to the M3 client root, remains compile-time gated by `NODE_ENV === 'development'`, and remains asserted inert in the exported output.

### Deployment note — static export content types

A static host must resolve extensionless export paths (for example, `/login` to `/login.html` where no directory index exists) and must serve Next's `_next/**/*.txt` RSC payloads as `text/x-component`. Serving those payloads as `application/octet-stream` causes Next to fall back to full-document navigation, which destroys M3's deliberately memory-only session state and presents as a broken login. This is a deployment correctness requirement, not an optional optimization.

The M3 implementation cites LAW-1 through LAW-11 where relevant. In particular:

- A successful capture must never wait for a request, a printer, or a token refresh (LAW-1 and LAW-9).
- Every sale, sale line, payment, and ticket gets a client UUID at its creation boundary (LAW-2).
- All money calculations and formatting use the existing `data/money.ts` API (LAW-5).
- Browser, IndexedDB, and cryptographic APIs are used only from post-mount effects or event handlers; nothing accesses them at module scope (LAW-6).
- A selected patient's allergy/alert is a permanent, ungated cart banner (LAW-7).
- An acting staff member never becomes an approver: the gate records a separately verified admin identity (LAW-8).
- A non-empty outbox blocks explicit logout, while the SyncChip displays its real M2 status (LAW-10).

## 2. Product composition and module ownership

The old component-sheet route is removed. Static client routes are `/login` and `/sale`; no dynamic route, server component fetch, API route, server action, or new package is introduced. A mounted application provider composes the database, query client, API client, session controller, and outbox controller. It is the only place that wires concrete dependencies together.

| Area | M3 responsibility | Allowed dependencies |
|---|---|---|
| `app/providers.tsx` | Client-only composition after mount; exposes ready/authenticated/offline-auth-required state; starts a drain after authentication and registers an `online` event only to *trigger* a drain. | `data/`, `modules/auth/`, `modules/sale/`, `i18n/`, `ui/` |
| `app/login/page.tsx` | Renders device setup, daily staff picker, PIN entry, status/error surfaces, and redirects to the static sale route after an unlock. | auth module, `ui/`, `i18n/` |
| `app/sale/page.tsx` | Renders the sale feature only after an authenticated or offline-unlocked session exists. | sale module, `ui/`, `i18n/` |
| `modules/auth/` | Session controller, encrypted-envelope codec, device setup screen, staff-picker/PIN state machine, and offline admin-PIN verification. | `data/`, `ui/`, `i18n/` |
| `modules/sale/` | Cart reducer, catalogue selectors, ticket store, tender/gate state, sale capture transaction, receipt confirmation, and sale CSS modules. | `data/`, `ui/`, `i18n/` |
| `data/auth.ts` | A small validated client for the documented unauthenticated `/auth/login` and `/auth/refresh` calls. | `data/types.ts`, `data/api.ts` error types |
| `data/` additions | Typed meta-key helpers for session envelopes, device ID, and tickets only. They do not import either feature module. | existing data layer |

`modules/auth` and `modules/sale` never import each other. Both import their data, UI, and i18n dependencies through the existing one-way boundary. The authenticated `SessionProvider` is injected into `createApiClient`; API refresh and outbox drain retain their M2 single-flight and untouched-row guarantees.

The provider's `online` listener is installed in a client effect and removed on cleanup. It is solely a wake-up signal for `drain()`; it never declares the application online. Offline remains derived only from an `ApiNetworkError` during a drain pass, as decided in M2.

## 3. Device provisioning and the daily login flow

### 3.1 First setup is deliberately not a login variant

If and only if the local `staff` table is empty, `/login` renders a distinct **Set up this device** screen. It has a translated installer-facing staff-ID field and PinPad, plus persistent copy that the device must be set up once with an internet connection. It is not styled or named as the normal reception login screen.

The setup action calls only the documented `POST /auth/login` shape (`staff_id`, `pin`). On `ApiNetworkError`, the form does not pretend it can work: it shows the same translated internet-required message. M3 does not use `navigator.onLine` as a false connectivity oracle, nor does it add a staff-directory API. On a valid online response, it installs the ephemeral credentials, performs the mandatory bootstrap, writes the local staff directory, persists the current staff's envelope, and moves to the daily picker. If bootstrap cannot complete, the device remains unprovisioned and shows a recoverable setup error; it never claims offline readiness.

Once bootstrap has populated `staff`, the device-setup screen is unreachable. The normal flow is always the visual-reference staff picker followed by PinPad. It reads the persisted directory, so it remains fully usable after a reboot and throughout an outage. A database wipe is the only route back to setup.

**Contract debt — device activation:** the durable solution is an admin-issued, short-lived pairing code that a fresh device exchanges for clinic context and a staff directory. That is a backend-contract/post-launch item. Typing a staff UUID is acceptable for Eden's installer, but not self-onboarding for a future clinic owner or phone-tier user.

### 3.2 Session controller and failure behavior

`modules/auth` owns a controller whose public `provider` implements the existing M2 seam:

```ts
interface SessionProvider {
  getAccessToken(): string | undefined | Promise<string | undefined>;
  refresh(): Promise<void>;
  onAuthFailure(): void | Promise<void>;
}
```

The controller separately exposes login/unlock/logout operations to the login screen, but `data/api.ts` and the outbox know only the interface above. `refresh()` uses the injected validated auth transport to call `/auth/refresh`, updates the in-memory access token, rotates the durable refresh credential, and re-encrypts the envelope. The provider retains the M2 contract: a successful `refresh()` makes the replacement access token visible before it resolves. M2's client-instance single-flight remains the sole coordinator for concurrent `401`s.

The normal staff PIN operation tries to unlock that staff member's envelope. A successful unlock establishes identity and an in-memory session even when there is no usable server credential, allowing sale capture. It then requests a non-blocking drain; any successful refresh rotates the credential and re-encrypts the envelope. A first setup or explicit online credential check uses `/auth/login`, and likewise re-encrypts the envelope after its successful bootstrap.

An envelope is necessarily per staff member: bootstrap deliberately contains no PIN verifier, so it cannot manufacture offline access for every listed staff account. A staff member receives offline capability on a device only after that staff member has completed one successful online sign-in there. If a selected staff member has no envelope and the login request cannot reach the server, M3 uses the same generic failed-PIN treatment; when connected, it falls back to the documented login call and creates that staff member's envelope. The M3 offline E2E provisions both the cashier and the admin online before disabling the network.

Online bad credentials and offline failed envelope decryption both present the same generic wrong-PIN treatment: clear the entered digits, shake the PinPad container, and apply an escalating client delay of 1, 2, 4, 8, 16, then 30 seconds for later attempts. The delay never becomes a hard lockout. Failed decryption and an incorrect PIN are indistinguishable by design. This avoids an offline hard lockout when the server cannot be reached and does not leak whether an envelope or PIN was valid.

An expired/rejected refresh invokes `onAuthFailure()`: it clears only the in-memory access state, preserves the envelope and every outbox row byte-for-byte, and shows re-authentication as required when a connection returns. It never bars a still-valid offline identity from completing a sale.

Explicit logout is not envelope deletion. It clears the in-memory session only; the next staff PIN entry can unlock the device during an outage. Per LAW-10, the logout control first checks the durable outbox and refuses logout with a toast while any item is non-`done`. Removing an account envelope is a distinct, future deliberate admin operation.

### 3.3 Per-staff encrypted session envelope

M3 deliberately changes the M2 boundary: session data is now permitted in Dexie `meta`, under an opaque per-staff key such as `auth-envelope:<staffId>`. No schema table is added. The stored JSON contains only versioning and encryption metadata:

```ts
{
  version: 1,
  kdf: 'PBKDF2-HMAC-SHA-256',
  iterations: 600_000,
  saltBase64: string,       // 16 random bytes, unique per staff envelope
  ivBase64: string,         // fresh 12 random bytes on each encryption
  ciphertextBase64: string  // AES-GCM-256 ciphertext and authentication tag
}
```

The encrypted plaintext carries two deliberately separate lifetime domains:

```ts
{
  identity: {
    staffId: string,
    name: string,
    role: 'admin' | 'staff',
    validUntil: string      // successful server-auth time + 90 days
  },
  credential: {
    refreshToken: string,
    refreshedAt: string
  }
}
```

The access token is memory-only and is never serialized. The staff table supplies picker labels; the decrypted identity must match the selected staff ID and continues to be the authoritative identity for attribution. The 90-day identity window is calculated from server-adjusted time, using M2's injected-clock/server-time-offset seam. Every successful server login or refresh reanchors the identity window, rotates the refresh token when the server returns one, and writes a newly encrypted ciphertext. The derived `CryptoKey` is kept only in the running controller so a rotated token can be re-encrypted without retaining the PIN.

The credential's server expiry is independent of the identity window. A rejected or expired refresh may block a drain and require re-authentication once connected; it must never block capture by a valid 90-day offline identity. Thus a clinic three weeks into an outage continues selling and keeps its queue. The 90-day identity window is the explicit local offline-login limit; it does not create an earlier credential-driven lockout.

PINs are used as key material only. The implementation derives an AES-GCM-256 key from the entered four digits using Web Crypto PBKDF2-HMAC-SHA-256 at 600,000 iterations, with the per-staff random salt; it stores no PIN hash, plaintext PIN, or bootstrap PIN. The iteration count follows current OWASP PBKDF2-HMAC-SHA-256 guidance, while the threat model below makes clear that it is not a defense against exhaustive attack on a four-digit secret.

### 3.4 Threat model (intentionally limited and explicit)

A 4-digit PIN yields 10,000 keys; an attacker with a copy of IndexedDB brute-forces that in seconds regardless of KDF. The envelope protects against the casual actor (a staff member picking up someone else's session, a stolen-but-not-forensically-attacked tablet), not a determined one. Browser storage also cannot protect against active XSS, because malicious same-origin code can invoke decryption while the user is present.

The existing structural mitigations are static export, the E2E-enforced zero non-localhost request rule, no third-party scripts, and bundled fonts. A strict CSP lands with the service-worker milestone. M3 makes no stronger secrecy claim and does not mislabel PIN-derived encryption as hardware-backed storage.

### 3.5 Offline administrative approval

For the M3-only gates (custom discount above 20% and pay-later over the clinic limit), an approver is verified separately from the active cashier. The modal lists only locally provisioned admin identities with an existing envelope. Entering an admin PIN attempts that admin envelope's decryption; the decrypted identity must be an `admin`, and the stored approver ID is written to the sale. The cashier session does not change.

This is the only valid offline proof: no PIN hash is created, and an admin without an envelope on this device cannot approve an offline override. When online, the same approval can be confirmed through the documented login endpoint and refreshed envelope. The broader questions of multi-admin device administration and how every later offline override should work remain open for M4; M3 implements only the gates §8.5 requires.

**Open question — idle lock:** whether a tablet returns to the staff picker after _N_ idle minutes remains a Dan/clinic configuration decision. M3 does not choose a timeout.

**Open question — later admin overrides:** an admin can be verified offline only if that admin has an envelope on that device. The policy for provisioning/removing such envelopes and using them across M4's other overrides must be decided with the M4 scope.

## 4. Sale flow and durable capture

### 4.1 Cart and catalogue

The sale route uses the v4 split layout: cart on the left, catalogue on the right, with responsive stacking at narrow widths. Catalogue reads are local Dexie/Query reads only. Services and Products use white-pill `Tabs`; the v4 category-chip row (All, Laser, Injectables, Brows & Lips, Skin) filters local service rows with the selected category as the deliberate ink-filled inversion. Catalogue entries are v4-style tiles, not list rows: `152px`-minimum grid cards, `92px` minimum height, and a cobalt price as the loudest value on the tile. Product stock, prices, and service prices never come from a render-time network request.

The scanner input is a focused text input: a HID scanner's trailing Enter dispatches the same lookup as manual input. A known retail product adds one line. A `professional` or `injectable` product refuses a scan and displays a singleton toast; it cannot silently reach the cart. An unknown barcode opens the reference's add-product handoff with the scanned code retained, but product authoring itself remains the M5 Stocks implementation rather than an unreviewed duplicate catalogue editor in M3.

Weight-sold products open a quantity keypad and retain their local unit label. A `requiresLot` service opens the traceability modal before the line exists. It requires a lot number and expiry, while the reference's **Scan GS1 DataMatrix (demo prefill)** action fills `BTX-2311` and `2027-01`; raw device/GS1 parsing has no contract encoding in the supplied API and is therefore not invented in M3. Line editing can change quantity, edit a note, or remove the line. Every line total, subtotal, discount total, tender calculation, change, outstanding amount, and MMK display delegates to `money.ts`; stock quantity changes are not money arithmetic.

Tickets are durable local drafts, not sales and not outbox entries. A typed ticket record in `meta` contains the cart snapshot, selected patient, discount state, and saving staff/time. Saving atomically persists the ticket then clears the live cart; resuming removes that ticket only after its snapshot has been installed in the live cart. No ticket is sent to the server.

The patient selector uses existing local patients and permits a walk-in. When a patient is selected, any allergy or alert note is rendered as a red banner above the cart controls and remains visible through tender and receipt states. M3 does not add the M4 patient-creation flow.

### 4.2 Discounts, tender, and approvals

The cart provides 0–20% discount chips plus a `Custom` disclosure chip; the selected discount is cobalt, following the v4 treatment. A custom value above 20% requires the separate admin-PIN proof described above; its `discountApprovedBy` is stored on the sale. A value at or below 20% requires no gate. M3 does not invent a product-price override.

Tender supports cash with reference quick amounts and calculated change, KBZPay, Wave, and a split list across those methods. Paid amount is totalled through the existing money API (not local `+` or `reduce` arithmetic), and `change()` supplies both balance due and change. Pay later requires a named local patient. Its credit is the unpaid remainder; when that result would put the patient's local outstanding credit over `clinic.creditLimitMmk`, it requires the same separate admin approval and stores `creditApprovedBy`. No amount is stored as a derived UI-only field.

The receipt confirmation mirrors the v4 hierarchy and labels the capture as waiting to sync when its outbox row remains pending. Its Print and Share controls are fire-and-forget and cannot affect the completed record. The reusable, width-specific canvas/PNG renderer and printer transports remain M5 work; M3's confirmation surface handles unavailable browser actions with a toast rather than blocking or rolling back capture.

### 4.3 Single capture transaction (LAW-1)

`modules/sale` owns one typed `completeSale()` command. Before the transaction, the UI must have collected required business inputs; once invoked, it makes no network request and does not wait for printing. It creates UUIDs for the sale, every line, every payment, and the outbox item; stamps the active staff identity and server-adjusted business time; and calculates the entire sale through `money.ts`.

Inside one caller-owned Dexie read/write transaction over `sales`, `products`, `outbox`, and the required `meta` rows, the command:

1. writes the immutable sale snapshot with lines, payments, discounts and approver IDs;
2. decrements local stock for product lines;
3. builds and enqueues the M2 typed entity-backed sale outbox row, protecting the new sale entity; and
4. removes a resumed ticket only after the sale row and outbox row are durable.

If that transaction rejects, all of the writes roll back together and the UI keeps the cart for retry. Once it succeeds, the cart resets immediately, the receipt opens, and a background drain may start. A network/auth/printer failure after this point cannot discard, park, mutate, or block the captured sale. Existing M2 retry, `401`, collision-defer, merge-rewrite, and replay behavior remains authoritative.

## 5. UI extension rules and selector accountability

M3 builds only sale/auth-specific CSS Modules; it extends `ui/` only where a primitive lacks a general capability needed by the product. In particular, any component whose rendered root is the target of an E2E `data-testid` must expose and spread that prop before a test asserts it. The M1 EmptyState correction is the rule, not a one-off fix.

The M3 E2E selector ledger will be written with the test before implementation and checked during review:

| E2E selector | Rendering owner | Required prop/DOM location |
|---|---|---|
| `login-root`, `device-setup`, `staff-picker`, `staff-option-<id>` | `LoginScreen` | Native route-screen and picker buttons |
| `login-pinpad`, `login-pin-display` | `PinPad` | Explicit test-ID props rendered by PinPad's root/output |
| `sale-root`, `catalogue-search`, `scanner-input`, `catalogue-item-<id>` | `SaleScreen` | Native sale root/input/catalogue buttons |
| `sale-cart`, `cart-line-<id>`, `allergy-banner` | `CartPanel` | Native cart elements |
| `lot-modal`, `tender-modal`, `approval-modal` | `Modal` | Explicit dialog/root test-ID props, not a hard-coded demo ID |
| `receipt-view`, `sale-complete` | `ReceiptConfirmation` | Native confirmation root/action button |
| `sync-chip` | `SyncChip` | Existing rendered root, extended only if it lacks the attribute pass-through |

Semantic selectors (`getByRole`, labels, and text through the dictionaries) remain preferred when they identify the behavior. This ledger covers the stable test IDs necessary for workflow assertions; no test introduces a hidden or unrenderable selector.

Product StatTiles, if a sale confirmation uses one, leave `valueTone` at its default ink. A semantic tone is reserved for an actual status such as outstanding credit.

## 6. Verification design

All five gates remain mandatory. `typecheck`, `lint`, and the M0 import-under-Node LAW-6 suite grow with every new source module. The token checksum and M2 money/outbox suites remain unchanged.

### Unit coverage

New unit tests will cover at least:

- Device setup is available only with an empty staff table; an actual auth network failure produces the internet-required state; successful login plus bootstrap makes the daily picker permanent.
- PBKDF2/AES-GCM envelope round-trip, per-staff salt/IV representation, no serialized access token/PIN/PIN hash, wrong-PIN indistinguishability, bounded escalating delay, and memory-only logout.
- The 90-day identity lifetime uses injected server-adjusted time. A failed/expired refresh preserves the envelope and an exact outbox snapshot while a valid identity can still invoke capture.
- Successful `/auth/refresh` rotation changes the persisted credential envelope and makes the new access token visible through the injected provider without changes to `api.ts` or outbox code.
- Offline admin proof succeeds only for a decrypted provisioned admin envelope and writes a separate approver ID; it cannot alter the cashier identity.
- Cart/line/tender calculations use `money.ts`, scanner refusal, lot-required capture, discount and credit gates, ticket save/resume, and allergy visibility.
- A complete sale writes sale, product decrements, and a drainable typed outbox row in one transaction; a forced transactional failure leaves all three absent and leaves the cart intact.

### Exported-output and dev-locale E2E

The existing one-command Playwright gate remains two projects, not a sixth gate. Its server array gains the documented mock server at `127.0.0.1:4010`; it continues serving `out/` at `127.0.0.1:4173` and `next dev` at `127.0.0.1:4174`. The export project uses only the static export and the local mock server. The dev-locale project continues to exercise the development-only override; production attempts such as `/?__devLocale=en` still must not change locale.

The export spec retains the M0/M1 baseline assertions: cream body background `rgb(250, 249, 247)`, cobalt primary action `rgb(0, 104, 249)`, loaded Padauk and Burmese font resolution, default Burmese locale/lang, and **zero requests to any non-localhost destination**. Existing reference screenshot routing continues to fulfill Google font CSS and font bytes locally, never from the network.

The M3 workflow then verifies:

1. first-device setup succeeds online for the installer ID, followed by daily staff and admin picker/PIN login;
2. an offline reload/PIN unlock captures a representative sale through catalogue search/scan, restricted-scan toast, weight quantity, required lot, line edit, saved ticket resume, discount/approval, split tender, and receipt confirmation;
3. the selected patient's allergy banner remains visible in the cart;
4. the static page is put offline before capture, verifies local stock decrement and one durable pending sale row, then is restored online;
5. a manual or triggered drain moves the same idempotent sale to `done`, and the accepted mock response/local authoritative row agree on the sale ID, totals, lines, payments, and status; and
6. logout is refused while the outbox is non-empty.

The dev-locales project proves `my`, `en`, and `zh` on the login/sale client root, including Padauk/line-height for Burmese, English fallback, and the declared system CJK stack for Chinese. It captures the locale evidence without adding font fetches.

### Screenshot evidence for review

The M3 report will include 1280×800 images of the staff picker, PIN screen, default Burmese sale workspace, tender/approval modal, receipt confirmation, and offline/pending SyncChip state. It will include side-by-side login and sale comparisons against the corresponding v4 reference states, with the reference fonts locally fulfilled as in M1. It will also retain the three locale screenshots and modal evidence needed to show the i18n and visual-law continuity.

## 7. Deliberate exclusions and handoff

M3 does not add service workers, manifests, a strict CSP, account-envelope removal, idle-lock policy, a backend pairing flow, a general GS1 parser, patient creation, calendar, client profiles, stock management, receipt canvas/PNG rendering, printer transports, feature flags, or later product screens. It does not upgrade dependencies or alter the M2 outbox/API seam.

The two explicit offline security questions handed to later work are the idle-lock policy and the wider admin-envelope/override policy. The named backend partner debt is the device-activation pairing-code flow. The M3 milestone is complete only when all five gates are green, the owner-session E2E has passed against both projects, and the report contains the file inventory, unabridged gate output, screenshot set, and these known limits.
