import { describe, expect, test, vi } from 'vitest';
import { buildReceiptLayout, qrModuleScale, QR_QUIET_MODULES, receiptHeaderLines, RECEIPT_HEADER_MAX_LINES, renderReceipt, waitForReceiptFonts, type ReceiptRenderInput } from '@/print/receipt';

const input: ReceiptRenderInput = {
  sale: {
    id: 'sale-1', patientId: 'patient-1', staffId: 's1', practitionerId: null, appointmentId: null,
    at: '2026-08-01T08:30:00.000Z', lines: [{ id: 'line-1', kind: 'service', itemId: 'v1', nameSnapshot: 'Laser facial', qty: 1, unitPrice: 45_000, lineTotal: 45_000, discountPct: null, note: null, lotNo: null, lotExpiry: null }],
    payments: [{ id: 'payment-1', method: 'cash', amount: 45_000, at: '2026-08-01T08:30:00.000Z' }],
    subtotal: 45_000, discountPct: null, discountApprovedBy: null, total: 45_000, credit: 0, creditApprovedBy: null,
    followupDate: null, deviceId: 'device-1', createdOffline: false, no: 'R-001', status: 'completed', needsReview: false, reviewReason: null, receivedAt: null,
  },
  clinic: {
    id: 'clinic-1', name: 'Eden Clinic', phone: '', address: '', roundingStep: 500, creditLimitMmk: 100_000,
    receipt: {}, receiptFooter: 'Thank you', logoUrl: '', telegramHandle: '', receiptHeader: '', receiptQr: true, receiptNextVisit: true,
    receiptTemplate: 'classic', receiptHeaderFont: 'sans', receiptDivider: 'line', consentMode: 'warn', addons: {}, featureFlags: {},
  },
  width: 576,
  palette: { background: 'token-bg', ink: 'token-ink', brand: 'token-brand', muted: 'token-muted', line: 'token-line' },
};

describe('receipt layout', () => {
  test('places an optional copy marker in the raster layout only for reprints', () => {
    const original = buildReceiptLayout(input);
    const copy = buildReceiptLayout({ ...input, copyMarker: 'COPY' });

    expect(original.runs.some((run) => run.kind === 'copy-marker')).toBe(false);
    expect(copy.runs).toContainEqual(expect.objectContaining({ kind: 'copy-marker', text: 'COPY' }));
    expect(copy.height).toBeGreaterThan(original.height);
    const copyMarker = copy.runs.find((run) => run.kind === 'copy-marker');
    const body = copy.runs.find((run) => run.kind === 'body');
    expect(copyMarker?.fontSize).toBeGreaterThan(body?.fontSize ?? 0);
    expect(copyMarker?.spacingBefore).toBeGreaterThan(0);
  });

  test.each([576, 384] as const)('gives a %i-dot COPY marker its own larger metrics', (width) => {
    const layout = buildReceiptLayout({ ...input, width, copyMarker: 'COPY' });
    const marker = layout.runs.find((run) => run.kind === 'copy-marker');
    expect(marker).toMatchObject({ weight: 700, spacingBefore: expect.any(Number), advance: expect.any(Number) });
    expect(marker?.fontSize).toBeGreaterThan(16);
  });

  test('builds all four templates legibly at both printer widths', () => {
    for (const width of [576, 384] as const) {
      for (const template of ['classic', 'modern', 'minimal', 'boxed'] as const) {
        const layout = buildReceiptLayout({ ...input, width, clinic: { ...input.clinic, receiptTemplate: template } });
        expect(layout).toMatchObject({ width, template, headerFont: 'Inter' });
        expect(layout.height).toBeGreaterThan(0);
        expect(layout.runs.some((run) => run.text === 'Telegram — aftercare & booking')).toBe(true);
      }
    }
  });

  test('maps only selected Latin header text to the optional header face and preserves the v4 QR strings exactly', () => {
    const serif = buildReceiptLayout({ ...input, clinic: { ...input.clinic, receiptHeaderFont: 'serif' } });
    const display = buildReceiptLayout({ ...input, clinic: { ...input.clinic, receiptHeaderFont: 'display' } });
    const withoutQr = buildReceiptLayout({ ...input, clinic: { ...input.clinic, receiptQr: false } });

    expect(serif.runs.find((run) => run.kind === 'header-latin')).toMatchObject({ font: 'Lora' });
    expect(display.runs.find((run) => run.kind === 'header-latin')).toMatchObject({ font: 'Playfair Display' });
    expect(serif.runs.filter((run) => run.locale === 'my').every((run) => run.font === 'Padauk')).toBe(true);
    expect(withoutQr.runs.map((run) => run.text).join('\n')).not.toContain('▩▩');
    expect(withoutQr.runs.map((run) => run.text).join('\n')).not.toContain('Telegram — aftercare & booking');
  });
});

test('waits for mandatory and selected receipt faces before any raster canvas exists', async () => {
  const calls: Array<[string, string | undefined]> = [];
  let releaseLora: (() => void) | undefined;
  const loraLoaded = new Promise<FontFace[]>((resolve) => { releaseLora = () => resolve([]); });
  const fonts = {
    load: vi.fn((font: string, sample?: string) => {
      calls.push([font, sample]);
      return font.includes('Lora') ? loraLoaded : Promise.resolve([] as FontFace[]);
    }),
  };
  const createCanvas = vi.fn(() => ({
    context: { fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), setLineDash: vi.fn() },
    toBlob: async () => new Blob(['png']),
  }));
  const pending = renderReceipt({ ...input, clinic: { ...input.clinic, receiptHeaderFont: 'serif' } }, { fonts, createCanvas });

  await Promise.resolve();
  expect(createCanvas).not.toHaveBeenCalled();
  releaseLora?.();
  await expect(pending).resolves.toMatchObject({ width: 576, raster: expect.any(Uint8Array) });
  expect(calls).toContainEqual(['700 16px Inter', undefined]);
  expect(calls.some(([font, sample]) => font === '400 16px Padauk' && sample !== undefined)).toBe(true);
  // The registry quotes every family uniformly; required for multi-word names
  // like "Playfair Display" and valid CSS for single-word ones.
  expect(calls).toContainEqual(['700 24px "Lora"', 'Eden Clinic']);
});

test('selective font loading leaves optional display faces out of a sans receipt', async () => {
  const fonts = { load: vi.fn(async () => []) };
  await waitForReceiptFonts(fonts, 'sans');
  expect(fonts.load).toHaveBeenCalledTimes(2);
  await waitForReceiptFonts(fonts, 'display');
  expect(fonts.load).toHaveBeenCalledWith('700 24px "Playfair Display"', 'Eden Clinic');
});

test('keeps rendering possible when an offline font face rejects', async () => {
  const fonts = {
    load: vi.fn((font: string) => font.includes('Padauk')
      ? Promise.reject(new Error('offline font cache miss'))
      : Promise.resolve([] as FontFace[])),
  };

  await expect(waitForReceiptFonts(fonts, 'display')).resolves.toBeUndefined();
  expect(fonts.load).toHaveBeenCalledWith('400 16px Padauk', expect.any(String));
  expect(fonts.load).toHaveBeenCalledWith('700 24px "Playfair Display"', 'Eden Clinic');
});

describe('receipt branding', () => {
  const branded: ReceiptRenderInput = {
    ...input,
    clinic: { ...input.clinic, phone: '09 771 000 111', address: 'Lashio, Myanmar', telegramHandle: '@edenclinic' },
  };

  test('prints the contact number and address that Set-up already collects', () => {
    const layout = buildReceiptLayout(branded);
    const contacts = layout.runs.filter((run) => run.kind === 'contact').map((run) => run.text);

    expect(contacts).toEqual(['09 771 000 111', 'Lashio, Myanmar']);
    // They belong under the header, above the receipt number.
    const lastContact = layout.runs.map((run, index) => run.kind === 'contact' ? index : -1).reduce((last, index) => Math.max(last, index), -1);
    const receiptNo = layout.runs.findIndex((run) => run.text.startsWith('Receipt '));
    expect(lastContact).toBeLessThan(receiptNo);
  });

  test('omits contact rows the clinic has not filled in', () => {
    const layout = buildReceiptLayout(input);
    expect(layout.runs.some((run) => run.kind === 'contact')).toBe(false);
  });

  test('replaces the placeholder marker with a scannable code and the handle', () => {
    const layout = buildReceiptLayout(branded);

    expect(layout.qr?.size).toBeGreaterThanOrEqual(21);
    expect(layout.runs.some((run) => run.kind === 'qr')).toBe(false);
    expect(layout.runs).toContainEqual(expect.objectContaining({ kind: 'qr-code', text: 'https://t.me/edenclinic' }));
    expect(layout.runs.some((run) => run.text === '@edenclinic')).toBe(true);
  });

  test('keeps the plain marker when no handle is set, rather than a QR leading nowhere', () => {
    const layout = buildReceiptLayout(input);
    expect(layout.qr).toBeUndefined();
    expect(layout.runs.some((run) => run.kind === 'qr')).toBe(true);
  });

  test('drops the whole telegram block when the clinic turns the QR off', () => {
    const layout = buildReceiptLayout({ ...branded, clinic: { ...branded.clinic, receiptQr: false } });
    expect(layout.runs.some((run) => run.kind === 'qr-code' || run.kind === 'qr')).toBe(false);
  });

  test('reserves height for a logo and puts it above the name', () => {
    const logo = { dots: new Uint8Array(40 * 20), height: 20, width: 40 };
    const withLogo = buildReceiptLayout({ ...branded, logo });
    const withoutLogo = buildReceiptLayout(branded);

    expect(withLogo.logo).toBe(logo);
    expect(withLogo.height).toBeGreaterThan(withoutLogo.height);
    expect(withLogo.runs[0]?.kind).toBe('logo');
    const header = withLogo.runs.findIndex((run) => run.kind === 'header-latin');
    expect(header).toBeGreaterThan(0);
  });

  test('selects the header family from the registry and honours the Burmese fallback', () => {
    expect(buildReceiptLayout({ ...branded, clinic: { ...branded.clinic, receiptHeaderFont: 'elegant' } }).headerFont).toBe('Cormorant Garamond');
    expect(buildReceiptLayout({ ...branded, clinic: { ...branded.clinic, receiptHeaderFont: 'geometric' } }).headerFont).toBe('Montserrat');
    expect(buildReceiptLayout({ ...branded, clinic: { ...branded.clinic, name: 'ဧဒင်ဆေးခန်း', receiptHeaderFont: 'geometric' } }).headerFont).toBe('Padauk');
  });
});

describe('qr quiet zone', () => {
  const branded: ReceiptRenderInput = {
    ...input,
    clinic: { ...input.clinic, telegramHandle: 'edenclinic' },
  };

  test('reserves the four-module light margin scanners need above and below', () => {
    const layout = buildReceiptLayout(branded);
    const qrRun = layout.runs.find((run) => run.kind === 'qr-code');
    const matrix = layout.qr;

    expect(qrRun).toBeDefined();
    expect(matrix).toBeDefined();
    if (qrRun === undefined || matrix === undefined) return;

    const scale = qrModuleScale(matrix, 576);
    const quiet = QR_QUIET_MODULES * scale;
    expect(qrRun.spacingBefore).toBe(quiet);
    expect(qrRun.advance - matrix.size * scale).toBe(quiet);
  });

  test('uses a whole number of pixels per module so edges land on dots', () => {
    const matrix = buildReceiptLayout(branded).qr;
    if (matrix === undefined) throw new Error('expected a qr matrix');
    for (const width of [576, 384] as const) {
      const scale = qrModuleScale(matrix, width);
      expect(Number.isInteger(scale)).toBe(true);
      expect(scale).toBeGreaterThanOrEqual(2);
      expect(matrix.size * scale).toBeLessThanOrEqual(width);
    }
  });
});

describe('receipt header band', () => {
  const withHeader = (header: string): ReceiptRenderInput => ({
    ...input,
    clinic: { ...input.clinic, address: 'Lashio, Myanmar', phone: '09 771 000 111', receiptHeader: header },
  });

  test('prints the clinic-authored header between rules, one run per line', () => {
    const layout = buildReceiptLayout(withHeader('No. 12, Theinni Road\nLashio, Shan State\nOpen 9am - 6pm'));
    const contacts = layout.runs.filter((run) => run.kind === 'contact').map((run) => run.text);

    expect(contacts).toEqual(['No. 12, Theinni Road', 'Lashio, Shan State', 'Open 9am - 6pm']);
    expect(layout.runs.filter((run) => run.kind === 'band-rule')).toHaveLength(2);
    const kinds = layout.runs.map((run) => run.kind);
    expect(kinds.indexOf('band-rule')).toBeLessThan(kinds.indexOf('contact'));
    expect(kinds.lastIndexOf('band-rule')).toBeGreaterThan(kinds.lastIndexOf('contact'));
  });

  test('the header replaces the structured phone and address lines', () => {
    const contacts = buildReceiptLayout(withHeader('Anything she wants')).runs
      .filter((run) => run.kind === 'contact').map((run) => run.text);
    expect(contacts).toEqual(['Anything she wants']);
  });

  test('falls back to phone and address when no header is set, so nothing is lost', () => {
    const layout = buildReceiptLayout(withHeader(''));
    expect(layout.runs.filter((run) => run.kind === 'band-rule')).toHaveLength(0);
    expect(layout.runs.filter((run) => run.kind === 'contact').map((run) => run.text))
      .toEqual(['09 771 000 111', 'Lashio, Myanmar']);
  });

  test('tidies whatever was typed and caps a runaway paste', () => {
    expect(receiptHeaderLines('  spaced  \n\n\n  lines  \n')).toEqual(['spaced', 'lines']);
    expect(receiptHeaderLines('   \n  \n')).toEqual([]);
    expect(receiptHeaderLines(null)).toEqual([]);
    expect(receiptHeaderLines(undefined)).toEqual([]);
    const many = Array.from({ length: 30 }, (_, index) => `line ${index}`).join('\n');
    expect(receiptHeaderLines(many)).toHaveLength(RECEIPT_HEADER_MAX_LINES);
  });

  test('grows the receipt by the band it adds', () => {
    expect(buildReceiptLayout(withHeader('a\nb\nc')).height).toBeGreaterThan(buildReceiptLayout(withHeader('')).height);
  });
});
