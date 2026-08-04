import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  LastAdminEnvelopeError,
  offlineApprovalsState,
  purgeOffboardedEnvelope,
  removeLocalEnvelope,
} from '@/data/adminEnvelopes';
import { authEnvelopeMetaKey, createClinicDb, type ClinicDb } from '@/data/db';

const databaseNames: string[] = [];
let databases: ClinicDb[] = [];

async function createDatabase(): Promise<ClinicDb> {
  const name = `eden-admin-envelope-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const db = createClinicDb(name);
  databases.push(db);
  await db.open();
  return db;
}

async function provisionAdmin(db: ClinicDb, id: string): Promise<void> {
  await db.staff.put({ id, name: id, role: 'admin', takesBookings: true, active: true });
  await db.meta.put({ key: authEnvelopeMetaKey(id), value: { opaque: id } });
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

describe('offline admin envelopes', () => {
  test('refuses a locally initiated removal of the final active admin envelope', async () => {
    const db = await createDatabase();
    await provisionAdmin(db, 'admin-1');

    await expect(removeLocalEnvelope(db, { targetStaffId: 'admin-1', actorStaffId: 'admin-1', now: 0 }))
      .rejects.toBeInstanceOf(LastAdminEnvelopeError);

    expect(await db.meta.get(authEnvelopeMetaKey('admin-1'))).toBeDefined();
    await expect(offlineApprovalsState(db)).resolves.toEqual({ hasAdminEnvelope: true });
  });

  test('removes a non-final local envelope and creates a JSON-safe manual audit entry', async () => {
    const db = await createDatabase();
    await provisionAdmin(db, 'admin-1');
    await provisionAdmin(db, 'admin-2');

    await removeLocalEnvelope(db, { targetStaffId: 'admin-2', actorStaffId: 'admin-1', now: 1_000 });

    expect(await db.meta.get(authEnvelopeMetaKey('admin-2'))).toBeUndefined();
    expect(await db.meta.filter((row) => row.key.startsWith('envelope-audit:')).first()).toMatchObject({
      value: { action: 'manual-removal', targetStaffId: 'admin-2', actorStaffId: 'admin-1', at: '1970-01-01T00:00:01.000Z' },
    });
  });

  test('purges a server-offboarded final admin envelope and advertises the degraded state', async () => {
    const db = await createDatabase();
    await provisionAdmin(db, 'admin-1');

    await purgeOffboardedEnvelope(db, { targetStaffId: 'admin-1', now: 2_000 });

    expect(await db.meta.get(authEnvelopeMetaKey('admin-1'))).toBeUndefined();
    await expect(offlineApprovalsState(db)).resolves.toEqual({ hasAdminEnvelope: false });
    expect(await db.meta.filter((row) => row.key.startsWith('envelope-audit:')).first()).toMatchObject({
      value: { action: 'server-offboarding', targetStaffId: 'admin-1', actorStaffId: null },
    });
  });
});
