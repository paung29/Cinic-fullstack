import { describe, expect, it } from 'vitest';
import { appliedCashAmount, cashChange, cashPortionOf, cashShortfall, parseCashInput, quickCashAmounts, receivedCash } from '@/modules/sale/tenderSelectors';

describe('cash tender', () => {
  it('offers the notes a customer would actually hand over', () => {
    const amounts = quickCashAmounts(45_000);
    expect(amounts[0]).toBe(45_000);
    expect(amounts).toContain(50_000);
    expect(amounts.every((amount) => amount >= 45_000)).toBe(true);
    expect(new Set(amounts).size).toBe(amounts.length);
  });

  it('does not repeat the exact amount when the total is already a round note', () => {
    const amounts = quickCashAmounts(50_000);
    expect(amounts.filter((amount) => amount === 50_000)).toHaveLength(1);
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
  });

  it('has nothing to offer on an empty cart', () => {
    expect(quickCashAmounts(0)).toEqual([]);
  });

  it('computes change and shortfall as opposite sides of the same gap', () => {
    expect(cashChange(50_000, 45_000)).toBe(5_000);
    expect(cashShortfall(50_000, 45_000)).toBe(0);
    expect(cashChange(30_000, 45_000)).toBe(0);
    expect(cashShortfall(30_000, 45_000)).toBe(15_000);
    expect(cashChange(45_000, 45_000)).toBe(0);
  });

  it('records only what settles the sale, so change never inflates the drawer', () => {
    // Shift close sums recorded payment amounts into expected cash; banking
    // the tendered 50,000 would overstate the drawer by the 5,000 handed back.
    expect(appliedCashAmount(50_000, 45_000)).toBe(45_000);
    expect(appliedCashAmount(30_000, 45_000)).toBe(30_000);
  });

  it('reads what a hurried cashier types', () => {
    expect(parseCashInput('50,000')).toBe(50_000);
    expect(parseCashInput('50 000 Ks')).toBe(50_000);
    expect(parseCashInput('')).toBe(0);
    expect(parseCashInput('abc')).toBe(0);
  });
});

describe('split payments', () => {
  const split = [
    { amount: 20_000, method: 'cash' },
    { amount: 25_000, method: 'wave' },
  ];

  it('measures the cash portion, not the whole bill', () => {
    expect(cashPortionOf(split)).toBe(20_000);
    expect(cashPortionOf([{ amount: 45_000, method: 'kbzpay' }])).toBe(0);
    expect(cashPortionOf([])).toBe(0);
  });

  it('does not demand the full total in notes when the rest is on a wallet', () => {
    // Regression: change and shortfall were measured against the sale total,
    // so a split showed 25,000 short and Complete stayed disabled forever.
    const portion = cashPortionOf(split);
    expect(cashShortfall(20_000, portion)).toBe(0);
    expect(cashChange(20_000, portion)).toBe(0);
    expect(cashChange(50_000, portion)).toBe(30_000);
  });

  it('treats an untouched field as exact cash, so a sale is never blocked', () => {
    // Regression: any path that set a cash tender without opening the pad —
    // a split, a resumed ticket — left the field empty and read as zero paid.
    expect(receivedCash('', 20_000)).toBe(20_000);
    expect(cashShortfall(receivedCash('', 20_000), 20_000)).toBe(0);
    expect(receivedCash('  ', 45_000)).toBe(45_000);
    expect(receivedCash('50000', 45_000)).toBe(50_000);
    expect(receivedCash('0', 45_000)).toBe(0);
  });
});
