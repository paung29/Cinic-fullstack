import type { Clock } from '@/data/bootstrap';
import type { ClinicDb } from '@/data/db';
import { cartSubtotal, lineTotal } from '@/data/money';
import { enqueueOutbox } from '@/data/outbox';
import type { PaymentRow, SaleLineRow, SaleRow } from '@/data/types';
import {
  cartDraftSubtotal,
  cartDraftTotal,
  saleBalanceDue,
  tenderTotal,
} from './cart';
import type { CartLineDraft, SaleDraft, TenderDraft } from './types';
import { ticketMetaKey } from './tickets';

export type { CartLineDraft, SaleDraft, TenderDraft } from './types';

export type CaptureSaleInput = {
  db: ClinicDb;
  staffId: string;
  deviceId: string;
  draft: SaleDraft;
  tenders: readonly TenderDraft[];
  creditApprovedBy: string | null;
  createdOffline: boolean;
  clock: Clock;
  uuid(): string;
  resumedTicketId?: string;
};

export {
  cartDraftSubtotal,
  cartDraftTotal,
  saleBalanceDue,
  saleChange,
  tenderTotal,
} from './cart';

export async function captureSale(input: CaptureSaleInput): Promise<SaleRow> {
  const clinic = await input.db.clinic.toCollection().first();
  if (clinic === undefined) {
    throw new Error('The clinic configuration is unavailable.');
  }
  if (input.draft.lines.length === 0) {
    throw new Error('A sale needs at least one line.');
  }
  if (input.draft.discountPct > 20 && input.draft.discountApprovedBy === null) {
    throw new Error('A discount above 20% needs separate approval.');
  }

  const subtotal = cartDraftSubtotal(input.draft.lines, clinic.roundingStep);
  const total = cartDraftTotal(input.draft, clinic.roundingStep);
  const paid = tenderTotal(input.tenders);
  const balanceDue = saleBalanceDue(total, paid);
  const credit = balanceDue > 0 ? balanceDue : 0;

  if (credit > 0 && input.draft.patientId === null) {
    throw new Error('Pay later needs a named patient.');
  }
  if (credit > 0 && input.draft.patientId !== null) {
    const patientSales = await input.db.sales.where('patientId').equals(input.draft.patientId).toArray();
    const projectedCredit = cartSubtotal([
      ...patientSales.map((sale) => ({ qty: 1, unitPrice: sale.credit })),
      { qty: 1, unitPrice: credit },
    ], 1);
    if (projectedCredit > clinic.creditLimitMmk && input.creditApprovedBy === null) {
      throw new Error('Credit above the clinic limit needs separate approval.');
    }
  }

  const offset = await serverTimeOffset(input.db);
  const at = new Date(input.clock.now() + offset).toISOString();
  const saleId = input.uuid();
  const lines = input.draft.lines.map((line) => toSaleLine(line, input.uuid(), clinic.roundingStep));
  const payments = input.tenders.map((tender) => toPayment(tender, input.uuid(), at));
  const outboxUuid = input.uuid();
  const sale: SaleRow = {
    id: saleId,
    patientId: input.draft.patientId,
    staffId: input.staffId,
    practitionerId: null,
    appointmentId: input.draft.appointmentId,
    at,
    lines,
    payments,
    subtotal,
    discountPct: input.draft.discountPct === 0 ? null : input.draft.discountPct,
    discountApprovedBy: input.draft.discountApprovedBy,
    total,
    credit,
    creditApprovedBy: credit > 0 ? input.creditApprovedBy : null,
    followupDate: null,
    deviceId: input.deviceId,
    createdOffline: input.createdOffline,
    no: null,
    status: 'completed',
    needsReview: false,
    reviewReason: null,
    receivedAt: null,
  };

  await input.db.transaction('rw', input.db.sales, input.db.products, input.db.outbox, input.db.meta, async () => {
    await input.db.sales.add(sale);
    await applyProductStockDecrements(input.db, sale.lines);
    await enqueueOutbox(input.db, {
      kind: 'sale',
      uuid: outboxUuid,
      now: input.clock.now(),
      payloadRef: {
        source: 'entity',
        entity: { table: 'sales', id: sale.id },
        protectedEntities: [{ table: 'sales', id: sale.id }],
      },
    });
    if (input.resumedTicketId !== undefined) {
      await input.db.meta.delete(ticketMetaKey(input.resumedTicketId));
    }
  });

  return sale;
}

function toSaleLine(line: CartLineDraft, id: string, roundingStep: number): SaleLineRow {
  return {
    id,
    kind: line.kind,
    itemId: line.itemId,
    nameSnapshot: line.nameSnapshot,
    qty: line.qty,
    unitPrice: line.unitPrice,
    lineTotal: lineTotal(line, roundingStep),
    discountPct: line.discountPct,
    note: line.note,
    lotNo: line.lotNo,
    lotExpiry: line.lotExpiry,
  };
}

function toPayment(tender: TenderDraft, id: string, at: string): PaymentRow {
  return { id, method: tender.method, amount: tender.amount, at };
}

async function applyProductStockDecrements(db: ClinicDb, lines: readonly SaleLineRow[]): Promise<void> {
  for (const line of lines) {
    if (line.kind !== 'product') continue;
    const product = await db.products.get(line.itemId);
    if (product === undefined) {
      throw new Error(`Product ${line.itemId} is unavailable.`);
    }
    await db.products.update(product.id, { stockQty: product.stockQty - line.qty });
  }
}

async function serverTimeOffset(db: ClinicDb): Promise<number> {
  const row = await db.meta.get('serverTimeOffset');
  return typeof row?.value === 'number' ? row.value : 0;
}
