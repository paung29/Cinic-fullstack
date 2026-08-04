import { type ApiClient } from '@/data/api';
import { purgeOffboardedEnvelope } from '@/data/adminEnvelopes';
import {
  activeProtectedKeys,
  clearDeferredChange,
  deferInboundChange,
  entityKey,
  type ClinicDb,
} from '@/data/db';
import {
  appointmentSchema,
  clinicSchema,
  contactSchema,
  deltaChangeSchema,
  patientSchema,
  productSchema,
  saleSchema,
  serviceSchema,
  staffSchema,
  toLocalAppointment,
  toLocalClinic,
  toLocalContact,
  toLocalPatient,
  toLocalProduct,
  toLocalSale,
  toLocalService,
  toLocalStaff,
  type BootstrapWire,
  type DeltaChangeWire,
} from '@/data/types';

export type Clock = {
  now(): number;
};

export type SyncStaffResult = {
  offboardedStaffIds: string[];
};

type InboundChange = {
  entity: DeltaChangeWire['entity'];
  op: DeltaChangeWire['op'];
  row: unknown;
};

export function serverTimeOffset(serverTime: string, clock: Clock): number {
  return Date.parse(serverTime) - clock.now();
}

export async function bootstrap(options: {
  db: ClinicDb;
  api: ApiClient;
  deviceId: string;
  clock: Clock;
}): Promise<SyncStaffResult> {
  const payload = await options.api.bootstrap();
  let offboardedStaffIds: string[] = [];

  await withSyncTransaction(options.db, async () => {
    offboardedStaffIds = await applyInboundChanges(options.db, bootstrapChanges(payload), options.clock.now());
    await options.db.meta.bulkPut([
      { key: 'serverTimeOffset', value: serverTimeOffset(payload.server_time, options.clock) },
      { key: 'sinceCursor', value: payload.cursor },
      { key: 'deviceId', value: options.deviceId },
    ]);
  });

  return { offboardedStaffIds };
}

export async function pullDelta(options: { db: ClinicDb; api: ApiClient; clock: Clock }): Promise<SyncStaffResult> {
  const cursor = await readCursor(options.db);
  const payload = await options.api.delta(cursor);
  let offboardedStaffIds: string[] = [];

  await withSyncTransaction(options.db, async () => {
    offboardedStaffIds = await applyInboundChanges(options.db, payload.changes, options.clock.now());
    await options.db.meta.bulkPut([
      { key: 'serverTimeOffset', value: serverTimeOffset(payload.server_time, options.clock) },
      { key: 'sinceCursor', value: payload.cursor },
    ]);
  });

  return { offboardedStaffIds };
}

export async function reconcileAuthoritativeChange(db: ClinicDb, change: InboundChange): Promise<void> {
  await withSyncTransaction(db, async () => {
    await reconcileAuthoritativeChangeInTransaction(db, change);
  });
}

export async function reconcileAuthoritativeChangeInTransaction(
  db: ClinicDb,
  change: InboundChange,
): Promise<void> {
  const normalizedChange = deltaChangeSchema.parse(change);
  await applyValidatedInboundChange(db, normalizedChange, new Set(), 0);
  const ref = protectedEntityRef(normalizedChange);
  if (ref !== undefined) {
    await clearDeferredChange(db, ref);
  }
}

function bootstrapChanges(payload: BootstrapWire): InboundChange[] {
  return [
    { entity: 'clinic', op: 'upsert', row: payload.clinic },
    ...payload.staff.map((row) => ({ entity: 'staff' as const, op: 'upsert' as const, row })),
    ...payload.services.map((row) => ({ entity: 'service' as const, op: 'upsert' as const, row })),
    ...payload.products.map((row) => ({ entity: 'product' as const, op: 'upsert' as const, row })),
    ...payload.patients.map((row) => ({ entity: 'patient' as const, op: 'upsert' as const, row })),
    ...payload.appointments.map((row) => ({ entity: 'appointment' as const, op: 'upsert' as const, row })),
    ...payload.recent_sales.map((row) => ({ entity: 'sale' as const, op: 'upsert' as const, row })),
  ];
}

async function readCursor(db: ClinicDb): Promise<number> {
  const row = await db.meta.get('sinceCursor');
  return typeof row?.value === 'number' ? row.value : 0;
}

async function applyInboundChanges(db: ClinicDb, changes: readonly InboundChange[], now: number): Promise<string[]> {
  const offboardedStaffIds = new Set<string>();
  for (const change of changes) {
    const validatedChange = deltaChangeSchema.parse(change);
    const protectedKeys = await activeProtectedKeys(db);
    const offboardedStaffId = await applyValidatedInboundChange(db, validatedChange, protectedKeys, now);
    if (offboardedStaffId !== undefined) {
      offboardedStaffIds.add(offboardedStaffId);
    }
  }

  return [...offboardedStaffIds];
}

async function applyValidatedInboundChange(
  db: ClinicDb,
  change: DeltaChangeWire,
  protectedKeys: ReadonlySet<string>,
  now: number,
): Promise<string | undefined> {
  const ref = protectedEntityRef(change);
  if (ref !== undefined && protectedKeys.has(entityKey(ref))) {
    await deferInboundChange(db, ref, change);
    return undefined;
  }

  if (change.op === 'delete') {
    await deleteInboundRow(db, change);
    if (change.entity === 'staff') {
      const staffId = inboundId(change);
      await purgeOffboardedEnvelope(db, { targetStaffId: staffId, now });
      return staffId;
    }
    return undefined;
  }

  await upsertInboundRow(db, change);
  if (change.entity === 'staff' && change.row.active === false) {
    const staffId = inboundId(change);
    await purgeOffboardedEnvelope(db, { targetStaffId: staffId, now });
    return staffId;
  }

  return undefined;
}

function protectedEntityRef(change: DeltaChangeWire):
  | { table: 'patients' | 'products' | 'sales' | 'appointments' | 'contacts'; id: string }
  | undefined {
  const id = change.row.id;
  if (typeof id !== 'string') {
    throw new Error(`Delta ${change.entity} row is missing its string id.`);
  }

  switch (change.entity) {
    case 'patient':
      return { table: 'patients', id };
    case 'product':
      return { table: 'products', id };
    case 'sale':
      return { table: 'sales', id };
    case 'appointment':
      return { table: 'appointments', id };
    case 'contact':
      return { table: 'contacts', id };
    case 'clinic':
    case 'service':
    case 'staff':
      return undefined;
  }
}

function inboundId(change: DeltaChangeWire): string {
  const id = change.row.id;
  if (typeof id !== 'string') {
    throw new Error(`Delta ${change.entity} row is missing its string id.`);
  }

  return id;
}

async function deleteInboundRow(db: ClinicDb, change: DeltaChangeWire): Promise<void> {
  const id = inboundId(change);
  switch (change.entity) {
    case 'service':
      await db.services.delete(id);
      return;
    case 'product':
      await db.products.delete(id);
      return;
    case 'patient':
      await db.patients.delete(id);
      return;
    case 'appointment':
      await db.appointments.delete(id);
      return;
    case 'sale':
      await db.sales.delete(id);
      return;
    case 'clinic':
      await db.clinic.delete(id);
      return;
    case 'staff':
      await db.staff.delete(id);
      return;
    case 'contact':
      await db.contacts.delete(id);
  }
}

async function upsertInboundRow(db: ClinicDb, change: DeltaChangeWire): Promise<void> {
  switch (change.entity) {
    case 'service':
      await db.services.put(toLocalService(serviceSchema.parse(change.row)));
      return;
    case 'product':
      await db.products.put(toLocalProduct(productSchema.parse(change.row)));
      return;
    case 'patient':
      await db.patients.put(toLocalPatient(patientSchema.parse(change.row)));
      return;
    case 'appointment':
      {
        const appointment = toLocalAppointment(appointmentSchema.parse(change.row));
        const existing = await db.appointments.get(appointment.id);
        await db.appointments.put({ ...appointment, syncConflict: existing?.syncConflict ?? false });
      }
      return;
    case 'sale':
      await db.sales.put(toLocalSale(saleSchema.parse(change.row)));
      return;
    case 'clinic':
      await db.clinic.put(toLocalClinic(clinicSchema.parse(change.row)));
      return;
    case 'staff':
      await db.staff.put(toLocalStaff(staffSchema.parse(change.row)));
      return;
    case 'contact':
      await db.contacts.put(toLocalContact(contactSchema.parse(change.row)));
  }
}

async function withSyncTransaction(db: ClinicDb, work: () => Promise<void>): Promise<void> {
  await db.transaction('rw', [
    db.appointments,
    db.clinic,
    db.contacts,
    db.leads,
    db.meta,
    db.outbox,
    db.patients,
    db.products,
    db.sales,
    db.services,
    db.staff,
  ], work);
}
