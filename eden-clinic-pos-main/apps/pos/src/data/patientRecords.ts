import type { ClinicDb } from '@/data/db';
import { enqueueOutbox } from '@/data/outbox';
import type { PatientRow } from '@/data/types';

export type CreatePatientInput = {
  id: string;
  name: string;
  phone: string;
  sex: string | null;
  telegramLinked: boolean;
  allergies: string | null;
  alertNote: string | null;
  now: number;
};

export type CreatedPatient = {
  patient: PatientRow;
  outboxUuid: string;
};

export async function createPatient(db: ClinicDb, input: CreatePatientInput): Promise<CreatedPatient> {
  const patient: PatientRow = {
    id: input.id,
    code: null,
    name: input.name,
    phone: input.phone,
    sex: input.sex,
    allergies: input.allergies,
    alertNote: input.alertNote,
    telegramLinked: input.telegramLinked,
    followupDate: null,
  };
  const outboxUuid = crypto.randomUUID();

  await db.transaction('rw', db.patients, db.outbox, async () => {
    await db.patients.add(patient);
    await enqueueOutbox(db, {
      kind: 'patient',
      uuid: outboxUuid,
      now: input.now,
      payloadRef: {
        source: 'entity',
        entity: { table: 'patients', id: patient.id },
        protectedEntities: [{ table: 'patients', id: patient.id }],
      },
    });
  });

  return { patient, outboxUuid };
}
