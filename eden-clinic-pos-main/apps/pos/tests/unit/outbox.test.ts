import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ApiAuthError, ApiHttpError, ApiNetworkError, type ApiClient } from '@/data/api';
import { createClinicDb, deferredMetaKey, type ClinicDb } from '@/data/db';
import { consumeSalePrefill, stageSalePrefill } from '@/data/salePrefill';
import {
  buildOutboxRow,
  createOutbox,
  enqueueOutbox,
  type OutboxEnqueueInput,
} from '@/data/outbox';
import { toWireSale, type PatientRow, type SaleRow } from '@/data/types';

const databaseNames: string[] = [];
let databases: ClinicDb[] = [];

function createClock(initialNow = 0): { clock: { now(): number }; setNow(value: number): void } {
  let currentNow = initialNow;

  return {
    clock: { now: () => currentNow },
    setNow(value: number): void {
      currentNow = value;
    },
  };
}

function patient(id: string): PatientRow {
  return {
    id,
    code: null,
    name: `Patient ${id}`,
    phone: `09 771 234 ${id.length.toString().padStart(3, '0')}`,
    sex: null,
    allergies: null,
    alertNote: null,
    telegramLinked: false,
    followupDate: null,
  };
}

function sale(id: string, patientId: string | null = null, itemName = 'Original treatment'): SaleRow {
  return {
    id,
    patientId,
    staffId: 'staff-1',
    practitionerId: null,
    appointmentId: null,
    at: '2026-07-31T12:00:00.000Z',
    lines: [
      {
        id: `${id}-line`,
        kind: 'service',
        itemId: 'service-1',
        nameSnapshot: itemName,
        qty: 1,
        unitPrice: 12_000,
        lineTotal: 12_000,
        discountPct: null,
        note: null,
        lotNo: null,
        lotExpiry: null,
      },
    ],
    payments: [],
    subtotal: 12_000,
    discountPct: null,
    discountApprovedBy: null,
    total: 12_000,
    credit: 12_000,
    creditApprovedBy: null,
    followupDate: null,
    deviceId: 'device-1',
    createdOffline: true,
    no: null,
    status: 'completed',
    needsReview: false,
    reviewReason: null,
    receivedAt: null,
  };
}

function saleEnqueueInput(id: string, overrides: Partial<OutboxEnqueueInput> = {}): OutboxEnqueueInput {
  return {
    kind: 'sale',
    uuid: `outbox-${id}`,
    payloadRef: {
      source: 'entity',
      entity: { table: 'sales', id },
      protectedEntities: [{ table: 'sales', id }],
    },
    now: 0,
    ...overrides,
  };
}

async function createDatabase(): Promise<ClinicDb> {
  const name = `eden-outbox-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const db = createClinicDb(name);
  databases.push(db);
  await db.open();
  return db;
}

function createOutboxFor(
  db: ClinicDb,
  dispatch: Pick<ApiClient, 'dispatch'>['dispatch'],
  now = 0,
) {
  const time = createClock(now);
  return {
    ...time,
    outbox: createOutbox({
      db,
      api: { dispatch },
      clock: time.clock,
      jitter: (baseMs) => baseMs,
    }),
  };
}

beforeEach(() => {
  Dexie.dependencies.indexedDB = indexedDB;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  databases = [];
});

afterEach(async () => {
  for (const db of databases) {
    db.close();
  }
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe('outbox', () => {
  test('builds and enqueues a typed row that drains without caller-side row construction', async () => {
    const db = await createDatabase();
    const localSale = sale('sale-1');
    await db.sales.put(localSale);
    const input = saleEnqueueInput(localSale.id);

    expect(buildOutboxRow(input)).toMatchObject({
      kind: 'sale',
      uuid: 'outbox-sale-1',
      status: 'pending',
      attempts: 0,
      nextAt: 0,
    });
    const seq = await enqueueOutbox(db, input);
    const { outbox } = createOutboxFor(db, async () => ({ sale: toWireSale(localSale), replayed: true }));

    await outbox.drain();

    expect(await db.outbox.get(seq)).toMatchObject({ status: 'done' });
  });

  test('drains a typed appointment status row through the documented update dispatch', async () => {
    const db = await createDatabase();
    await db.appointments.put({
      id: 'appointment-status-1',
      date: '2026-08-01',
      time: '09:30',
      staffId: 's1',
      patientId: 'c1',
      serviceId: 'v1',
      status: 'booked',
      syncConflict: false,
    });
    const seq = await enqueueOutbox(db, {
      kind: 'appointmentStatus',
      uuid: 'appointment-status-outbox-1',
      payloadRef: {
        source: 'inline',
        payload: { appointment_id: 'appointment-status-1', status: 'here' },
        protectedEntities: [{ table: 'appointments', id: 'appointment-status-1' }],
      },
      now: 0,
    });
    const dispatched: string[] = [];
    const { outbox } = createOutboxFor(db, async (item) => {
      if (item.kind !== 'appointmentStatus') {
        throw new Error('Expected an appointment status update.');
      }

      dispatched.push(`${item.appointmentId}:${item.payload.status}`);
      return {
        appointment: {
          id: 'appointment-status-1',
          date: '2026-08-01',
          time: '09:30',
          staff_id: 's1',
          patient_id: 'c1',
          service_id: 'v1',
          status: 'here',
        },
      };
    });

    await outbox.drain();

    expect(dispatched).toEqual(['appointment-status-1:here']);
    expect(await db.outbox.get(seq)).toMatchObject({ status: 'done' });
    expect(await db.appointments.get('appointment-status-1')).toMatchObject({ status: 'here' });
  });

  test('backs off a 5xx from 30 seconds after the injected clock time', async () => {
    const db = await createDatabase();
    const localSale = sale('sale-5xx');
    await db.sales.put(localSale);
    const seq = await enqueueOutbox(db, saleEnqueueInput(localSale.id));
    const { outbox } = createOutboxFor(db, async () => {
      throw new ApiHttpError(500, 'CHAOS', 'simulated failure');
    }, 10_000);

    await outbox.drain();

    expect(await db.outbox.get(seq)).toMatchObject({
      status: 'pending',
      attempts: 1,
      nextAt: 40_000,
    });
  });

  test('recovers a durable in-flight item by safely replaying it after a restart', async () => {
    const db = await createDatabase();
    const localSale = sale('sale-recover-inflight');
    await db.sales.put(localSale);
    const interrupted = buildOutboxRow(saleEnqueueInput(localSale.id));
    interrupted.status = 'inflight';
    const seq = await db.outbox.add(interrupted);
    const { outbox } = createOutboxFor(db, async () => ({ sale: toWireSale(localSale), replayed: true }));

    await outbox.drain();

    expect(await db.outbox.get(seq)).toMatchObject({ status: 'done' });
  });

  test('parks only a non-auth 4xx row and continues an independent item', async () => {
    const db = await createDatabase();
    const malformed = sale('sale-malformed');
    const succeeding = sale('sale-succeeds');
    await db.sales.bulkPut([malformed, succeeding]);
    const malformedSeq = await enqueueOutbox(db, saleEnqueueInput(malformed.id));
    const successfulSeq = await enqueueOutbox(db, saleEnqueueInput(succeeding.id));
    const { outbox } = createOutboxFor(db, async (item) => {
      if (item.kind === 'sale' && item.payload.id === malformed.id) {
        throw new ApiHttpError(400, 'MALFORMED', 'bad payload');
      }

      if (item.kind !== 'sale') {
        throw new Error('Expected a sale dispatch.');
      }

      return { sale: toWireSale(succeeding), replayed: false };
    });

    await outbox.drain();

    expect(await db.outbox.get(malformedSeq)).toMatchObject({
      status: 'attention',
      lastErrorStatus: 400,
      lastErrorCode: 'MALFORMED',
    });
    expect(await db.outbox.get(successfulSeq)).toMatchObject({ status: 'done' });
  });

  test('holds a dependent child while its parent is pending or parked for attention', async () => {
    const db = await createDatabase();
    const parentSale = sale('parent-sale');
    const childSale = sale('child-sale');
    await db.sales.bulkPut([parentSale, childSale]);
    const parentSeq = await enqueueOutbox(db, saleEnqueueInput(parentSale.id, { now: 10_000 }));
    const childSeq = await enqueueOutbox(
      db,
      saleEnqueueInput(childSale.id, { dependsOnUuid: `outbox-${parentSale.id}` }),
    );
    const { outbox } = createOutboxFor(db, async () => {
      throw new Error('A blocked child must not dispatch.');
    });

    await outbox.drain();
    expect(await db.outbox.get(childSeq)).toMatchObject({ status: 'pending', attempts: 0 });

    await db.outbox.update(parentSeq, { status: 'attention' });
    await outbox.drain();
    expect(await db.outbox.get(childSeq)).toMatchObject({ status: 'pending', attempts: 0 });
  });

  test('rewrites local and queued patient references before a merged parent allows its child to send', async () => {
    const db = await createDatabase();
    const localPatient = patient('patient-offline');
    const localSale = sale('sale-after-merge', localPatient.id);
    await db.patients.put(localPatient);
    await db.sales.put(localSale);
    await db.appointments.put({
      id: 'appointment-after-merge',
      date: '2026-08-01',
      time: '09:30',
      staffId: 'staff-1',
      patientId: localPatient.id,
      serviceId: 'service-1',
      status: 'booked',
      syncConflict: false,
    });
    await db.contacts.put({
      id: 'contact-after-merge',
      patientId: localPatient.id,
      saleId: null,
      at: null,
      channel: 'phone',
      direction: 'out',
      outcome: null,
      note: null,
      automated: false,
    });
    await enqueueOutbox(db, {
      kind: 'patient',
      uuid: 'patient-create',
      payloadRef: {
        source: 'entity',
        entity: { table: 'patients', id: localPatient.id },
        protectedEntities: [{ table: 'patients', id: localPatient.id }],
      },
      now: 0,
    });
    const childSeq = await enqueueOutbox(db, {
      ...saleEnqueueInput(localSale.id),
      uuid: 'sale-after-merge-create',
      dependsOnUuid: 'patient-create',
      payloadRef: {
        source: 'entity',
        entity: { table: 'sales', id: localSale.id },
        protectedEntities: [
          { table: 'sales', id: localSale.id },
          { table: 'patients', id: localPatient.id },
        ],
      },
    });
    const sentPatientIds: Array<string | null | undefined> = [];
    const { outbox } = createOutboxFor(db, async (item) => {
      if (item.kind === 'patient') {
        return {
          patient: {
            id: 'patient-server',
            name: 'Existing patient',
            phone: localPatient.phone,
          },
          merged_into: 'patient-server',
        };
      }

      if (item.kind !== 'sale') {
        throw new Error('Expected a patient then a sale.');
      }

      sentPatientIds.push(item.payload.patient_id);
      return { sale: toWireSale({ ...localSale, patientId: 'patient-server' }), replayed: false };
    });

    await outbox.drain();

    expect(sentPatientIds).toEqual(['patient-server']);
    expect(await db.sales.get(localSale.id)).toMatchObject({ patientId: 'patient-server' });
    expect(await db.appointments.get('appointment-after-merge')).toMatchObject({ patientId: 'patient-server' });
    expect(await db.contacts.get('contact-after-merge')).toMatchObject({ patientId: 'patient-server' });
    expect(await db.outbox.get(childSeq)).toMatchObject({
      status: 'done',
      payloadRef: { protectedEntities: [{ table: 'sales', id: localSale.id }, { table: 'patients', id: 'patient-server' }] },
    });
  });

  test('rewrites a staged sale prefill patient reference when the server merges an offline patient', async () => {
    const db = await createDatabase();
    const localPatient = patient('patient-prefill-offline');
    await db.patients.put(localPatient);
    await stageSalePrefill(db, {
      appointmentId: 'appointment-prefill-1',
      patientId: localPatient.id,
      serviceId: 'service-1',
    });
    await enqueueOutbox(db, {
      kind: 'patient',
      uuid: 'patient-prefill-create',
      payloadRef: {
        source: 'entity',
        entity: { table: 'patients', id: localPatient.id },
        protectedEntities: [{ table: 'patients', id: localPatient.id }],
      },
      now: 0,
    });
    const { outbox } = createOutboxFor(db, async () => ({
      patient: { id: 'patient-authoritative', name: 'Existing patient', phone: localPatient.phone },
      merged_into: 'patient-authoritative',
    }));

    await outbox.drain();

    await expect(consumeSalePrefill(db)).resolves.toEqual({
      appointmentId: 'appointment-prefill-1',
      patientId: 'patient-authoritative',
      serviceId: 'service-1',
    });
  });

  test('rewrites product-backed sale sources before a barcode-merged parent allows its child to send', async () => {
    const db = await createDatabase();
    await db.products.put({
      id: 'product-offline',
      name: 'Offline product',
      category: 'Aftercare',
      subcategory: null,
      sortOrder: 0,
      barcode: '8850123456789',
      cost: 9_000,
      price: 18_000,
      stockQty: 1,
      lowStockAt: 1,
      reorderAt: 1,
      stockType: 'retail',
      soldBy: 'each',
      requiresLot: false,
      requiresConsent: false,
      unitLabel: null,
      photoKey: null,
      lots: [],
      active: true,
    });
    const localSale = sale('sale-after-product-merge');
    localSale.lines[0] = { ...localSale.lines[0]!, kind: 'product', itemId: 'product-offline' };
    await db.sales.put(localSale);
    await enqueueOutbox(db, {
      kind: 'product',
      uuid: 'product-create',
      payloadRef: {
        source: 'entity',
        entity: { table: 'products', id: 'product-offline' },
        protectedEntities: [{ table: 'products', id: 'product-offline' }],
      },
      now: 0,
    });
    await enqueueOutbox(db, {
      ...saleEnqueueInput(localSale.id),
      uuid: 'sale-after-product-merge-create',
      dependsOnUuid: 'product-create',
      payloadRef: {
        source: 'entity',
        entity: { table: 'sales', id: localSale.id },
        protectedEntities: [
          { table: 'sales', id: localSale.id },
          { table: 'products', id: 'product-offline' },
        ],
      },
    });
    const sentItemIds: string[] = [];
    const { outbox } = createOutboxFor(db, async (item) => {
      if (item.kind === 'product') {
        return {
          product: {
            id: 'product-server',
            name: 'Existing product',
            price: 18_000,
            stock_type: 'retail',
            sold_by: 'each',
          },
          merged_into: 'product-server',
        };
      }
      if (item.kind !== 'sale') {
        throw new Error('Expected a product then a sale.');
      }

      sentItemIds.push(item.payload.lines[0]!.item_id);
      return { sale: item.payload, replayed: false };
    });

    await outbox.drain();

    expect(sentItemIds).toEqual(['product-server']);
    expect(await db.sales.get(localSale.id)).toMatchObject({ lines: [{ itemId: 'product-server' }] });
  });

  test('restores every outbox byte when authentication fails during a drain', async () => {
    const db = await createDatabase();
    const localSale = sale('sale-auth');
    await db.sales.put(localSale);
    await enqueueOutbox(db, saleEnqueueInput(localSale.id));
    const before = JSON.stringify(await db.outbox.toArray());
    const { outbox } = createOutboxFor(db, async () => {
      throw new ApiAuthError();
    });

    const status = await outbox.drain();

    expect(JSON.stringify(await db.outbox.toArray())).toBe(before);
    expect(status.state).not.toBe('attention');
  });

  test('re-reads the entity source immediately before dispatch', async () => {
    const db = await createDatabase();
    const localSale = sale('sale-reread');
    await db.sales.put(localSale);
    await enqueueOutbox(db, saleEnqueueInput(localSale.id));
    await db.sales.put(sale(localSale.id, null, 'Updated treatment'));
    const dispatchedNames: string[] = [];
    const { outbox } = createOutboxFor(db, async (item) => {
      if (item.kind !== 'sale') {
        throw new Error('Expected a sale dispatch.');
      }

      dispatchedNames.push(item.payload.lines[0]!.name_snapshot);
      return { sale: item.payload, replayed: false };
    });

    await outbox.drain();

    expect(dispatchedNames).toEqual(['Updated treatment']);
  });

  test('derives offline status only from a network failure and keeps the row pending', async () => {
    const db = await createDatabase();
    const localSale = sale('sale-network');
    await db.sales.put(localSale);
    const seq = await enqueueOutbox(db, saleEnqueueInput(localSale.id));
    const { outbox } = createOutboxFor(db, async () => {
      throw new ApiNetworkError();
    }, 10_000);

    const status = await outbox.drain();

    expect(status.state).toBe('offline');
    expect(await db.outbox.get(seq)).toMatchObject({ status: 'pending', attempts: 1, nextAt: 40_000 });
  });

  test('reconciles an authoritative drained response over a prior deferred inbound change', async () => {
    const db = await createDatabase();
    const localSale = sale('sale-collision');
    await db.sales.put(localSale);
    await enqueueOutbox(db, saleEnqueueInput(localSale.id));
    await db.meta.put({
      key: deferredMetaKey({ table: 'sales', id: localSale.id }),
      value: {
        entity: 'sale',
        op: 'upsert',
        row: { ...toWireSale({ ...localSale, lines: [{ ...localSale.lines[0]!, nameSnapshot: 'Stale server name' }] }) },
      },
    });
    await db.meta.put({ key: 'sinceCursor', value: 8 });
    const authoritative = sale(localSale.id, null, 'Authoritative name');
    const { outbox } = createOutboxFor(db, async () => ({ sale: toWireSale(authoritative), replayed: false }));

    await outbox.drain();

    expect(await db.sales.get(localSale.id)).toMatchObject({ lines: [{ nameSnapshot: 'Authoritative name' }] });
    expect(await db.meta.get(deferredMetaKey({ table: 'sales', id: localSale.id }))).toBeUndefined();
    expect(await db.meta.get('sinceCursor')).toEqual({ key: 'sinceCursor', value: 8 });
  });
});
