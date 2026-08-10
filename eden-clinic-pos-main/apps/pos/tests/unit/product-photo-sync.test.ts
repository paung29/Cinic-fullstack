import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createClinicDb, type ClinicDb } from '@/data/db';
import { productPhotoKey, readProductPhoto, reconcileProductPhotos, stageProductPhoto } from '@/data/productPhoto';
import type { ProductRow } from '@/data/types';

const databaseNames: string[] = [];
let databases: ClinicDb[] = [];

async function createDatabase(): Promise<ClinicDb> {
  const name = `eden-photo-sync-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const db = createClinicDb(name);
  databases.push(db);
  await db.open();
  return db;
}

function product(id: string, photoKey: string | null): ProductRow {
  return {
    id, name: id, category: 'Skin', subcategory: null, sortOrder: 0, barcode: null,
    cost: 0, price: 1000, stockQty: 1, lowStockAt: 0, reorderAt: 0, stockType: 'retail',
    soldBy: 'each', requiresLot: false, requiresConsent: false, unitLabel: null,
    photoKey, lots: [], active: true,
  };
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

describe('reconciling product photos with the clinic', () => {
  test('uploads a photo taken on this device and records the fingerprint it came back with', async () => {
    const db = await createDatabase();
    await db.products.put(product('p1', null));
    await stageProductPhoto(db, 'p1', new Blob(['shelf'], { type: 'image/jpeg' }));

    const sent: string[] = [];
    const result = await reconcileProductPhotos(db, {
      putProductPhoto: async (id) => { sent.push(id); return { ...product(id, 'fp-1'), photo_key: 'fp-1' } as never; },
      getProductPhoto: async () => { throw new Error('should not download'); },
    }, [product('p1', null)]);

    expect(sent).toEqual(['p1']);
    expect(result.uploaded).toBe(1);
    expect((await db.receiptAssets.get(productPhotoKey('p1')))?.photoKey).toBe('fp-1');
    // Without this the next pass reads "server has none, cache does" and
    // deletes the photo it just uploaded.
    expect((await db.products.get('p1'))?.photoKey).toBe('fp-1');
  });

  test('downloads a photo another device added', async () => {
    const db = await createDatabase();
    const result = await reconcileProductPhotos(db, {
      putProductPhoto: async () => { throw new Error('should not upload'); },
      getProductPhoto: async (id) => ({ product_id: id, photo_key: 'fp-2', content_type: 'image/jpeg', data: btoa('remote') }),
    }, [product('p2', 'fp-2')]);

    expect(result.downloaded).toBe(1);
    expect(await (await readProductPhoto(db, 'p2'))?.text()).toBe('remote');
  });

  test('does nothing when the cached copy is already the current one', async () => {
    const db = await createDatabase();
    await db.receiptAssets.put({ blob: new Blob(['same']), key: productPhotoKey('p3'), photoKey: 'fp-3' });

    const result = await reconcileProductPhotos(db, {
      putProductPhoto: async () => { throw new Error('should not upload'); },
      getProductPhoto: async () => { throw new Error('should not download'); },
    }, [product('p3', 'fp-3')]);

    expect(result).toMatchObject({ uploaded: 0, downloaded: 0, removed: 0, offline: false });
  });

  test('drops the cached copy once the clinic no longer has one', async () => {
    const db = await createDatabase();
    await db.receiptAssets.put({ blob: new Blob(['old']), key: productPhotoKey('p4'), photoKey: 'fp-4' });

    const result = await reconcileProductPhotos(db, {
      putProductPhoto: async () => { throw new Error('should not upload'); },
      getProductPhoto: async () => { throw new Error('should not download'); },
    }, [product('p4', null)]);

    expect(result.removed).toBe(1);
    expect(await readProductPhoto(db, 'p4')).toBeUndefined();
  });

  // The one that would lose a user's work: a photo taken with the internet
  // down looks exactly like "server has no photo" to the delete branch.
  test('keeps a photo taken offline when the upload cannot go through', async () => {
    const db = await createDatabase();
    await db.products.put(product('p5', null));
    await stageProductPhoto(db, 'p5', new Blob(['taken offline'], { type: 'image/jpeg' }));

    const result = await reconcileProductPhotos(db, {
      putProductPhoto: async () => { throw new Error('offline'); },
      getProductPhoto: async () => { throw new Error('offline'); },
    }, [product('p5', null)]);

    expect(result.offline).toBe(true);
    expect(result.removed).toBe(0);
    expect(await (await readProductPhoto(db, 'p5'))?.text()).toBe('taken offline');
  });
});
