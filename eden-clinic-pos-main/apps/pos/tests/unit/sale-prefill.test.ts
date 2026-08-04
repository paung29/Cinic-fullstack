import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createClinicDb, type ClinicDb } from '@/data/db';
import { consumeSalePrefill, stageSalePrefill } from '@/data/salePrefill';

const databaseNames: string[] = [];
let databases: ClinicDb[] = [];

async function createDatabase(): Promise<ClinicDb> {
  const name = `eden-sale-prefill-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const db = createClinicDb(name);
  databases.push(db);
  await db.open();
  return db;
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

describe('sale prefill', () => {
  test('consumes an appointment handoff exactly once', async () => {
    const db = await createDatabase();
    await stageSalePrefill(db, { appointmentId: 'appointment-1', patientId: 'patient-1', serviceId: 'v1' });

    await expect(consumeSalePrefill(db)).resolves.toEqual({ appointmentId: 'appointment-1', patientId: 'patient-1', serviceId: 'v1' });
    await expect(consumeSalePrefill(db)).resolves.toBeUndefined();
  });
});
