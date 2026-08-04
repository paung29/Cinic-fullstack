import type { PatientRow } from '@/data/types';

export function selectPatients(rows: readonly PatientRow[], query: string): PatientRow[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized === '') return [...rows];
  const queryDigits = normalized.replace(/\D/g, '');

  return rows.filter((patient) => (
    patient.name.toLocaleLowerCase().includes(normalized)
    || (queryDigits !== '' && patient.phone.replace(/\D/g, '').includes(queryDigits))
  ));
}

export function selectedPatientIdFromSearch(search: string): string | undefined {
  const patientId = new URLSearchParams(search).get('patient');
  return patientId === null || patientId === '' ? undefined : patientId;
}

export function counterAlertText(patient: Pick<PatientRow, 'allergies' | 'alertNote'>): string | undefined {
  return [patient.allergies, patient.alertNote].filter((value): value is string => value !== null && value !== '').join(' · ') || undefined;
}
