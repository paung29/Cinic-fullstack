import { describe, expect, test, vi } from 'vitest';
import { buildReceiptLayout, renderReceipt, waitForReceiptFonts, type ReceiptRenderInput } from '@/print/receipt';

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
    receipt: {}, receiptFooter: 'Thank you', logoUrl: '', receiptQr: true, receiptNextVisit: true,
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
  expect(calls).toContainEqual(['700 24px Lora', 'Eden Clinic']);
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
