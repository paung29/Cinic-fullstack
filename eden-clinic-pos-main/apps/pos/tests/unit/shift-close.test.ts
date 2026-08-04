import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createClinicDb, type ClinicDb } from '@/data/db';
import { buildOutboxRow } from '@/data/outbox';
import { closeShift, currentShiftMetaKey, ShiftCloseAdminRequiredError, ShiftCloseSyncRequiredError } from '@/data/shiftClose';
import { drawerDifferenceTone } from '@/modules/today/shiftPresentation';
import type { SaleRow } from '@/data/types';

const now = new Date(2026, 7, 2, 10, 0, 0).getTime();
const databases: ClinicDb[] = [];
const databaseNames: string[] = [];

function sale(id: string, at: string, cash: number): SaleRow {
  return {
    id, patientId: null, staffId: 's1', practitionerId: null, appointmentId: null, at,
    lines: [], payments: [{ id: `payment-${id}`, method: 'cash', amount: cash, at }],
    subtotal: cash, discountPct: null, discountApprovedBy: null, total: cash, credit: 0,
    creditApprovedBy: null, followupDate: null, deviceId: 'device-1', createdOffline: false,
    no: id, status: 'completed', needsReview: false, reviewReason: null, receivedAt: null,
  };
}

async function database(): Promise<ClinicDb> {
  const name = `eden-shift-close-${crypto.randomUUID()}`;
  const db = createClinicDb(name);
  databaseNames.push(name);
  databases.push(db);
  await db.open();
  return db;
}

async function addOutbox(db: ClinicDb, status: 'pending' | 'inflight' | 'attention' | 'done'): Promise<void> {
  await db.outbox.add({
    ...buildOutboxRow({
      kind: 'sale', uuid: `queue-${status}`,
      payloadRef: { source: 'entity', entity: { table: 'sales', id: 'sale-1' }, protectedEntities: [{ table: 'sales', id: 'sale-1' }] },
      now,
    }),
    status,
  });
}

beforeEach(() => {
  Dexie.dependencies.indexedDB = indexedDB;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
});

afterEach(async () => {
  for (const db of databases.splice(0)) db.close();
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe('shift close', () => {
  test('uses a red display tone only for a negative cash drawer difference', () => {
    expect(drawerDifferenceTone(-1)).toBe('negative');
    expect(drawerDifferenceTone(0)).toBe('ink');
    expect(drawerDifferenceTone(1)).toBe('ink');
  });

  test('refuses a non-admin before reading or writing a close record', async () => {
    const db = await database();
    await expect(closeShift({ db, now, deviceId: 'device-1', actor: { staffId: 's2', role: 'staff' }, openingCash: 100_000, countedCash: 100_000, uuid: 'close-staff' }))
      .rejects.toBeInstanceOf(ShiftCloseAdminRequiredError);
    expect(await db.meta.toArray()).toEqual([]);
  });

  test.each(['pending', 'inflight', 'attention'] as const)('refuses %s outbox work', async (status) => {
    const db = await database();
    await addOutbox(db, status);

    await expect(closeShift({ db, now, deviceId: 'device-1', actor: { staffId: 's1', role: 'admin' }, openingCash: 100_000, countedCash: 100_000, uuid: `close-${status}` }))
      .rejects.toBeInstanceOf(ShiftCloseSyncRequiredError);
    expect(await db.meta.toArray()).toEqual([]);
  });

  test('records an immutable local cash snapshot while done history does not block', async () => {
    const db = await database();
    await db.sales.bulkPut([
      sale('last-night', new Date(2026, 7, 1, 23, 59, 0).toISOString(), 999_000),
      sale('today-cash', new Date(2026, 7, 2, 9, 0, 0).toISOString(), 55_000),
    ]);
    await addOutbox(db, 'done');

    const record = await closeShift({
      db, now, deviceId: 'device-1', actor: { staffId: 's1', role: 'admin' },
      openingCash: 100_000, countedCash: 160_000, uuid: 'close-1',
    });

    expect(record).toMatchObject({
      version: 1, id: 'close-1', deviceId: 'device-1', closedByStaffId: 's1', day: '2026-08-02',
      openingCash: 100_000, cashSales: 55_000, expectedCash: 155_000, countedCash: 160_000,
      difference: 5_000, pendingCount: 0, attentionCount: 0,
    });
    expect((await db.meta.get('shift-close:v1:close-1'))?.value).toEqual(record);
    expect((await db.meta.get(currentShiftMetaKey('device-1', '2026-08-02')))?.value).toEqual({
      version: 1, openingCash: 100_000, latestCloseId: 'close-1',
    });
    expect((await db.outbox.toArray())[0]?.status).toBe('done');
  });
});
