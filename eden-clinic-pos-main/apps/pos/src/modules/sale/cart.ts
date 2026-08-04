import { cartSubtotal, cartTotal, change, lineTotal } from '@/data/money';
import type { CartLineDraft, SaleDraft, TenderDraft } from './types';

export function cartLineTotal(line: CartLineDraft, roundingStep: number): number {
  return lineTotal(line, roundingStep);
}

export function cartDraftSubtotal(lines: readonly CartLineDraft[], roundingStep: number): number {
  return cartSubtotal(lines, roundingStep);
}

export function cartDraftTotal(draft: SaleDraft, roundingStep: number): number {
  return cartTotal(draft.lines, draft.discountPct, roundingStep);
}

export function tenderTotal(tenders: readonly TenderDraft[]): number {
  return cartSubtotal(tenders.map((tender) => ({ qty: 1, unitPrice: tender.amount })), 1);
}

export function saleBalanceDue(total: number, paid: number): number {
  return change(total, paid);
}

export function saleChange(paid: number, total: number): number {
  return change(paid, total);
}
