// Adding a receipt font is a three-step change and nothing else:
//   1. drop the woff2 in public/fonts/ and record it in NOTICE.md + checksums.txt
//   2. add the @font-face block in globals.css
//   3. add one entry here
// Everything downstream — the Set-up picker, font preloading, the canvas, and
// the wire contract — is driven off this table.
export type ReceiptFontId = 'sans' | 'serif' | 'display' | 'geometric' | 'rounded' | 'elegant';

export type ReceiptFontSpec = {
  id: ReceiptFontId;
  family: string;
  weight: 700;
};

export const RECEIPT_FONTS: readonly ReceiptFontSpec[] = [
  { family: 'Inter', id: 'sans', weight: 700 },
  { family: 'Lora', id: 'serif', weight: 700 },
  { family: 'Playfair Display', id: 'display', weight: 700 },
  { family: 'Montserrat', id: 'geometric', weight: 700 },
  { family: 'Poppins', id: 'rounded', weight: 700 },
  { family: 'Cormorant Garamond', id: 'elegant', weight: 700 },
];

export const RECEIPT_FONT_IDS: readonly ReceiptFontId[] = RECEIPT_FONTS.map((font) => font.id);

const DEFAULT_FONT = RECEIPT_FONTS[0] as ReceiptFontSpec;

export function isReceiptFontId(value: unknown): value is ReceiptFontId {
  return typeof value === 'string' && (RECEIPT_FONT_IDS as readonly string[]).includes(value);
}

// Unknown ids reach us from a clinic row written by a newer build; fall back
// rather than throwing, so an old device can still print.
export function receiptFontSpec(id: string | null | undefined): ReceiptFontSpec {
  return RECEIPT_FONTS.find((font) => font.id === id) ?? DEFAULT_FONT;
}

export function receiptFontFamily(id: string | null | undefined): string {
  return receiptFontSpec(id).family;
}

// Only Padauk covers Myanmar script in this bundle. A brand name written in
// Burmese would silently fall back to a face with no Myanmar glyphs, so the
// header font applies to Latin names only and Burmese names stay on Padauk.
const MYANMAR_RANGE = /[က-႟ꩠ-ꩿ]/;

export function headerFamilyFor(name: string, id: string | null | undefined): string {
  return MYANMAR_RANGE.test(name) ? 'Padauk' : receiptFontFamily(id);
}
