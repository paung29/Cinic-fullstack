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
  PhotoSessionRow,
  ProductRow,
  ReceiptAssetRow,
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
  photoSessions!: Table<PhotoSessionRow, string>;
  products!: Table<ProductRow, string>;
  receiptAssets!: Table<ReceiptAssetRow, string>;
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

    // v2 adds the device-local photo library. Additive only: every v1 store
    // keeps its schema, so existing clinic databases upgrade in place.
    this.version(2).stores({
      photoSessions: 'id, patientId',
    });

    // v3 adds binary receipt assets (the brand logo). Additive, same as v2.
    this.version(3).stores({
      receiptAssets: 'key',
    });

    this.appointments = this.table('appointments');
    this.clinic = this.table('clinic');
    this.contacts = this.table('contacts');
    this.leads = this.table('leads');
    this.meta = this.table('meta');
    this.outbox = this.table('outbox');
    this.patients = this.table('patients');
    this.photoSessions = this.table('photoSessions');
    this.products = this.table('products');
    this.receiptAssets = this.table('receiptAssets');
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

// Set when the server rejects this staff member's stored credential, cleared
// on the next successful online sign-in. The envelope itself is kept so the
// device stays usable offline; this only tells the login screen to prefer a
// real server sign-in over an offline unlock.
export function authRepairMetaKey(staffId: string): string {
  return `auth-repair:${staffId}`;
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
