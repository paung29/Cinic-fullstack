import { change } from '@/data/money';

// Common Myanmar notes. A customer paying 45,000 hands over 50,000 far more
// often than they count out the exact amount, so the pad offers the notes
// they will actually reach for rather than making staff type every time.
const NOTE_STEPS = [1_000, 5_000, 10_000, 50_000, 100_000] as const;

export function quickCashAmounts(total: number, count = 4): number[] {
  if (total <= 0) return [];
  const amounts = new Set<number>([total]);
  for (const step of NOTE_STEPS) {
    const rounded = Math.ceil(total / step) * step;
    if (rounded > total) amounts.add(rounded);
  }
  return [...amounts].sort((a, b) => a - b).slice(0, count);
}

// Change and shortfall are measured against the CASH PORTION, not the sale
// total. On a split the customer hands over cash for part of the bill and
// pays the rest by wallet; comparing to the total would demand the whole
// amount in notes and wedge the sale.
export function cashChange(received: number, cashPortion: number): number {
  const due = change(received, cashPortion);
  return due > 0 ? due : 0;
}

export function cashShortfall(received: number, cashPortion: number): number {
  const short = cashPortion - received;
  return short > 0 ? short : 0;
}

export function cashPortionOf(tenders: readonly { method: string; amount: number }[]): number {
  return tenders.reduce((total, tender) => tender.method === 'cash' ? total + tender.amount : total, 0);
}

// An untouched field means "the customer handed over exactly the cash owed" —
// the common case, and the one that must never block completing a sale.
export function receivedCash(raw: string, cashPortion: number): number {
  return raw.trim() === '' ? cashPortion : parseCashInput(raw);
}

// The customer may hand over more than the bill, but only the amount that
// settles the sale is recorded — the rest goes back as change and must not
// inflate the drawer at shift close.
export function appliedCashAmount(received: number, total: number): number {
  return Math.min(received, total);
}

export function parseCashInput(raw: string): number {
  const digits = raw.replace(/[^\d]/g, '');
  return digits === '' ? 0 : Number(digits);
}
