import { afterEach, expect, test } from 'vitest';
import { createAuthClient } from '@/data/auth';
import { ApiHttpError, ApiNetworkError } from '@/data/api';
import { startMockServer, type MockServer } from './mock-server';

let mock: MockServer | undefined;

afterEach(async () => {
  await mock?.stop();
  mock = undefined;
});

test('validates the documented login and refresh responses', async () => {
  mock = await startMockServer();
  const auth = createAuthClient({ baseUrl: mock.baseUrl });

  const login = await auth.login({ staff_id: 's1', pin: '1234' });
  expect(login.staff).toMatchObject({ id: 's1', role: 'admin' });
  expect(login.token).toMatch(/^tok_/);
  expect(login.refresh).toMatch(/^ref_/);
  expect(login.server_time).toMatch(/T/);

  const refreshed = await auth.refresh(login.refresh);
  expect(refreshed.token).toMatch(/^tok_/);
  expect(refreshed.refresh).toMatch(/^ref_/);
  expect(refreshed.refresh).not.toBe(login.refresh);
});

test('maps refresh rejection and transport failures to existing API errors', async () => {
  mock = await startMockServer();
  const auth = createAuthClient({ baseUrl: mock.baseUrl });

  await expect(auth.refresh('not-a-token')).rejects.toMatchObject({ status: 401, code: 'BAD_REFRESH' } satisfies Partial<ApiHttpError>);

  const offline = createAuthClient({
    baseUrl: mock.baseUrl,
    fetchFn: async () => Promise.reject(new Error('offline')) as never,
  });

  await expect(offline.login({ staff_id: 's1', pin: '1234' })).rejects.toBeInstanceOf(ApiNetworkError);
});
