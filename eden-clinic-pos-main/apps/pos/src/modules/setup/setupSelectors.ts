import type { OutboxStatusView } from '@/data/outbox';

export function isClinicSaveOffline(status: OutboxStatusView): boolean {
  return status.state === 'offline';
}
