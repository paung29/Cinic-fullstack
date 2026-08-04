import { describe, expect, test } from 'vitest';
import { returnToAfterSignIn, safeReturnTo } from '@/data/returnTo';
import { counterAlertText, selectedPatientIdFromSearch, selectPatients } from '@/modules/patients/patientSelectors';
import type { PatientRow } from '@/data/types';

const patients: PatientRow[] = [
  { id: 'c1', code: 'P-00001', name: 'Ma Thida', phone: '09 771 234 560', sex: 'F', allergies: 'Lidocaine', alertNote: 'Avoid numbing cream', telegramLinked: true, followupDate: null },
  { id: 'c2', code: 'P-00002', name: 'Ko Zaw Min', phone: '09 425 118 220', sex: 'M', allergies: null, alertNote: null, telegramLinked: false, followupDate: null },
];

describe('patient selectors', () => {
  test('searches locally by normalized name or phone', () => {
    expect(selectPatients(patients, 'thida').map((patient) => patient.id)).toEqual(['c1']);
    expect(selectPatients(patients, '771234').map((patient) => patient.id)).toEqual(['c1']);
    expect(selectPatients(patients, 'no match')).toEqual([]);
  });

  test('extracts a URL-encoded static patient query and keeps all counter alerts visible', () => {
    expect(selectedPatientIdFromSearch('?patient=local%20patient')).toBe('local patient');
    expect(selectedPatientIdFromSearch('?other=c1')).toBeUndefined();
    expect(counterAlertText(patients[0]!)).toBe('Lidocaine · Avoid numbing cream');
  });

  test('allows only local sale, calendar, and clients return targets', () => {
    expect(safeReturnTo('/clients?patient=c1')).toBe('/clients?patient=c1');
    expect(safeReturnTo('/calendar')).toBe('/calendar');
    expect(safeReturnTo('/sale')).toBe('/sale');
    expect(safeReturnTo('//attacker.example')).toBe('/sale');
    expect(safeReturnTo('https://attacker.example')).toBe('/sale');
    expect(safeReturnTo('/security')).toBe('/sale');
    expect(returnToAfterSignIn(true, '/clients?patient=c1')).toBeUndefined();
    expect(returnToAfterSignIn(false, '/clients?patient=c1')).toBe('/clients?patient=c1');
  });
});
