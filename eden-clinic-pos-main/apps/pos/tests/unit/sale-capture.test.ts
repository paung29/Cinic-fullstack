import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createClinicDb, type ClinicDb } from '@/data/db';
import { cartSubtotal, cartTotal, change, fmtMMK, lineTotal } from '@/data/money';
import { createOutbox } from '@/data/outbox';
import { toWireSale, type ClinicRow, type ProductRow, type ServiceRow } from '@/data/types';
import {
  captureSale,
  cartDraftSubtotal,
  cartDraftTotal,
  saleBalanceDue,
  saleChange,
  tenderTotal,
  type CaptureSaleInput,
  type SaleDraft,
  type TenderDraft,
} from '@/modules/sale/capture';
import { saveTicket, ticketMetaKey, type SaleTicket } from '@/modules/sale/tickets';

const databaseNames: string[] = [];
let databases: ClinicDb[] = [];

const clinic: ClinicRow = {
  id: 'clinic-1',
  name: 'Eden Clinic',
  phone: '',
  address: '',
  roundingStep: 500,
  creditLimitMmk: 100_000,
  receipt: {},
  receiptFooter: '',
  logoUrl: '',
  receiptQr: true,
  receiptNextVisit: true,
  receiptTemplate: 'classic',
  receiptHeaderFont: 'sans',
  receiptDivider: 'line',
  consentMode: 'warn',
  addons: {},
  featureFlags: {},
};

const service: ServiceRow = {
  id: 'service-1',
  category: 'Facial',
  nameMm: 'Facial',
  nameEn: 'Facial',
  price: 15_000,
  durationMin: 45,
  requiresLot: false,
  defaultFollowupDays: null,
  active: true,
};

const retailProduct: ProductRow = {
  id: 'product-1',
  name: 'Aftercare',
  category: 'Retail',
  subcategory: null,
  sortOrder: 0,
  barcode: '1234567890123',
  cost: 5_000,
  price: 20_000,
  stockQty: 7,
  lowStockAt: 2,
  reorderAt: 2,
  stockType: 'retail',
  soldBy: 'each',
  requiresLot: false,
  requiresConsent: false,
  unitLabel: null,
  photoKey: null,
  lots: [],
  active: true,
};

const weightProduct: ProductRow = {
  ...retailProduct,
  id: 'product-weight',
  name: 'Weight product',
  barcode: null,
  soldBy: 'weight',
  stockQty: 10,
};

function draft(overrides: Partial<SaleDraft> = {}): SaleDraft {
  return {
    patientId: 'p1',
    appointmentId: null,
    discountPct: 0,
    discountApprovedBy: null,
    lines: [
      {
        id: 'draft-service',
        kind: 'service',
        itemId: service.id,
        nameSnapshot: service.nameMm,
        qty: 1,
        unitPrice: service.price,
        discountPct: null,
        note: null,
        lotNo: null,
        lotExpiry: null,
      },
      {
        id: 'draft-product',
        kind: 'product',
        itemId: retailProduct.id,
        nameSnapshot: retailProduct.name,
        qty: 2,
        unitPrice: retailProduct.price,
        discountPct: null,
        note: null,
        lotNo: null,
        lotExpiry: null,
      },
    ],
    ...overrides,
  };
}

function tenders(overrides: readonly TenderDraft[] = [{ id: 'cash', method: 'cash', amount: 55_000 }]): TenderDraft[] {
  return [...overrides];
}

function uuids(...values: string[]): () => string {
  let index = 0;
  return () => values[index++] ?? `unused-${index}`;
}

async function createDatabase(): Promise<ClinicDb> {
  const name = `eden-sale-capture-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const db = createClinicDb(name);
  databases.push(db);
  await db.open();
  await db.clinic.put(clinic);
  await db.services.put(service);
  await db.products.bulkPut([retailProduct, weightProduct]);
  await db.patients.put({
    id: 'p1',
    code: null,
    name: 'Ma Thida',
    phone: '09 771 234 560',
    sex: null,
    allergies: 'Latex',
    alertNote: null,
    telegramLinked: false,
    followupDate: null,
  });
  await db.meta.put({ key: 'serverTimeOffset', value: 2_000 });
  return db;
}

function input(db: ClinicDb, overrides: Partial<CaptureSaleInput> = {}): CaptureSaleInput {
  return {
    db,
    staffId: 's2',
    deviceId: 'device-1',
    draft: draft(),
    tenders: tenders(),
    creditApprovedBy: null,
    createdOffline: true,
    clock: { now: () => Date.parse('2026-07-31T12:00:00.000Z') },
    uuid: uuids('sale-1', 'line-1', 'line-2', 'payment-1', 'outbox-1'),
    ...overrides,
  };
}

beforeEach(() => {
  Dexie.dependencies.indexedDB = indexedDB;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  databases = [];
});

afterEach(async () => {
  for (const db of databases) db.close();
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe('sale capture', () => {
  test('delegates every draft and tender amount to the money API', () => {
    const saleDraft = draft({ lines: [{ ...draft().lines[0]!, qty: 2, discountPct: 10 }] });
    const saleTenders = tenders([{ id: 'cash', method: 'cash', amount: 40_000 }, { id: 'wave', method: 'wave', amount: 10_000 }]);

    expect(cartDraftSubtotal(saleDraft.lines, clinic.roundingStep)).toBe(cartSubtotal(saleDraft.lines, clinic.roundingStep));
    expect(cartDraftTotal(saleDraft, clinic.roundingStep)).toBe(cartTotal(saleDraft.lines, saleDraft.discountPct, clinic.roundingStep));
    expect(lineTotal(saleDraft.lines[0]!, clinic.roundingStep)).toBe(27_000);
    expect(tenderTotal(saleTenders)).toBe(cartSubtotal(saleTenders.map((tender) => ({ qty: 1, unitPrice: tender.amount })), 1));
    expect(saleBalanceDue(cartDraftTotal(saleDraft, clinic.roundingStep), tenderTotal(saleTenders))).toBe(change(cartDraftTotal(saleDraft, clinic.roundingStep), tenderTotal(saleTenders)));
    expect(saleChange(tenderTotal(saleTenders), cartDraftTotal(saleDraft, clinic.roundingStep))).toBe(change(tenderTotal(saleTenders), cartDraftTotal(saleDraft, clinic.roundingStep)));
    expect(fmtMMK(cartDraftTotal(saleDraft, clinic.roundingStep))).toBe('27,000 Ks');
  });

  test('writes a stock-adjusted sale and a drainable entity-backed outbox row atomically', async () => {
    const db = await createDatabase();
    const captured = await captureSale(input(db));

    expect(captured).toMatchObject({
      id: 'sale-1',
      staffId: 's2',
      createdOffline: true,
      at: '2026-07-31T12:00:02.000Z',
      subtotal: 55_000,
      total: 55_000,
      credit: 0,
    });
    expect(captured.lines.map((line) => line.id)).toEqual(['line-1', 'line-2']);
    expect(captured.payments.map((payment) => payment.id)).toEqual(['payment-1']);
    expect(await db.products.get(retailProduct.id)).toMatchObject({ stockQty: 5 });
    expect(await db.services.get(service.id)).toEqual(service);
    expect(await db.outbox.toArray()).toMatchObject([{
      uuid: 'outbox-1',
      kind: 'sale',
      status: 'pending',
      payloadRef: {
        source: 'entity',
        entity: { table: 'sales', id: 'sale-1' },
        protectedEntities: [{ table: 'sales', id: 'sale-1' }],
      },
    }]);

    const outbox = createOutbox({
      db,
      api: { dispatch: async (item) => item.kind === 'sale' ? { sale: toWireSale(captured), replayed: false } : Promise.reject(new Error('Unexpected item')) },
      clock: { now: () => Date.parse('2026-07-31T12:00:00.000Z') },
      jitter: (baseMs) => baseMs,
    });
    await outbox.drain();
    expect(await db.outbox.toArray()).toMatchObject([{ status: 'done' }]);
  });

  test('rolls all capture writes back when a duplicate sale UUID rejects the transaction', async () => {
    const db = await createDatabase();
    const existing = await captureSale(input(db));
    const ticket: SaleTicket = { id: 'ticket-1', staffId: 's2', savedAt: existing.at, draft: draft() };
    await saveTicket(db, ticket);
    const stockBefore = (await db.products.get(retailProduct.id))?.stockQty;
    const outboxBefore = await db.outbox.count();

    await expect(captureSale(input(db, {
      resumedTicketId: ticket.id,
      uuid: uuids(existing.id, 'line-new-1', 'line-new-2', 'payment-new', 'outbox-new'),
    }))).rejects.toThrow();

    expect((await db.products.get(retailProduct.id))?.stockQty).toBe(stockBefore);
    expect(await db.outbox.count()).toBe(outboxBefore);
    expect(await db.meta.get(ticketMetaKey(ticket.id))).toBeDefined();
  });

  test('requires a named patient and separate approval for over-limit credit, then persists that approver', async () => {
    const db = await createDatabase();
    const unpaid = tenders([]);
    await db.clinic.update(clinic.id, { creditLimitMmk: 50_000 });

    await expect(captureSale(input(db, { draft: draft({ patientId: null }), tenders: unpaid }))).rejects.toThrow('named patient');
    await expect(captureSale(input(db, { tenders: unpaid }))).rejects.toThrow('approval');

    const captured = await captureSale(input(db, {
      tenders: unpaid,
      creditApprovedBy: 's1',
      uuid: uuids('sale-credit', 'line-credit-1', 'line-credit-2', 'outbox-credit'),
    }));
    expect(captured).toMatchObject({ credit: 55_000, creditApprovedBy: 's1' });
  });
});
