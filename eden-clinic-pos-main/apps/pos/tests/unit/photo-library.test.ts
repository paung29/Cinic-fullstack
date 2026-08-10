import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createClinicDb, type ClinicDb } from '@/data/db';
import { gradeLabelKey, isPhotoGrade, newPhotoSession, photoSessionTitle, sortPhotoSessions, PHOTO_GRADES } from '@/modules/patients/photoSelectors';
import { deletePhotoSession, patchPhotoSession, putPhotoSession, readPhotoSessions } from '@/modules/patients/photoStore';
import type { PhotoSessionRow } from '@/data/types';

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

function makeDb(): ClinicDb {
  const name = `eden-photos-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const db = createClinicDb(name);
  databases.push(db);
  return db;
}

function session(patch: Partial<PhotoSessionRow>): PhotoSessionRow {
  return { ...newPhotoSession('patient-1', 'session-1', '2026-08-09'), ...patch };
}

describe('photoSelectors', () => {
  test('sorts sessions newest first, breaking date ties by id', () => {
    const rows = [
      session({ at: '2026-08-01', id: 'a' }),
      session({ at: '2026-08-09', id: 'b' }),
      session({ at: '2026-08-09', id: 'c' }),
    ];
    expect(sortPhotoSessions(rows).map((row) => row.id)).toEqual(['c', 'b', 'a']);
  });

  test('does not mutate the input ordering', () => {
    const rows = [session({ at: '2026-08-01', id: 'a' }), session({ at: '2026-08-09', id: 'b' })];
    sortPhotoSessions(rows);
    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
  });

  test('falls back to the default title only for blank titles', () => {
    expect(photoSessionTitle(session({ title: '' }), 'New visit')).toBe('New visit');
    expect(photoSessionTitle(session({ title: '   ' }), 'New visit')).toBe('New visit');
    expect(photoSessionTitle(session({ title: 'Laser #3' }), 'New visit')).toBe('Laser #3');
  });

  test('maps grades to translation keys, with pending for ungraded', () => {
    expect(gradeLabelKey(null)).toBe('photo.grPending');
    expect(gradeLabelKey('slight')).toBe('photo.grSlight');
    expect(PHOTO_GRADES.every((grade) => gradeLabelKey(grade).startsWith('photo.gr'))).toBe(true);
  });

  test('guards grade values', () => {
    expect(isPhotoGrade('marked')).toBe(true);
    expect(isPhotoGrade('pending')).toBe(false);
    expect(isPhotoGrade(null)).toBe(false);
  });

  test('creates blank sessions bound to the patient and day', () => {
    const created = newPhotoSession('patient-9', 'id-9', '2026-08-09');
    expect(created).toEqual({ after: null, at: '2026-08-09', before: null, grade: null, id: 'id-9', note: '', patientId: 'patient-9', title: '' });
  });
});

describe('photoStore', () => {
  test('round-trips sessions per patient with blobs intact', async () => {
    const db = makeDb();
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' });
    await putPhotoSession(db, session({ before: blob, id: 'mine' }));
    await putPhotoSession(db, { ...session({ id: 'other' }), patientId: 'patient-2' });

    const mine = await readPhotoSessions(db, 'patient-1');
    expect(mine.map((row) => row.id)).toEqual(['mine']);
    expect(mine[0]?.before).toBeInstanceOf(Blob);
    expect(mine[0]?.before?.size).toBe(4);
    expect(mine[0]?.after).toBeNull();
  });

  test('patches fields without touching the rest of the row', async () => {
    const db = makeDb();
    await putPhotoSession(db, session({ note: 'keep', title: 'Laser' }));
    await patchPhotoSession(db, 'session-1', { grade: 'marked' });

    const rows = await readPhotoSessions(db, 'patient-1');
    expect(rows[0]?.grade).toBe('marked');
    expect(rows[0]?.title).toBe('Laser');
    expect(rows[0]?.note).toBe('keep');
  });

  test('deletes sessions', async () => {
    const db = makeDb();
    await putPhotoSession(db, session({}));
    await deletePhotoSession(db, 'session-1');
    expect(await readPhotoSessions(db, 'patient-1')).toEqual([]);
  });

  test('upgrades a v1 database in place without losing existing rows', async () => {
    const name = `eden-upgrade-${crypto.randomUUID()}`;
    databaseNames.push(name);

    const v1 = new Dexie(name);
    v1.version(1).stores({
      services: 'id, category',
      products: 'id, barcode, category',
      patients: 'id, phone, name',
      sales: 'id, at, patientId',
      appointments: 'id, [date+staffId], patientId',
      leads: 'id, status',
      contacts: 'id, patientId',
      staff: 'id',
      clinic: 'id',
      outbox: '++seq, status',
      meta: 'key',
    });
    await v1.open();
    await v1.table('patients').put({ alertNote: null, allergies: null, code: null, followupDate: null, id: 'patient-1', name: 'Ma Thida', phone: '09 771 234 560', sex: null, telegramLinked: false });
    v1.close();

    const upgraded = createClinicDb(name);
    databases.push(upgraded);
    await upgraded.open();
    expect(upgraded.verno).toBe(3);
    expect((await upgraded.patients.get('patient-1'))?.name).toBe('Ma Thida');
    await putPhotoSession(upgraded, session({}));
    expect((await readPhotoSessions(upgraded, 'patient-1')).length).toBe(1);
  });
});
