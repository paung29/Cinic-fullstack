import { describe, expect, test } from 'vitest';
import * as dataTypes from '@/data/types';
import {
  appointmentSchema,
  bootstrapSchema,
  paymentSchema,
  productSchema,
  saleLineSchema,
  toLocalStaff,
  toWirePatient,
  toLocalProduct,
  type ProductWire,
} from '@/data/types';

const service = {
  id: 'service-1',
  category: 'Skin',
  name_mm: 'ကုသမှု',
  name_en: 'Skin treatment',
  price: 45_000,
  duration_min: 30,
  requires_lot: false,
  default_followup_days: 30,
  active: true,
};

const product = {
  id: 'product-1',
  name: 'Aftercare cream',
  category: 'Aftercare',
  barcode: '8850123456789',
  cost: 9_000,
  price: 18_000,
  stock_qty: 14,
  low_stock_at: 5,
  stock_type: 'retail',
  sold_by: 'each',
  unit_label: null,
  photo_key: null,
  active: true,
} satisfies ProductWire;

const patient = {
  id: 'patient-1',
  code: 'P-00001',
  name: 'Ma Thida',
  phone: '09 771 234 560',
  sex: 'F',
  allergies: 'Lidocaine',
  alert_note: null,
  telegram_linked: true,
  followup_date: null,
};

describe('data schemas', () => {
  test('accepts only documented, non-empty clinic and product patch fields', () => {
    const { clinicPatchSchema, productPatchSchema } = dataTypes as typeof dataTypes & {
      clinicPatchSchema: { parse(value: unknown): unknown };
      productPatchSchema: { parse(value: unknown): unknown };
    };

    expect(clinicPatchSchema.parse({ receipt_template: 'boxed', receipt_qr: false })).toMatchObject({
      receipt_template: 'boxed',
      receipt_qr: false,
    });
    expect(() => clinicPatchSchema.parse({ addons: { recall: true } })).toThrow();
    expect(() => clinicPatchSchema.parse({})).toThrow();
    expect(productPatchSchema.parse({ sold_by: 'weight', price: 32_000 })).toMatchObject({ sold_by: 'weight', price: 32_000 });
    expect(() => productPatchSchema.parse({ stock_qty: 9 })).toThrow();
  });

  test('preserves snake_case wire data while normalizing product rows for Dexie', () => {
    const wire = productSchema.parse(product);
    const local = toLocalProduct(wire);

    expect(wire.stock_qty).toBe(14);
    expect(local).toMatchObject({
      stockQty: 14,
      lowStockAt: 5,
      stockType: 'retail',
      soldBy: 'each',
      unitLabel: null,
      photoKey: null,
      lots: [],
    });
    expect(local).not.toHaveProperty('stock_qty');
  });

  test('preserves the M5 receipt settings and product-edit fields across wire/local mappings', () => {
    const clinic = dataTypes.toLocalClinic(dataTypes.clinicSchema.parse({
      id: 'clinic-1', name: 'Eden', phone: '09 123', address: 'Lashio', rounding_step: 500,
      credit_limit_mmk: 100_000, receipt: {}, receipt_footer: 'Thank you', logo_url: 'logo-key',
      receipt_qr: false, receipt_next_visit: true, receipt_template: 'modern',
      receipt_header_font: 'serif', receipt_divider: 'dots', consent_mode: 'block', addons: {}, feature_flags: {},
    }));
    const expandedProduct = dataTypes.toLocalProduct(dataTypes.productSchema.parse({
      ...product, subcategory: 'Serums', sort_order: 4, reorder_at: 8, requires_lot: true, requires_consent: true,
    }));

    expect(clinic).toMatchObject({ receiptTemplate: 'modern', receiptHeaderFont: 'serif', receiptDivider: 'dots', receiptQr: false });
    expect(dataTypes.toWireProduct(expandedProduct)).toMatchObject({
      subcategory: 'Serums', sort_order: 4, reorder_at: 8, requires_lot: true, requires_consent: true,
    });
  });

  test('preserves an explicit staff offboarding state while defaulting legacy staff to active', () => {
    expect(toLocalStaff({ id: 'staff-offboarded', name: 'Former staff', role: 'staff', active: false })).toMatchObject({
      active: false,
    });
    expect(toLocalStaff({ id: 'staff-legacy', name: 'Existing staff', role: 'staff' })).toMatchObject({ active: true });
  });

  test('validates a documented bootstrap working set', () => {
    const parsed = bootstrapSchema.parse({
      clinic: {
        id: 'clinic-1',
        name: 'Eden',
        rounding_step: 500,
        credit_limit_mmk: 100_000,
        receipt: {},
        addons: {},
        feature_flags: {},
      },
      staff: [{ id: 'staff-1', name: 'Aye Aye', role: 'staff', takes_bookings: true }],
      services: [service],
      products: [product],
      patients: [patient],
      appointments: [],
      recent_sales: [],
      server_time: '2026-07-31T12:00:00.000Z',
      cursor: 7,
    });

    expect(parsed.cursor).toBe(7);
    expect(parsed.services[0]?.name_mm).toBe('ကုသမှု');
    expect(parsed.patients[0]?.telegram_linked).toBe(true);
  });

  test('rejects a sale line whose whole-MMK unit price is not an integer', () => {
    expect(() =>
      saleLineSchema.parse({
        id: 'line-1',
        kind: 'service',
        item_id: 'service-1',
        name_snapshot: 'Skin treatment',
        qty: 1,
        unit_price: 45_000.5,
        line_total: 45_000,
        discount_pct: null,
        note: null,
        lot_no: null,
        lot_expiry: null,
      }),
    ).toThrow();
  });

  test('rejects malformed documented appointment date and time values', () => {
    expect(() =>
      appointmentSchema.parse({
        id: 'appointment-1',
        date: '31/07/2026',
        time: '9:30am',
        staff_id: 'staff-1',
        patient_id: 'patient-1',
        service_id: 'service-1',
      }),
    ).toThrow();
  });

  test('accepts documented ISO date-times with a UTC offset', () => {
    expect(
      paymentSchema.parse({
        id: 'payment-1',
        method: 'cash',
        amount: 12_500,
        at: '2026-07-31T12:00:00+06:30',
      }),
    ).toMatchObject({ at: '2026-07-31T12:00:00+06:30' });
  });

  test('converts local patient rows to the documented snake_case wire shape', () => {
    expect(
      toWirePatient({
        id: 'patient-1',
        code: null,
        name: 'Ma Thida',
        phone: '09 771 234 560',
        sex: null,
        allergies: null,
        alertNote: 'Lidocaine',
        telegramLinked: true,
        followupDate: '2026-08-01',
      }),
    ).toMatchObject({
      alert_note: 'Lidocaine',
      telegram_linked: true,
      followup_date: '2026-08-01',
    });
  });
});
