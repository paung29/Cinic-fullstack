import type { ApiClient } from '@/data/api';

export type ElevationState =
  | { kind: 'none' }
  | { kind: 'active'; token: string; expiresAt: string };

export type ElevationController = {
  state(): ElevationState;
  elevate(password: string, screen: string): Promise<void>;
  clear(): void;
};

export function createElevationController(options: {
  api: Pick<ApiClient, 'elevate'>;
  clock: { now(): number };
}): ElevationController {
  let current: ElevationState = { kind: 'none' };

  function state(): ElevationState {
    if (current.kind === 'active' && Date.parse(current.expiresAt) <= options.clock.now()) {
      current = { kind: 'none' };
    }
    return current;
  }

  return {
    state,
    async elevate(password, screen): Promise<void> {
      const response = await options.api.elevate({ password, screen });
      current = { kind: 'active', token: response.elevation_token, expiresAt: response.expires_at };
    },
    clear(): void {
      current = { kind: 'none' };
    },
  };
}
