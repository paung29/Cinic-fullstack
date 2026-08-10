import type { ClinicDb } from '@/data/db';
import { downscaleToJpeg } from '@/data/photoBlob';

/**
 * Shelf photos so staff can recognise a product by sight rather than by
 * reading a name off a list — the difference between finding the right box
 * first time and reading four labels with a patient waiting.
 *
 * These live in the device asset store, like the receipt logo and the payment
 * QR. That means they are per-device: a second device paired to the same
 * clinic will not show photos added here until product images are carried by
 * the server, which needs an upload endpoint that does not exist yet.
 */
export const PRODUCT_PHOTO_PREFIX = 'product-photo:';

// A shelf thumbnail never needs camera resolution, and every one of these sits
// in the device's storage quota alongside the clinical photo library.
const PRODUCT_PHOTO_MAX_DIMENSION = 640;

export function productPhotoKey(productId: string): string {
  return `${PRODUCT_PHOTO_PREFIX}${productId}`;
}

export async function readProductPhoto(db: ClinicDb, productId: string): Promise<Blob | undefined> {
  const row = await db.receiptAssets.get(productPhotoKey(productId));
  return row?.blob;
}

export async function writeProductPhoto(db: ClinicDb, productId: string, file: Blob): Promise<void> {
  const blob = await downscaleToJpeg(file, PRODUCT_PHOTO_MAX_DIMENSION);
  await db.receiptAssets.put({ blob, key: productPhotoKey(productId) });
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
