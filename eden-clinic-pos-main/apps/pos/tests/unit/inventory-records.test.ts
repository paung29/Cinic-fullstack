import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, expect, test } from 'vitest';
import type { ApiClient } from '@/data/api';
import { createClinicDb, type ClinicDb } from '@/data/db';
import { createProduct, hasPendingProductCreate, receiveStock, updateExistingProduct } from '@/data/inventoryRecords';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
const databases: ClinicDb[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (db) => { const name = db.name; db.close(); await Dexie.delete(name); }));
});

test('atomically captures an offline weight product and makes it drainable as an entity-backed outbox item', async () => {
  const db = createClinicDb(`inventory-${crypto.randomUUID()}`); databases.push(db); await db.open();
  const created = await createProduct({ db, now: 1, uuid: (() => { let count = 0; return () => `product-${++count}`; })(), input: { name: 'Loose mask', category: 'Skin', subcategory: null, sortOrder: 0, barcode: null, cost: 4_000, price: 9_000, stockQty: 3, lowStockAt: 1, reorderAt: 1, stockType: 'retail', soldBy: 'weight', requiresLot: false, requiresConsent: false, unitLabel: 'g', photoKey: null, active: true, lots: [] } });
  expect(await db.products.get(created.product.id)).toMatchObject({ soldBy: 'weight', stockQty: 3 });
  expect(await db.outbox.toArray()).toMatchObject([{ kind: 'product', payloadRef: { source: 'entity', entity: { id: created.product.id } } }]);
  await expect(hasPendingProductCreate(db, created.product.id)).resolves.toBe(true);
});

test('receives injectable stock with its lot in the same local transaction and queues a stock movement', async () => {
  const db = createClinicDb(`inventory-${crypto.randomUUID()}`); databases.push(db); await db.open();
  await db.products.put({ id: 'p7', name: 'Botox', category: 'Injectables', subcategory: null, sortOrder: 0, barcode: null, cost: 0, price: 80_000, stockQty: 1, lowStockAt: 1, reorderAt: 1, stockType: 'injectable', soldBy: 'each', requiresLot: true, requiresConsent: false, unitLabel: null, photoKey: null, lots: [], active: true });
  await receiveStock({ db, now: 2, uuid: (() => { let count = 0; return () => `receive-${++count}`; })(), input: { productId: 'p7', qty: 2, cost: 30_000, lotNo: 'L-9', lotExpiry: '2027-01-01' } });
  expect(await db.products.get('p7')).toMatchObject({ stockQty: 3, cost: 30_000, lots: [{ lotNo: 'L-9', expiry: '2027-01-01', qty: 2 }] });
  expect(await db.outbox.toArray()).toMatchObject([{ kind: 'stockReceive', payloadRef: { source: 'inline' } }]);
});

test('refuses pending product edits and replaces local data only after elevated server success', async () => {
  const db = createClinicDb(`inventory-${crypto.randomUUID()}`); databases.push(db); await db.open();
  await db.products.put({ id: 'p1', name: 'Before', category: 'Skin', subcategory: null, sortOrder: 0, barcode: null, cost: 1, price: 2, stockQty: 1, lowStockAt: 1, reorderAt: 1, stockType: 'retail', soldBy: 'each', requiresLot: false, requiresConsent: false, unitLabel: null, photoKey: null, lots: [], active: true });
  const api = { updateProduct: async () => ({ id: 'p1', name: 'After', price: 10, stock_type: 'retail' as const, sold_by: 'each' as const }) } as Pick<ApiClient, 'updateProduct'>;
  await expect(updateExistingProduct({ db, api, productId: 'p1', patch: { price: 10 }, elevationToken: 'e1' })).resolves.toMatchObject({ name: 'After', price: 10 });
  expect(await db.products.get('p1')).toMatchObject({ name: 'After', price: 10 });
});
