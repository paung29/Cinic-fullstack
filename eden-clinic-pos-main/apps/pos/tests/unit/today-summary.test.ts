import { describe, expect, test } from 'vitest';
import { businessDayWindow, summarizeToday } from '@/data/todaySummary';
import type { PatientRow, ProductRow, SaleRow, StaffRow } from '@/data/types';

const now = new Date(2026, 7, 2, 0, 5, 0).getTime();

function sale(input: Partial<SaleRow> & Pick<SaleRow, 'id' | 'at' | 'staffId'>): SaleRow {
  return {
    id: input.id,
    patientId: input.patientId ?? null,
    staffId: input.staffId,
    practitionerId: null,
    appointmentId: null,
    at: input.at,
    lines: [],
    payments: input.payments ?? [],
    subtotal: input.subtotal ?? 0,
    discountPct: null,
    discountApprovedBy: null,
    total: input.total ?? 0,
    credit: input.credit ?? 0,
    creditApprovedBy: null,
    followupDate: null,
    deviceId: 'device-1',
    createdOffline: false,
    no: input.id,
    status: input.status ?? 'completed',
    needsReview: input.needsReview ?? false,
    reviewReason: null,
    receivedAt: null,
  };
}

function patient(id: string): PatientRow {
  return { id, code: null, name: `Patient ${id}`, phone: `09${id}`, sex: null, allergies: null, alertNote: null, telegramLinked: false, followupDate: null };
}

function product(id: string, stockQty: number, lowStockAt: number): ProductRow {
  return {
    id, name: `Product ${id}`, category: 'Skin', subcategory: null, sortOrder: 0,
    barcode: null, cost: 1, price: 2, stockQty, lowStockAt, reorderAt: 0,
    stockType: 'retail', soldBy: 'each', requiresLot: false, requiresConsent: false,
    unitLabel: null, photoKey: null, lots: [], active: true,
  };
}

const staff: StaffRow[] = [
  { id: 's2', name: 'Aye Aye', role: 'staff', takesBookings: false, active: true },
  { id: 's3', name: 'Su Su', role: 'staff', takesBookings: true, active: true },
];

describe('today summary', () => {
  test('uses one device-local midnight window that separates 23:59 from 00:01', () => {
    const window = businessDayWindow(now);
    const beforeMidnight = new Date(2026, 7, 1, 23, 59, 0).getTime();
    const afterMidnight = new Date(2026, 7, 2, 0, 1, 0).getTime();

    expect(window.day).toBe('2026-08-02');
    expect(beforeMidnight).toBeLessThan(window.startMs);
    expect(afterMidnight).toBeGreaterThanOrEqual(window.startMs);
    expect(afterMidnight).toBeLessThan(window.endMs);
  });

  test('groups only current-day completed sales and exposes every operational count', () => {
    const priorDay = sale({ id: 'prior', staffId: 's2', at: new Date(2026, 7, 1, 23, 59, 0).toISOString(), total: 999_000, payments: [{ id: 'p0', method: 'cash', amount: 999_000, at: null }] });
    const currentDay = sale({
      id: 'current', staffId: 's2', at: new Date(2026, 7, 2, 0, 1, 0).toISOString(), total: 100_000, credit: 10_000, needsReview: true,
      payments: [
        { id: 'p1', method: 'cash', amount: 40_000, at: null },
        { id: 'p2', method: 'kbzpay', amount: 20_000, at: null },
        { id: 'p3', method: 'wave', amount: 10_000, at: null },
        { id: 'p4', method: 'bank', amount: 20_000, at: null },
      ],
    });
    const voided = sale({ id: 'voided', staffId: 's3', at: new Date(2026, 7, 2, 0, 2, 0).toISOString(), total: 50_000, status: 'voided', payments: [{ id: 'p5', method: 'cash', amount: 50_000, at: null }] });

    const summary = summarizeToday({
      now,
      sales: [priorDay, currentDay, voided],
      patients: [patient('c1')],
      products: [product('low', 2, 2), product('healthy', 3, 2)],
      staff,
      outbox: { state: 'attention', pendingCount: 3, attentionCount: 1, drainProgress: 0 },
    });

    expect(summary.methodTotals).toMatchObject({ cash: 40_000, kbzpay: 20_000, wave: 10_000, otherMethods: 20_000, totalCollected: 90_000, credit: 10_000 });
    expect(summary.currentDaySales.map((row) => row.id)).toEqual(['current']);
    expect(summary.staffBreakdown).toEqual([{ staffId: 's2', name: 'Aye Aye', total: 100_000 }]);
    expect(summary.needsReviewCount).toBe(1);
    expect(summary.pendingCount).toBe(3);
    expect(summary.attentionCount).toBe(1);
    expect(summary.lowStock.map((row) => row.id)).toEqual(['low']);
  });

  test('uses exact aging-band edges for each positive debtor', () => {
    const debts = [7, 8, 30, 31, 60, 61].map((days, index) => sale({
      id: `debt-${days}`,
      patientId: `c${index + 1}`,
      staffId: 's2',
      at: new Date(now - days * 24 * 60 * 60 * 1_000).toISOString(),
      total: 10_000,
      credit: 10_000,
    }));

    const summary = summarizeToday({
      now,
      sales: debts,
      patients: debts.map((row) => patient(row.patientId!)),
      products: [],
      staff,
      outbox: { state: 'synced', pendingCount: 0, attentionCount: 0, drainProgress: 0 },
    });

    expect(summary.debtors.map((debtor) => [debtor.daysOutstanding, debtor.band])).toEqual([
      [7, '0-7'], [8, '8-30'], [30, '8-30'], [31, '31-60'], [60, '31-60'], [61, '61+'],
    ]);
  });
});
