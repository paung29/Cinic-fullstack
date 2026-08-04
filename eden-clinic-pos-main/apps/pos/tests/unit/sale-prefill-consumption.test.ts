import { describe, expect, test } from 'vitest';
import type { PatientRow, ServiceRow } from '@/data/types';
import { applySalePrefill } from '@/modules/sale/salePrefillConsumption';

const patient: PatientRow = { id: 'c1', code: null, name: 'Ma Thida', phone: '09 111', sex: null, allergies: null, alertNote: null, telegramLinked: false, followupDate: null };
const service: ServiceRow = { id: 'v1', category: 'Laser', nameMm: 'Laser', nameEn: 'Laser hair removal', price: 45_000, durationMin: 30, requiresLot: false, defaultFollowupDays: null, active: true };
const draft = { patientId: null, appointmentId: null, lines: [], discountPct: 0, discountApprovedBy: null };

describe('sale prefill consumption', () => {
  test('installs the staged patient, service and appointment only when the local cart can accept them', () => {
    expect(applySalePrefill(draft, { appointmentId: 'a1', patientId: 'c1', serviceId: 'v1' }, patient, service, 'line-1')).toMatchObject({
      patientId: 'c1', appointmentId: 'a1', lines: [{ id: 'line-1', itemId: 'v1', kind: 'service' }],
    });
    expect(applySalePrefill(draft, { appointmentId: 'a1', patientId: 'missing', serviceId: 'v1' }, undefined, service, 'line-1')).toBeUndefined();
  });
});
