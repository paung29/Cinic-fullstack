# Eden Clinic OS — M6 Today, Shift Close, Switch User, and Device Diagnostics

**Status:** approved with the four M6 review amendments  
**Scope:** M6 only — the Today screen and local shift-close record, the canonical A4 Switch user behavior, browser-storage protection and support diagnostics, and receipt-history reprints. M6 retains the accepted M0–M5 paths. It does not start the M7 service worker, CSP, manifest, reboot-recovery work, Hub, Analytics, refunds, pay-in/pay-out, flags, a new backend endpoint, or physical printer transport.

## 1. Authorities and boundaries

The authorities are `docs/eden-frontend-build-spec-v1.1.md` (v1.2 content), `docs/reference/demo-v4.html`, `docs/reference/LUSA-design-system.md`, `docs/reference/openapi.yaml`, `mock/mock-server.mjs`, and the pilot blocker acceptance criteria supplied for M6. M6 preserves static export, the pinned dependency set, self-hosted fonts, the 597-byte `tokens.css` hash, no literal colours, the import fence, and all five gates.

No M6 action is an offline configuration mutation. The existing outbox continues to hold capture operations only. Today reads local replicas; shift close writes an explicitly device-local audit entry; storage diagnostics read browser state; and receipt reprint is a rendering/transport action. None needs, invents, or queues an API mutation.

Every new visible string is a typed `useT()` key. English is complete; Burmese and Simplified Chinese drafts carry `// TODO(native-review)`. New screen surfaces retain the cream canvas, white cards, cobalt controls/focus ring, 40 px touch floor, and ink-default StatTile values. `data/` selectors receive an injected clock and never call `Date.now()` internally.

## 2. Today and the close-of-shift boundary

`/` becomes the authenticated **Today** route rather than redirecting to `/login`. A visit to `/` without an active in-memory session — including every cold reload by design — redirects to the staff picker at `/login`; it never briefly exposes Today data. The session-state effect is the query gate: it performs no Dexie read for Today rows unless the state is `active` or `auth-required`. It is a counter-operational view, not the unscoped M6 Hub/Analytics milestone from the master plan. The shell gains a Today tab and every current product route keeps its own active tab.

The route move changes no M0–M5 baseline semantics. The only existing assertion whose rendered root changes is the production locale-persistence reload proof: after a full static reload has intentionally discarded memory-only session state, it asserts the persisted `data-locale` and `lang` on `login-root` at the staff picker, not on an authenticated screen. The M4 static-export deep-link proof remains verbatim: `?patient=<uuid>` is parsed post-mount, survives a full static-export reload while API traffic is aborted, and resolves the same local patient after authentication. Cream/cobalt, Padauk and Burmese line-height, zero external requests, static RSC `.txt` MIME, development-locale proof, and all other M0–M5 assertions retain their existing targets and expectations. M6 adds the explicit cold `/` → `login-root` assertion; it does not silently weaken or replace a baseline.

`modules/today/TodayScreen.tsx` owns the composition only. A pure `data/todaySummary.ts` reads cloned local rows and an injected `now`, then returns a typed `TodaySummary`. Its single `businessDayWindow(now)` function defines device-local midnight-inclusive, next-midnight-exclusive boundaries and the selected local business-day label. Every Today selector and the shift-close cash-sales calculation consumes that one returned window; no screen or close helper calculates its own day range. `data/money.ts` owns all integer-MMK arithmetic used by that summary:

- four method StatTiles: **cash**, **KBZPay**, **Wave**, and **credit**. Cash/KBZPay/Wave sum completed-sale payment rows; credit sums completed-sale `credit`, rather than pretending credit is a tender. `otherMethods` sums the completed-sale bank, other, and write-off payment rows, while `totalCollected` sums cash, KBZPay, Wave, and `otherMethods`. The unit-tested reconciliation invariant is `cash + kbzpay + wave + otherMethods === totalCollected` for every generated input. Credit is excluded from `totalCollected` because it is outstanding, not collected;
- staff breakdown: completed-sale total by the immutable `sale.staffId`, including any credit portion of the sale total;
- needs-review count from completed local sales with `needsReview`, and pending/attention queue counts from `OutboxStatusView`;
- debtor aging: each patient with positive local outstanding credit, its oldest completed credit-sale date, and the explicit `0–7`, `8–30`, `31–60`, or `61+` day band, evaluated against injected time;
- low stock: active products where `stockQty <= lowStockAt`.

Today shows total collected alongside the four StatTiles, then staff breakdown, review/sync counts, debtor-aging rows, low-stock rows, and a recent completed-sale history. It renders the translated `other` reconciliation line only when `otherMethods` is non-zero. Missing data uses the existing honest empty-state pattern; no generated insight, reminder, or clinical content enters M6. The patient and stock affordances are links into the existing client and Stocks screens.

### 2.1 Shift close is local, drain-gated, and admin-only

There is no documented shift-close endpoint, so M6 does not fabricate a server-side command or an outbox kind. The close modal accepts integer-MMK **opening cash** and **counted cash**, computes **cash sales**, **expected cash** (`openingCash + cashSales`), and **difference** (`countedCash - expectedCash`) only through `money.ts`, and records an immutable local `shift-close:v1:<uuid>` meta audit entry after confirmation. The entry includes the device ID, active admin staff ID, locally injected close timestamp, selected local business day, the four cash figures, and the outbox status snapshot. It is a local close record, not a claim that a server or Telegram was notified.

Close is enabled only for an active identity whose role is `admin` and when the live `OutboxStatusView` has **zero pending and zero attention** items. An active admin has already completed that administrator's PIN re-entry; M6 adds no server mutation or secondary elevation requirement to this local close record. Historical `done` rows are not work and do not block close. The modal refreshes status immediately before writing, so a row that appears while it is open blocks the action. This is the LAW-10 drain gate; it is intentionally separate from A4's cart-only guard. M6 does not add pay-in/pay-out or a multi-shift scheduler.

The ongoing shift summary for the current device/day is stored under a typed, versioned meta key only to retain the opening value and to show the most recent close record. It calls `businessDayWindow(now)` from `data/todaySummary.ts` before deriving cash sales, so the tile and close modal cannot diverge at midnight. A new close is not silently inferred from a sale, and its local record never affects sale capture or money arithmetic elsewhere.

## 3. A4 — Switch user (canonical text)

**What it does:** Switch user is a header action that clears only the in-memory session (retained CryptoKey, elevation state, any X-Elevation grant) and returns to the staff picker. It never touches persisted state: staff envelopes, queued outbox rows, Dexie data, and device profile all survive untouched.

**Availability — the critical distinction:** Switch user is never drain-gated. It remains available with a non-empty outbox because sale attribution is immutable at capture: `sale.staffId` is stamped on the row when the sale is captured (LAW-2 territory — identity travels with the row, not with the session). This is exactly what separates Switch user from logout and shift close, which stay drain-gated under LAW-10. No shared guard or hook may conflate the two.

**Cart guard:** Switch user is disabled while an uncommitted cart or tender flow is open. This is a cart guard, not a drain gate: the named `hasUncommittedCart` predicate reads only in-memory UI state (`draft.lines.length > 0 || tenderOpen`) and never consults outbox depth or sync status. The moment the cart is cleared or the tender flow closes, Switch user re-enables — even with fifty rows queued.

**After switch:** the incoming staff authenticates via their own PIN against their own envelope. They start unelevated. The wrong-PIN throttle state (memory-only, 1→30s) is per-attempt-session and resets naturally since it is memory-only; it has no persistence or carryover requirement.

`SessionController` gains a semantically named `switchUser()` operation, distinct from the existing logout caller path even though both clear only ephemeral credentials. `AppShell` receives explicit `onSwitchUser` and `switchUserDisabled` props. The Sale module alone computes `hasUncommittedCart`; all other product screens pass `false`. This makes the absence of an outbox/sync condition mechanically visible at every call site. The action routes to `/login` without a return target, so the picker appears before an incoming staff member reaches any product route.

M6 makes the existing LAW-10 logout gate structurally consistent across every shell route: the separately named `hasDrainBlockingSyncWork` predicate derives only pending/attention outbox state and disables/refuses logout. It is never reused by Switch user. A4 never broadens logout and shift-close behavior.

## 4. Browser storage protection and support diagnostics

After the provider has mounted, opened Dexie, and created the runtime, it constructs a narrow browser-only `StorageDiagnostics` controller. It is never imported or invoked at module scope. The controller:

1. makes one best-effort `navigator.storage.persist()` request post-mount;
2. reads `navigator.storage.persisted()` and `navigator.storage.estimate()` when those APIs exist;
3. represents unsupported API, denied persistence, granted persistence, usage bytes, and quota bytes as typed state; and
4. treats an exception or unavailable API as a non-fatal, visible unavailable/not-granted state — it must never prevent clinic startup or capture.

The provider publishes the resulting state to the shell. When persistence is not granted or unsupported, every authenticated product screen shows a translated persistent attention banner explaining that browser storage is not protected and must not be cleared. This is intentionally not a toast. The Set-up diagnostics card shows the same current persistence status, usage/quota estimate, and a refresh action. M6 chooses the conservative controller contract: that action re-reads `persisted()`/`estimate()` only; it does not ask the browser to persist again. Each cold mount remains the deliberate one best-effort `persist()` request. M6 does not mistake `navigator.storage.persist()` for the M7 service worker; it neither precaches nor changes network behavior.

The diagnostics card also offers a **support outbox JSON export**. It serializes only non-done queue rows plus a minimal schema version, generated timestamp, device ID, and status snapshot — never the complete database, encrypted staff envelopes, refresh credentials, elevation token, or printer/locale profile. Because this is an export under LAW-8, it always requires a fresh online password elevation, even inside a current elevation window. It is therefore unavailable while offline: a cancelled, offline, or failed elevation produces no Blob or download and the translated failure copy explicitly says that an internet connection is required. This is an intentional security limit because no local password verifier exists and a PIN is not an export credential. `OutboxStatusView` may pre-warn the user, but it is only a UX courtesy: the fresh elevation attempt is the authoritative connectivity gate and no queue state can grant export. The primary support case, rows in `attention`, normally means the server was reachable to return a 4xx response, so the online elevation path remains available for the situation it is meant to diagnose. On success, an event-handler-created local Blob download is named with the device ID and timestamp; it makes no network request and does not change the outbox.

## 5. Receipt-history reprint

Today’s sale history provides a reprint action for completed sales. It reads the immutable sale row and the currently confirmed clinic content/style plus the local printer profile, then calls the existing `buildConfirmedReceiptInput()` and the one `renderReceipt()` implementation. M6 does not create a DOM-only preview or a second receipt renderer.

`ReceiptRenderInput` gains an optional display-only `copyMarker` string. The Today caller supplies the translated `receipt.copy` value; the renderer makes it a deliberate, high-visibility `copy-marker` run in the raster layout before generating bytes. The marker is therefore on the printed/shared PNG, not merely beside the preview. Original post-capture receipts omit the marker. Reprints use M5's selected transport and PNG-share fallback, remain fire-and-forget under LAW-9, and cannot alter the completed sale or its outbox state.

`print/ReceiptViewer` is extracted from the Sale receipt modal so Sale and Today consume the same image/print/share behavior without a forbidden module-to-module import. It accepts `RenderedReceipt`, image URL, profile, labels, and callbacks; it does not own sales, storage, or session state. Its rendered receipt image carries a truthful copy-mode data attribute; the renderer unit test proves that this mode produces the `copy-marker` raster run.

## 6. Test-ID discipline, verification, and evidence

Every M6 E2E selector is owned by a renderer before its spec is written:

| Test ID family | Renderer |
|---|---|
| `today-root`, `today-method-*`, `today-staff-*`, `today-debtors`, `today-low-stock` | `TodayScreen` |
| `shift-close`, `shift-close-modal`, `shift-opening`, `shift-counted`, `shift-confirm` | `TodayScreen` close modal |
| `switch-user`, `storage-persistence-banner` | `AppShell` |
| `storage-diagnostics`, `storage-export` | `SetupScreen` diagnostics card |
| `sale-history-row-*`, `reprint-sale-*`, `reprint-receipt-canvas` | `TodayScreen` and the shared `ReceiptViewer` |

The exported-output project remains the only production E2E authority and retains all M0–M5 baseline assertions: cream background, cobalt primary action, Padauk resolution and Burmese line height, `lang`/`data-locale`, correct static RSC `.txt` MIME behavior, no external requests, and the real locale picker reload proof. The development-locale project remains in the same invocation for Burmese/English/Chinese visual proof.

M6 adds unit coverage for injected-clock day selection and the one `businessDayWindow()` at `23:59`/`00:01`; aging-band edges at day `7`/`8`, `30`/`31`, and `60`/`61`; all four money-method buckets and the `totalCollected` reconciliation invariant; expected/difference arithmetic; low-stock and staff grouping; shift-close drain/admin refusal and immutable local audit write; storage API granted/denied/unavailable cases; support-export redaction, fresh-elevation refusal, and internet-required copy; optional `copyMarker` layout/raster inclusion; and the semantic `switchUser()` memory-only behavior.

The exported E2E covers shift close refusal with pending and attention rows, successful admin close only after a drain, storage-warning/card behavior and redacted fresh-elevation export, receipt-history reprint in copy mode (with renderer-unit coverage proving the marker is in the raster), and the exact canonical A4 workflow. Like the M4 deep-link proof, its offline phase aborts API traffic rather than calling `context.setOffline(true)`, because M7 has not yet supplied a service worker and a full browser offline switch would also block the exported static assets:

1. device offline; Aye Aye (staff) logs in and captures two sales;
2. Switch user is visibly enabled with queue depth two; selecting it shows the staff picker and Aye Aye's active session is gone;
3. Su Su logs in with her own PIN and captures two sales, producing queue depth four;
4. reconnecting drains all four sequentially with 2xx responses; mock state proves two rows carry Aye Aye's staff ID and two Su Su's;
5. both envelopes still exist and both staff can authenticate afterward; and
6. with a cart item or open tender flow, Switch user is disabled; clearing the cart/closing tender re-enables it without examining queue depth.

Owner-session visual evidence adds Today at 1280×800, the close modal with its expected/difference rows, the persistent storage-warning plus Set-up diagnostics card, and a sale-history copy receipt. Today/close are paired against the relevant v4 Home and Hub Money treatments; owner visual judgment remains authoritative.

## 7. Explicit exclusions and M7 handoff

M6 does not add a service worker, cache API responses, a manifest, CSP, idle lock, a full shift/pay-in/pay-out workflow, refund, analytics, Hub, real printer protocol, a support upload endpoint, or server persistence for device diagnostics/shift records. It does not turn Shift close or Switch user into an outbox command.

M7 owns service-worker cache policy, strict CSP, reboot recovery, and the deployment rule that exported Next RSC `.txt` payloads must be served as `text/x-component`. M6's storage warning is deliberately honest: persistence can reduce browser eviction risk but is not a substitute for M7's offline shell availability or the reboot-recovery acceptance test.
