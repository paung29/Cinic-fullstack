import { describe, expect, test } from 'vitest';
import { patientOutstanding } from '@/data/money';
import { counterAlertText } from '@/modules/patients/patientSelectors';

describe('patient counter profile', () => {
  test('keeps allergies and alert notes available before the clinical gate', () => {
    expect(counterAlertText({ allergies: 'Lidocaine', alertNote: 'Avoid numbing cream' })).toBe('Lidocaine · Avoid numbing cream');
    expect(patientOutstanding([
      { credit: 12_500, status: 'completed' },
      { credit: 99_000, status: 'voided' },
    ])).toBe(12_500);
  });
});
