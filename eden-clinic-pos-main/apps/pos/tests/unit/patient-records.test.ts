import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createClinicDb, type ClinicDb } from '@/data/db';
import { createPatient } from '@/data/patientRecords';

const databaseNames: string[] = [];
let databases: ClinicDb[] = [];

async function createDatabase(): Promise<ClinicDb> {
  const name = `eden-patient-record-${crypto.randomUUID()}`;
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

describe('patient records', () => {
  test('atomically persists a locally created patient with a null server code and entity outbox row', async () => {
    const db = await createDatabase();

    const created = await createPatient(db, {
      id: 'patient-local-1',
      name: 'Ma Ei',
      phone: '09 771 234 560',
      sex: null,
      telegramLinked: false,
      allergies: 'Lidocaine',
      alertNote: null,
      now: 5,
    });

    expect(created.patient).toMatchObject({ id: 'patient-local-1', code: null, allergies: 'Lidocaine' });
    expect(await db.patients.get('patient-local-1')).toMatchObject({ code: null, phone: '09 771 234 560' });
    expect(await db.outbox.filter((row) => row.uuid === created.outboxUuid).first()).toMatchObject({
      kind: 'patient',
      status: 'pending',
      payloadRef: {
        source: 'entity',
        entity: { table: 'patients', id: 'patient-local-1' },
        protectedEntities: [{ table: 'patients', id: 'patient-local-1' }],
      },
    });
  });
});
