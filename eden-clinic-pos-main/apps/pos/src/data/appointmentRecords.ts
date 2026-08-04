import type { ClinicDb } from '@/data/db';
import { enqueueOutbox } from '@/data/outbox';
import type { AppointmentRow, AppointmentStatus, OutboxRow } from '@/data/types';

export type CreateAppointmentInput = {
  id: string;
  date: string;
  time: string;
  staffId: string;
  patientId: string;
  serviceId: string;
  dependsOnUuid: string | null;
  now: number;
};

export type CreatedAppointment = {
  appointment: AppointmentRow;
  outboxUuid: string;
};

export async function createAppointment(db: ClinicDb, input: CreateAppointmentInput): Promise<CreatedAppointment> {
  const appointment: AppointmentRow = {
    id: input.id,
    date: input.date,
    time: input.time,
    staffId: input.staffId,
    patientId: input.patientId,
    serviceId: input.serviceId,
    status: 'booked',
    syncConflict: false,
  };
  const outboxUuid = crypto.randomUUID();

  await db.transaction('rw', db.appointments, db.outbox, async () => {
    await db.appointments.add(appointment);
    await enqueueOutbox(db, {
      kind: 'appointment',
      uuid: outboxUuid,
      now: input.now,
      dependsOnUuid: input.dependsOnUuid,
      payloadRef: {
        source: 'entity',
        entity: { table: 'appointments', id: appointment.id },
        protectedEntities: [
          { table: 'appointments', id: appointment.id },
          { table: 'patients', id: appointment.patientId },
        ],
      },
    });
  });

  return { appointment, outboxUuid };
}

export async function setAppointmentStatus(
  db: ClinicDb,
  input: { appointmentId: string; status: AppointmentStatus; dependsOnUuid: string | null; now: number },
): Promise<string> {
  const outboxUuid = crypto.randomUUID();

  await db.transaction('rw', db.appointments, db.outbox, async () => {
    const appointment = await db.appointments.get(input.appointmentId);
    if (appointment === undefined) {
      throw new Error(`Appointment ${input.appointmentId} is unavailable.`);
    }

    await db.appointments.update(appointment.id, { status: input.status });
    await enqueueOutbox(db, {
      kind: 'appointmentStatus',
      uuid: outboxUuid,
      now: input.now,
      dependsOnUuid: input.dependsOnUuid ?? pendingCreateUuid(await db.outbox.toArray(), input.appointmentId),
      payloadRef: {
        source: 'inline',
        payload: { appointment_id: input.appointmentId, status: input.status },
        protectedEntities: [{ table: 'appointments', id: input.appointmentId }],
      },
    });
  });

  return outboxUuid;
}

export function isSlotOccupied(
  appointments: readonly AppointmentRow[],
  staffId: string,
  date: string,
  time: string,
): boolean {
  return appointments.some((appointment) => (
    appointment.staffId === staffId
    && appointment.date === date
    && appointment.time === time
    && (appointment.status === 'booked' || appointment.status === 'here')
  ));
}

function pendingCreateUuid(rows: readonly OutboxRow[], appointmentId: string): string | null {
  return rows.find((row) => (
    row.kind === 'appointment'
    && row.status !== 'done'
    && row.payloadRef.source === 'entity'
    && row.payloadRef.entity.table === 'appointments'
    && row.payloadRef.entity.id === appointmentId
  ))?.uuid ?? null;
}
