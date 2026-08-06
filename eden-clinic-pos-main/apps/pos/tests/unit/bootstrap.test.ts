import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { ApiClient } from '@/data/api';
import {
  bootstrap,
  pullDelta,
  reconcileAuthoritativeChange,
  serverTimeOffset,
  type Clock,
} from '@/data/bootstrap';
import { authEnvelopeMetaKey, createClinicDb, deferredMetaKey, type ClinicDb } from '@/data/db';
import type { BootstrapWire, DeltaWire } from '@/data/types';

const clock: Clock = { now: () => 1_000 };
const databaseNames: string[] = [];
let databases: ClinicDb[] = [];

function bootstrapPayload(patientName = 'Server name'): BootstrapWire {
  return {
    clinic: {
      id: 'clinic-1',
      name: 'Eden',
      phone: '',
      address: '',
      rounding_step: 500,
      credit_limit_mmk: 100_000,
      receipt: {},
      receipt_footer: '',
      logo_url: '',
      receipt_qr: true,
      receipt_next_visit: true,
      receipt_template: 'classic',
      receipt_header_font: 'sans',
      receipt_divider: 'line',
      consent_mode: 'warn',
      addons: {},
      feature_flags: {},
    },
    staff: [],
    services: [],
    products: [],
    patients: [
      {
        id: 'patient-local',
        name: patientName,
        phone: '09 771 234 560',
      },
    ],
    appointments: [],
    recent_sales: [],
    server_time: '1970-01-01T00:00:02.500Z',
    cursor: 8,
  };
}

function deltaPayload(patientName = 'Server delta name'): DeltaWire {
  return {
    changes: [
      {
        entity: 'patient',
        op: 'upsert',
        row: {
          id: 'patient-local',
          name: patientName,
          phone: '09 771 234 560',
        },
      },
    ],
    cursor: 8,
    server_time: '1970-01-01T00:00:02.500Z',
  };
}

function createApi(overrides: Partial<ApiClient>): ApiClient {
  return {
    health: async () => ({ ok: true, server_time: '1970-01-01T00:00:02.500Z' }),
    login: async () => {
      throw new Error('not used by bootstrap tests');
    },
    bootstrap: async () => bootstrapPayload(),
    delta: async () => deltaPayload(),
    elevate: async () => {
      throw new Error('not used by bootstrap tests');
    },
    updateClinic: async () => {
      throw new Error('not used by bootstrap tests');
    },
    updatePatient: async () => {
      throw new Error('not used by bootstrap tests');
    },
    updateProduct: async () => {
      throw new Error('not used by bootstrap tests');
    },
    adjustStock: async () => {
      throw new Error('not used by bootstrap tests');
    },
    voidSale: async () => {
      throw new Error('not used by bootstrap tests');
    },
    followups: async () => [],
    dailyReport: async (date) => ({
      date,
      collected: 0,
      delivered: 0,
      new_credit: 0,
      outstanding: 0,
      sales: 0,
    }),
    lookupBarcode: async () => {
      throw new Error('not used by bootstrap tests');
    },
    dispatch: async () => {
      throw new Error('not used by bootstrap tests');
    },
    ...overrides,
  };
}

async function createDatabase(): Promise<ClinicDb> {
  const name = `eden-bootstrap-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const db = createClinicDb(name);
  databases.push(db);
  await db.open();
  return db;
}

async function insertProtectedLocalPatient(db: ClinicDb): Promise<void> {
  await db.patients.put({
    id: 'patient-local',
    code: null,
    name: 'Local pending name',
    phone: '09 771 234 560',
    sex: null,
    allergies: null,
    alertNote: null,
    telegramLinked: false,
    followupDate: null,
  });
  await db.outbox.add({
    kind: 'patient',
    uuid: 'outbox-patient-local',
    payloadRef: {
      source: 'entity',
      entity: { table: 'patients', id: 'patient-local' },
      protectedEntities: [{ table: 'patients', id: 'patient-local' }],
    },
    dependsOnUuid: null,
    attempts: 0,
    nextAt: 0,
    status: 'pending',
    lastErrorStatus: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
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

describe('bootstrap and delta synchronization', () => {
  test('stores the server clock offset, cursor, and device id from bootstrap', async () => {
    const db = await createDatabase();

    await bootstrap({ db, api: createApi({}), deviceId: 'device-1', clock });

    expect(serverTimeOffset('1970-01-01T00:00:02.500Z', clock)).toBe(1_500);
    expect(await db.meta.get('serverTimeOffset')).toEqual({ key: 'serverTimeOffset', value: 1_500 });
    expect(await db.meta.get('sinceCursor')).toEqual({ key: 'sinceCursor', value: 8 });
    expect(await db.meta.get('deviceId')).toEqual({ key: 'deviceId', value: 'device-1' });
  });

  test('defers a delta competing with a protected local row while safely advancing its cursor', async () => {
    const db = await createDatabase();
    await insertProtectedLocalPatient(db);
    await db.meta.put({ key: 'sinceCursor', value: 3 });

    await pullDelta({ db, api: createApi({}), clock });

    expect(await db.patients.get('patient-local')).toMatchObject({ name: 'Local pending name' });
    expect(await db.meta.get('sinceCursor')).toEqual({ key: 'sinceCursor', value: 8 });
    expect(await db.meta.get(deferredMetaKey({ table: 'patients', id: 'patient-local' }))).toMatchObject({
      value: { entity: 'patient', op: 'upsert', row: { name: 'Server delta name' } },
    });

    await reconcileAuthoritativeChange(db, deltaPayload('Authoritative response').changes[0]!);

    expect(await db.patients.get('patient-local')).toMatchObject({ name: 'Authoritative response' });
    expect(await db.meta.get(deferredMetaKey({ table: 'patients', id: 'patient-local' }))).toBeUndefined();
    expect(await db.meta.get('sinceCursor')).toEqual({ key: 'sinceCursor', value: 8 });
  });

  test('defers a bootstrap snapshot row that collides with local pending intent', async () => {
    const db = await createDatabase();
    await insertProtectedLocalPatient(db);

    await bootstrap({
      db,
      api: createApi({ bootstrap: async () => bootstrapPayload('Snapshot server name') }),
      deviceId: 'device-1',
      clock,
    });

    expect(await db.patients.get('patient-local')).toMatchObject({ name: 'Local pending name' });
    expect(await db.meta.get(deferredMetaKey({ table: 'patients', id: 'patient-local' }))).toMatchObject({
      value: { row: { name: 'Snapshot server name' } },
    });
  });

  test('purges server-offboarded and deleted staff envelopes inside the sync transaction', async () => {
    const db = await createDatabase();
    await db.staff.bulkPut([
      { id: 's1', name: 'Dr. Hkawn Mai', role: 'admin', takesBookings: true, active: true },
      { id: 's2', name: 'Aye Aye', role: 'staff', takesBookings: false, active: true },
    ]);
    await db.meta.bulkPut([
      { key: authEnvelopeMetaKey('s1'), value: { opaque: 's1' } },
      { key: authEnvelopeMetaKey('s2'), value: { opaque: 's2' } },
      { key: 'sinceCursor', value: 0 },
    ]);
    const changes: DeltaWire['changes'] = [
      { entity: 'staff', op: 'upsert', row: { id: 's1', name: 'Dr. Hkawn Mai', role: 'admin', takes_bookings: true, active: false } },
      { entity: 'staff', op: 'delete', row: { id: 's2' } },
    ];
    const result = await pullDelta({
      db,
      api: createApi({
        delta: async () => ({
          changes,
          cursor: 9,
          server_time: '1970-01-01T00:00:02.500Z',
        }),
      }),
      clock,
    });

    expect(result).toEqual({ offboardedStaffIds: ['s1', 's2'] });
    expect(await db.staff.get('s1')).toMatchObject({ active: false });
    expect(await db.staff.get('s2')).toBeUndefined();
    expect(await db.meta.get(authEnvelopeMetaKey('s1'))).toBeUndefined();
    expect(await db.meta.get(authEnvelopeMetaKey('s2'))).toBeUndefined();
    expect(await db.meta.filter((row) => row.key.startsWith('envelope-audit:')).count()).toBe(2);
  });
});
