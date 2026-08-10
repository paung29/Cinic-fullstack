import type { ClinicRow } from '@/data/types';

export type ClinicBranding = {
  brand: string;
  location: string;
};

/**
 * The shell header names the clinic the staff actually work in, not the
 * product. Every screen used to pass the `brand.name` / `brand.location`
 * translation strings, which meant a clinic that set the app up in Yangon
 * still read "Eden Clinic OS · Lashio · Myanmar" on every screen — the first
 * client's identity leaking into the next one's counter.
 *
 * The clinic row is authoritative and is written during setup, so it is
 * present on every screen behind the login. The fallbacks cover only the
 * moments before that row has loaded, where the product name is the honest
 * answer rather than another clinic's.
 */
export function clinicBranding(
  clinic: Pick<ClinicRow, 'name' | 'address'> | undefined,
  fallback: ClinicBranding,
): ClinicBranding {
  const name = clinic?.name.trim() ?? '';
  const address = clinic?.address.trim() ?? '';
  return {
    brand: name === '' ? fallback.brand : name,
    // An address is optional at setup, and a header reading "Clinic ·" with
    // nothing after it looks broken, so an empty one collapses to blank
    // rather than falling back to wherever the previous clinic was.
    location: name === '' ? fallback.location : address,
  };
}
