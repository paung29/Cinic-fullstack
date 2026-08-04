import type { ApiClient } from '@/data/api';
import type { ClinicDb } from '@/data/db';
import { clinicPatchSchema, toLocalClinic, type ClinicPatchWire, type ClinicRow } from '@/data/types';

export async function saveClinicConfig(input: {
  db: ClinicDb;
  api: Pick<ApiClient, 'updateClinic'>;
  patch: ClinicPatchWire;
  elevationToken: string;
}): Promise<ClinicRow> {
  const patch = clinicPatchSchema.parse(input.patch);
  const confirmed = await input.api.updateClinic(patch, input.elevationToken);
  const clinic = toLocalClinic(confirmed);
  await input.db.clinic.put(clinic);
  return clinic;
}
