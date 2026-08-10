import { expect, test } from 'vitest';
import { buildConfirmedReceiptInput } from '@/print/receiptInput';

test('builds receipts from confirmed clinic truth, not a device-local designer draft', () => {
  const input = buildConfirmedReceiptInput({
    sale: {
      id: 'sale-1', patientId: null, staffId: 's1', practitionerId: null, appointmentId: null, at: '2026-08-01T08:00:00.000Z',
      lines: [], payments: [], subtotal: 0, discountPct: null, discountApprovedBy: null, total: 0, credit: 0,
      creditApprovedBy: null, followupDate: null, deviceId: 'd1', createdOffline: true, no: null, status: 'completed', needsReview: false, reviewReason: null, receivedAt: null,
    },
    clinic: {
      id: 'clinic-1', name: 'Confirmed Eden', phone: '', address: '', roundingStep: 500, creditLimitMmk: 0,
      receipt: {}, receiptFooter: 'Confirmed footer', logoUrl: '', telegramHandle: '', receiptHeader: '', receiptQr: true, receiptNextVisit: true,
      receiptTemplate: 'boxed', receiptHeaderFont: 'display', receiptDivider: 'dots', consentMode: 'warn', addons: {}, featureFlags: {},
    },
    width: 384,
    palette: { background: 'bg', ink: 'ink', brand: 'brand', muted: 'muted', line: 'line' },
  });

  expect(input).toMatchObject({ width: 384, clinic: { name: 'Confirmed Eden', receiptTemplate: 'boxed', receiptFooter: 'Confirmed footer' } });
});
