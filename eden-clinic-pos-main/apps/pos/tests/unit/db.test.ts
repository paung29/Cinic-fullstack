import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ClinicDb, createClinicDb } from '@/data/db';

const databaseNames: string[] = [];
let databases: ClinicDb[] = [];

beforeEach(() => {
  Dexie.dependencies.indexedDB = indexedDB;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  databases = [];
});

afterEach(async () => {
  for (const database of databases) {
    database.close();
  }

  await Promise.all(databaseNames.splice(0).map((databaseName) => Dexie.delete(databaseName)));
});

describe('ClinicDb', () => {
  test('creates isolated databases only when the factory is called', async () => {
    expect(createClinicDb).toBeTypeOf('function');

    const firstName = `eden-first-${crypto.randomUUID()}`;
    const secondName = `eden-second-${crypto.randomUUID()}`;
    databaseNames.push(firstName, secondName);
    const first = createClinicDb(firstName);
    const second = createClinicDb(secondName);
    databases = [first, second];

    await first.open();
    await second.open();
    await first.patients.put({
      id: 'patient-1',
      code: null,
      name: 'Ma Thida',
      phone: '09 771 234 560',
      sex: null,
      allergies: null,
      alertNote: null,
      telegramLinked: false,
      followupDate: null,
    });

    expect(await second.patients.get('patient-1')).toBeUndefined();
    expect(first.tables.map((table) => table.name).sort()).toEqual([
      'appointments',
      'clinic',
      'contacts',
      'leads',
      'meta',
      'outbox',
      'patients',
      'photoSessions',
      'products',
      'sales',
      'services',
      'staff',
    ]);
  });
});
