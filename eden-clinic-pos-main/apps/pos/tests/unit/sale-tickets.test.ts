import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createClinicDb, type ClinicDb } from '@/data/db';
import { resumeTicket, saveTicket, ticketMetaKey, type SaleTicket } from '@/modules/sale/tickets';

const databaseNames: string[] = [];
let databases: ClinicDb[] = [];

beforeEach(() => {
  Dexie.dependencies.indexedDB = indexedDB;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  databases = [];
});

afterEach(async () => {
  for (const db of databases) db.close();
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

async function createDatabase(): Promise<ClinicDb> {
  const name = `eden-sale-ticket-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const db = createClinicDb(name);
  databases.push(db);
  await db.open();
  return db;
}

test('persists a typed ticket snapshot and removes it only after resume reads it', async () => {
  const db = await createDatabase();
  const ticket: SaleTicket = {
    id: 'ticket-1',
    staffId: 's2',
    savedAt: '2026-07-31T12:00:00.000Z',
    draft: {
      patientId: 'p1',
      appointmentId: null,
      discountPct: 10,
      discountApprovedBy: null,
      lines: [{
        id: 'line-1',
        kind: 'service',
        itemId: 'service-1',
        nameSnapshot: 'Facial',
        qty: 1,
        unitPrice: 15_000,
        discountPct: null,
        note: null,
        lotNo: null,
        lotExpiry: null,
      }],
    },
  };

  await saveTicket(db, ticket);

  expect(await db.meta.get(ticketMetaKey(ticket.id))).toMatchObject({ value: ticket });
  await expect(resumeTicket(db, ticket.id)).resolves.toEqual(ticket);
  expect(await db.meta.get(ticketMetaKey(ticket.id))).toBeUndefined();
});
