import type { SalePrefill } from '@/data/salePrefill';
import type { PatientRow, ServiceRow } from '@/data/types';
import type { CartLineDraft, SaleDraft } from './types';

export function applySalePrefill(
  draft: SaleDraft,
  prefill: SalePrefill,
  patient: PatientRow | undefined,
  service: ServiceRow | undefined,
  lineId: string,
): SaleDraft | undefined {
  if (patient === undefined || service === undefined || !service.active) return undefined;

  const line: CartLineDraft = {
    id: lineId,
    kind: 'service',
    itemId: service.id,
    nameSnapshot: service.nameEn ?? service.nameMm,
    qty: 1,
    unitPrice: service.price,
    discountPct: null,
    note: null,
    lotNo: null,
    lotExpiry: null,
  };

  return {
    ...draft,
    patientId: patient.id,
    appointmentId: prefill.appointmentId,
    lines: [...draft.lines, line],
  };
}
