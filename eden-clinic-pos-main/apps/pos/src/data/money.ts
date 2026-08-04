// LAW-5: integer-MMK arithmetic is centralized here.
export type MoneyLine = {
  qty: number;
  unitPrice: number;
  discountPct?: number | null;
};

export type OutstandingSale = {
  credit: number;
  status: 'completed' | 'voided';
};

export type PaymentMethodSale = OutstandingSale & {
  payments: readonly {
    method: 'cash' | 'kbzpay' | 'wave' | 'bank' | 'other' | 'writeoff';
    amount: number;
  }[];
};

export type MethodTotals = {
  cash: number;
  kbzpay: number;
  wave: number;
  otherMethods: number;
  totalCollected: number;
  credit: number;
};

export function roundToStep(n: number, step: number): number {
  return Math.round(n / step) * step;
}

export function lineTotal(line: MoneyLine, step: number): number {
  const discountPct = line.discountPct ?? 0;
  return roundToStep(line.qty * line.unitPrice * (1 - discountPct / 100), step);
}

export function cartSubtotal(lines: readonly MoneyLine[], step: number): number {
  return lines.reduce((subtotal, line) => subtotal + lineTotal(line, step), 0);
}

export function cartTotal(lines: readonly MoneyLine[], cartDiscPct: number, step: number): number {
  return roundToStep(cartSubtotal(lines, step) * (1 - cartDiscPct / 100), step);
}

export function change(tendered: number, total: number): number {
  return tendered - total;
}

export function expectedCash(openingCash: number, cashSales: number): number {
  return openingCash + cashSales;
}

export function cashDifference(countedCash: number, expected: number): number {
  return countedCash - expected;
}

export function paymentMethodTotals(sales: readonly PaymentMethodSale[]): MethodTotals {
  const totals: MethodTotals = {
    cash: 0,
    kbzpay: 0,
    wave: 0,
    otherMethods: 0,
    totalCollected: 0,
    credit: 0,
  };

  for (const sale of sales) {
    if (sale.status !== 'completed') continue;
    totals.credit += sale.credit;
    for (const payment of sale.payments) {
      if (payment.method === 'cash') totals.cash += payment.amount;
      else if (payment.method === 'kbzpay') totals.kbzpay += payment.amount;
      else if (payment.method === 'wave') totals.wave += payment.amount;
      else totals.otherMethods += payment.amount;
    }
  }

  totals.totalCollected = totals.cash + totals.kbzpay + totals.wave + totals.otherMethods;
  return totals;
}

export function patientOutstanding(sales: readonly OutstandingSale[]): number {
  return cartSubtotal(
    sales
      .filter((sale) => sale.status === 'completed')
      .map((sale) => ({ qty: 1, unitPrice: sale.credit })),
    1,
  );
}

export function marginPct(cost: number, price: number): number | null {
  if (cost <= 0 || price <= 0) {
    return null;
  }

  return Math.round(((price - cost) / price) * 100);
}

export function marginBand(cost: number, price: number): 'high' | 'medium' | 'low' | 'none' {
  const margin = marginPct(cost, price);
  if (margin === null) return 'none';
  if (margin >= 40) return 'high';
  if (margin >= 20) return 'medium';
  return 'low';
}

export function fmtMMK(n: number): string {
  return `${new Intl.NumberFormat('en-US').format(n)} Ks`;
}
