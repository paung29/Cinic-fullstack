import { businessDayWindow } from '@/data/todaySummary';
import { cashDifference, expectedCash, paymentMethodTotals } from '@/data/money';
import type { ClinicDb } from '@/data/db';

export type ShiftCloseRecord = {
  version: 1;
  id: string;
  deviceId: string;
  day: string;
  closedAt: string;
  closedByStaffId: string;
  openingCash: number;
  cashSales: number;
  expectedCash: number;
  countedCash: number;
  difference: number;
  pendingCount: number;
  attentionCount: number;
};

export type CurrentShiftRecord = {
  version: 1;
  openingCash: number;
  latestCloseId: string;
};

export type CloseShiftInput = {
  db: ClinicDb;
  now: number;
  deviceId: string;
  actor: { staffId: string; role: 'admin' | 'staff' };
  openingCash: number;
  countedCash: number;
  uuid: string;
};

export class ShiftCloseAdminRequiredError extends Error {
  constructor() {
    super('An active administrator is required to close a shift.');
    this.name = 'ShiftCloseAdminRequiredError';
  }
}

export class ShiftCloseSyncRequiredError extends Error {
  constructor() {
    super('Queued work must finish syncing before shift close.');
    this.name = 'ShiftCloseSyncRequiredError';
  }
}

export class ShiftCloseAlreadyRecordedError extends Error {
  constructor() {
    super('A shift close record with this ID already exists.');
    this.name = 'ShiftCloseAlreadyRecordedError';
  }
}

export function shiftCloseAuditMetaKey(id: string): string {
  return `shift-close:v1:${id}`;
}

export function currentShiftMetaKey(deviceId: string, day: string): string {
  return `shift-current:v1:${deviceId}:${day}`;
}

export async function closeShift(input: CloseShiftInput): Promise<ShiftCloseRecord> {
  if (input.actor.role !== 'admin') {
    throw new ShiftCloseAdminRequiredError();
  }

  return input.db.transaction('rw', [input.db.sales, input.db.outbox, input.db.meta], async () => {
    const [sales, outbox, existing] = await Promise.all([
      input.db.sales.toArray(),
      input.db.outbox.toArray(),
      input.db.meta.get(shiftCloseAuditMetaKey(input.uuid)),
    ]);
    if (existing !== undefined) {
      throw new ShiftCloseAlreadyRecordedError();
    }

    const pendingCount = outbox.filter((row) => row.status === 'pending' || row.status === 'inflight').length;
    const attentionCount = outbox.filter((row) => row.status === 'attention').length;
    if (pendingCount > 0 || attentionCount > 0) {
      throw new ShiftCloseSyncRequiredError();
    }

    const window = businessDayWindow(input.now);
    const cashSales = paymentMethodTotals(sales.filter((sale) => (
      sale.status === 'completed'
      && Date.parse(sale.at) >= window.startMs
      && Date.parse(sale.at) < window.endMs
    ))).cash;
    const expected = expectedCash(input.openingCash, cashSales);
    const record: ShiftCloseRecord = {
      version: 1,
      id: input.uuid,
      deviceId: input.deviceId,
      day: window.day,
      closedAt: new Date(input.now).toISOString(),
      closedByStaffId: input.actor.staffId,
      openingCash: input.openingCash,
      cashSales,
      expectedCash: expected,
      countedCash: input.countedCash,
      difference: cashDifference(input.countedCash, expected),
      pendingCount,
      attentionCount,
    };

    await input.db.meta.put({ key: shiftCloseAuditMetaKey(record.id), value: record });
    await input.db.meta.put({
      key: currentShiftMetaKey(input.deviceId, window.day),
      value: { version: 1, openingCash: input.openingCash, latestCloseId: record.id } satisfies CurrentShiftRecord,
    });
    return record;
  });
}
