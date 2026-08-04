import {
  ApiAuthError,
  ApiHttpError,
  ApiNetworkError,
  type ApiClient,
  type OutboxDispatch,
  type OutboxDispatchResult,
} from '@/data/api';
import { reconcileAuthoritativeChangeInTransaction, type Clock } from '@/data/bootstrap';
import { clearDeferredChange, type ClinicDb } from '@/data/db';
import { rewriteStagedSalePrefillPatient } from '@/data/salePrefill';
import {
  appointmentSchema,
  appointmentStatusUpdateSchema,
  contactSchema,
  patientSchema,
  paymentSchema,
  productSchema,
  saleSchema,
  stockReceiveSchema,
  toWireAppointment,
  toWireContact,
  toWirePatient,
  toWireProduct,
  toWireSale,
  type EntityRef,
  type JsonValue,
  type OutboxKind,
  type OutboxRow,
  type PayloadRef,
} from '@/data/types';

export type OutboxEnqueueInput = {
  kind: OutboxKind;
  uuid: string;
  payloadRef: PayloadRef;
  dependsOnUuid?: string | null;
  now: number;
};

export type OutboxStatusView = {
  state: 'synced' | 'syncing' | 'offline' | 'attention';
  pendingCount: number;
  attentionCount: number;
  drainProgress: number;
};

export function buildOutboxRow(input: OutboxEnqueueInput): OutboxRow {
  return {
    kind: input.kind,
    uuid: input.uuid,
    payloadRef: input.payloadRef,
    dependsOnUuid: input.dependsOnUuid ?? null,
    attempts: 0,
    nextAt: input.now,
    status: 'pending',
    lastErrorStatus: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  };
}

export async function enqueueOutbox(
  db: Pick<ClinicDb, 'outbox'>,
  input: OutboxEnqueueInput,
): Promise<number> {
  return db.outbox.add(buildOutboxRow(input));
}

export function createOutbox(options: {
  db: ClinicDb;
  api: Pick<ApiClient, 'dispatch'>;
  clock: Clock;
  jitter: (baseMs: number) => number;
}): { drain(): Promise<OutboxStatusView>; status(): Promise<OutboxStatusView> } {
  let drainPromise: Promise<OutboxStatusView> | undefined;
  let offline = false;
  let drainTotal = 0;
  let drainCompleted = 0;

  async function status(): Promise<OutboxStatusView> {
    const rows = await options.db.outbox.toArray();
    const pendingCount = rows.filter((row) => row.status === 'pending' || row.status === 'inflight').length;
    const attentionCount = rows.filter((row) => row.status === 'attention').length;
    const state = attentionCount > 0
      ? 'attention'
      : offline
        ? 'offline'
        : pendingCount > 0
          ? 'syncing'
          : 'synced';

    return {
      state,
      pendingCount,
      attentionCount,
      drainProgress: drainTotal === 0 ? 0 : drainCompleted / drainTotal,
    };
  }

  async function drainInternal(): Promise<OutboxStatusView> {
    await options.db.outbox.where('status').equals('inflight').modify({ status: 'pending' });
    const startingRows = await options.db.outbox.toArray();
    drainTotal = startingRows.filter((row) => row.status === 'pending').length;
    drainCompleted = 0;

    while (true) {
      const next = await nextEligibleRow(options.db, options.clock.now());
      if (next === undefined || next.seq === undefined) {
        return status();
      }

      const outcome = await processRow(next);
      if (outcome === 'stop') {
        return status();
      }
    }
  }

  async function processRow(selected: OutboxRow): Promise<'continue' | 'stop'> {
    if (selected.seq === undefined) {
      return 'continue';
    }

    const before = await options.db.outbox.get(selected.seq);
    if (before === undefined || before.status !== 'pending' || before.nextAt > options.clock.now()) {
      return 'continue';
    }

    const rowsAtSend = await options.db.outbox.toArray();
    if (!isDependencySatisfiedInRows(before, rowsAtSend)) {
      return 'continue';
    }

    await options.db.outbox.update(before.seq!, { status: 'inflight' });
    const current = await options.db.outbox.get(before.seq!);
    if (current === undefined) {
      return 'continue';
    }

    try {
      const dispatch = await resolveDispatch(options.db, current);
      const result = await options.api.dispatch(dispatch);
      await applySuccess(options.db, before, result);
      offline = false;
      drainCompleted += 1;
      return 'continue';
    } catch (error) {
      if (error instanceof ApiAuthError) {
        await options.db.outbox.put(before);
        return 'stop';
      }

      if (error instanceof ApiNetworkError) {
        await scheduleRetry(options.db, before, options.clock.now(), options.jitter);
        offline = true;
        return 'stop';
      }

      if (error instanceof ApiHttpError) {
        if (error.status >= 500) {
          await scheduleRetry(options.db, before, options.clock.now(), options.jitter);
          return 'stop';
        }

        if (error.status >= 400) {
          await options.db.outbox.update(before.seq!, {
            status: 'attention',
            lastErrorStatus: error.status,
            lastErrorCode: error.code,
            lastErrorMessage: error.message,
          });
          return 'continue';
        }
      }

      await options.db.outbox.put(before);
      throw error;
    }
  }

  return {
    drain(): Promise<OutboxStatusView> {
      if (drainPromise === undefined) {
        drainPromise = drainInternal().finally(() => {
          drainPromise = undefined;
        });
      }

      return drainPromise;
    },
    status,
  };
}

async function nextEligibleRow(db: ClinicDb, now: number): Promise<OutboxRow | undefined> {
  const rows = await db.outbox.toArray();
  const byUuid = new Map(rows.map((row) => [row.uuid, row]));
  return rows
    .filter((row) => row.status === 'pending' && row.nextAt <= now)
    .sort((left, right) => (left.seq ?? 0) - (right.seq ?? 0))
    .find((row) => isDependencySatisfiedInMap(row, byUuid));
}

function isDependencySatisfiedInRows(row: OutboxRow, rows: readonly OutboxRow[]): boolean {
  if (row.dependsOnUuid === null) {
    return true;
  }

  const parent = rows.find((candidate) => candidate.uuid === row.dependsOnUuid);
  return parent?.status === 'done';
}

function isDependencySatisfiedInMap(row: OutboxRow, rows: ReadonlyMap<string, OutboxRow>): boolean {
  if (row.dependsOnUuid === null) {
    return true;
  }

  const parent = rows.get(row.dependsOnUuid);
  return parent?.status === 'done';
}

async function scheduleRetry(
  db: ClinicDb,
  row: OutboxRow,
  now: number,
  jitter: (baseMs: number) => number,
): Promise<void> {
  const baseMs = Math.min(30_000 * 2 ** row.attempts, 900_000);
  await db.outbox.update(row.seq!, {
    status: 'pending',
    attempts: row.attempts + 1,
    nextAt: now + jitter(baseMs),
  });
}

async function resolveDispatch(db: ClinicDb, row: OutboxRow): Promise<OutboxDispatch> {
  if (row.payloadRef.source === 'inline') {
    return dispatchFromInline(row.kind, row.payloadRef.payload);
  }

  return dispatchFromEntity(db, row.kind, row.payloadRef.entity);
}

async function dispatchFromEntity(db: ClinicDb, kind: OutboxKind, ref: EntityRef): Promise<OutboxDispatch> {
  switch (kind) {
    case 'sale': {
      const row = await requireRow(db.sales.get(ref.id), ref);
      return { kind, payload: toWireSale(row) };
    }
    case 'patient': {
      const row = await requireRow(db.patients.get(ref.id), ref);
      return { kind, payload: toWirePatient(row) };
    }
    case 'product': {
      const row = await requireRow(db.products.get(ref.id), ref);
      return { kind, payload: toWireProduct(row) };
    }
    case 'appointment': {
      const row = await requireRow(db.appointments.get(ref.id), ref);
      return { kind, payload: toWireAppointment(row) };
    }
    case 'contact': {
      const row = await requireRow(db.contacts.get(ref.id), ref);
      return { kind, payload: toWireContact(row) };
    }
    case 'appointmentStatus':
    case 'stockReceive':
    case 'salePayment':
      throw new ApiHttpError(400, 'MISSING_PAYLOAD', `${kind} requires an inline payload reference.`);
  }
}

function dispatchFromInline(kind: OutboxKind, payload: Record<string, JsonValue>): OutboxDispatch {
  switch (kind) {
    case 'sale':
      return { kind, payload: saleSchema.parse(payload) };
    case 'patient':
      return { kind, payload: patientSchema.parse(payload) };
    case 'product':
      return { kind, payload: productSchema.parse(payload) };
    case 'stockReceive':
      return { kind, payload: stockReceiveSchema.parse(payload) };
    case 'appointment':
      return { kind, payload: appointmentSchema.parse(payload) };
    case 'appointmentStatus': {
      const parsed = appointmentStatusUpdateSchema.parse(payload);
      return { kind, appointmentId: parsed.appointment_id, payload: { status: parsed.status } };
    }
    case 'contact':
      return { kind, payload: contactSchema.parse(payload) };
    case 'salePayment': {
      const saleId = payload.sale_id;
      if (typeof saleId !== 'string') {
        throw new ApiHttpError(400, 'MISSING_PAYLOAD', 'salePayment requires a string sale_id.');
      }

      return { kind, saleId, payload: paymentSchema.parse(payload) };
    }
  }
}

async function requireRow<T>(row: Promise<T | undefined>, ref: EntityRef): Promise<T> {
  const resolved = await row;
  if (resolved === undefined) {
    throw new ApiHttpError(400, 'MISSING_PAYLOAD', `Missing ${ref.table} row ${ref.id}.`);
  }

  return resolved;
}

async function applySuccess(db: ClinicDb, row: OutboxRow, result: OutboxDispatchResult): Promise<void> {
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
  ], async () => {
    if ('patient' in result && 'merged_into' in result && result.merged_into !== undefined) {
      const source = sourceEntityRef(row.payloadRef, 'patients');
      if (source !== undefined) {
        await rewriteEntityMerge(db, source, { table: 'patients', id: result.merged_into });
      }
    }
    if ('product' in result && 'merged_into' in result && result.merged_into !== undefined) {
      const source = sourceEntityRef(row.payloadRef, 'products');
      if (source !== undefined) {
        await rewriteEntityMerge(db, source, { table: 'products', id: result.merged_into });
      }
    }

    const change = authoritativeChange(result);
    if (change !== undefined) {
      await reconcileAuthoritativeChangeInTransaction(db, change);
    }
    if (row.kind === 'appointment' && 'appointment' in result && result.conflict === true) {
      await db.appointments.update(result.appointment.id, { syncConflict: true });
    }

    await db.outbox.update(row.seq!, { status: 'done' });
  });
}

function sourceEntityRef(payloadRef: PayloadRef, table: EntityRef['table']): EntityRef | undefined {
  if (payloadRef.source === 'entity' && payloadRef.entity.table === table) {
    return payloadRef.entity;
  }

  return payloadRef.protectedEntities.find((ref) => ref.table === table);
}

function authoritativeChange(result: OutboxDispatchResult):
  | { entity: 'sale' | 'patient' | 'product' | 'appointment' | 'contact'; op: 'upsert'; row: unknown }
  | undefined {
  if ('sale' in result) {
    return { entity: 'sale', op: 'upsert', row: result.sale };
  }
  if ('patient' in result) {
    return { entity: 'patient', op: 'upsert', row: result.patient };
  }
  if ('product' in result) {
    return { entity: 'product', op: 'upsert', row: result.product };
  }
  if ('appointment' in result) {
    return { entity: 'appointment', op: 'upsert', row: result.appointment };
  }
  if ('contact' in result) {
    return { entity: 'contact', op: 'upsert', row: result.contact };
  }

  return undefined;
}

async function rewriteEntityMerge(db: ClinicDb, source: EntityRef, target: EntityRef): Promise<void> {
  if (source.table !== target.table || source.id === target.id) {
    return;
  }

  if (source.table === 'patients') {
    await rewritePatientRows(db, source.id, target.id);
    await db.patients.delete(source.id);
  }
  if (source.table === 'products') {
    await rewriteProductRows(db, source.id, target.id);
    await db.products.delete(source.id);
  }

  const outboxRows = await db.outbox.filter((row) => row.status !== 'done').toArray();
  await Promise.all(
    outboxRows.map((row) => db.outbox.update(row.seq!, {
      payloadRef: rewritePayloadRef(row.payloadRef, source, target),
    })),
  );
  await clearDeferredChange(db, source);
}

async function rewritePatientRows(db: ClinicDb, sourcePatientId: string, targetPatientId: string): Promise<void> {
  const [sales, appointments, contacts, leads] = await Promise.all([
    db.sales.where('patientId').equals(sourcePatientId).toArray(),
    db.appointments.where('patientId').equals(sourcePatientId).toArray(),
    db.contacts.where('patientId').equals(sourcePatientId).toArray(),
    db.leads.filter((row) => row.patientId === sourcePatientId).toArray(),
  ]);
  await Promise.all([
    ...sales.map((row) => db.sales.update(row.id, { patientId: targetPatientId })),
    ...appointments.map((row) => db.appointments.update(row.id, { patientId: targetPatientId })),
    ...contacts.map((row) => db.contacts.update(row.id, { patientId: targetPatientId })),
    ...leads.map((row) => db.leads.update(row.id, { patientId: targetPatientId })),
  ]);
  await rewriteStagedSalePrefillPatient(db, sourcePatientId, targetPatientId);
}

async function rewriteProductRows(db: ClinicDb, sourceProductId: string, targetProductId: string): Promise<void> {
  const sales = await db.sales.toArray();
  await Promise.all(sales.map((row) => {
    const lines = row.lines.map((line) => (
      line.kind === 'product' && line.itemId === sourceProductId
        ? { ...line, itemId: targetProductId }
        : line
    ));
    return lines.some((line, index) => line !== row.lines[index])
      ? db.sales.update(row.id, { lines })
      : Promise.resolve(0);
  }));
}

function rewritePayloadRef(payloadRef: PayloadRef, source: EntityRef, target: EntityRef): PayloadRef {
  const protectedEntities = payloadRef.protectedEntities.map((ref) => rewriteEntityRef(ref, source, target));
  if (payloadRef.source === 'entity') {
    return {
      source: 'entity',
      entity: rewriteEntityRef(payloadRef.entity, source, target),
      protectedEntities,
    };
  }

  return {
    source: 'inline',
    payload: rewriteJsonRecord(payloadRef.payload, source, target),
    protectedEntities,
  };
}

function rewriteEntityRef(ref: EntityRef, source: EntityRef, target: EntityRef): EntityRef {
  if (ref.table === source.table && ref.id === source.id) {
    return target;
  }

  return ref;
}

function rewriteJsonRecord(
  record: Record<string, JsonValue>,
  source: EntityRef,
  target: EntityRef,
): Record<string, JsonValue> {
  const rewritten: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isInlineReference(key, value, record, source)) {
      rewritten[key] = target.id;
    } else {
      rewritten[key] = rewriteJsonValue(value, source, target);
    }
  }

  return rewritten;
}

function isInlineReference(
  key: string,
  value: JsonValue,
  record: Record<string, JsonValue>,
  source: EntityRef,
): boolean {
  if (value !== source.id) {
    return false;
  }
  if (source.table === 'patients') {
    return key === 'patient_id' || key === 'patientId';
  }
  if (source.table === 'products') {
    return key === 'product_id'
      || key === 'productId'
      || ((key === 'item_id' || key === 'itemId') && record.kind === 'product');
  }

  return false;
}

function rewriteJsonValue(value: JsonValue, source: EntityRef, target: EntityRef): JsonValue {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteJsonValue(entry, source, target));
  }
  if (value !== null && typeof value === 'object') {
    return rewriteJsonRecord(value, source, target);
  }

  return value;
}
