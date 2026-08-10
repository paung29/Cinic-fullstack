import { describe, expect, it } from 'vitest';
import { cartLineTotal, steepestDiscountPct, type CartLineDraft, type SaleDraft } from '@/modules/sale/capture';

function line(overrides: Partial<CartLineDraft> = {}): CartLineDraft {
  return {
    id: 'l1',
    kind: 'service',
    itemId: 's1',
    nameSnapshot: 'Consultation',
    qty: 1,
    unitPrice: 20_000,
    discountPct: null,
    note: null,
    lotNo: null,
    lotExpiry: null,
    ...overrides,
  };
}

function draft(overrides: Partial<SaleDraft> = {}): SaleDraft {
  return { patientId: null, appointmentId: null, lines: [line()], discountPct: 0, discountApprovedBy: null, ...overrides };
}

describe('per-line discounts', () => {
  it('discounts one line without touching its neighbours', () => {
    expect(cartLineTotal(line({ discountPct: 25 }), 500)).toBe(15_000);
    expect(cartLineTotal(line(), 500)).toBe(20_000);
  });

  it('applies the line discount across the whole quantity', () => {
    expect(cartLineTotal(line({ discountPct: 10, qty: 3 }), 500)).toBe(54_000);
  });

  it('rounds the discounted line to the clinic step', () => {
    expect(cartLineTotal(line({ discountPct: 33, unitPrice: 10_000 }), 500)).toBe(6_500);
  });

  it('treats an untouched line as no discount', () => {
    expect(steepestDiscountPct(draft())).toBe(0);
  });

  it('reports the cart discount when it is the steepest', () => {
    expect(steepestDiscountPct(draft({ discountPct: 15, lines: [line({ discountPct: 5 })] }))).toBe(15);
  });

  // Without this, a cashier could take 100% off one line while the cart-wide
  // figure sat at an unremarkable 0%, and never meet the >20% approval gate.
  it('reports a steep single line over a mild cart discount', () => {
    const steep = draft({ discountPct: 0, lines: [line(), line({ id: 'l2', discountPct: 100 })] });
    expect(steepestDiscountPct(steep)).toBe(100);
  });
});
