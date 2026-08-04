import type { OutboxStatusView } from '@/data/outbox';
import type { OutboxRow } from '@/data/types';

export type SupportOutboxExport = {
  version: 1;
  exportedAt: string;
  deviceId: string;
  status: OutboxStatusView;
  rows: readonly OutboxRow[];
};

export function buildSupportOutboxExport(input: {
  deviceId: string;
  now: number;
  status: OutboxStatusView;
  rows: readonly OutboxRow[];
}): SupportOutboxExport {
  return {
    version: 1,
    exportedAt: new Date(input.now).toISOString(),
    deviceId: input.deviceId,
    status: input.status,
    rows: input.rows.filter((row) => row.status !== 'done'),
  };
}
