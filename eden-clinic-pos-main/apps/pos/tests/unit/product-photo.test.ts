import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createClinicDb, type ClinicDb } from '@/data/db';
import { clearProductPhoto, productPhotoKey, readProductPhoto, readProductPhotos } from '@/data/productPhoto';

const databaseNames: string[] = [];
let databases: ClinicDb[] = [];

async function createDatabase(): Promise<ClinicDb> {
  const name = `eden-product-photo-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const db = createClinicDb(name);
  databases.push(db);
  await db.open();
  return db;
}

/** Written directly so the test never depends on canvas being available. */
async function putPhoto(db: ClinicDb, productId: string, body: string): Promise<void> {
  await db.receiptAssets.put({ blob: new Blob([body], { type: 'image/jpeg' }), key: productPhotoKey(productId) });
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

describe('product shelf photos', () => {
  test('keys photos per product so two products never collide', () => {
    expect(productPhotoKey('a')).not.toBe(productPhotoKey('b'));
    expect(productPhotoKey('a')).toBe('product-photo:a');
  });

  // The table reads photos in one bulkGet and maps results back by position.
  // If that alignment ever slips, every product silently shows a neighbour's
  // photo — which looks like working software right up until staff pick the
  // wrong box off the shelf.
  test('maps a bulk read back onto the right products when some have none', async () => {
    const db = await createDatabase();
    await putPhoto(db, 'p1', 'one');
    await putPhoto(db, 'p3', 'three');

    const found = await readProductPhotos(db, ['p1', 'p2', 'p3']);

    expect([...found.keys()].sort()).toEqual(['p1', 'p3']);
    expect(await found.get('p1')?.text()).toBe('one');
    expect(await found.get('p3')?.text()).toBe('three');
    expect(found.has('p2')).toBe(false);
  });

  test('returns nothing for an empty product list without touching the store', async () => {
    const db = await createDatabase();
    expect((await readProductPhotos(db, [])).size).toBe(0);
  });

  test('removing one product photo leaves the others alone', async () => {
    const db = await createDatabase();
    await putPhoto(db, 'p1', 'one');
    await putPhoto(db, 'p2', 'two');

    await clearProductPhoto(db, 'p1');

    expect(await readProductPhoto(db, 'p1')).toBeUndefined();
    expect(await (await readProductPhoto(db, 'p2'))?.text()).toBe('two');
  });
});
