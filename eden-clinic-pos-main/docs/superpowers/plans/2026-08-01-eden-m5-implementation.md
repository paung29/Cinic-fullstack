# Eden Clinic OS M5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task. This workspace does not permit agent-managed Git writes: the owner commits and pushes at the M5 review boundary.

**Goal:** Deliver the server-confirmed receipt renderer and Set-up experience, plus offline-capable Stocks, without weakening sale capture, the outbox, or the M0–M4 verification contract.

**Architecture:** First amend the two privileged online-only API mutations, then extend the typed data/API seams. A single receipt renderer consumes confirmed clinic content and a local printer profile; its transport is injected behind `PrinterTransport`. Set-up owns authoritative clinic drafts and local device preferences, while Stocks owns product capture/receive and elevated edits through dedicated data commands.

**Tech Stack:** Next.js static export, React 19, TypeScript 5.9, Dexie 4, Zod 4, Vitest 4, Playwright 1.62, bundled WOFF2 fonts, Canvas 2D.

## Global Constraints

- M5 adds no npm dependency and leaves `package.json`/`package-lock.json` unchanged; TypeScript stays 5.x and ESLint stays 9.x.
- Preserve static export, exact `tokens.css` checksum/597-byte guard, CSS Modules, and zero non-localhost browser requests.
- Every user-facing string goes through typed `useT()`; English is complete and drafted Burmese/Chinese entries carry `// TODO(native-review)`.
- LAW-1/2/3/4: product create and stock receive are UUID-backed, one-transaction offline captures; clinic and existing-product changes never enter the outbox.
- LAW-5: margin and all MMK arithmetic use `data/money.ts`; do not duplicate arithmetic in UI components.
- LAW-6: browser, Dexie, Canvas, FontFaceSet, and meta access occur only from post-mount effects or event handlers; no module-scope storage/listener access.
- LAW-8: clinic and existing-product writes require the current memory-only elevation token; do not store it or import the elevation controller into `data/api.ts`.
- LAW-9: printing starts only after sale capture commits and is never awaited by that capture; failure shows toast plus PNG-share affordance.
- LAW-11: Burmese stays Padauk with line-height ≥1.7; Chinese uses its existing system stack; no CJK asset is bundled.
- Receipt content/style is clinic truth and changes only from a successful `PATCH /clinic` response. Width and selected transport are device truth under a typed meta key. Designer drafts never print, sync, or enter the outbox.
- Receipt QR is exactly the v4 marker `▩▩` and caption `Telegram — aftercare & booking`; M5 creates no URL or QR-token scheme.
- Header font maps only `sans → Inter 700`, `serif → Lora 700`, `display → Playfair Display 700`. Burmese remains Padauk and all body text remains Inter/Padauk.
- Extend `apps/pos/public/fonts/checksums.txt` from the actual bytes; do not invent a hash. Update `NOTICE.md` with the two asset sources and licences.
- A static host must continue to serve exported Next RSC `.txt` payloads as `text/x-component` and extensionless routes as their HTML output.
- Do not write Git metadata. Owner-session commit message after approval: `setup: deliver receipts and stocks (M5)`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `docs/reference/openapi.yaml` | M5 contract version plus strict `PATCH /clinic` and `PATCH /products/{id}` definitions. |
| `mock/mock-server.mjs` | Executable strict mutation behavior, elevation-header checks, duplicate barcode response, and normal delta emission. |
| `apps/pos/src/data/types.ts` | Typed clinic receipt settings, strict patch schemas, expanded product fields, barcode lookup schema, and wire/local mappers. |
| `apps/pos/src/data/api.ts` | Elevated clinic/product mutations and protected barcode lookup; no controller ownership. |
| `apps/pos/src/data/clinicConfig.ts` | 200-only authoritative clinic replacement command. |
| `apps/pos/src/data/printerProfile.ts` | Versioned device printer profile, device locale preference, and non-operative designer draft meta records. |
| `apps/pos/src/data/inventoryRecords.ts` | Atomic local product-create/receive commands, pending-create selector, and elevated product-update command. |
| `apps/pos/src/print/receipt.ts` | Font-readiness gate, pure layout, Canvas PNG/raster rendering, v4 QR marker, and token-resolved palette input. |
| `apps/pos/src/print/transport.ts` | `PrinterTransport`, M5 no-hardware stub, and PNG-share transport. |
| `apps/pos/src/modules/setup/SetupScreen.{tsx,module.css}` | Set-up sections, elevation/save flow, local preview, transport profile, test print, and locale picker. |
| `apps/pos/src/modules/inventory/StocksScreen.{tsx,module.css}` | Stock table, barcode-first create, receive, and elevated edit flows. |
| `apps/pos/src/modules/sale/SaleScreen.tsx` | Replace the placeholder receipt body and browser-print calls with renderer/transport integration. |
| `apps/pos/src/app/{setup,stocks}/page.tsx` | Static route entry points. |
| `apps/pos/src/app/providers.tsx`, `apps/pos/src/i18n/I18nProvider.tsx` | Post-mount device locale restoration/persistence bridge. |
| `apps/pos/src/app/globals.css`, `apps/pos/public/fonts/*` | Two local font faces, checksum manifest, and licence provenance. |
| `apps/pos/tests/unit/{api,types,clinic-config,printer-profile,receipt,transport,inventory-records,font-assets}.test.ts` | Deterministic data, rendering, asset, and atomicity coverage. |
| `apps/pos/tests/e2e/m5.export.spec.ts`, `apps/pos/tests/e2e/visuals.ts`, `apps/pos/tests/e2e/mock.ts` | Exported-output workflow, M4 evidence debt, and M5 screenshot helpers. |

---

### Task 1: Amend the API contract and executable mock

**Files:**
- Modify: `docs/reference/openapi.yaml`
- Modify: `mock/mock-server.mjs`
- Modify: `apps/pos/tests/unit/mock-server.ts`
- Modify: `apps/pos/tests/unit/api.test.ts`

**Consumes:** existing bearer auth, `X-Elevation` implementation in the mock, and delta `bump(entity, row)` behavior.

**Produces:** contract-valid `PATCH /clinic` and `PATCH /products/{id}` behavior for later typed client methods.

- [ ] **Step 1: Add failing mock-contract tests for both privileged PATCH routes.**

  Add an elevated login helper and tests that prove valid mutations return complete rows, append a delta upsert, and reject invalid bodies:

  ```ts
  const elevation = await client.elevate({ password: 'eden', screen: 'm5-contract' });
  await expect(client.updateClinic({ receipt_qr: false }, elevation.elevation_token))
    .resolves.toMatchObject({ id: 'clinic-1', receipt_qr: false });

  await expect(client.updateProduct('p1', { price: 33_000 }, elevation.elevation_token))
    .resolves.toMatchObject({ id: 'p1', price: 33_000 });
  ```

  Cover `400 MALFORMED` for empty/unknown clinic bodies, `stock_qty`, `id`, and `clinic_id` product bodies; `403 ELEVATION_REQUIRED` without `X-Elevation`; and `400 DUPLICATE_BARCODE` whose message includes the owning product ID.

- [ ] **Step 2: Run the focused test to verify the routes and client methods are absent.**

  Run: `npm run test:unit -- tests/unit/api.test.ts`

  Expected: FAIL because `updateClinic` and `updateProduct` do not exist and the mock has no PATCH behavior.

- [ ] **Step 3: Amend `openapi.yaml` before any implementation.**

  Set `info.version` to `1.1.0`. Add a reusable `ElevationHeader` parameter for `X-Elevation`, then define the two paths and schemas exactly:

  ```yaml
  ClinicPatch:
    type: object
    minProperties: 1
    additionalProperties: false
    properties:
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

  Define `ProductPatch` with `minProperties: 1`, `additionalProperties: false`, and only `name`, `category`, `subcategory`, `sort_order`, `price`, `cost`, `low_stock_at`, `reorder_at`, `stock_type`, `sold_by`, `requires_lot`, `requires_consent`, `unit_label`, `barcode`, `photo_key`, and `active`. Add descriptions stating that `stock_qty` is movement-derived and rejects direct writes; `id`/`clinic_id` are immutable; and deactivation is `active: false`, with no DELETE route. Add `ErrDuplicateBarcode` using the standard `{ status, code, message }` shape.

- [ ] **Step 4: Implement the mock routes with strict body validation and normal deltas.**

  Add a small local helper so every rejected field is structurally checked before mutation:

  ```js
  function strictPatch(body, allowed) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) return false;
    return Object.keys(body).every((key) => allowed.includes(key));
  }
  ```

  Seed all newly explicit clinic fields, including `receipt_template: 'classic'`, `receipt_header_font: 'sans'`, and `receipt_divider: 'line'`. Require `elevated()` on both routes, validate enum/range values, mutate only allowed fields, call `bump('clinic', db.clinic)` or `bump('product', product)`, and return the complete row. On product barcode conflict, return:

  ```js
  return err(res, 400, 'DUPLICATE_BARCODE', `barcode already belongs to product ${other.id}`);
  ```

  Extend the unit mock wrapper only with helpers actually used by tests; keep fixtures under `/__` and both PATCH routes as product endpoints.

- [ ] **Step 5: Run the focused contract tests.**

  Run: `npm run test:unit -- tests/unit/api.test.ts`

  Expected: PASS, including strict rejection, elevation, duplicate-barcode, and delta assertions.

---

### Task 2: Create typed clinic/product mutation and lookup seams

**Files:**
- Modify: `apps/pos/src/data/types.ts`
- Modify: `apps/pos/src/data/api.ts`
- Modify: `apps/pos/tests/unit/types.test.ts`
- Modify: `apps/pos/tests/unit/api.test.ts`

**Consumes:** Task 1’s wire contract.

**Produces:** `ClinicPatchWire`, `ProductPatchWire`, `BarcodeLookupWire`, `ApiClient.updateClinic`, `ApiClient.updateProduct`, and `ApiClient.lookupBarcode`.

- [ ] **Step 1: Write failing schema and header-forwarding tests.**

  Add the following contract assertions:

  ```ts
  expect(() => clinicPatchSchema.parse({})).toThrow();
  expect(() => productPatchSchema.parse({ stock_qty: 2 })).toThrow();
  expect(() => productPatchSchema.parse({ name: 'Serum', unexpected: true })).toThrow();

  await client.updateProduct('p1', { sold_by: 'weight' }, 'elev-1');
  expect(new Headers(fetchFn.mock.calls[0][1]?.headers).get('x-elevation')).toBe('elev-1');
  ```

  Assert `toLocalClinic()` maps every new named receipt field and `toLocalProduct()`/`toWireProduct()` preserve subcategory, sort order, reorder threshold, lot/consent requirements, and active status.

- [ ] **Step 2: Run focused type/API tests to verify the new symbols fail.**

  Run: `npm run test:unit -- tests/unit/types.test.ts tests/unit/api.test.ts`

  Expected: FAIL because the strict schemas and API methods are not exported.

- [ ] **Step 3: Add strict Zod schemas and complete local mappings.**

  In `types.ts`, add exact enum schemas and strict, non-empty patch schemas:

  ```ts
  export const receiptTemplateSchema = z.enum(['classic', 'modern', 'minimal', 'boxed']);
  export const receiptHeaderFontSchema = z.enum(['sans', 'serif', 'display']);
  export const receiptDividerSchema = z.enum(['line', 'dots', 'none']);
  export const clinicPatchSchema = z.object({
    name: z.string().optional(), phone: z.string().optional(), address: z.string().optional(),
    receipt_footer: z.string().optional(), logo_url: z.string().optional(),
    rounding_step: z.union([z.literal(1), z.literal(100), z.literal(500), z.literal(1_000)]).optional(),
    credit_limit_mmk: z.number().int().nonnegative().optional(),
    consent_mode: z.enum(['off', 'warn', 'block']).optional(), receipt_qr: z.boolean().optional(),
    receipt_next_visit: z.boolean().optional(), receipt_template: receiptTemplateSchema.optional(),
    receipt_header_font: receiptHeaderFontSchema.optional(), receipt_divider: receiptDividerSchema.optional(),
  }).strict().refine(
    (patch) => Object.keys(patch).length > 0,
    'Clinic patch needs one field.',
  );
  ```

  Expand `ClinicRow` with `phone`, `address`, `receiptFooter`, `logoUrl`, `receiptQr`, `receiptNextVisit`, `receiptTemplate`, `receiptHeaderFont`, `receiptDivider`, and `consentMode`. Expand `ProductRow` and `ProductWire` with `subcategory`, `sort_order`, `reorder_at`, `requires_lot`, and `requires_consent`. Defaults preserve existing seed compatibility; explicit M5 PATCH parsing stays strict.

  Add `barcodeLookupSchema` for the documented `{ found, name?, brand?, category?, image_url?, source? }` response.

- [ ] **Step 4: Extend the API client without coupling it to elevation state.**

  Extend request options and `sendRequest()` so an optional explicit token becomes the `x-elevation` header. Add these exact methods:

  ```ts
  updateClinic(input: ClinicPatchWire, elevationToken: string): Promise<ClinicWire>;
  updateProduct(id: string, input: ProductPatchWire, elevationToken: string): Promise<ProductWire>;
  lookupBarcode(code: string): Promise<BarcodeLookupWire>;
  ```

  `updateClinic` calls `PATCH /clinic`; `updateProduct` URI-encodes the ID and calls `PATCH /products/{id}`. Both use their strict schema, bearer protection, and the caller-supplied elevation token. `lookupBarcode` is bearer-protected but has no elevation header. Retain the existing single-flight 401 behavior for all three paths.

- [ ] **Step 5: Run the focused tests and static type check.**

  Run: `npm run test:unit -- tests/unit/types.test.ts tests/unit/api.test.ts`

  Expected: PASS.

  Run: `npm run typecheck`

  Expected: PASS with no missing `ClinicRow` or `ProductRow` properties.

---

### Task 3: Add device preferences, authoritative config commands, and font-asset integrity

**Files:**
- Create: `apps/pos/src/data/clinicConfig.ts`
- Create: `apps/pos/src/data/printerProfile.ts`
- Create: `apps/pos/tests/unit/clinic-config.test.ts`
- Create: `apps/pos/tests/unit/printer-profile.test.ts`
- Create: `apps/pos/tests/unit/font-assets.test.ts`
- Create: `apps/pos/public/fonts/checksums.txt`
- Modify: `apps/pos/src/app/providers.tsx`
- Modify: `apps/pos/src/i18n/I18nProvider.tsx`
- Modify: `apps/pos/src/app/globals.css`
- Modify: `apps/pos/public/fonts/NOTICE.md`
- Add: `apps/pos/public/fonts/lora-700.woff2`
- Add: `apps/pos/public/fonts/playfair-display-700.woff2`

**Consumes:** Task 2’s schemas/API and the existing `deviceId` meta value.

**Produces:** authoritative online config saves, device-local `PrinterProfile`, reload-persistent locale preference, and verifiable offline font assets.

- [ ] **Step 1: Write failing command/profile/asset tests.**

  Test that `saveClinicConfig()` only writes the complete returned row, never adds an outbox row, and leaves the local row byte-for-byte unchanged when `api.updateClinic()` rejects. Test profile and locale round trips through Dexie meta:

  ```ts
  await savePrinterProfile(db, 'device-1', { version: 1, transport: 'generic-escpos', width: 384 });
  await expect(readPrinterProfile(db, 'device-1')).resolves.toEqual({ version: 1, transport: 'generic-escpos', width: 384 });
  ```

  Add a font-manifest test that parses `checksums.txt`, hashes every named asset with `node:crypto`, and requires entries for the six current files plus `lora-700.woff2` and `playfair-display-700.woff2`.

- [ ] **Step 2: Run the focused tests to verify missing commands/assets fail.**

  Run: `npm run test:unit -- tests/unit/clinic-config.test.ts tests/unit/printer-profile.test.ts tests/unit/font-assets.test.ts`

  Expected: FAIL because no command/profile module or checksum manifest exists.

- [ ] **Step 3: Implement the 200-only clinic command and typed device profile.**

  Implement these interfaces:

  ```ts
  export type PrinterTransportId = 'sunmi-sdk' | 'xprinter-lan' | 'xprinter-bluetooth' | 'epson-epos' | 'generic-escpos';
  export type PrinterProfile = { version: 1; transport: PrinterTransportId; width: 576 | 384 };

  export async function saveClinicConfig(input: {
    db: ClinicDb; api: Pick<ApiClient, 'updateClinic'>; patch: ClinicPatchWire; elevationToken: string;
  }): Promise<ClinicRow>;
  ```

  `saveClinicConfig` parses its patch, awaits `api.updateClinic`, converts the result with `toLocalClinic`, then puts that row in `db.clinic`. It never performs a local optimistic config edit and never imports `outbox.ts`. `printerProfileMetaKey(deviceId)`, `receiptDesignerDraftMetaKey(deviceId)`, and `localePreferenceMetaKey(deviceId)` must be explicit versioned/meta names. Define `ReceiptDesignerDraft` as `{ version: 1; fields: ClinicPatchWire }`; it is never read by real receipt rendering.

- [ ] **Step 4: Add post-mount locale restoration and persistence.**

  Add a small bridge rendered inside `ClinicRuntimeProvider` after Dexie opens. It reads `localePreferenceMetaKey(runtime.deviceId)` once, calls `setLocale()` only for the `my|en|zh` union, and only then writes subsequent picker changes. It must use effects, not module-scope `window` or storage access. The Set-up picker will call the existing `setLocale`; the bridge persists it. The development-only `__devLocale` override remains compile-time gated and must still be inert in `out/`.

- [ ] **Step 5: Bundle and record the two actual font assets.**

  Use `@fontsource/lora@5.3.0` and `@fontsource/playfair-display@5.3.0` only as non-runtime asset sources. Create the ignored `work/m5-font-pack/` cache, then pack — never install — the two tarballs:

  ```powershell
  New-Item -ItemType Directory -Force work/m5-font-pack | Out-Null
  npm pack @fontsource/lora@5.3.0 --pack-destination work/m5-font-pack
  npm pack @fontsource/playfair-display@5.3.0 --pack-destination work/m5-font-pack
  ```

  Extract `package/files/lora-latin-700-normal.woff2` and `package/files/playfair-display-latin-700-normal.woff2` from those tarballs to the two named public-font files. Record `Get-FileHash -Algorithm SHA256` values for both source tarballs in the M5 report. Do not add either package to `package.json` or the lockfile.

  After the files exist, generate `checksums.txt` from their actual bytes and the existing six assets, one line per asset in `SHA256␠␠filename` format. Add the exact source package/file names, versions, extraction date, and SIL Open Font License 1.1 notice to `NOTICE.md`. Do not prefill any hash before it is calculated.

  Add these faces to `globals.css` with `font-display: swap`:

  ```css
  @font-face { font-family: 'Lora'; src: url('/fonts/lora-700.woff2') format('woff2'); font-display: swap; font-style: normal; font-weight: 700; }
  @font-face { font-family: 'Playfair Display'; src: url('/fonts/playfair-display-700.woff2') format('woff2'); font-display: swap; font-style: normal; font-weight: 700; }
  ```

- [ ] **Step 6: Run focused tests and inspect the manifest.**

  Run: `npm run test:unit -- tests/unit/clinic-config.test.ts tests/unit/printer-profile.test.ts tests/unit/font-assets.test.ts`

  Expected: PASS with hashes derived from committed font bytes.

  Run: `npm run lint && npm run typecheck`

  Expected: PASS; no module-scope storage access is introduced.

  Run: `git diff -- package.json package-lock.json`

  Expected: no output.

---

### Task 4: Build the one receipt renderer and transport boundary

**Files:**
- Create: `apps/pos/src/print/receipt.ts`
- Create: `apps/pos/src/print/transport.ts`
- Create: `apps/pos/tests/unit/receipt.test.ts`
- Create: `apps/pos/tests/unit/transport.test.ts`

**Consumes:** Task 2 clinic types, Task 3 printer profile/assets, `fmtMMK`, immutable `SaleRow` snapshots.

**Produces:** `buildReceiptLayout`, `waitForReceiptFonts`, `renderReceipt`, `RenderedReceipt`, and `PrinterTransport`.

- [ ] **Step 1: Write failing layout, font-readiness, and transport tests.**

  Snapshot all four templates at both widths from one fixture sale/clinic pair:

  ```ts
  for (const width of [576, 384] as const) {
    for (const template of ['classic', 'modern', 'minimal', 'boxed'] as const) {
      expect(buildReceiptLayout({ ...fixture, width, clinic: { ...fixture.clinic, receiptTemplate: template } })).toMatchSnapshot();
    }
  }
  ```

  Use an injected fake `FontFaceSet` to assert the exact gate: Inter 700 and Padauk always load; Lora 700 loads for `serif`; Playfair Display 700 loads for `display`; rasterization does not begin until all requested load promises resolve. Assert QR-off contains neither `▩▩` nor `Telegram — aftercare & booking` and QR-on contains both exact reference strings. Assert a rejecting stub transport rejects without mutating the `RenderedReceipt`, while PNG-share receives its PNG blob.

- [ ] **Step 2: Run renderer tests to verify they fail.**

  Run: `npm run test:unit -- tests/unit/receipt.test.ts tests/unit/transport.test.ts`

  Expected: FAIL because the renderer and transport modules are absent.

- [ ] **Step 3: Implement pure layout and an explicit font-readiness gate.**

  Define these public values:

  ```ts
  export type ReceiptRenderInput = { sale: SaleRow; clinic: ClinicRow; width: 576 | 384; palette: ReceiptPalette };
  export type RenderedReceipt = { width: 576 | 384; png: Blob; raster: Uint8Array; layout: ReceiptLayout };
  export async function waitForReceiptFonts(fonts: FontFaceSet, headerFont: ReceiptHeaderFont): Promise<void>;
  export function buildReceiptLayout(input: ReceiptRenderInput): ReceiptLayout;
  export async function renderReceipt(input: ReceiptRenderInput, deps: ReceiptRenderDeps): Promise<RenderedReceipt>;
  ```

  `waitForReceiptFonts` calls `fonts.load('700 16px Inter')` and `fonts.load('400 16px Padauk', burmeseSample)` for every receipt, then conditionally calls `fonts.load('700 24px Lora', latinHeader)` or `fonts.load('700 24px "Playfair Display"', latinHeader)`. `renderReceipt` must await this function before calling any Canvas drawing method. This prevents silent fallback rasterization that would look like a template defect at the clinic.

  Build layouts with classic/modern/minimal/boxed header alignment and spacing plus line/dots/none divider primitives. Apply the header-font mapping only to a Latin header run; emit Burmese header/subline/footer runs with Padauk and all body runs with Inter/Padauk. Resolve receipt palette values from existing CSS token values in a post-mount caller; do not introduce raw color values in source. Render the v4 QR marker/caption verbatim only when `clinic.receiptQr` is true.

- [ ] **Step 4: Implement a renderer-independent transport seam.**

  Define:

  ```ts
  export type PrinterTransport = { readonly id: PrinterTransportId; send(receipt: RenderedReceipt): Promise<void> };
  export function createM5PrinterTransport(profile: PrinterProfile): PrinterTransport;
  export function createPngShareTransport(share: (file: File) => Promise<void>): PrinterTransport;
  ```

  The M5 printer stub accepts the selected profile but rejects with a typed no-hardware error; it consumes `raster` and never calls the renderer. PNG share consumes the rendered PNG. Later LAN/Bluetooth implementations can replace only `createM5PrinterTransport` branches without touching layout or Canvas code.

- [ ] **Step 5: Run renderer/transport tests.**

  Run: `npm run test:unit -- tests/unit/receipt.test.ts tests/unit/transport.test.ts`

  Expected: PASS with eight stable layout snapshots and the selected-font readiness assertions.

---

### Task 5: Replace the sale receipt placeholder with the real renderer

**Files:**
- Modify: `apps/pos/src/modules/sale/SaleScreen.tsx`
- Modify: `apps/pos/src/modules/sale/SaleScreen.module.css`
- Modify: `apps/pos/tests/unit/sale-capture.test.ts`
- Modify: `apps/pos/tests/e2e/m3.export.spec.ts`

**Consumes:** Task 3 local printer profile, Task 4 renderer/transport, existing `captureWithinBoundary` and `SaleRow` capture result.

**Produces:** real canvas receipt, print/share controls, and retained no-orphan-backdrop protection.

- [ ] **Step 1: Write failing receipt integration tests.**

  Add unit coverage around a receipt-input builder that reads the confirmed `ClinicRow`, not `ReceiptDesignerDraft`. In the existing sale e2e, after capture assert:

  ```ts
  await expect(page.getByTestId('receipt-canvas')).toBeVisible();
  await page.getByTestId('receipt-print').click();
  await expect(page.getByTestId('toast-item')).toBeVisible();
  await expect(page.getByTestId('receipt-share')).toBeVisible();
  await page.getByTestId('sale-complete').click();
  await expect(page.getByTestId('modal-backdrop')).toHaveCount(0);
  ```

- [ ] **Step 2: Run the affected unit test to verify the builder is absent.**

  Run: `npm run test:unit -- tests/unit/sale-capture.test.ts`

  Expected: FAIL because no confirmed-receipt input builder exists.

- [ ] **Step 3: Integrate renderer and transport only after the committed capture.**

  After `captureSale()` resolves and `setTenderOpen(false)` has run, read the clinic row and printer profile in an event/effect, resolve token palette values from the mounted document, and call `renderReceipt`. Display the resulting PNG in a `<canvas>` or image-backed canvas element carrying `data-testid="receipt-canvas"`. The receipt modal must show a loading skeleton until rasterization completes.

  Print uses `void selectedTransport.send(renderedReceipt).catch(...)`; its error handler queues the translated toast and preserves a `receipt-share` control. The `ReceiptModal` owns `data-qr-present="true|false"`, derived from `renderedReceipt.layout`, so the E2E selector traces to the real renderer result rather than a parallel designer state. Share creates a `File` from the PNG and delegates to `createPngShareTransport`; neither action can reject through or alter the sale-capture transaction. Replace `window.print()` and the current `navigator.share({ text: receipt.id })` placeholder.

- [ ] **Step 4: Run sale unit coverage.**

  Run: `npm run test:unit -- tests/unit/sale-capture.test.ts tests/unit/receipt.test.ts tests/unit/transport.test.ts`

  Expected: PASS, proving confirmed content, fire-and-forget failure, and no capture regression.

---

### Task 6: Deliver the Set-up route and production locale picker

**Files:**
- Create: `apps/pos/src/app/setup/page.tsx`
- Create: `apps/pos/src/modules/setup/SetupScreen.tsx`
- Create: `apps/pos/src/modules/setup/SetupScreen.module.css`
- Modify: `apps/pos/src/ui/AppShell.tsx` only if a shared route helper is extracted; otherwise leave its public shape unchanged.
- Modify: `apps/pos/src/modules/{sale,patients,calendar}/*Screen.tsx` to add the Stocks/Set-up tabs and route mapping.
- Modify: `apps/pos/src/i18n/{types,dict.en,dict.my,dict.zh}.ts`
- Create: `apps/pos/tests/unit/setup-selectors.test.ts`
- Create: `apps/pos/tests/e2e/m5.export.spec.ts`

**Consumes:** Tasks 2–5 plus `useClinicRuntimeStatus`, `useLocaleControl`, existing `AppShell`, `Switch`, `Select`, `Modal`, `Toast`.

**Produces:** static `/setup`, confirmed receipt editor, local printer/locale controls, and export-grade locale persistence proof.

- [ ] **Step 1: Write failing pure selector and exported-output tests.**

  Add a selector test for the Save state: only `OutboxStatusView.state === 'offline'` disables online-only clinic Save; it must not use `navigator.onLine`. In `m5.export.spec.ts`, provision, open Set-up, choose English through `locale-picker`, and assert immediate text and root attributes change; reload `/setup` and assert English persists:

  ```ts
  await page.getByTestId('locale-picker').selectOption('en');
  await expect(page.getByTestId('setup-root')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('setup-save')).toContainText('Save');
  await page.reload();
  await expect(page.getByTestId('setup-root')).toHaveAttribute('data-locale', 'en');
  ```

  Add a separate export test that elevates, changes `receipt_qr` to false, saves, completes the next sale, and asserts the real receipt omits both exact v4 QR strings.

- [ ] **Step 2: Run the selector test to verify the new policy is absent.**

  Run: `npm run test:unit -- tests/unit/setup-selectors.test.ts`

  Expected: FAIL because Set-up selectors and route are absent.

- [ ] **Step 3: Implement `SetupScreen` with one renderer-backed preview.**

  On mount, load clinic/profile/draft through `runtime.db` and refresh on runtime revision. Its Receipt design card holds the named clinic content fields and the three enum-only controls:

  ```ts
  type ReceiptDraft = Pick<ClinicPatchWire,
    'name' | 'phone' | 'address' | 'receipt_footer' | 'logo_url' |
    'receipt_qr' | 'receipt_next_visit' | 'receipt_template' |
    'receipt_header_font' | 'receipt_divider'>;
  ```

  Every control updates only this draft and rerenders the Task 4 preview at the selected local width. Save requires `runtime.elevation.state().kind === 'active'`; otherwise open the existing password-elevation modal and then call `saveClinicConfig`. Offline derives solely from existing outbox drain state — no navigator listener. In that state, Save is disabled with translated explanation and creates no outbox row. A failed request leaves both draft and confirmed clinic row intact.

  The hardware card persists `PrinterProfile`, exposes all five v4 transport labels, and maps 80 mm to 576 / 58 mm to 384. Test print invokes the same renderer and selected `PrinterTransport`. Add-on rows present current server license state as read-only state, never a fake local switch. Locale picker calls `setLocale` and relies on Task 3’s bridge to persist it.

- [ ] **Step 4: Complete static routing, shell navigation, copy, and test IDs.**

  Add `/setup` to every existing shell tab mapping and add `/stocks` at the same time so every screen offers one consistent tab set. Add only component-owned test IDs: `setup-root`, `locale-picker`, `setup-save`, `receipt-preview`, `receipt-template`, `receipt-header-font`, `receipt-divider`, `printer-width`, `printer-test`, and the elevation controls. Add complete English translations and drafted Burmese/Chinese entries.

- [ ] **Step 5: Run Set-up unit/type/lint checks.**

  Run: `npm run test:unit -- tests/unit/setup-selectors.test.ts tests/unit/clinic-config.test.ts tests/unit/printer-profile.test.ts`

  Expected: PASS.

  Run: `npm run typecheck && npm run lint`

  Expected: PASS with no raw user-visible literals or forbidden browser access.

---

### Task 7: Implement atomic inventory commands and selectors

**Files:**
- Create: `apps/pos/src/data/inventoryRecords.ts`
- Create: `apps/pos/src/modules/inventory/inventorySelectors.ts`
- Create: `apps/pos/tests/unit/inventory-records.test.ts`
- Create: `apps/pos/tests/unit/inventory-selectors.test.ts`
- Modify: `apps/pos/src/data/money.ts`

**Consumes:** Tasks 1–2 product API/types, existing `enqueueOutbox`, `buildOutboxRow`, and money functions.

**Produces:** atomic `createProduct`, `receiveStock`, elevated `updateProduct`, `hasPendingProductCreate`, and stock/margin selectors.

- [ ] **Step 1: Write failing transactional and selector tests.**

  Cover one transaction for offline creation and receiving:

  ```ts
  const created = await createProduct({ db, now: 1, uuid: () => 'product-uuid', input: weightProduct });
  expect(await db.products.get(created.product.id)).toMatchObject({ soldBy: 'weight' });
  expect(await db.outbox.toArray()).toHaveLength(1);

  await receiveStock({ db, now: 2, uuid: () => 'receive-uuid', input: { productId: 'p7', qty: 2, lotNo: 'L-9', lotExpiry: '2027-01-01' } });
  ```

  Assert a failed transaction leaves neither product/receive local effects nor outbox row; `hasPendingProductCreate(db, id)` blocks edit; `marginPct` is the only calculator behind `marginBand(cost, price)`; and an elevated update replaces the local product only after API success.

- [ ] **Step 2: Run focused inventory tests to verify they fail.**

  Run: `npm run test:unit -- tests/unit/inventory-records.test.ts tests/unit/inventory-selectors.test.ts`

  Expected: FAIL because inventory commands/selectors are absent.

- [ ] **Step 3: Implement the commands with exact outbox payload ownership.**

  Define:

  ```ts
  export async function createProduct(input: CreateProductInput): Promise<{ product: ProductRow; outboxUuid: string }>;
  export async function receiveStock(input: ReceiveStockInput): Promise<{ product: ProductRow; outboxUuid: string }>;
  export async function updateExistingProduct(input: {
    db: ClinicDb; api: Pick<ApiClient, 'updateProduct'>; productId: string;
    patch: ProductPatchWire; elevationToken: string;
  }): Promise<ProductRow>;
  export async function hasPendingProductCreate(db: ClinicDb, productId: string): Promise<boolean>;
  ```

  `createProduct` generates a product UUID and outbox UUID, puts `ProductRow`, then enqueues the entity-backed `product` row inside one transaction. `receiveStock` creates the receive UUID/outbox UUID, updates product quantity/cost and injectable lot aggregation, then enqueues the inline `stockReceive` payload inside one transaction. `updateExistingProduct` refuses if `hasPendingProductCreate` is true, calls the elevated PATCH, and only then replaces `db.products` with `toLocalProduct(response)`; it imports no outbox command.

- [ ] **Step 4: Implement selectors and money-bound margin bands.**

  Add `marginBand(cost, price): 'high' | 'medium' | 'low' | 'none'` beside `marginPct` in `money.ts`, with exact threshold behavior: high ≥40, medium ≥20, low below 20, none for an unavailable margin. `inventorySelectors.ts` filters active products by local query/barcode and returns only computed presentation data; it never stores or writes margin.

- [ ] **Step 5: Run focused inventory tests.**

  Run: `npm run test:unit -- tests/unit/inventory-records.test.ts tests/unit/inventory-selectors.test.ts tests/unit/money.test.ts`

  Expected: PASS, including rollback, pending-edit refusal, lot receive, and exact margin bands.

---

### Task 8: Deliver the Stocks screen and checkout-compatible weight products

**Files:**
- Create: `apps/pos/src/app/stocks/page.tsx`
- Create: `apps/pos/src/modules/inventory/StocksScreen.tsx`
- Create: `apps/pos/src/modules/inventory/StocksScreen.module.css`
- Modify: `apps/pos/src/modules/sale/SaleScreen.tsx`
- Modify: `apps/pos/src/i18n/{types,dict.en,dict.my,dict.zh}.ts`
- Modify: `apps/pos/tests/e2e/m5.export.spec.ts`

**Consumes:** Task 7 commands/selectors, Task 2 lookup API, existing M3 weight keypad/cart behavior, and Set-up’s shared shell navigation.

**Produces:** static `/stocks`, barcode-first add form, receive flow, elevated edit flow, and end-to-end weight product sale proof.

- [ ] **Step 1: Write the failing export workflow.**

  Add one M5 export test that provisions, makes the mock API unavailable, opens Stocks, creates a weight product manually, receives injectable stock with lot/expiry, and confirms both outbox rows are pending. Restore API, trigger sync, then assert the product is editable only after sync. In the same or a dedicated workflow, add the weight product to the sale catalogue and assert the existing quantity keypad is used before capture.

  Add direct online cases for barcode lookup prefill, `DUPLICATE_BARCODE` translated refusal, and `stock_qty` absent from all edit controls.

- [ ] **Step 2: Run the export spec to verify it fails.**

  Run: `npm run build` with `NEXT_PUBLIC_EDEN_API_BASE_URL=http://127.0.0.1:4010`.

  Run: `npm run test:e2e -- --project=e2e-export tests/e2e/m5.export.spec.ts`

  Expected: FAIL because `/stocks` and its test IDs are absent.

- [ ] **Step 3: Implement the v4 Stocks table and add-product flow.**

  Render active local products in a white-card-on-cream table with photo metadata, name, category/subcategory, type and sold-by tags, Buy/Sell/Margin, stock/low tags/lots, and barcode. Apply `marginBand` as a status treatment only. The Add-product modal begins with barcode scan/input. When online lookup returns `found: true`, prefill name/category/photo metadata; when it returns false or online-only state is unavailable, expose the complete manual form.

  The manual form includes each/weight selector, cost/price/live computed margin, opening stock, barcode, category, type, unit label, and injectables’ lot/expiry. Submitting calls `createProduct`; it does not await network. A created weight product must appear in Sale’s products tab and follow its existing keypad branch.

- [ ] **Step 4: Implement receive and elevated edit without a direct quantity field.**

  Receive modal accepts quantity, optional cost, and lot/expiry for injectables, then calls `receiveStock`. Existing product edit is visible only when no non-done create row exists. It opens an elevation password modal when no active elevation exists, sends only `ProductPatchWire` fields on Save, and displays the translated duplicate-barcode server error. Omit `stockQty`, `id`, and `clinicId` controls entirely. The retirement control sends `active: false`; it never deletes.

- [ ] **Step 5: Add component-owned IDs and complete translations.**

  Add `stocks-root`, `stock-row-<id>`, `add-product-open`, `add-product-barcode`, `add-product-lookup`, `add-product-sold-by`, `add-product-save`, `receive-open-<id>`, `receive-save`, `product-edit-<id>`, `product-edit-save`, and `product-waiting-<id>` to their renderers. Add all matching typed translations before compiling.

- [ ] **Step 6: Run inventory and type checks.**

  Run: `npm run test:unit -- tests/unit/inventory-records.test.ts tests/unit/inventory-selectors.test.ts tests/unit/money.test.ts`

  Expected: PASS.

  Run: `npm run typecheck && npm run lint`

  Expected: PASS.

---

### Task 9: Complete the two-project E2E gate and evidence capture

**Files:**
- Modify: `apps/pos/tests/e2e/m5.export.spec.ts`
- Modify: `apps/pos/tests/e2e/m3.locales.spec.ts` only if its screenshots need a stable new route; retain its assertions unchanged.
- Modify: `apps/pos/tests/e2e/visuals.ts`
- Modify: `apps/pos/tests/e2e/mock.ts`
- Modify: `apps/pos/playwright.config.ts` only if an existing server command needs the M5 fixture; keep ports 4010/4173/4174 and one invocation.
- Modify: `.gitignore` only if new regeneratable screenshots are not already excluded.

**Consumes:** completed Tasks 1–8 and the existing owner-session Playwright topology.

**Produces:** M5 workflow coverage, all required screenshots, and the two missing M4 captures.

- [ ] **Step 1: Add test helpers that reset deterministically and trace every ID.**

  Extend `resetMock()` only with M5 fixture options that remain under `/__reset`; do not add a product-facing test route. Before each M5 test, POST reset, provision with `s1/1234`, and wait for the exact owning test ID before interacting. Keep `workers: 1` and both existing web servers unchanged.

- [ ] **Step 2: Add the exported-output baseline and production-locale cases first.**

  The first test retains the M0–M4 baseline: exported route, cream `rgb(250, 249, 247)`, cobalt primary action `rgb(0, 104, 249)`, Padauk loaded/resolved with Burmese line height, default Burmese `lang`/`data-locale`, inert `__devLocale`, correct RSC behavior, and zero non-localhost requests. Then cover real locale picker immediate swap and static-export reload persistence. The development-locale project continues independently to prove my/en/zh rendering; do not replace it with the picker test.

- [ ] **Step 3: Add receipt, configuration, and inventory workflows.**

  Exercise elevated clinic Save, then assert updated rounding affects a fresh Sale through existing `money.ts` rather than UI arithmetic. Assert no config outbox row via IndexedDB inspection. Set QR off, complete the next sale, and assert the renderer-owned `receipt-canvas` container has `data-qr-present="false"`; the Task 4 unit layout test proves this state removes both `▩▩` and `Telegram — aftercare & booking` from the actual render primitives. Exercise the no-hardware print failure, toast, share affordance, and no-backdrop-after-dismissal assertion.

  Exercise barcode-first offline creation, injectable receive, after-sync edit availability, duplicate barcode refusal, and a weight-product sale. Never use `context.setOffline(true)` for a full static page: abort only the mock API route when testing app offline behavior, so static assets remain available.

- [ ] **Step 4: Capture M5 and carried M4 evidence.**

  Extend `visuals.ts` to write ignored artifacts for:

  ```text
  setup-classic-80.png
  setup-modern-80.png
  setup-minimal-80.png
  setup-boxed-80.png
  setup-classic-58.png
  receipt-completed-80.png
  receipt-completed-58.png
  stocks-table.png
  stocks-add-weight.png
  stocks-receive-injectable.png
  clients-list.png
  calendar-status-blocks.png
  comparison-setup.png
  comparison-stocks.png
  ```

  Route the v4 Google Fonts stylesheet and font files to the bundled local assets, as M1 already established, so reference comparison typography never depends on live requests. Seed booked/here/done/cancelled appointment fixtures before `calendar-status-blocks.png`; the capture must visibly show all four colored block treatments.

- [ ] **Step 5: Run both Playwright projects from the exported build.**

  Run in PowerShell: `$env:NEXT_PUBLIC_EDEN_API_BASE_URL='http://127.0.0.1:4010'; npm run build`

  Run: `npm run test:e2e`

  Expected: both `e2e-export` and `e2e-dev-locales` pass in one invocation and all listed artifacts are newly generated.

---

### Task 10: Run the milestone gates and prepare the owner-session handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-08-01-eden-m5-design.md` only to record any approved implementation-level deviation; otherwise leave the accepted record unchanged.
- Inspect: all M5 files and screenshot artifacts.

**Consumes:** Tasks 1–9.

**Produces:** a truthful M5 report for the owner’s commit, CI, and visual review.

- [ ] **Step 1: Verify scope and literal-color policy.**

  Run: `rg -n -e '#[0-9a-fA-F]{3,8}' -e 'rgba?\(' apps/pos/src`

  Expected: no newly introduced raw CSS colors. Receipt Canvas colors must be resolved from existing token values, not literals. Review `git diff` for only M5 contract, fonts, data, print, Setup, Stocks, tests, and documentation changes.

  Run: `git diff -- package.json package-lock.json`

  Expected: no output; `npm pack` asset sourcing must not change the dependency manifests.

- [ ] **Step 2: Run the four in-sandbox gates in order.**

  Run: `npm run typecheck`

  Expected: PASS.

  Run: `npm run lint`

  Expected: PASS.

  Run: `npm run test:unit`

  Expected: PASS, including the Node import-everything LAW-6 guard and new asset/renderer snapshots.

  Run in PowerShell: `$env:NEXT_PUBLIC_EDEN_API_BASE_URL='http://127.0.0.1:4010'; npm run build`

  Expected: PASS and static `/setup` plus `/stocks` output.

- [ ] **Step 3: Hand off the formal E2E/visual gate to the owner session.**

  Provide the exact build command, `npm run test:e2e` output, M5 screenshot inventory, font checksum manifest, and the known Windows Playwright-teardown behavior if it recurs. Ask the owner to run the formal five-gate workflow and judge all M5 comparisons plus the carried Clients/Calendar evidence against v4. Do not attempt a Git commit or push from this sandbox.

## Self-Review

### Spec coverage

- M5 receipt content/style, one-renderer preview, device geometry, printer seam, strict font readiness, QR boundary, and 80/58 evidence: Tasks 3–6 and 9.
- `PATCH /clinic` and `PATCH /products/{id}`, strict error behavior, elevation headers, delta convergence, and no outbox writes: Tasks 1–2 and 6–9.
- Real locale picker plus static-export reload persistence: Tasks 3, 6, and 9.
- Offline product creation/receive, barcode lookup, weight products, margins, product PATCH, pending-create refusal, and stock movement boundary: Tasks 2, 7, 8, and 9.
- M0–M4 baselines, test-ID traceability, and carried M4 screenshot debt: Tasks 5, 6, and 9.
- Font integrity and licence provenance: Task 3.

### Placeholder scan

The plan names every new interface, route, test file, command, response condition, source asset, test ID family, screenshot artifact, and owner-only handoff action. It deliberately contains no precomputed font checksum: hashes are derived from the actual extracted files before the asset manifest is committed.

### Type consistency

Later tasks use the Task 2 types `ClinicPatchWire`, `ProductPatchWire`, `BarcodeLookupWire`, and `ClinicRow`; Task 3 defines `PrinterProfile`/`PrinterTransportId`; Task 4 defines `ReceiptRenderInput`, `RenderedReceipt`, and `PrinterTransport`; Task 7 defines the inventory command names used by Task 8. No feature module imports another feature module.

## Execution Handoff

Plan saved at `docs/superpowers/plans/2026-08-01-eden-m5-implementation.md`. Per the agreed milestone protocol, implementation waits for Dan’s plan review; owner-session commits and pushes remain outside this sandbox.
