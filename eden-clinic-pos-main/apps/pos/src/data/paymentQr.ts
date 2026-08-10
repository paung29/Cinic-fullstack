import type { ClinicDb } from '@/data/db';

/**
 * The clinic's own KBZPay merchant QR, uploaded once in Setup and shown to the
 * customer at payment.
 *
 * It is deliberately a static image rather than a per-sale generated code: an
 * amount-encoded KBZPay QR can only be minted by the bank against a merchant
 * agreement, and faking one client-side would produce a code that scans into
 * the wrong amount — or nothing at all. Staff read the amount off the screen
 * beside the QR and confirm once the customer's transfer lands.
 */
export const PAYMENT_QR_KEY = 'payment-qr:kbzpay:v1';

export async function readPaymentQr(db: ClinicDb): Promise<Blob | undefined> {
  const row = await db.receiptAssets.get(PAYMENT_QR_KEY);
  return row?.blob;
}

export async function writePaymentQr(db: ClinicDb, qr: Blob): Promise<void> {
  await db.receiptAssets.put({ blob: qr, key: PAYMENT_QR_KEY });
}

export async function clearPaymentQr(db: ClinicDb): Promise<void> {
  await db.receiptAssets.delete(PAYMENT_QR_KEY);
}
