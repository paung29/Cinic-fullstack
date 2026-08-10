// ESC p m t1 t2 — the standard ESC/POS drawer kick. The pulse rides the same
// connection as a print job, so a drawer only opens on a device that has a
// working printer transport.
//
// m selects the connector pin: virtually every till used with an ESC/POS
// printer is wired to pin 2. t1/t2 are the on/off pulse widths in 2ms units;
// 25/250 is the widely supported default — too short and heavier solenoids
// fail to throw, too long and they can overheat.
export const DRAWER_PIN_2 = 0;
export const DRAWER_PIN_5 = 1;

export function drawerKickCommand(pin: 0 | 1 = DRAWER_PIN_2, onMs = 50, offMs = 500): Uint8Array {
  const toPulseUnits = (ms: number): number => Math.min(255, Math.max(1, Math.round(ms / 2)));
  return new Uint8Array([0x1b, 0x70, pin, toPulseUnits(onMs), toPulseUnits(offMs)]);
}

// A sale opens the till only when actual cash changes hands. Wallet and card
// payments must leave it shut: an unnecessary open invites theft, and staff
// stop trusting a drawer that pops on every sale.
export function shouldOpenDrawerForTenders(tenders: readonly { method: string; amount: number }[]): boolean {
  return tenders.some((tender) => tender.method === 'cash' && tender.amount > 0);
}
