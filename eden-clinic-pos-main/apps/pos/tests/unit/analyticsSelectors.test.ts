import { describe, expect, it } from 'vitest';
import {
  abbreviateKs,
  bucketKey,
  bucketKeys,
  expensesForMonth,
  expensesInWindow,
  revenueSeries,
  saleCost,
  sumAmounts,
  type ExpenseEntry,
} from '@/modules/analytics/analyticsSelectors';
import type { ProductRow, SaleRow } from '@/data/types';

const product = (id: string, cost: number): ProductRow => ({
  id, name: id, category: 'Skin', subcategory: null, sortOrder: 0, barcode: null,
  cost, price: cost * 2, stockQty: 10, lowStockAt: 1, reorderAt: 1,
  stockType: 'retail', soldBy: 'each', requiresLot: false, requiresConsent: false,
  unitLabel: null, photoKey: null, lots: [], active: true,
});

const sale = (at: string, total: number, lines: SaleRow['lines'] = [], status: SaleRow['status'] = 'completed'): SaleRow => ({
  id: `s-${at}-${total}`, patientId: null, staffId: 's1', practitionerId: null, appointmentId: null,
  at, lines, payments: [], subtotal: total, discountPct: null, discountApprovedBy: null,
  total, credit: 0, creditApprovedBy: null, followupDate: null, deviceId: null,
  createdOffline: false, no: null, status, needsReview: false, reviewReason: null, receivedAt: null,
});

const line = (itemId: string, qty: number): SaleRow['lines'][number] => ({
  id: `${itemId}-${qty}`, kind: 'product', itemId, nameSnapshot: itemId, qty, unitPrice: 100,
  lineTotal: qty * 100, discountPct: null, note: null, lotNo: null, lotExpiry: null,
});

describe('bucketKey', () => {
  it('keeps daily keys as the day itself', () => {
    expect(bucketKey('2026-08-09', 'daily')).toBe('2026-08-09');
  });
  it('maps a week to its Monday', () => {
    expect(bucketKey('2026-08-09', 'weekly')).toBe('2026-08-03');
    expect(bucketKey('2026-08-03', 'weekly')).toBe('2026-08-03');
  });
  it('maps months and years to their prefixes', () => {
    expect(bucketKey('2026-08-09', 'monthly')).toBe('2026-08');
    expect(bucketKey('2026-08-09', 'yearly')).toBe('2026');
  });
});

describe('bucketKeys', () => {
  it('returns 14 contiguous days ending today', () => {
    const keys = bucketKeys('2026-08-09', 'daily');
    expect(keys).toHaveLength(14);
    expect(keys[0]).toBe('2026-07-27');
    expect(keys[13]).toBe('2026-08-09');
  });
  it('crosses month boundaries for monthly ranges', () => {
    const keys = bucketKeys('2026-02-10', 'monthly');
    expect(keys[0]).toBe('2025-03');
    expect(keys[11]).toBe('2026-02');
  });
  it('returns 4 years for yearly', () => {
    expect(bucketKeys('2026-08-09', 'yearly')).toEqual(['2023', '2024', '2025', '2026']);
  });
});

describe('revenueSeries', () => {
  const products = [product('p1', 9000)];
  it('sums revenue and product cost into the right buckets and skips voided sales', () => {
    const sales = [
      sale('2026-08-09T04:00:00.000Z', 45000, [line('p1', 2)]),
      sale('2026-08-09T06:00:00.000Z', 10000, [], 'voided'),
      sale('2026-08-01T06:00:00.000Z', 20000),
    ];
    const series = revenueSeries(sales, products, 'daily', '2026-08-09');
    const today = series[series.length - 1];
    expect(today?.revenue).toBe(45000);
    expect(today?.cost).toBe(18000);
    expect(series.reduce((total, point) => total + point.revenue, 0)).toBe(65000);
  });
  it('ignores sales outside the window', () => {
    const series = revenueSeries([sale('2020-01-01T00:00:00.000Z', 99999)], products, 'daily', '2026-08-09');
    expect(series.every((point) => point.revenue === 0)).toBe(true);
  });
});

describe('saleCost', () => {
  it('counts only product lines it can price', () => {
    const map = new Map([['p1', product('p1', 500)]]);
    const row = sale('2026-08-09T00:00:00.000Z', 1000, [line('p1', 3), { ...line('p1', 1), kind: 'service', itemId: 'v1' }]);
    expect(saleCost(row, map)).toBe(1500);
  });
});

describe('expenses windows', () => {
  const entries: ExpenseEntry[] = [
    { id: '1', label: 'Rent', cat: 'rent', amount: 300000, date: '2026-08-01' },
    { id: '2', label: 'Old rent', cat: 'rent', amount: 300000, date: '2026-06-01' },
    { id: '3', label: 'Ads', cat: 'marketing', amount: 50000, date: '2026-08-08' },
  ];
  it('filters entries into the daily window', () => {
    const within = expensesInWindow(entries, 'daily', '2026-08-09');
    expect(within.map((entry) => entry.id)).toEqual(['1', '3']);
  });
  it('keeps older entries for yearly windows', () => {
    expect(expensesInWindow(entries, 'yearly', '2026-08-09')).toHaveLength(3);
  });
  it('sums the current month only', () => {
    expect(sumAmounts(expensesForMonth(entries, '2026-08'))).toBe(350000);
  });
});

describe('abbreviateKs', () => {
  it('renders thousands and millions', () => {
    expect(abbreviateKs(45000)).toBe('45k Ks');
    expect(abbreviateKs(2450000)).toBe('2.5M Ks');
    expect(abbreviateKs(0)).toBe('0k Ks');
  });
});
