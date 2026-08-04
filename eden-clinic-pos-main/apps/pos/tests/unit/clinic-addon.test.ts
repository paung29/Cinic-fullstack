import { describe, expect, test } from 'vitest';
import { clinicAddonEnabled } from '@/flags/useClinicAddon';

describe('clinic add-ons', () => {
  test('enables Recall only for the literal true bootstrap value', () => {
    expect(clinicAddonEnabled({ recall: true }, 'recall')).toBe(true);
    expect(clinicAddonEnabled({ recall: false }, 'recall')).toBe(false);
    expect(clinicAddonEnabled({}, 'recall')).toBe(false);
    expect(clinicAddonEnabled(undefined, 'recall')).toBe(false);
  });
});
