import type { ApiClient } from '@/data/api';
import type { ClinicDb } from '@/data/db';
import { enqueueOutbox } from '@/data/outbox';
import { productPatchSchema, toLocalProduct, type ProductPatchWire, type ProductRow } from '@/data/types';

export type CreateProductInput = {
  db: ClinicDb;
  now: number;
  uuid(): string;
  input: Omit<ProductRow, 'id'>;
};

export type ReceiveStockInput = {
  db: ClinicDb;
  now: number;
  uuid(): string;
  input: { productId: string; qty: number; cost?: number; lotNo?: string; lotExpiry?: string };
};

export async function createProduct(input: CreateProductInput): Promise<{ product: ProductRow; outboxUuid: string }> {
  const product: ProductRow = { ...input.input, id: input.uuid() };
  const outboxUuid = input.uuid();
  await input.db.transaction('rw', input.db.products, input.db.outbox, async () => {
    await input.db.products.add(product);
    await enqueueOutbox(input.db, {
      kind: 'product',
      uuid: outboxUuid,
      now: input.now,
      payloadRef: {
        source: 'entity',
        entity: { table: 'products', id: product.id },
        protectedEntities: [{ table: 'products', id: product.id }],
      },
    });
  });
  return { product, outboxUuid };
}

export async function receiveStock(input: ReceiveStockInput): Promise<{ product: ProductRow; outboxUuid: string }> {
  const receiveId = input.uuid();
  const outboxUuid = input.uuid();
  let updated: ProductRow | undefined;
  await input.db.transaction('rw', input.db.products, input.db.outbox, async () => {
    const product = await input.db.products.get(input.input.productId);
    if (product === undefined) throw new Error('Product is unavailable.');
    const lots = mergeLots(product, input.input);
    updated = { ...product, stockQty: product.stockQty + input.input.qty, cost: input.input.cost ?? product.cost, lots };
    await input.db.products.put(updated);
    await enqueueOutbox(input.db, {
      kind: 'stockReceive',
      uuid: outboxUuid,
      now: input.now,
      payloadRef: {
        source: 'inline',
        payload: {
          id: receiveId,
          product_id: input.input.productId,
          qty: input.input.qty,
          ...(input.input.cost === undefined ? {} : { cost: input.input.cost }),
          ...(input.input.lotNo === undefined ? {} : { lot_no: input.input.lotNo }),
          ...(input.input.lotExpiry === undefined ? {} : { lot_expiry: input.input.lotExpiry }),
        },
        protectedEntities: [{ table: 'products', id: input.input.productId }],
      },
    });
  });
  if (updated === undefined) throw new Error('Stock receive did not complete.');
  return { product: updated, outboxUuid };
}

export async function updateExistingProduct(input: {
  db: ClinicDb;
  api: Pick<ApiClient, 'updateProduct'>;
  productId: string;
  patch: ProductPatchWire;
  elevationToken: string;
}): Promise<ProductRow> {
  if (await hasPendingProductCreate(input.db, input.productId)) {
    throw new Error('Product is waiting to sync before it can be edited.');
  }
  const confirmed = await input.api.updateProduct(input.productId, productPatchSchema.parse(input.patch), input.elevationToken);
  const row = toLocalProduct(confirmed);
  const existing = await input.db.products.get(input.productId);
  await input.db.products.put(existing === undefined ? row : { ...row, lots: existing.lots });
  return existing === undefined ? row : { ...row, lots: existing.lots };
}

export async function hasPendingProductCreate(db: Pick<ClinicDb, 'outbox'>, productId: string): Promise<boolean> {
  const rows = await db.outbox.toArray();
  return rows.some((row) => row.status !== 'done'
    && row.kind === 'product'
    && row.payloadRef.source === 'entity'
    && row.payloadRef.entity.table === 'products'
    && row.payloadRef.entity.id === productId);
}

function mergeLots(product: ProductRow, input: ReceiveStockInput['input']): ProductRow['lots'] {
  if (product.stockType !== 'injectable' || input.lotNo === undefined) return product.lots;
  const existing = product.lots.find((lot) => lot.lotNo === input.lotNo && lot.expiry === (input.lotExpiry ?? null));
  if (existing === undefined) return [...product.lots, { lotNo: input.lotNo, expiry: input.lotExpiry ?? null, qty: input.qty }];
  return product.lots.map((lot) => lot === existing ? { ...lot, qty: lot.qty + input.qty } : lot);
}
