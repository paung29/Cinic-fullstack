import { describe, expect, test } from 'vitest';
import {
  cartSubtotal,
  cartTotal,
  change,
  fmtMMK,
  lineTotal,
  marginPct,
  cashDifference,
  expectedCash,
  paymentMethodTotals,
  patientOutstanding,
  roundToStep,
  type MoneyLine,
} from '@/data/money';

function createDeterministicRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function independentlyRoundedLine(line: MoneyLine, step: number): number {
  return Math.round((line.qty * line.unitPrice * (1 - (line.discountPct ?? 0) / 100)) / step) * step;
}

describe('money', () => {
  test('reconciles completed tender methods while keeping credit outside collected money', () => {
    const sales = [
      {
        status: 'completed', credit: 7_000,
        payments: [
          { method: 'cash', amount: 10_000 },
          { method: 'kbzpay', amount: 20_000 },
          { method: 'wave', amount: 30_000 },
          { method: 'bank', amount: 40_000 },
          { method: 'other', amount: 50_000 },
          { method: 'writeoff', amount: 60_000 },
        ],
      },
      {
        status: 'voided', credit: 99_000,
        payments: [{ method: 'cash', amount: 99_000 }],
      },
    ] as const;

    expect(paymentMethodTotals(sales)).toEqual({
      cash: 10_000,
      kbzpay: 20_000,
      wave: 30_000,
      otherMethods: 150_000,
      totalCollected: 210_000,
      credit: 7_000,
    });
    expect(expectedCash(100_000, 55_000)).toBe(155_000);
    expect(cashDifference(160_000, 155_000)).toBe(5_000);
  });

  test('maintains the collected-method reconciliation invariant across deterministic sales', () => {
    const random = createDeterministicRandom(0x0ddba11);
    const methods = ['cash', 'kbzpay', 'wave', 'bank', 'other', 'writeoff'] as const;

    for (let example = 0; example < 1_000; example += 1) {
      const sales = Array.from({ length: 1 + Math.floor(random() * 6) }, (_, saleIndex) => ({
        status: saleIndex % 5 === 0 ? 'voided' as const : 'completed' as const,
        credit: Math.floor(random() * 50_000),
        payments: Array.from({ length: 1 + Math.floor(random() * 4) }, (_, paymentIndex) => ({
          method: methods[(saleIndex + paymentIndex) % methods.length]!,
          amount: Math.floor(random() * 100_000),
        })),
      }));
      const totals = paymentMethodTotals(sales);

      expect(totals.cash + totals.kbzpay + totals.wave + totals.otherMethods, `example ${example}`).toBe(totals.totalCollected);
    }
  });

  test('applies the clinic rounding contract to hand-checked examples', () => {
    expect(roundToStep(12_249, 500)).toBe(12_000);
    expect(roundToStep(12_250, 500)).toBe(12_500);
    expect(lineTotal({ qty: 2, unitPrice: 12_000, discountPct: 10 }, 500)).toBe(21_500);
    expect(cartSubtotal([{ qty: 1, unitPrice: 12_000 }, { qty: 2, unitPrice: 6_000 }], 500)).toBe(24_000);
    expect(cartTotal([{ qty: 1, unitPrice: 12_000 }], 10, 500)).toBe(11_000);
    expect(change(15_000, 12_500)).toBe(2_500);
    expect(marginPct(9_000, 18_000)).toBe(50);
    expect(marginPct(180_000, 0)).toBeNull();
    expect(fmtMMK(12_500)).toBe('12,500 Ks');
    expect(patientOutstanding([
      { credit: 12_500, status: 'completed' },
      { credit: 5_000, status: 'completed' },
      { credit: 99_000, status: 'voided' },
    ])).toBe(17_500);
  });

  test('matches independently calculated rounding across 1,000 deterministic carts', () => {
    const random = createDeterministicRandom(0x00c0ffee);
    const steps = [100, 500, 1_000] as const;

    for (let cartNumber = 0; cartNumber < 1_000; cartNumber += 1) {
      const step = steps[Math.floor(random() * steps.length)];
      const lines: MoneyLine[] = Array.from({ length: 1 + Math.floor(random() * 8) }, () => ({
        qty: 1 + Math.floor(random() * 10),
        unitPrice: 100 + Math.floor(random() * 200_000),
        discountPct: Math.floor(random() * 51),
      }));
      const cartDiscPct = Math.floor(random() * 31);
      const expectedSubtotal = lines.reduce(
        (sum, line) => sum + independentlyRoundedLine(line, step),
        0,
      );
      const expectedTotal = Math.round((expectedSubtotal * (1 - cartDiscPct / 100)) / step) * step;
      const actualSubtotal = cartSubtotal(lines, step);
      const actualTotal = cartTotal(lines, cartDiscPct, step);

      expect(actualSubtotal, `cart ${cartNumber} subtotal`).toBe(expectedSubtotal);
      expect(actualTotal, `cart ${cartNumber} total`).toBe(expectedTotal);
      expect(Number.isInteger(actualSubtotal), `cart ${cartNumber} subtotal is integer MMK`).toBe(true);
      expect(Number.isInteger(actualTotal), `cart ${cartNumber} total is integer MMK`).toBe(true);
      expect(change(actualTotal + step, actualTotal), `cart ${cartNumber} change is non-negative`).toBe(step);
    }
  });
});
