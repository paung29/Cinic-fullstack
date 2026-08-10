import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, expect, test, vi } from 'vitest';
import type { ApiClient } from '@/data/api';
import { saveClinicConfig } from '@/data/clinicConfig';
import { createClinicDb, type ClinicDb } from '@/data/db';
import type { ClinicRow, ClinicWire } from '@/data/types';

const databases: ClinicDb[] = [];

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

const existingClinic: ClinicRow = {
  id: 'clinic-1', name: 'Before', phone: '', address: '', roundingStep: 500, creditLimitMmk: 100_000,
  receipt: {}, receiptFooter: '', logoUrl: '', telegramHandle: '', receiptHeader: '', receiptQr: true, receiptNextVisit: true,
  receiptTemplate: 'classic', receiptHeaderFont: 'sans', receiptDivider: 'line', consentMode: 'warn', addons: {}, featureFlags: {},
};

const serverClinic: ClinicWire = {
  id: 'clinic-1', name: 'After', phone: '09 123', address: 'Lashio', rounding_step: 1_000, credit_limit_mmk: 90_000,
  receipt: {}, receipt_footer: 'See you', logo_url: '', telegram_handle: '', receipt_header: '', receipt_qr: false, receipt_next_visit: false,
  receipt_template: 'boxed', receipt_header_font: 'display', receipt_divider: 'none', consent_mode: 'block', addons: {}, feature_flags: {},
};

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (db) => {
    const name = db.name;
    db.close();
    await Dexie.delete(name);
  }));
});

test('writes only the complete server-confirmed clinic row and never enqueues configuration', async () => {
  const db = createClinicDb(`clinic-config-${crypto.randomUUID()}`);
  databases.push(db);
  await db.open();
  await db.clinic.put(existingClinic);
  const updateClinic = vi.fn(async () => serverClinic);

  await expect(saveClinicConfig({
    db,
    api: { updateClinic } as Pick<ApiClient, 'updateClinic'>,
    patch: { receipt_template: 'boxed' },
    elevationToken: 'elevation-1',
  })).resolves.toMatchObject({ name: 'After', receiptTemplate: 'boxed' });

  expect(updateClinic).toHaveBeenCalledWith({ receipt_template: 'boxed' }, 'elevation-1');
  expect(await db.clinic.get('clinic-1')).toMatchObject({ name: 'After', receiptTemplate: 'boxed' });
  expect(await db.outbox.count()).toBe(0);
});

test('leaves the authoritative local row byte-for-byte unchanged when online save rejects', async () => {
  const db = createClinicDb(`clinic-config-${crypto.randomUUID()}`);
  databases.push(db);
  await db.open();
  await db.clinic.put(existingClinic);
  const before = JSON.stringify(await db.clinic.get('clinic-1'));

  await expect(saveClinicConfig({
    db,
    api: { updateClinic: async () => Promise.reject(new Error('offline')) } as Pick<ApiClient, 'updateClinic'>,
    patch: { receipt_qr: false },
    elevationToken: 'elevation-1',
  })).rejects.toThrow('offline');

  expect(JSON.stringify(await db.clinic.get('clinic-1'))).toBe(before);
});
