import type { PaymentRow } from '@/data/types';

export type CartLineDraft = {
  id: string;
  kind: 'service' | 'product';
  itemId: string;
  nameSnapshot: string;
  qty: number;
  unitPrice: number;
  discountPct: number | null;
  note: string | null;
  lotNo: string | null;
  lotExpiry: string | null;
};

export type TenderDraft = {
  id: string;
  method: PaymentRow['method'];
  amount: number;
};

export type SaleDraft = {
  patientId: string | null;
  appointmentId: string | null;
  lines: CartLineDraft[];
  discountPct: number;
  discountApprovedBy: string | null;
};
