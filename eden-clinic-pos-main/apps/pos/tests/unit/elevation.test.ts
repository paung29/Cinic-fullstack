import { describe, expect, test, vi } from 'vitest';
import { ApiNetworkError, type ApiClient } from '@/data/api';
import { createElevationController } from '@/data/elevation';

describe('elevation controller', () => {
  test('keeps a successful server elevation exclusively in memory until its expiry', async () => {
    let now = Date.parse('2026-08-01T10:00:00.000Z');
    const api = {
      elevate: vi.fn(async () => ({
        elevation_token: 'elev-1',
        expires_at: '2026-08-01T10:15:00.000Z',
      })),
    } as Pick<ApiClient, 'elevate'>;
    const controller = createElevationController({ api, clock: { now: () => now } });

    await controller.elevate('eden', 'clinical-history');
    expect(controller.state()).toEqual({ kind: 'active', token: 'elev-1', expiresAt: '2026-08-01T10:15:00.000Z' });

    now = Date.parse('2026-08-01T10:15:00.000Z');
    expect(controller.state()).toEqual({ kind: 'none' });
  });

  test('propagates a network failure without inventing an offline elevation state', async () => {
    const api = {
      elevate: vi.fn(async () => Promise.reject(new ApiNetworkError('offline')) as never),
    } as Pick<ApiClient, 'elevate'>;
    const controller = createElevationController({ api, clock: { now: () => 0 } });

    await expect(controller.elevate('eden', 'clinical-history')).rejects.toBeInstanceOf(ApiNetworkError);
    expect(controller.state()).toEqual({ kind: 'none' });
  });
});
