import Dexie, { type Table } from 'dexie';
import type {
  AppointmentRow,
  ClinicRow,
  ContactRow,
  DeferredRemoteChange,
  EntityRef,
  LeadRow,
  MetaRow,
  OutboxRow,
  PatientRow,
  ProductRow,
  SaleRow,
  ServiceRow,
  StaffRow,
} from '@/data/types';

export class ClinicDb extends Dexie {
  appointments!: Table<AppointmentRow, string>;
  clinic!: Table<ClinicRow, string>;
  contacts!: Table<ContactRow, string>;
  leads!: Table<LeadRow, string>;
  meta!: Table<MetaRow, string>;
  outbox!: Table<OutboxRow, number>;
  patients!: Table<PatientRow, string>;
  products!: Table<ProductRow, string>;
  sales!: Table<SaleRow, string>;
  services!: Table<ServiceRow, string>;
  staff!: Table<StaffRow, string>;

  constructor(name: string) {
    super(name);

    this.version(1).stores({
      services: 'id, category',
      products: 'id, barcode, category',
      patients: 'id, phone, name',
      sales: 'id, at, patientId',
      appointments: 'id, [date+staffId], patientId',
      leads: 'id, status',
      contacts: 'id, patientId',
      staff: 'id',
      clinic: 'id',
      outbox: '++seq, status',
      meta: 'key',
    });

    this.appointments = this.table('appointments');
    this.clinic = this.table('clinic');
    this.contacts = this.table('contacts');
    this.leads = this.table('leads');
    this.meta = this.table('meta');
    this.outbox = this.table('outbox');
    this.patients = this.table('patients');
    this.products = this.table('products');
    this.sales = this.table('sales');
    this.services = this.table('services');
    this.staff = this.table('staff');
  }
}

export function createClinicDb(name = 'eden-clinic'): ClinicDb {
  return new ClinicDb(name);
}

export function entityKey(ref: EntityRef): string {
  return `${ref.table}:${ref.id}`;
}

export function deferredMetaKey(ref: EntityRef): string {
  return `deferred:${entityKey(ref)}`;
}

export function authEnvelopeMetaKey(staffId: string): string {
  return `auth-envelope:${staffId}`;
}

export async function activeProtectedKeys(db: ClinicDb): Promise<Set<string>> {
  const protectedKeys = new Set<string>();
  const rows = await db.outbox.filter((row) => row.status !== 'done').toArray();

  for (const row of rows) {
    for (const ref of row.payloadRef.protectedEntities) {
      protectedKeys.add(entityKey(ref));
    }
  }

  return protectedKeys;
}

export async function deferInboundChange(
  db: ClinicDb,
  ref: EntityRef,
  change: DeferredRemoteChange,
): Promise<void> {
  await db.meta.put({ key: deferredMetaKey(ref), value: change });
}

export async function clearDeferredChange(db: ClinicDb, ref: EntityRef): Promise<void> {
  await db.meta.delete(deferredMetaKey(ref));
}
