import { describe, expect, it } from 'vitest';
import { buildQrMatrix, normalizeTelegramHandle, telegramDisplayHandle, telegramLink } from '@/print/qr';
import { RECEIPT_FONTS, headerFamilyFor, isReceiptFontId, receiptFontFamily } from '@/print/receiptFonts';
import { ditherToDots, fitLogoBox, luminance, shouldInvertForPrint } from '@/print/receiptLogo';

describe('telegram handle parsing', () => {
  it('accepts the shapes a clinic will actually paste', () => {
    for (const raw of ['edenclinic', '@edenclinic', 't.me/edenclinic', 'https://t.me/edenclinic', 'https://t.me/edenclinic/', 'TELEGRAM.ME/edenclinic']) {
      expect(normalizeTelegramHandle(raw)).toBe('edenclinic');
    }
  });
  it('builds a scannable link and a readable handle', () => {
    expect(telegramLink('@edenclinic')).toBe('https://t.me/edenclinic');
    expect(telegramDisplayHandle('t.me/edenclinic')).toBe('@edenclinic');
  });
});

describe('qr matrix', () => {
  it('encodes a telegram link with intact finder patterns', () => {
    const matrix = buildQrMatrix('https://t.me/edenclinic');
    expect(matrix.size).toBeGreaterThanOrEqual(21);
    // Each finder is a 7x7 ring: solid border, light gap, solid 3x3 core.
    for (const [row, column] of [[0, 0], [0, matrix.size - 7], [matrix.size - 7, 0]] as const) {
      expect(matrix.isDark(row, column)).toBe(true);
      expect(matrix.isDark(row + 1, column + 1)).toBe(false);
      expect(matrix.isDark(row + 3, column + 3)).toBe(true);
    }
  });
  it('grows with payload length rather than truncating', () => {
    const short = buildQrMatrix('https://t.me/a');
    const long = buildQrMatrix(`https://t.me/${'x'.repeat(200)}`);
    expect(long.size).toBeGreaterThan(short.size);
  });
});

describe('receipt font registry', () => {
  it('exposes unique ids and families', () => {
    expect(new Set(RECEIPT_FONTS.map((f) => f.id)).size).toBe(RECEIPT_FONTS.length);
    expect(new Set(RECEIPT_FONTS.map((f) => f.family)).size).toBe(RECEIPT_FONTS.length);
  });
  it('falls back rather than throwing on an id from a newer build', () => {
    expect(receiptFontFamily('not-a-font')).toBe('Inter');
    expect(receiptFontFamily(undefined)).toBe('Inter');
    expect(isReceiptFontId('not-a-font')).toBe(false);
    expect(isReceiptFontId('elegant')).toBe(true);
  });
  it('keeps Burmese brand names on Padauk, the only face with Myanmar glyphs', () => {
    expect(headerFamilyFor('ကျေးဇူးတင်ပါသည်', 'elegant')).toBe('Padauk');
    expect(headerFamilyFor('Eden Clinic', 'elegant')).toBe('Cormorant Garamond');
  });
});

describe('logo preparation', () => {
  it('scales down to the print box but never enlarges', () => {
    expect(fitLogoBox(1600, 800)).toEqual({ height: 160, width: 320 });
    expect(fitLogoBox(80, 40)).toEqual({ height: 40, width: 80 });
    expect(fitLogoBox(0, 0)).toEqual({ height: 0, width: 0 });
  });
  it('weights green most, matching perceived brightness', () => {
    expect(luminance(0, 255, 0)).toBeGreaterThan(luminance(255, 0, 0));
    expect(luminance(255, 255, 255)).toBeCloseTo(255, 5);
  });
  it('turns dark pixels into dots and leaves transparency as paper', () => {
    // Predominantly light, so the dark-logo inversion does not engage and this
    // exercises the plain mapping: dark ink, transparent paper.
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 0,
      255, 255, 255, 255,
    ]);
    const bitmap = ditherToDots(rgba, 2, 2);
    expect(bitmap.dots[0]).toBe(1);
    // Fully transparent is paper even though its RGB is black.
    expect(bitmap.dots[2]).toBe(0);
    expect(bitmap.dots).toHaveLength(4);
  });
  it('inverts a light-on-dark brand mark instead of burning a solid slab', () => {
    // The real Eden logo arrives this way: near-black field, cream artwork.
    const pixels = 20 * 20;
    const rgba = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < pixels; i += 1) {
      const lit = i % 20 === 10;
      rgba.set(lit ? [235, 225, 205, 255] : [8, 8, 8, 255], i * 4);
    }
    expect(shouldInvertForPrint(rgba, 20, 20)).toBe(true);

    const { dots } = ditherToDots(rgba, 20, 20);
    const on = dots.reduce((total, dot) => total + dot, 0);
    // The lit stripe becomes the ink; the field stays paper.
    expect(on).toBeGreaterThan(0);
    expect(on).toBeLessThan(pixels * 0.25);
  });

  it('leaves an ordinary dark-on-white logo alone', () => {
    const pixels = 20 * 20;
    const rgba = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < pixels; i += 1) {
      const inked = i % 20 === 10;
      rgba.set(inked ? [10, 10, 10, 255] : [250, 250, 250, 255], i * 4);
    }
    expect(shouldInvertForPrint(rgba, 20, 20)).toBe(false);
    const { dots } = ditherToDots(rgba, 20, 20);
    expect(dots.reduce((total, dot) => total + dot, 0)).toBeLessThan(pixels * 0.25);
  });

  it('leaves a mostly-transparent cutout alone however dark its edge pixels read', () => {
    // Regression from the real Eden logo: 97.8% transparent, and the soft
    // antialiased edges pull the opaque mean down to ~57. Inverting that
    // erased the mark, so coverage has to gate the darkness test.
    const pixels = 100 * 100;
    const rgba = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < pixels; i += 1) {
      rgba.set(i < pixels * 0.022 ? [57, 57, 57, 255] : [0, 0, 0, 0], i * 4);
    }
    expect(shouldInvertForPrint(rgba, 100, 100)).toBe(false);
  });

  it('does invert a logo genuinely flattened onto a black background', () => {
    const pixels = 100 * 100;
    const rgba = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < pixels; i += 1) {
      rgba.set(i % 100 === 50 ? [235, 225, 205, 255] : [8, 8, 8, 255], i * 4);
    }
    expect(shouldInvertForPrint(rgba, 100, 100)).toBe(true);
  });

  it('has nothing to judge in an entirely transparent or empty image', () => {
    expect(shouldInvertForPrint(new Uint8ClampedArray(400), 10, 10)).toBe(false);
    expect(shouldInvertForPrint(new Uint8ClampedArray(0), 0, 0)).toBe(false);
  });

  it('renders a mid-grey block as a mix rather than all-black or all-white', () => {
    const pixels = 32 * 32;
    const rgba = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < pixels; i += 1) {
      rgba.set([128, 128, 128, 255], i * 4);
    }
    const { dots } = ditherToDots(rgba, 32, 32);
    const on = dots.reduce((total, dot) => total + dot, 0);
    expect(on).toBeGreaterThan(pixels * 0.2);
    expect(on).toBeLessThan(pixels * 0.8);
  });
});
