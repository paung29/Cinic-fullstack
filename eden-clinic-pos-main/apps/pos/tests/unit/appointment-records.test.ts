import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createAppointment, isSlotOccupied, setAppointmentStatus } from '@/data/appointmentRecords';
import { createClinicDb, type ClinicDb } from '@/data/db';
import { createPatient } from '@/data/patientRecords';
import type { AppointmentRow } from '@/data/types';

const databaseNames: string[] = [];
let databases: ClinicDb[] = [];

async function createDatabase(): Promise<ClinicDb> {
  const name = `eden-appointment-record-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const db = createClinicDb(name);
  databases.push(db);
  await db.open();
  return db;
}

beforeEach(() => {
  Dexie.dependencies.indexedDB = indexedDB;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  databases = [];
});

afterEach(async () => {
  for (const db of databases) db.close();
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe('appointment records', () => {
  test('creates a booking dependent on a newly created patient and protects both entities for merge rewrite', async () => {
    const db = await createDatabase();
    const patient = await createPatient(db, {
      id: 'patient-local-2', name: 'Daw Nu', phone: '09 450 111 222', sex: null,
      telegramLinked: false, allergies: null, alertNote: null, now: 10,
    });

    const booking = await createAppointment(db, {
      id: 'appointment-local-1', date: '2026-08-01', time: '09:30', staffId: 's1',
      patientId: patient.patient.id, serviceId: 'v1', dependsOnUuid: patient.outboxUuid, now: 11,
    });

    expect(booking.appointment).toMatchObject({ id: 'appointment-local-1', status: 'booked', syncConflict: false });
    expect(await db.outbox.filter((row) => row.uuid === booking.outboxUuid).first()).toMatchObject({
      kind: 'appointment',
      dependsOnUuid: patient.outboxUuid,
      payloadRef: {
        source: 'entity',
        protectedEntities: [
          { table: 'appointments', id: 'appointment-local-1' },
          { table: 'patients', id: 'patient-local-2' },
        ],
      },
    });
  });

  test('derives occupied same-device slots from booked and arrived appointments only', () => {
    const rows: AppointmentRow[] = [
      { id: 'booked', date: '2026-08-01', time: '10:00', staffId: 's1', patientId: 'c1', serviceId: 'v1', status: 'booked', syncConflict: false },
      { id: 'cancelled', date: '2026-08-01', time: '10:00', staffId: 's2', patientId: 'c2', serviceId: 'v1', status: 'cancelled', syncConflict: false },
      { id: 'done', date: '2026-08-01', time: '11:00', staffId: 's1', patientId: 'c3', serviceId: 'v1', status: 'done', syncConflict: false },
    ];

    expect(isSlotOccupied(rows, 's1', '2026-08-01', '10:00')).toBe(true);
    expect(isSlotOccupied(rows, 's2', '2026-08-01', '10:00')).toBe(false);
    expect(isSlotOccupied(rows, 's1', '2026-08-01', '11:00')).toBe(false);
  });

  test('makes a status update wait for its pending create row and persists the local state first', async () => {
    const db = await createDatabase();
    const booking = await createAppointment(db, {
      id: 'appointment-local-2', date: '2026-08-01', time: '11:00', staffId: 's1',
      patientId: 'c1', serviceId: 'v1', dependsOnUuid: null, now: 20,
    });

    const statusUuid = await setAppointmentStatus(db, {
      appointmentId: booking.appointment.id,
      status: 'here',
      dependsOnUuid: null,
      now: 21,
    });

    expect(await db.appointments.get(booking.appointment.id)).toMatchObject({ status: 'here' });
    expect(await db.outbox.filter((row) => row.uuid === statusUuid).first()).toMatchObject({
      kind: 'appointmentStatus',
      dependsOnUuid: booking.outboxUuid,
      payloadRef: { source: 'inline', payload: { appointment_id: 'appointment-local-2', status: 'here' } },
    });
  });
});
