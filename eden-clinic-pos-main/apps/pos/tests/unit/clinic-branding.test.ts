import { describe, expect, test } from 'vitest';
import { clinicBranding } from '@/data/clinicBranding';

const FALLBACK = { brand: 'Eden Clinic OS', location: 'Lashio · Myanmar' };

describe('clinicBranding', () => {
  test('names the clinic that set the app up, not the product', () => {
    expect(clinicBranding({ name: 'Thiri Skin Clinic', address: 'Yangon · Myanmar' }, FALLBACK))
      .toEqual({ brand: 'Thiri Skin Clinic', location: 'Yangon · Myanmar' });
  });

  test('falls back to the product only while the clinic row is still loading', () => {
    expect(clinicBranding(undefined, FALLBACK)).toEqual(FALLBACK);
  });

  test('a clinic with no address shows no location rather than the previous clinic', () => {
    // The regression this whole helper exists for: never show one clinic's
    // city to another. A blank header slot is correct; a stale one is not.
    expect(clinicBranding({ name: 'Thiri Skin Clinic', address: '' }, FALLBACK))
      .toEqual({ brand: 'Thiri Skin Clinic', location: '' });
  });

  test('a blank clinic name is treated as not yet set up', () => {
    expect(clinicBranding({ name: '   ', address: 'Yangon' }, FALLBACK)).toEqual(FALLBACK);
  });

  test('surrounding whitespace never reaches the header', () => {
    expect(clinicBranding({ name: '  Thiri Skin Clinic  ', address: '  Yangon  ' }, FALLBACK))
      .toEqual({ brand: 'Thiri Skin Clinic', location: 'Yangon' });
  });
});
