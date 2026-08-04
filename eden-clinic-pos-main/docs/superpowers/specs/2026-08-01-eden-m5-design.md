# Eden Clinic OS — M5 Receipts, Set-up, and Stocks

**Status:** proposed for Dan's review  
**Scope:** M5 only — the receipt renderer and transport seam, Set-up, Stocks, and the two approved API-contract amendments. M5 retains the accepted M0–M4 paths. It does not start Home, Hub, Analytics, Care-loop, a service worker, manifest, CSP, a binary-upload service, or physical printer integration.

## 1. Authorities, order, and non-negotiable boundaries

The authorities are `docs/eden-frontend-build-spec-v1.1.md` (v1.2 content), `docs/reference/demo-v4.html`, `docs/reference/LUSA-design-system.md`, `docs/reference/openapi.yaml`, and `mock/mock-server.mjs`. M5 adds no dependency, preserves the pinned TypeScript 5.x and ESLint 9.x holds, keeps static export and self-hosted fonts, and retains all five existing gates.

The implementation order is intentional:

1. amend and validate the API contract and mock;
2. build the one receipt renderer and its transport seam;
3. build Set-up around server-confirmed clinic truth and device-local hardware truth;
4. build Stocks against the established product and receive commands.

This places the last patient-facing money artifact ahead of its editor. A second, designer-only renderer is prohibited: the preview is valid only when it calls the same renderer as a completed sale.

Every new user-visible string is a typed `useT()` key. English remains complete; drafted Burmese and Simplified Chinese strings carry `// TODO(native-review)`. All new UI follows the existing cream canvas, white cards, hairlines, cobalt interactive controls, violet-only AI treatment, 40 px touch floor, and cobalt focus ring. It introduces no literal colours.

## 2. Approved OpenAPI change set

`docs/reference/openapi.yaml` is amended before mock or frontend code, with its `info.version` note incremented for the M5 contract. The mock implements the exact same two product endpoints as real endpoints — never under `/__`. Both mutations are online-only and bypass the outbox entirely.

### 2.1 Shared elevation contract

The existing bearer authentication remains required. M5 documents the existing `X-Elevation` header as the additional active-elevation proof for privileged mutations. An absent, expired, or invalid header returns the standard `403 { status: 403, code: ELEVATION_REQUIRED, message }` shape. `ApiClient` accepts an explicit active elevation token argument for these requests; it never imports, owns, or persists the elevation controller.

### 2.2 `PATCH /clinic`

The amendment adds this elevated, structural-strict route:

```yaml
/clinic:
  patch:
    tags: [system]
    summary: >
      Online-only clinic configuration update. Requires an active elevation;
      config is never queued because money and receipt semantics must be
      server-confirmed.
    parameters:
      - $ref: '#/components/parameters/ElevationHeader'
    requestBody:
      required: true
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ClinicPatch' }
    responses:
      '200':
        description: Updated complete clinic row; also emitted as a normal clinic delta upsert.
        content: { application/json: { schema: { $ref: '#/components/schemas/ClinicConfig' } } }
      '400': { $ref: '#/components/responses/ErrMalformed' }
      '401': { $ref: '#/components/responses/Err401' }
      '403': { $ref: '#/components/responses/Err403' }
```

`ClinicPatch` has `additionalProperties: false`, `minProperties: 1`, and exactly these mutable properties:

```yaml
name: { type: string }
phone: { type: string }
address: { type: string }
receipt_footer: { type: string }
logo_url: { type: string }
rounding_step: { type: integer, enum: [1, 100, 500, 1000] }
credit_limit_mmk: { type: integer, minimum: 0 }
consent_mode: { type: string, enum: [off, warn, block] }
receipt_qr: { type: boolean }
receipt_next_visit: { type: boolean }
receipt_template: { type: string, enum: [classic, modern, minimal, boxed], default: classic }
receipt_header_font: { type: string, enum: [sans, serif, display], default: sans }
receipt_divider: { type: string, enum: [line, dots, none], default: line }
```

It rejects license/add-on fields, unknown fields, and every other field as `400 MALFORMED`. The complete `ClinicConfig` schema gains the flat `phone`, `address`, `receipt_footer`, `logo_url`, `receipt_qr`, `receipt_next_visit`, `receipt_template`, `receipt_header_font`, `receipt_divider`, and `consent_mode` fields. The former opaque `receipt` payload may remain on the wire temporarily for compatibility, but no M5 renderer or editor reads it: the named fields are the authoritative content model.

The mock validates the strict body before mutation, verifies `X-Elevation` exactly as the existing elevation route issues it, updates its clinic row, returns the complete row, and calls its normal clinic delta-upsert mechanism. This lets every other device converge through the existing bootstrap/delta path rather than a new config-sync mechanism.

### 2.3 `PATCH /products/{id}`

The amendment adds this elevated, structural-strict route:

```yaml
/products/{id}:
  patch:
    tags: [catalogue]
    summary: Online-only elevated catalogue update; never queued.
    parameters:
      - { name: id, in: path, required: true, schema: { type: string } }
      - $ref: '#/components/parameters/ElevationHeader'
    requestBody:
      required: true
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ProductPatch' }
    responses:
      '200':
        description: Updated complete product row; also emitted as a normal product delta upsert.
        content: { application/json: { schema: { $ref: '#/components/schemas/Product' } } }
      '400': { $ref: '#/components/responses/ErrMalformed' }
      '401': { $ref: '#/components/responses/Err401' }
      '403': { $ref: '#/components/responses/Err403' }
      '404': { $ref: '#/components/responses/Err404' }
```

`ProductPatch` has `additionalProperties: false`, `minProperties: 1`, and exactly these mutable properties: `name`, `category`, `subcategory`, `sort_order`, `price`, `cost`, `low_stock_at`, `reorder_at`, `stock_type`, `sold_by`, `requires_lot`, `requires_consent`, `unit_label`, `barcode`, `photo_key`, and `active`. `Product` gains matching response fields where absent today.

The schema descriptions and mock behavior explicitly enforce three exclusions:

- `stock_qty` is never PATCHable. Its presence returns `400 MALFORMED` because stock movements — sale, receive, and adjustment — are the sole source of the cached quantity. A direct write would desynchronize the movement ledger from the number.
- `id` and `clinic_id` are immutable; their presence returns `400 MALFORMED`.
- There is no DELETE endpoint. `active: false` is the retirement path because sale-line history refers to products permanently.

Changing `barcode` to a value belonging to another product returns the standard error shape with `400`, `code: DUPLICATE_BARCODE`, and a message that includes the existing product ID. This is a deliberate interactive refusal, not the offline-create `merged_into` path. A successful mutation returns the complete product and emits the normal product delta upsert.

## 3. Module ownership and data seams

| Area | Responsibility | Permitted dependencies |
|---|---|---|
| `data/clinicConfig.ts` | Strict clinic-patch validation, elevated online update, and local replacement only after a 200 response. | `api`, `db`, `types` |
| `data/printerProfile.ts` | Versioned device-local printer profile and explicitly non-operative receipt-designer draft. | `db`, `types` |
| `data/inventoryRecords.ts` | Transactional local product creation, stock receive, pending-create lookup, and elevated product update. | `db`, `outbox`, `api`, `types`, `money` |
| `print/receipt.ts` | Pure receipt layout plus canvas raster/PNG rendering at 576 or 384 dots. | `types`, `money` |
| `print/transport.ts` | `PrinterTransport` interface, transport selection, M5 stub, and PNG-share implementation. | `receipt` types only |
| `modules/setup/` | Set-up UI, elevation entry, local draft, printer profile, locale picker, and owner controls. | `data`, `ui`, `i18n`, `flags`, `print` |
| `modules/inventory/` | Stocks list, barcode-first add flow, receive flow, and elevated product edit UI. | `data`, `ui`, `i18n`, `flags` |
| `modules/sale/` | Receipt modal integration only; it calls the renderer/selected transport after capture. | `data`, `ui`, `i18n`, `print` |

Modules remain isolated under the existing import fence. The provider stays the composition root for the runtime, elevation controller, sync refresh, and route shell. No M5 module reads storage at module scope (LAW-6).

## 4. Receipt truth, printer geometry, and fire-and-forget printing

| Concern | Authority | Storage | Can affect a real receipt? |
|---|---|---|---|
| Header/name, address, phone, footer, logo URL, QR, next visit | Clinic truth | Confirmed clinic row from `PATCH /clinic`, bootstrap, or delta | Yes |
| Printer transport and 576/384-dot width | Device truth | Versioned printer-profile meta record keyed by device ID | Yes |
| Unsaved receipt-designer form | This-device draft | Explicit draft meta record or in-memory state | No — preview only |

Receipt content is clinic truth: a device must not print a draft the server has not confirmed. Receipt geometry is device truth: an 80 mm counter tablet with a LAN printer and a 58 mm pocket-printer phone can belong to one clinic and legitimately print identical content at different widths. If width were clinic state, the two devices would overwrite each other through delta sync. The record therefore prohibits promoting width to clinic configuration later.

`ReceiptRenderInput` contains an immutable completed-sale snapshot, confirmed named clinic content and style enums, optional next-visit data, and `width: 576 | 384`. `renderReceipt()` maps the confirmed `classic|modern|minimal|boxed` template to header composition, alignment, and spacing; maps `line|dots|none` to the divider treatment; and produces a `RenderedReceipt` with a PNG blob and the raster bytes required by an eventual ESC/POS/ePOS implementation. All four templates reflow legibly at both widths.

**Receipt legibility law:** `receipt_header_font` applies only to Latin header display text. `sans` maps to bundled Inter, `serif` to bundled Lora, and `display` to bundled Playfair Display. Burmese always renders in Padauk; body text remains Inter/Padauk. This is a legibility rule, not a limitation to apologize for: a decorative Latin face must never substitute for the Burmese typeface that keeps the receipt readable.

M5 bundles only Lora 700 and Playfair Display 700, as self-hosted WOFF2 assets with their OFL license notices alongside the existing local font notices. It never fetches a font at runtime. The renderer waits for bundled Padauk before drawing Burmese and uses the chosen Latin header face only for supported Latin glyphs. QR content is copied verbatim from the v4 reference; M5 controls only its presence. It does not manufacture a Telegram, web, or checkout-link scheme ahead of Phase 5.

`print/transport.ts` defines a narrow seam:

```ts
type PrinterTransport = {
  readonly id: PrinterTransportId;
  send(receipt: RenderedReceipt): Promise<void>;
};
```

M5 supplies the deterministic printer stub and PNG-share path. Future Sunmi, ePOS-Print LAN, Bluetooth bridge, Xprinter, and Epson implementations consume the same `RenderedReceipt`; they do not modify `print/receipt.ts`. The device profile selects the desired transport and width.

After the M3 sale transaction has committed, Sale opens the receipt modal and starts `transport.send()` without awaiting it (LAW-9). A transport error leaves the completed sale and modal intact, shows the translated failure toast, and exposes PNG share. Dismissing the receipt leaves no tender modal or backdrop behind.

## 5. Set-up: confirmed clinic writes and device-local preferences

`/setup` follows the v4 owner-oriented card composition:

- **AI add-ons:** current server license state, with its whole-app effect visible immediately after bootstrap/delta. These rows are deliberately not fake client-side switches: license fields are not in the mutable clinic contract.
- **Clinic configuration:** name, contact/address, rounding step, credit limit, consent mode, receipt footer/logo/QR/next-visit, template, Latin header-font choice, and divider. A valid draft may be previewed locally, but Save requires current elevation and connectivity. It is disabled offline with translated, honest copy. On success, only the returned complete clinic row replaces local state; no configuration row enters the outbox.
- **Hardware:** selected printer transport and 80/58 mm width live in the typed local device profile. Test print uses the same renderer and selected transport as a completed sale.
- **Receipt design:** template, header-font, and divider pickers join the existing content controls. The complete current draft drives the one renderer at the selected local width. Header maps to clinic name, sub-line to address, phone to phone, and logo presence to the configured logo URL. Its Save is the clinic-config Save described above; it sends only the three enum values, never CSS or a font name.
- **Language:** a real, production locale picker changes `I18nProvider` immediately and persists the choice in a device-local typed meta key after mount. It is not sent to `PATCH /clinic`, whose whitelist intentionally omits a clinic-wide language field.
- **Owner area:** existing elevated security controls remain available; active elevation is visible and expiry follows the M4 memory-only controller.

The locale picker is usable as a local presentation preference; privileged clinic and catalogue writes require active elevation. An unsaved locale change is not a clinic configuration mutation and never touches the outbox.

## 6. Stocks: local capture versus privileged catalogue mutation

`/stocks` reproduces the v4 inventory table: product/photo, category, type tag, Buy/Sell/Margin, quantity/low tag/lots, and barcode. Margin is derived by a `money.ts` helper — never duplicated in the component — with the specified ≥40%, ≥20%, and below-20% treatment. The ordinary price/value treatment respects cobalt pricing only where the visual law calls for it; StatTile values elsewhere retain ink by default.

### 6.1 Add product and receive

Add product is barcode-first. An online scan may call the documented lookup endpoint and prefill the manual form; offline and lookup-miss paths go directly to manual entry. The form includes photo metadata, name, barcode, category, **sold by each/weight**, cost, price, live margin, opening stock, and all needed product classification fields. A weight product created here is immediately consumable by the existing M3 checkout keypad.

`createProduct()` generates the product UUID before its Dexie transaction, writes the local product (including opening quantity) and typed `product` outbox item atomically, and returns without a network dependency (LAW-2 and LAW-3). Barcode conflict reconciliation remains the established POST merge behavior.

Receive is likewise offline-capable. `receiveStock()` generates its UUID, locally updates quantity/cost and injectable lot/expiry data, and creates the typed `stockReceive` outbox row in the same transaction. It uses the established replay-safe receive endpoint; it does not route through the elevated product PATCH.

### 6.2 Existing product edit

Existing products expose a read/edit action only with active elevation and online save. The exact product-patch whitelist prevents direct quantity changes, immutable-ID edits, deletion, and unknown fields. `active: false` retires a product while retaining historical sale references.

An offline-created product with a non-done create outbox row is visibly marked waiting to sync and has no edit control. It cannot exist server-side yet, so allowing an edit would manufacture a 404 window and undermine the M2 deferred-inbound collision protection.

## 7. Test-ID discipline, verification, and visual evidence

Every new E2E selector is assigned to a renderer before its spec is written:

| Test ID family | Renderer |
|---|---|
| `setup-root`, `clinic-save`, `receipt-preview`, `printer-profile-*`, `locale-picker` | `SetupScreen` and native controls |
| `receipt-canvas`, `receipt-print`, `receipt-share` | `ReceiptModal` / `SaleScreen` |
| `stocks-root`, `stock-row-<id>`, `add-product-*`, `receive-*`, `product-edit-*` | `StocksScreen` and its modals |

The export project remains the sole static-output authority and retains every M0–M4 assertion: cream body, cobalt primary action, Padauk font and Burmese line height, `lang`/`data-locale`, correct static RSC MIME behavior, and zero non-localhost requests. It adds:

- real Set-up locale switching, immediate visible text change, and persistence through a full exported-page reload;
- elevated online clinic/product saves, strict-error paths, delta convergence, and proof that neither mutation adds an outbox item;
- a real sale after saved QR-off content to prove the next receipt omits the reference QR payload;
- printer-stub failure with toast and PNG-share fallback, without blocking or undoing the sale;
- offline add-product and receive flows, sold-by-weight checkout, money-derived margin, barcode duplicate behavior, and pending-create edit refusal.

The development-locale project remains in the same Playwright invocation and continues to prove Burmese/English/Chinese rendering and the dev-only query override. The locale picker coverage above is deliberately separate: it proves the production UI and its device-local persistence.

Unit coverage includes strict patch-schema validation; elevation header forwarding; a 200-only clinic replacement invariant; no config outbox rows; device-profile and draft separation; all four template layout snapshots at 576 and 384 dots; Latin-header font mapping while Burmese remains Padauk; selected transport consumption of renderer bytes; QR omission; print failure isolation; product-create and receive transactionality; stock movement-only quantity discipline; product-patch barcode refusal; pending-create detection; and each/weight product behavior.

The M5 visual evidence set includes:

- Setup at 1280×800 with confirmed receipt design, each printer width, and a modal/preview comparison to v4;
- all four receipt templates at 80 mm, at least one template at 58 mm, and a completed-sale receipt with print-failure/share fallback;
- Stocks table, barcode-first add-product, weight-product form, injectable receive/lot view, and elevated product edit state;
- side-by-side v4 comparisons for the new screens;
- the M4 evidence debt: standalone Clients list and Calendar with booked, here, done, and cancelled colored blocks visible.

Owner-session visual judgment remains authoritative. Fresh captures rather than stale cached copies are used for review.

## 8. Explicit exclusions and handoffs

M5 does not create a client-side license-toggle endpoint, a clinic-wide language contract, a binary media-upload API, Telegram QR-token links, physical printer integrations, or a service worker. It does not queue clinic or existing-product mutations, persist elevation state, weaken the sale transaction, or change the M3/M4 envelope policy.

The hardware-drill milestone owns real ePOS-Print LAN POST and Bluetooth-bridge transports, implemented as additions behind `PrinterTransport`. M7 retains the strict CSP and the deployment requirement that exported Next RSC `.txt` payloads are served as `text/x-component`.
