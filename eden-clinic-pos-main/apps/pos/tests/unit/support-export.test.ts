import { expect, test } from 'vitest';
import { buildSupportOutboxExport } from '@/data/supportExport';

test('exports only unsettled queue rows and supplied diagnostics', () => {
  const document = buildSupportOutboxExport({
    deviceId: 'device-1', now: Date.parse('2026-08-02T10:00:00.000Z'),
    status: { state: 'attention', pendingCount: 1, attentionCount: 1, drainProgress: 0 },
    rows: [
      { uuid: 'pending', status: 'pending' }, { uuid: 'attention', status: 'attention' }, { uuid: 'done', status: 'done' },
    ] as never,
  });
  expect(document).toMatchObject({ version: 1, deviceId: 'device-1', rows: [{ uuid: 'pending' }, { uuid: 'attention' }] });
  expect(JSON.stringify(document)).not.toContain('done');
  expect(JSON.stringify(document)).not.toContain('auth-envelope');
});
