import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, expect, test } from 'vitest';
import { createClinicDb, type ClinicDb } from '@/data/db';
import {
  localePreferenceMetaKey,
  readLocalePreference,
  readPrinterProfile,
  receiptDesignerDraftMetaKey,
  saveLocalePreference,
  savePrinterProfile,
} from '@/data/printerProfile';

const databases: ClinicDb[] = [];

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (db) => {
    const name = db.name;
    db.close();
    await Dexie.delete(name);
  }));
});

test('round-trips versioned printer profile and locale preferences through typed device meta keys', async () => {
  const db = createClinicDb(`printer-profile-${crypto.randomUUID()}`);
  databases.push(db);
  await db.open();

  await savePrinterProfile(db, 'device-1', { version: 1, transport: 'generic-escpos', width: 384 });
  await saveLocalePreference(db, 'device-1', 'zh');

  await expect(readPrinterProfile(db, 'device-1')).resolves.toEqual({ version: 1, transport: 'generic-escpos', width: 384 });
  await expect(readLocalePreference(db, 'device-1')).resolves.toBe('zh');
  expect(localePreferenceMetaKey('device-1')).toBe('device-locale:v1:device-1');
  expect(receiptDesignerDraftMetaKey('device-1')).toBe('receipt-designer-draft:v1:device-1');
});
