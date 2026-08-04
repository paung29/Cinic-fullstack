import { expect, test } from 'vitest';
import { isClinicSaveOffline } from '@/modules/setup/setupSelectors';

test('only the outbox-derived offline status disables online-only clinic configuration saves', () => {
  expect(isClinicSaveOffline({ state: 'offline', pendingCount: 1, attentionCount: 0, drainProgress: 0 })).toBe(true);
  expect(isClinicSaveOffline({ state: 'synced', pendingCount: 0, attentionCount: 0, drainProgress: 0 })).toBe(false);
  expect(isClinicSaveOffline({ state: 'attention', pendingCount: 1, attentionCount: 1, drainProgress: 0 })).toBe(false);
});
