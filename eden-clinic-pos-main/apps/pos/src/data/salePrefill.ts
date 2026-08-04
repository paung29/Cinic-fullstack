import type { ClinicDb } from '@/data/db';

export const salePrefillMetaKey = 'sale-prefill';

export type SalePrefill = {
  appointmentId: string;
  patientId: string;
  serviceId: string;
};

export async function stageSalePrefill(db: ClinicDb, prefill: SalePrefill): Promise<void> {
  await db.meta.put({ key: salePrefillMetaKey, value: prefill });
}

export async function consumeSalePrefill(db: ClinicDb): Promise<SalePrefill | undefined> {
  return db.transaction('rw', db.meta, async () => {
    const row = await db.meta.get(salePrefillMetaKey);
    if (row === undefined) {
      return undefined;
    }
    if (!isSalePrefill(row.value)) {
      throw new Error('The staged sale prefill is invalid.');
    }

    await db.meta.delete(salePrefillMetaKey);
    return row.value;
  });
}

export async function rewriteStagedSalePrefillPatient(
  db: Pick<ClinicDb, 'meta'>,
  sourcePatientId: string,
  targetPatientId: string,
): Promise<void> {
  const row = await db.meta.get(salePrefillMetaKey);
  if (row === undefined || !isSalePrefill(row.value) || row.value.patientId !== sourcePatientId) {
    return;
  }

  await db.meta.put({ key: salePrefillMetaKey, value: { ...row.value, patientId: targetPatientId } });
}

function isSalePrefill(value: unknown): value is SalePrefill {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.appointmentId === 'string'
    && typeof candidate.patientId === 'string'
    && typeof candidate.serviceId === 'string';
}
