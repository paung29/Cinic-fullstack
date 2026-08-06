import { z } from './zod';

const jsonValueSchema = z.json();
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
const dateSchema = z.iso.date();
const dateTimeSchema = z.iso.datetime({ offset: true });
const timeSchema = z.string().regex(/^[0-2][0-9]:[0-5][0-9]$/);

export type JsonValue = z.infer<typeof jsonValueSchema>;

export const apiErrorSchema = z.object({
  status: z.number().int(),
  code: z.string(),
  message: z.string(),
});

export const healthSchema = z.object({
  ok: z.boolean(),
  server_time: dateTimeSchema,
});

export const clinicSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().default(''),
  address: z.string().default(''),
  rounding_step: z.union([z.literal(1), z.literal(100), z.literal(500), z.literal(1_000)]),
  credit_limit_mmk: z.number().int(),
  receipt: jsonObjectSchema,
  receipt_footer: z.string().default(''),
  logo_url: z.string().default(''),
  receipt_qr: z.boolean().default(true),
  receipt_next_visit: z.boolean().default(true),
  receipt_template: z.enum(['classic', 'modern', 'minimal', 'boxed']).default('classic'),
  receipt_header_font: z.enum(['sans', 'serif', 'display']).default('sans'),
  receipt_divider: z.enum(['line', 'dots', 'none']).default('line'),
  consent_mode: z.enum(['off', 'warn', 'block']).default('warn'),
  addons: jsonObjectSchema,
  feature_flags: jsonObjectSchema,
});

export const clinicPatchSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  receipt_footer: z.string().optional(),
  logo_url: z.string().optional(),
  rounding_step: z.union([z.literal(1), z.literal(100), z.literal(500), z.literal(1_000)]).optional(),
  credit_limit_mmk: z.number().int().min(0).optional(),
  consent_mode: z.enum(['off', 'warn', 'block']).optional(),
  receipt_qr: z.boolean().optional(),
  receipt_next_visit: z.boolean().optional(),
  receipt_template: z.enum(['classic', 'modern', 'minimal', 'boxed']).optional(),
  receipt_header_font: z.enum(['sans', 'serif', 'display']).optional(),
  receipt_divider: z.enum(['line', 'dots', 'none']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'At least one clinic field is required.' });

export const staffSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['admin', 'staff']),
  takes_bookings: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const serviceSchema = z.object({
  id: z.string(),
  category: z.string().optional(),
  name_mm: z.string(),
  name_en: z.string().optional(),
  price: z.number().int(),
  duration_min: z.number().int().optional(),
  requires_lot: z.boolean().optional(),
  default_followup_days: z.number().int().nullable().optional(),
  active: z.boolean().optional(),
});

export const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().optional(),
  subcategory: z.string().nullable().optional(),
  sort_order: z.number().int().nonnegative().optional(),
  barcode: z.string().nullable().optional(),
  cost: z.number().int().optional(),
  price: z.number().int(),
  stock_qty: z.number().optional(),
  low_stock_at: z.number().optional(),
  reorder_at: z.number().optional(),
  stock_type: z.enum(['retail', 'professional', 'injectable']),
  sold_by: z.enum(['each', 'weight']),
  requires_lot: z.boolean().optional(),
  requires_consent: z.boolean().optional(),
  unit_label: z.string().nullable().optional(),
  photo_key: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export const productPatchSchema = z.object({
  name: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().nullable().optional(),
  sort_order: z.number().int().nonnegative().optional(),
  price: z.number().int().nonnegative().optional(),
  cost: z.number().int().nonnegative().optional(),
  low_stock_at: z.number().nonnegative().optional(),
  reorder_at: z.number().nonnegative().optional(),
  stock_type: z.enum(['retail', 'professional', 'injectable']).optional(),
  sold_by: z.enum(['each', 'weight']).optional(),
  requires_lot: z.boolean().optional(),
  requires_consent: z.boolean().optional(),
  unit_label: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  photo_key: z.string().nullable().optional(),
  active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, { message: 'At least one product field is required.' });

export const barcodeLookupSchema = z.object({
  found: z.boolean(),
  name: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  image_url: z.string().optional(),
  source: z.string().optional(),
});

export const patientSchema = z.object({
  id: z.string(),
  code: z.string().nullable().optional(),
  name: z.string(),
  phone: z.string(),
  sex: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  alert_note: z.string().nullable().optional(),
  telegram_linked: z.boolean().optional(),
  followup_date: dateSchema.nullable().optional(),
});

export const saleLineSchema = z.object({
  id: z.string(),
  kind: z.enum(['service', 'product']),
  item_id: z.string(),
  name_snapshot: z.string(),
  qty: z.number(),
  unit_price: z.number().int(),
  line_total: z.number().int(),
  discount_pct: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
  lot_no: z.string().nullable().optional(),
  lot_expiry: z.string().nullable().optional(),
});

export const paymentSchema = z.object({
  id: z.string(),
  method: z.enum(['cash', 'kbzpay', 'wave', 'bank', 'other', 'writeoff']),
  amount: z.number().int(),
  at: dateTimeSchema.optional(),
});

export const saleCreateSchema = z.object({
  id: z.string(),
  patient_id: z.string().nullable().optional(),
  staff_id: z.string(),
  practitioner_id: z.string().nullable().optional(),
  appointment_id: z.string().nullable().optional(),
  at: dateTimeSchema,
  lines: z.array(saleLineSchema).min(1),
  payments: z.array(paymentSchema).optional(),
  subtotal: z.number().int().optional(),
  discount_pct: z.number().nullable().optional(),
  discount_approved_by: z.string().nullable().optional(),
  total: z.number().int(),
  credit: z.number().int().optional(),
  credit_approved_by: z.string().nullable().optional(),
  followup_date: dateSchema.nullable().optional(),
  device_id: z.string().optional(),
  created_offline: z.boolean().optional(),
});

export const saleSchema = saleCreateSchema.extend({
  no: z.string().optional(),
  status: z.enum(['completed', 'voided']).optional(),
  needs_review: z.boolean().optional(),
  review_reason: z.string().nullable().optional(),
  received_at: dateTimeSchema.optional(),
});

export const appointmentStatusSchema = z.enum(['booked', 'here', 'done', 'cancelled']);

export const appointmentSchema = z.object({
  id: z.string(),
  date: dateSchema,
  time: timeSchema,
  staff_id: z.string(),
  patient_id: z.string(),
  service_id: z.string(),
  status: appointmentStatusSchema.optional(),
});

export const appointmentStatusUpdateSchema = z.object({
  appointment_id: z.string(),
  status: appointmentStatusSchema,
});

export const contactSchema = z.object({
  id: z.string(),
  patient_id: z.string(),
  sale_id: z.string().nullable().optional(),
  at: dateTimeSchema.optional(),
  channel: z.enum(['telegram', 'viber', 'phone', 'sms', 'in_person', 'other']),
  direction: z.enum(['out', 'in']),
  outcome: z
    .enum(['no_answer', 'reached', 'rescheduled', 'booked', 'complication', 'better', 'same', 'worse'])
    .nullable()
    .optional(),
  note: z.string().nullable().optional(),
  automated: z.boolean().optional(),
});

export const stockReceiveSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  qty: z.number(),
  cost: z.number().int().optional(),
  lot_no: z.string().optional(),
  lot_expiry: z.string().optional(),
});

export const stockAdjustSchema = z.object({
  product_id: z.string(),
  delta: z.number(),
  reason: z.enum(['adjust', 'waste', 'expiry']),
});

export const followupSchema = z.object({
  patient_id: z.string(),
  date: dateSchema,
  service: z.string(),
});

export const followupsSchema = z.array(followupSchema);
export const dailyReportSchema = z.object({
  date: dateSchema,
  collected: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  new_credit: z.number().int().nonnegative(),
  outstanding: z.number().int().nonnegative(),
  sales: z.number().int().nonnegative(),
});

export const loginSchema = z.object({
  staff_id: z.string(),
  pin: z.string().regex(/^\d{4}$/),
});

export const loginResponseSchema = z.object({
  token: z.string(),
  refresh: z.string(),
  staff: staffSchema,
  clinic: clinicSchema,
  server_time: dateTimeSchema,
});

export const refreshRequestSchema = z.object({
  refresh: z.string(),
});

export const refreshResponseSchema = z.object({
  token: z.string(),
  refresh: z.string(),
});

export const elevationResponseSchema = z.object({
  elevation_token: z.string(),
  expires_at: dateTimeSchema,
});

export const bootstrapSchema = z.object({
  clinic: clinicSchema,
  staff: z.array(staffSchema),
  services: z.array(serviceSchema),
  products: z.array(productSchema),
  patients: z.array(patientSchema),
  appointments: z.array(appointmentSchema),
  recent_sales: z.array(saleSchema).default([]),
  server_time: dateTimeSchema,
  cursor: z.number().int(),
});

export const deltaEntitySchema = z.enum([
  'service',
  'product',
  'patient',
  'appointment',
  'sale',
  'clinic',
  'staff',
  'contact',
]);

export const deltaChangeSchema = z.object({
  entity: deltaEntitySchema,
  op: z.enum(['upsert', 'delete']),
  row: jsonObjectSchema,
});

export const deltaSchema = z.object({
  changes: z.array(deltaChangeSchema),
  cursor: z.number().int(),
  server_time: dateTimeSchema,
});

export const saleResponseSchema = z.object({
  sale: saleSchema,
  replayed: z.boolean().optional(),
});

export const patientResponseSchema = z.object({
  patient: patientSchema,
  merged_into: z.string().nullable().optional(),
  replayed: z.boolean().optional(),
});

export const productResponseSchema = z.object({
  product: productSchema,
  merged_into: z.string().nullable().optional(),
  replayed: z.boolean().optional(),
});

export const stockReceiveResponseSchema = z.object({
  product: productSchema,
  replayed: z.boolean().optional(),
});

export const appointmentResponseSchema = z.object({
  appointment: appointmentSchema,
  conflict: z.boolean().optional(),
  replayed: z.boolean().optional(),
});

export const contactResponseSchema = z.object({
  contact: contactSchema,
  replayed: z.boolean().optional(),
});

export const paymentResponseSchema = z.object({
  payment: paymentSchema,
  replayed: z.boolean().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type HealthWire = z.infer<typeof healthSchema>;
export type ClinicWire = z.infer<typeof clinicSchema>;
export type ClinicPatchWire = z.infer<typeof clinicPatchSchema>;
export type StaffWire = z.infer<typeof staffSchema>;
export type ServiceWire = z.infer<typeof serviceSchema>;
export type ProductWire = z.infer<typeof productSchema>;
export type ProductPatchWire = z.infer<typeof productPatchSchema>;
export type BarcodeLookupWire = z.infer<typeof barcodeLookupSchema>;
export type PatientWire = z.infer<typeof patientSchema>;
export type SaleLineWire = z.infer<typeof saleLineSchema>;
export type PaymentWire = z.infer<typeof paymentSchema>;
export type SaleWire = z.infer<typeof saleSchema>;
export type AppointmentWire = z.infer<typeof appointmentSchema>;
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;
export type AppointmentStatusUpdateWire = z.infer<typeof appointmentStatusUpdateSchema>;
export type ContactWire = z.infer<typeof contactSchema>;
export type StockReceiveWire = z.infer<typeof stockReceiveSchema>;
export type StockAdjustWire = z.infer<typeof stockAdjustSchema>;
export type FollowupWire = z.infer<typeof followupSchema>;
export type DailyReportWire = z.infer<typeof dailyReportSchema>;
export type LoginWire = z.infer<typeof loginSchema>;
export type LoginResponseWire = z.infer<typeof loginResponseSchema>;
export type RefreshRequestWire = z.infer<typeof refreshRequestSchema>;
export type RefreshResponseWire = z.infer<typeof refreshResponseSchema>;
export type ElevationResponseWire = z.infer<typeof elevationResponseSchema>;
export type BootstrapWire = z.infer<typeof bootstrapSchema>;
export type DeltaChangeWire = z.infer<typeof deltaChangeSchema>;
export type DeltaWire = z.infer<typeof deltaSchema>;
export type SaleResponseWire = z.infer<typeof saleResponseSchema>;
export type PatientResponseWire = z.infer<typeof patientResponseSchema>;
export type ProductResponseWire = z.infer<typeof productResponseSchema>;
export type StockReceiveResponseWire = z.infer<typeof stockReceiveResponseSchema>;
export type AppointmentResponseWire = z.infer<typeof appointmentResponseSchema>;
export type ContactResponseWire = z.infer<typeof contactResponseSchema>;
export type PaymentResponseWire = z.infer<typeof paymentResponseSchema>;

export type ClinicRow = {
  id: string;
  name: string;
  phone: string;
  address: string;
  roundingStep: 1 | 100 | 500 | 1_000;
  creditLimitMmk: number;
  receipt: Record<string, JsonValue>;
  receiptFooter: string;
  logoUrl: string;
  receiptQr: boolean;
  receiptNextVisit: boolean;
  receiptTemplate: 'classic' | 'modern' | 'minimal' | 'boxed';
  receiptHeaderFont: 'sans' | 'serif' | 'display';
  receiptDivider: 'line' | 'dots' | 'none';
  consentMode: 'off' | 'warn' | 'block';
  addons: Record<string, JsonValue>;
  featureFlags: Record<string, JsonValue>;
};

export type StaffRow = {
  id: string;
  name: string;
  role: 'admin' | 'staff';
  takesBookings: boolean;
  active: boolean;
};

export type ServiceRow = {
  id: string;
  category: string;
  nameMm: string;
  nameEn: string | null;
  price: number;
  durationMin: number | null;
  requiresLot: boolean;
  defaultFollowupDays: number | null;
  active: boolean;
};

export type LotRow = {
  lotNo: string;
  expiry: string | null;
  qty: number;
};

export type ProductRow = {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  sortOrder: number;
  barcode: string | null;
  cost: number;
  price: number;
  stockQty: number;
  lowStockAt: number;
  reorderAt: number;
  stockType: 'retail' | 'professional' | 'injectable';
  soldBy: 'each' | 'weight';
  requiresLot: boolean;
  requiresConsent: boolean;
  unitLabel: string | null;
  photoKey: string | null;
  lots: LotRow[];
  active: boolean;
};

export type PatientRow = {
  id: string;
  code: string | null;
  name: string;
  phone: string;
  sex: string | null;
  allergies: string | null;
  alertNote: string | null;
  telegramLinked: boolean;
  followupDate: string | null;
};

export type SaleLineRow = {
  id: string;
  kind: 'service' | 'product';
  itemId: string;
  nameSnapshot: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  discountPct: number | null;
  note: string | null;
  lotNo: string | null;
  lotExpiry: string | null;
};

export type PaymentRow = {
  id: string;
  method: 'cash' | 'kbzpay' | 'wave' | 'bank' | 'other' | 'writeoff';
  amount: number;
  at: string | null;
};

export type SaleRow = {
  id: string;
  patientId: string | null;
  staffId: string;
  practitionerId: string | null;
  appointmentId: string | null;
  at: string;
  lines: SaleLineRow[];
  payments: PaymentRow[];
  subtotal: number;
  discountPct: number | null;
  discountApprovedBy: string | null;
  total: number;
  credit: number;
  creditApprovedBy: string | null;
  followupDate: string | null;
  deviceId: string | null;
  createdOffline: boolean;
  no: string | null;
  status: 'completed' | 'voided';
  needsReview: boolean;
  reviewReason: string | null;
  receivedAt: string | null;
};

export type AppointmentRow = {
  id: string;
  date: string;
  time: string;
  staffId: string;
  patientId: string;
  serviceId: string;
  status: AppointmentStatus;
  syncConflict: boolean;
};

export type ContactRow = {
  id: string;
  patientId: string;
  saleId: string | null;
  at: string | null;
  channel: 'telegram' | 'viber' | 'phone' | 'sms' | 'in_person' | 'other';
  direction: 'out' | 'in';
  outcome: 'no_answer' | 'reached' | 'rescheduled' | 'booked' | 'complication' | 'better' | 'same' | 'worse' | null;
  note: string | null;
  automated: boolean;
};

export type LeadRow = {
  id: string;
  name: string;
  phone: string;
  channel: string | null;
  interest: string | null;
  patientId: string | null;
  status: string;
};

export type EntityTable = 'patients' | 'products' | 'sales' | 'appointments' | 'contacts';

export type EntityRef = {
  table: EntityTable;
  id: string;
};

export type PayloadRef =
  | {
      source: 'entity';
      entity: EntityRef;
      protectedEntities: readonly EntityRef[];
    }
  | {
      source: 'inline';
      payload: Record<string, JsonValue>;
      protectedEntities: readonly EntityRef[];
    };

export type OutboxKind =
  | 'sale'
  | 'patient'
  | 'product'
  | 'stockReceive'
  | 'appointment'
  | 'appointmentStatus'
  | 'contact'
  | 'salePayment';

export type OutboxStatus = 'pending' | 'inflight' | 'attention' | 'done';

export type OutboxRow = {
  seq?: number;
  kind: OutboxKind;
  uuid: string;
  payloadRef: PayloadRef;
  dependsOnUuid: string | null;
  attempts: number;
  nextAt: number;
  status: OutboxStatus;
  lastErrorStatus: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

export type MetaRow = {
  key: string;
  value: JsonValue;
};

export type DeferredRemoteChange = {
  entity: z.infer<typeof deltaEntitySchema>;
  op: 'upsert' | 'delete';
  row: Record<string, JsonValue>;
};

export function toLocalClinic(wire: ClinicWire): ClinicRow {
  return {
    id: wire.id,
    name: wire.name,
    phone: wire.phone,
    address: wire.address,
    roundingStep: wire.rounding_step,
    creditLimitMmk: wire.credit_limit_mmk,
    receipt: wire.receipt,
    receiptFooter: wire.receipt_footer,
    logoUrl: wire.logo_url,
    receiptQr: wire.receipt_qr,
    receiptNextVisit: wire.receipt_next_visit,
    receiptTemplate: wire.receipt_template,
    receiptHeaderFont: wire.receipt_header_font,
    receiptDivider: wire.receipt_divider,
    consentMode: wire.consent_mode,
    addons: wire.addons,
    featureFlags: wire.feature_flags,
  };
}

export function toLocalStaff(wire: StaffWire): StaffRow {
  return {
    id: wire.id,
    name: wire.name,
    role: wire.role,
    takesBookings: wire.takes_bookings ?? false,
    active: wire.active ?? true,
  };
}

export function toLocalService(wire: ServiceWire): ServiceRow {
  return {
    id: wire.id,
    category: wire.category ?? 'Other',
    nameMm: wire.name_mm,
    nameEn: wire.name_en ?? null,
    price: wire.price,
    durationMin: wire.duration_min ?? null,
    requiresLot: wire.requires_lot ?? false,
    defaultFollowupDays: wire.default_followup_days ?? null,
    active: wire.active ?? true,
  };
}

export function toLocalProduct(wire: ProductWire): ProductRow {
  return {
    id: wire.id,
    name: wire.name,
    category: wire.category ?? 'Other',
    subcategory: wire.subcategory ?? null,
    sortOrder: wire.sort_order ?? 0,
    barcode: wire.barcode ?? null,
    cost: wire.cost ?? 0,
    price: wire.price,
    stockQty: wire.stock_qty ?? 0,
    lowStockAt: wire.low_stock_at ?? 0,
    reorderAt: wire.reorder_at ?? wire.low_stock_at ?? 0,
    stockType: wire.stock_type,
    soldBy: wire.sold_by,
    requiresLot: wire.requires_lot ?? false,
    requiresConsent: wire.requires_consent ?? false,
    unitLabel: wire.unit_label ?? null,
    photoKey: wire.photo_key ?? null,
    lots: [],
    active: wire.active ?? true,
  };
}

export function toLocalPatient(wire: PatientWire): PatientRow {
  return {
    id: wire.id,
    code: wire.code ?? null,
    name: wire.name,
    phone: wire.phone,
    sex: wire.sex ?? null,
    allergies: wire.allergies ?? null,
    alertNote: wire.alert_note ?? null,
    telegramLinked: wire.telegram_linked ?? false,
    followupDate: wire.followup_date ?? null,
  };
}

export function toWirePatient(row: PatientRow): PatientWire {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    phone: row.phone,
    sex: row.sex,
    allergies: row.allergies,
    alert_note: row.alertNote,
    telegram_linked: row.telegramLinked,
    followup_date: row.followupDate,
  };
}

export function toWireProduct(row: ProductRow): ProductWire {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    sort_order: row.sortOrder,
    barcode: row.barcode,
    cost: row.cost,
    price: row.price,
    stock_qty: row.stockQty,
    low_stock_at: row.lowStockAt,
    reorder_at: row.reorderAt,
    stock_type: row.stockType,
    sold_by: row.soldBy,
    requires_lot: row.requiresLot,
    requires_consent: row.requiresConsent,
    unit_label: row.unitLabel,
    photo_key: row.photoKey,
    active: row.active,
  };
}

function toLocalSaleLine(wire: SaleLineWire): SaleLineRow {
  return {
    id: wire.id,
    kind: wire.kind,
    itemId: wire.item_id,
    nameSnapshot: wire.name_snapshot,
    qty: wire.qty,
    unitPrice: wire.unit_price,
    lineTotal: wire.line_total,
    discountPct: wire.discount_pct ?? null,
    note: wire.note ?? null,
    lotNo: wire.lot_no ?? null,
    lotExpiry: wire.lot_expiry ?? null,
  };
}

function toLocalPayment(wire: PaymentWire): PaymentRow {
  return {
    id: wire.id,
    method: wire.method,
    amount: wire.amount,
    at: wire.at ?? null,
  };
}

export function toLocalSale(wire: SaleWire): SaleRow {
  return {
    id: wire.id,
    patientId: wire.patient_id ?? null,
    staffId: wire.staff_id,
    practitionerId: wire.practitioner_id ?? null,
    appointmentId: wire.appointment_id ?? null,
    at: wire.at,
    lines: wire.lines.map(toLocalSaleLine),
    payments: (wire.payments ?? []).map(toLocalPayment),
    subtotal: wire.subtotal ?? wire.total,
    discountPct: wire.discount_pct ?? null,
    discountApprovedBy: wire.discount_approved_by ?? null,
    total: wire.total,
    credit: wire.credit ?? 0,
    creditApprovedBy: wire.credit_approved_by ?? null,
    followupDate: wire.followup_date ?? null,
    deviceId: wire.device_id ?? null,
    createdOffline: wire.created_offline ?? false,
    no: wire.no ?? null,
    status: wire.status ?? 'completed',
    needsReview: wire.needs_review ?? false,
    reviewReason: wire.review_reason ?? null,
    receivedAt: wire.received_at ?? null,
  };
}

export function toWireSale(row: SaleRow): SaleWire {
  return {
    id: row.id,
    patient_id: row.patientId,
    staff_id: row.staffId,
    practitioner_id: row.practitionerId,
    appointment_id: row.appointmentId,
    at: row.at,
    lines: row.lines.map((line) => ({
      id: line.id,
      kind: line.kind,
      item_id: line.itemId,
      name_snapshot: line.nameSnapshot,
      qty: line.qty,
      unit_price: line.unitPrice,
      line_total: line.lineTotal,
      discount_pct: line.discountPct,
      note: line.note,
      lot_no: line.lotNo,
      lot_expiry: line.lotExpiry,
    })),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: payment.amount,
      ...(payment.at === null ? {} : { at: payment.at }),
    })),
    subtotal: row.subtotal,
    discount_pct: row.discountPct,
    discount_approved_by: row.discountApprovedBy,
    total: row.total,
    credit: row.credit,
    credit_approved_by: row.creditApprovedBy,
    followup_date: row.followupDate,
    ...(row.deviceId === null ? {} : { device_id: row.deviceId }),
    created_offline: row.createdOffline,
    ...(row.no === null ? {} : { no: row.no }),
    status: row.status,
    needs_review: row.needsReview,
    review_reason: row.reviewReason,
    ...(row.receivedAt === null ? {} : { received_at: row.receivedAt }),
  };
}

export function toLocalAppointment(wire: AppointmentWire): AppointmentRow {
  return {
    id: wire.id,
    date: wire.date,
    time: wire.time,
    staffId: wire.staff_id,
    patientId: wire.patient_id,
    serviceId: wire.service_id,
    status: wire.status ?? 'booked',
    syncConflict: false,
  };
}

export function toWireAppointment(row: AppointmentRow): AppointmentWire {
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    staff_id: row.staffId,
    patient_id: row.patientId,
    service_id: row.serviceId,
    status: row.status,
  };
}

export function toLocalContact(wire: ContactWire): ContactRow {
  return {
    id: wire.id,
    patientId: wire.patient_id,
    saleId: wire.sale_id ?? null,
    at: wire.at ?? null,
    channel: wire.channel,
    direction: wire.direction,
    outcome: wire.outcome ?? null,
    note: wire.note ?? null,
    automated: wire.automated ?? false,
  };
}

export function toWireContact(row: ContactRow): ContactWire {
  return {
    id: row.id,
    patient_id: row.patientId,
    sale_id: row.saleId,
    ...(row.at === null ? {} : { at: row.at }),
    channel: row.channel,
    direction: row.direction,
    outcome: row.outcome,
    note: row.note,
    automated: row.automated,
  };
}
