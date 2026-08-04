import { z } from './zod';
import type { ClinicDb } from '@/data/db';
import { clinicPatchSchema, type ClinicPatchWire } from '@/data/types';
import type { Locale } from '@/i18n';

export const printerTransportIdSchema = z.enum(['sunmi-sdk', 'xprinter-lan', 'xprinter-bluetooth', 'epson-epos', 'generic-escpos']);
export type PrinterTransportId = z.infer<typeof printerTransportIdSchema>;

export const printerProfileSchema = z.object({
  version: z.literal(1),
  transport: printerTransportIdSchema,
  width: z.union([z.literal(576), z.literal(384)]),
});
export type PrinterProfile = z.infer<typeof printerProfileSchema>;

const localeSchema = z.enum(['my', 'en', 'zh']);

export type ReceiptDesignerDraft = {
  version: 1;
  fields: ClinicPatchWire;
};

export function printerProfileMetaKey(deviceId: string): string {
  return `printer-profile:v1:${deviceId}`;
}

export function receiptDesignerDraftMetaKey(deviceId: string): string {
  return `receipt-designer-draft:v1:${deviceId}`;
}

export function localePreferenceMetaKey(deviceId: string): string {
  return `device-locale:v1:${deviceId}`;
}

export async function savePrinterProfile(db: Pick<ClinicDb, 'meta'>, deviceId: string, profile: PrinterProfile): Promise<void> {
  await db.meta.put({ key: printerProfileMetaKey(deviceId), value: printerProfileSchema.parse(profile) });
}

export async function readPrinterProfile(db: Pick<ClinicDb, 'meta'>, deviceId: string): Promise<PrinterProfile | undefined> {
  const row = await db.meta.get(printerProfileMetaKey(deviceId));
  return row === undefined ? undefined : printerProfileSchema.parse(row.value);
}

export async function saveReceiptDesignerDraft(db: Pick<ClinicDb, 'meta'>, deviceId: string, draft: ReceiptDesignerDraft): Promise<void> {
  await db.meta.put({
    key: receiptDesignerDraftMetaKey(deviceId),
    value: { version: 1, fields: clinicPatchSchema.parse(draft.fields) },
  });
}

export async function readReceiptDesignerDraft(db: Pick<ClinicDb, 'meta'>, deviceId: string): Promise<ReceiptDesignerDraft | undefined> {
  const row = await db.meta.get(receiptDesignerDraftMetaKey(deviceId));
  if (row === undefined) return undefined;
  const value = z.object({ version: z.literal(1), fields: clinicPatchSchema }).parse(row.value);
  return value;
}

export async function saveLocalePreference(db: Pick<ClinicDb, 'meta'>, deviceId: string, locale: Locale): Promise<void> {
  await db.meta.put({ key: localePreferenceMetaKey(deviceId), value: localeSchema.parse(locale) });
}

export async function readLocalePreference(db: Pick<ClinicDb, 'meta'>, deviceId: string): Promise<Locale | undefined> {
  const row = await db.meta.get(localePreferenceMetaKey(deviceId));
  return row === undefined ? undefined : localeSchema.parse(row.value);
}
