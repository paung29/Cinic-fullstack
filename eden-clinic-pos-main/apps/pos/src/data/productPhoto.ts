import type { ApiClient } from '@/data/api';
import type { ClinicDb } from '@/data/db';
import { downscaleToJpeg } from '@/data/photoBlob';
import type { ProductRow } from '@/data/types';

/**
 * Shelf photos, so staff recognise a product by sight rather than by reading a
 * name off a list — the difference between reaching for the right box first
 * time and reading four labels with a patient waiting.
 *
 * The photo lives on the server so every device in the clinic sees it. What
 * sits on the device is a cache tagged with the server fingerprint it was
 * downloaded at, so opening Stocks re-downloads only what actually changed. A
 * photo taken while offline is cached with no fingerprint, and that absence is
 * exactly how the reconciler recognises one that still owes an upload.
 */
export const PRODUCT_PHOTO_PREFIX = 'product-photo:';

// A shelf thumbnail never needs camera resolution, and every one of these
// crosses a clinic's internet connection and lands in its database.
const PRODUCT_PHOTO_MAX_DIMENSION = 640;

export function productPhotoKey(productId: string): string {
  return `${PRODUCT_PHOTO_PREFIX}${productId}`;
}

export async function readProductPhoto(db: ClinicDb, productId: string): Promise<Blob | undefined> {
  const row = await db.receiptAssets.get(productPhotoKey(productId));
  return row?.blob;
}

export async function clearProductPhoto(db: ClinicDb, productId: string): Promise<void> {
  await db.receiptAssets.delete(productPhotoKey(productId));
}

/** One pass for a whole table, rather than a read per rendered row. */
export async function readProductPhotos(db: ClinicDb, productIds: readonly string[]): Promise<Map<string, Blob>> {
  const found = new Map<string, Blob>();
  if (productIds.length === 0) return found;
  const rows = await db.receiptAssets.bulkGet(productIds.map(productPhotoKey));
  rows.forEach((row, index) => {
    const id = productIds[index];
    if (row?.blob !== undefined && id !== undefined) found.set(id, row.blob);
  });
  return found;
}

/** The server fingerprint each cached copy was taken at; absent means "mine, not yet uploaded". */
export async function cachedPhotoKeys(db: ClinicDb, productIds: readonly string[]): Promise<Map<string, string | undefined>> {
  const held = new Map<string, string | undefined>();
  if (productIds.length === 0) return held;
  const rows = await db.receiptAssets.bulkGet(productIds.map(productPhotoKey));
  rows.forEach((row, index) => {
    const id = productIds[index];
    if (row !== undefined && id !== undefined) held.set(id, row.photoKey);
  });
  return held;
}

/**
 * Take a photo on this device. It is stored immediately so the picture appears
 * whether or not there is internet, and left without a fingerprint so the next
 * reconcile knows to send it.
 */
export async function stageProductPhoto(db: ClinicDb, productId: string, file: Blob): Promise<Blob> {
  const blob = await downscaleToJpeg(file, PRODUCT_PHOTO_MAX_DIMENSION);
  await db.receiptAssets.put({ blob, key: productPhotoKey(productId) });
  return blob;
}

async function cacheServerPhoto(db: ClinicDb, productId: string, photoKey: string, blob: Blob): Promise<void> {
  await db.receiptAssets.put({ blob, key: productPhotoKey(productId), photoKey });
}

function base64ToBlob(data: string, contentType: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: contentType });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked: spreading a whole image into String.fromCharCode blows the
  // argument limit on anything but a thumbnail.
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

export type PhotoReconcileResult = { uploaded: number; downloaded: number; removed: number; offline: boolean };

/**
 * Bring this device's photo cache in line with the clinic's.
 *
 * Deliberately not routed through the sales outbox. That queue drains in order
 * and a 200KB image sitting at its head on a bad connection would hold up the
 * sales behind it — money waits for a picture. Photos instead settle up
 * whenever Stocks is opened, which is the only place they are looked at.
 *
 * Three cases, in one pass:
 *  - cached with no fingerprint  → taken here, still owes an upload
 *  - product fingerprint differs → someone else changed it, pull the new one
 *  - product has none, cache does → deleted elsewhere, drop our copy
 *
 * A cached copy with no fingerprint is never deleted, because that is a photo
 * this device took and has not managed to send yet.
 */
export async function reconcileProductPhotos(
  db: ClinicDb,
  api: Pick<ApiClient, 'putProductPhoto' | 'getProductPhoto'>,
  products: readonly ProductRow[],
): Promise<PhotoReconcileResult> {
  const result: PhotoReconcileResult = { uploaded: 0, downloaded: 0, removed: 0, offline: false };
  const held = await cachedPhotoKeys(db, products.map((product) => product.id));

  for (const product of products) {
    const cachedKey = held.get(product.id);
    const isCached = held.has(product.id);
    try {
      if (isCached && cachedKey === undefined) {
        if (api.putProductPhoto === undefined) continue;
        const blob = await readProductPhoto(db, product.id);
        if (blob === undefined) continue;
        const saved = await api.putProductPhoto(product.id, {
          content_type: blob.type === '' ? 'image/jpeg' : blob.type,
          data: await blobToBase64(blob),
        });
        if (saved.photo_key != null) {
          await cacheServerPhoto(db, product.id, saved.photo_key, blob);
          // The local row has to learn its own new fingerprint here. Leave it
          // null and the next pass reads "server has no photo, cache does" and
          // deletes the picture it just finished uploading.
          await db.products.update(product.id, { photoKey: saved.photo_key });
        }
        result.uploaded += 1;
        continue;
      }
      if (product.photoKey !== null && product.photoKey !== cachedKey) {
        if (api.getProductPhoto === undefined) continue;
        const remote = await api.getProductPhoto(product.id);
        await cacheServerPhoto(db, product.id, remote.photo_key, base64ToBlob(remote.data, remote.content_type));
        result.downloaded += 1;
        continue;
      }
      if (product.photoKey === null && isCached && cachedKey !== undefined) {
        await clearProductPhoto(db, product.id);
        result.removed += 1;
      }
    } catch {
      // One unreachable product must not abandon the rest, and being offline
      // is an ordinary state here rather than a failure worth shouting about.
      result.offline = true;
    }
  }

  return result;
}
