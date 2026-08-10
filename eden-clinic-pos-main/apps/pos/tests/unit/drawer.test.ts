import { describe, expect, it } from 'vitest';
import { DRAWER_PIN_2, DRAWER_PIN_5, drawerKickCommand, shouldOpenDrawerForTenders } from '@/print/drawer';

describe('drawer kick command', () => {
  it('emits the ESC/POS pulse on pin 2 by default', () => {
    expect([...drawerKickCommand()]).toEqual([0x1b, 0x70, 0x00, 25, 250]);
  });

  it('can target pin 5 for tills wired the other way', () => {
    expect([...drawerKickCommand(DRAWER_PIN_5)][2]).toBe(1);
    expect([...drawerKickCommand(DRAWER_PIN_2)][2]).toBe(0);
  });

  it('keeps pulse widths inside the single byte the protocol allows', () => {
    const long = drawerKickCommand(DRAWER_PIN_2, 10_000, 10_000);
    expect(long[3]).toBeLessThanOrEqual(255);
    expect(long[4]).toBeLessThanOrEqual(255);
    const short = drawerKickCommand(DRAWER_PIN_2, 0, 0);
    expect(short[3]).toBeGreaterThanOrEqual(1);
    expect(short[4]).toBeGreaterThanOrEqual(1);
  });
});

describe('when the till should open', () => {
  it('opens for cash', () => {
    expect(shouldOpenDrawerForTenders([{ amount: 45_000, method: 'cash' }])).toBe(true);
  });

  it('stays shut for wallet payments', () => {
    expect(shouldOpenDrawerForTenders([{ amount: 45_000, method: 'kbzpay' }])).toBe(false);
    expect(shouldOpenDrawerForTenders([{ amount: 45_000, method: 'wave' }])).toBe(false);
    expect(shouldOpenDrawerForTenders([])).toBe(false);
  });

  it('opens on a split that includes cash, because cash still changes hands', () => {
    expect(shouldOpenDrawerForTenders([
      { amount: 20_000, method: 'cash' },
      { amount: 25_000, method: 'wave' },
    ])).toBe(true);
  });

  it('ignores a zero-value cash line', () => {
    expect(shouldOpenDrawerForTenders([{ amount: 0, method: 'cash' }])).toBe(false);
  });
});
