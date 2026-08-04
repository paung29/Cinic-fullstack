import { ZodError } from 'zod';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiAuthError, createApiClient, type SessionProvider } from '@/data/api';
import { startMockServer, type MockServer } from './mock-server';

const bootstrapPayload = {
  clinic: {
    id: 'clinic-1',
    name: 'Eden',
    rounding_step: 500,
    credit_limit_mmk: 100_000,
    receipt: {},
    addons: {},
    feature_flags: {},
  },
  staff: [],
  services: [],
  products: [],
  patients: [],
  appointments: [],
  recent_sales: [],
  server_time: '2026-07-31T12:00:00.000Z',
  cursor: 0,
};

function responseWithStatus(status: number): Response {
  return Response.json(
    status === 401
      ? { status: 401, code: 'TOKEN_EXPIRED', message: 'Token expired' }
      : bootstrapPayload,
    { status },
  );
}

function createSessionProvider(refreshImpl: () => Promise<void>): {
  session: SessionProvider;
  getAccessToken: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  onAuthFailure: ReturnType<typeof vi.fn>;
  setToken(token: string): void;
} {
  let token = 'expired-token';
  const getAccessToken = vi.fn(async () => token);
  const refresh = vi.fn(refreshImpl);
  const onAuthFailure = vi.fn(async () => undefined);

  return {
    session: { getAccessToken, refresh, onAuthFailure },
    getAccessToken,
    refresh,
    onAuthFailure,
    setToken(nextToken: string): void {
      token = nextToken;
    },
  };
}

let mock: MockServer;

beforeAll(async () => {
  mock = await startMockServer();
});

beforeEach(async () => {
  await mock.reset();
});

afterAll(async () => {
  await mock.stop();
});

describe('createApiClient', () => {
  test('shares one refresh across concurrent 401 responses before retrying every request once', async () => {
    let expiredRequests = 0;
    let releaseExpiredRequests: (() => void) | undefined;
    const expiredWave = new Promise<void>((resolveWave) => {
      releaseExpiredRequests = resolveWave;
    });
    const provider = createSessionProvider(async () => {
      provider.setToken('fresh-token');
    });
    const fetchFn: typeof fetch = async (_input, init) => {
      const authorization = new Headers(init?.headers).get('authorization');
      if (authorization === 'Bearer expired-token') {
        expiredRequests += 1;
        if (expiredRequests === 3) {
          releaseExpiredRequests?.();
        }
        await expiredWave;
        return responseWithStatus(401);
      }

      return responseWithStatus(200);
    };
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchFn, session: provider.session });

    const results = await Promise.all([client.bootstrap(), client.bootstrap(), client.bootstrap()]);

    expect(provider.refresh).toHaveBeenCalledTimes(1);
    expect(provider.getAccessToken).toHaveBeenCalled();
    expect(results).toHaveLength(3);
  });

  test('does not start a second refresh when a staggered old-token 401 arrives after another request renewed', async () => {
    let token = 'expired-token';
    let releaseFirstUnauthorized: (() => void) | undefined;
    let releaseSecondUnauthorized: (() => void) | undefined;
    let secondUnauthorizedStarted: (() => void) | undefined;
    let refreshCompleted: (() => void) | undefined;
    const firstUnauthorized = new Promise<void>((resolve) => {
      releaseFirstUnauthorized = resolve;
    });
    const secondUnauthorized = new Promise<void>((resolve) => {
      releaseSecondUnauthorized = resolve;
    });
    const secondStarted = new Promise<void>((resolve) => {
      secondUnauthorizedStarted = resolve;
    });
    const refreshed = new Promise<void>((resolve) => {
      refreshCompleted = resolve;
    });
    const refresh = vi.fn(async () => {
      token = 'fresh-token';
      refreshCompleted?.();
    });
    const session: SessionProvider = {
      getAccessToken: () => token,
      refresh,
      onAuthFailure: async () => undefined,
    };
    let expiredRequests = 0;
    const fetchFn: typeof fetch = async (_input, init) => {
      if (new Headers(init?.headers).get('authorization') !== 'Bearer expired-token') {
        return responseWithStatus(200);
      }

      expiredRequests += 1;
      if (expiredRequests === 1) {
        await firstUnauthorized;
      } else {
        secondUnauthorizedStarted?.();
        await secondUnauthorized;
      }
      return responseWithStatus(401);
    };
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchFn, session });

    const first = client.bootstrap();
    const second = client.bootstrap();
    await secondStarted;
    releaseFirstUnauthorized?.();
    await refreshed;
    releaseSecondUnauthorized?.();

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  test('signals auth failure once when the shared refresh rejects', async () => {
    const provider = createSessionProvider(async () => Promise.reject(new Error('refresh unavailable')));
    const fetchFn: typeof fetch = async () => responseWithStatus(401);
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchFn, session: provider.session });

    const results = await Promise.allSettled([client.bootstrap(), client.bootstrap()]);

    expect(results.every((result) => result.status === 'rejected' && result.reason instanceof ApiAuthError)).toBe(true);
    expect(provider.refresh).toHaveBeenCalledTimes(1);
    expect(provider.onAuthFailure).toHaveBeenCalledTimes(1);
  });

  test('does not refresh twice when the retried request is also unauthorized', async () => {
    const provider = createSessionProvider(async () => {
      provider.setToken('still-expired');
    });
    const fetchFn: typeof fetch = async () => responseWithStatus(401);
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchFn, session: provider.session });

    await expect(client.bootstrap()).rejects.toBeInstanceOf(ApiAuthError);

    expect(provider.refresh).toHaveBeenCalledTimes(1);
    expect(provider.onAuthFailure).toHaveBeenCalledTimes(1);
  });

  test('validates an unauthorized error body before starting refresh', async () => {
    const provider = createSessionProvider(async () => undefined);
    const fetchFn: typeof fetch = async () => Response.json({ error: 'not the contract shape' }, { status: 401 });
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchFn, session: provider.session });

    await expect(client.bootstrap()).rejects.toBeInstanceOf(ZodError);

    expect(provider.refresh).not.toHaveBeenCalled();
  });

  test('signals auth failure without retrying when refresh produces no replacement token', async () => {
    const getAccessToken = vi.fn(async () => undefined);
    const refresh = vi.fn(async () => undefined);
    const onAuthFailure = vi.fn(async () => undefined);
    const session: SessionProvider = { getAccessToken, refresh, onAuthFailure };
    let requestCount = 0;
    const fetchFn: typeof fetch = async () => {
      requestCount += 1;
      return responseWithStatus(401);
    };
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchFn, session });

    await expect(client.bootstrap()).rejects.toBeInstanceOf(ApiAuthError);

    expect(requestCount).toBe(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });

  test('validates a real login and bootstrap, then exposes the mock patient-merge response', async () => {
    const auth = { token: undefined as string | undefined };
    const session: SessionProvider = {
      getAccessToken: () => auth.token,
      refresh: async () => undefined,
      onAuthFailure: async () => undefined,
    };
    const client = createApiClient({ baseUrl: mock.baseUrl, session });
    const login = await client.login({ staff_id: 's1', pin: '1234' });
    auth.token = login.token;

    const bootstrap = await client.bootstrap();
    const patientResult = await client.dispatch({
      kind: 'patient',
      payload: {
        id: 'offline-patient',
        name: 'Duplicate phone',
        phone: '09 771 234 560',
      },
    });

    expect(bootstrap.products.map((product) => product.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p7']);
    expect(patientResult).toMatchObject({ merged_into: 'c1', patient: { id: 'c1' } });
  });

  test('sends an appointment status change to the documented PATCH route with its status-only body', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({
      id: 'appointment-1',
      date: '2026-08-01',
      time: '09:30',
      staff_id: 's1',
      patient_id: 'c1',
      service_id: 'v1',
      status: 'here',
    }));
    const session: SessionProvider = {
      getAccessToken: () => 'token-1',
      refresh: async () => undefined,
      onAuthFailure: async () => undefined,
    };
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchFn, session });
    await expect(client.dispatch({ kind: 'appointmentStatus', appointmentId: 'appointment-1', payload: { status: 'here' } })).resolves.toMatchObject({
      appointment: { id: 'appointment-1', status: 'here' },
    });

    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.test/appointments/appointment-1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'here' }) }),
    );
  });

  test('uses the protected API path to validate and return a server elevation response', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({
      elevation_token: 'elevation-1',
      expires_at: '2026-08-01T10:00:00.000Z',
    }));
    const session: SessionProvider = {
      getAccessToken: () => 'token-1',
      refresh: async () => undefined,
      onAuthFailure: async () => undefined,
    };
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchFn, session });
    await expect(client.elevate({ password: 'eden', screen: 'clinical-history' })).resolves.toEqual({
      elevation_token: 'elevation-1',
      expires_at: '2026-08-01T10:00:00.000Z',
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.test/auth/elevate',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ password: 'eden', screen: 'clinical-history' }) }),
    );
  });

  test('sends elevated clinic and product updates over the documented online-only paths', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === '/clinic') {
        return Response.json({ ...bootstrapPayload.clinic, receipt_qr: false, receipt_template: 'minimal' });
      }
      return Response.json({
        id: 'p1', name: 'Aftercare cream', price: 32_000, stock_type: 'retail', sold_by: 'weight',
      });
    });
    const session: SessionProvider = {
      getAccessToken: () => 'token-1',
      refresh: async () => undefined,
      onAuthFailure: async () => undefined,
    };
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchFn, session }) as unknown as {
      updateClinic(input: { receipt_qr?: boolean; receipt_template?: string }, elevationToken: string): Promise<{ receipt_qr: boolean }>;
      updateProduct(id: string, input: { price?: number; sold_by?: string }, elevationToken: string): Promise<{ sold_by: string }>;
    };

    await expect(client.updateClinic({ receipt_qr: false, receipt_template: 'minimal' }, 'elevation-1')).resolves.toMatchObject({ receipt_qr: false });
    await expect(client.updateProduct('p1', { price: 32_000, sold_by: 'weight' }, 'elevation-1')).resolves.toMatchObject({ sold_by: 'weight' });

    expect(fetchFn).toHaveBeenNthCalledWith(
      1,
      'https://api.example.test/clinic',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ receipt_qr: false, receipt_template: 'minimal' }), headers: expect.any(Headers) }),
    );
    expect(new Headers(fetchFn.mock.calls[0]?.[1]?.headers).get('x-elevation')).toBe('elevation-1');
    expect(fetchFn).toHaveBeenNthCalledWith(
      2,
      'https://api.example.test/products/p1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ price: 32_000, sold_by: 'weight' }) }),
    );
  });

  test('uses the protected barcode lookup endpoint without an elevation header', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({
      found: true, name: 'NIVEA Soft moisturising cream 100ml', brand: 'NIVEA', category: 'Skincare', source: 'obf',
    }));
    const session: SessionProvider = {
      getAccessToken: () => 'token-1',
      refresh: async () => undefined,
      onAuthFailure: async () => undefined,
    };
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchFn, session }) as unknown as {
      lookupBarcode(code: string): Promise<{ found: boolean; brand?: string }>;
    };

    await expect(client.lookupBarcode('4005900654321')).resolves.toMatchObject({ found: true, brand: 'NIVEA' });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.example.test/barcode-lookup?code=4005900654321',
      expect.objectContaining({ method: 'GET', headers: expect.any(Headers) }),
    );
    expect(new Headers(fetchFn.mock.calls[0]?.[1]?.headers).get('x-elevation')).toBeNull();
  });

  test('keeps staff activity explicit and limits recall/offboarding controls to mock fixtures', async () => {
    await mock.reset({ addons: { recall: false } });
    const loginResponse = await fetch(`${mock.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ staff_id: 's1', pin: '1234' }),
    });
    const login = await loginResponse.json() as { token: string };
    const bootstrapResponse = await fetch(`${mock.baseUrl}/bootstrap`, {
      headers: { authorization: `Bearer ${login.token}` },
    });
    const bootstrap = await bootstrapResponse.json() as {
      clinic: { addons: { recall?: boolean } };
      staff: Array<{ active?: boolean }>;
      cursor: number;
    };

    expect(bootstrap.clinic.addons.recall).toBe(false);
    expect(bootstrap.staff).toHaveLength(3);
    expect(bootstrap.staff.every((staff) => staff.active === true)).toBe(true);

    await mock.offboard('s2');
    const deltaResponse = await fetch(`${mock.baseUrl}/delta?since=${bootstrap.cursor}`, {
      headers: { authorization: `Bearer ${login.token}` },
    });
    const delta = await deltaResponse.json() as { changes: Array<{ entity: string; row: { id?: string; active?: boolean } }> };
    const offboarding = delta.changes.find((change) => change.entity === 'staff' && change.row.id === 's2');
    expect(offboarding).toMatchObject({ row: { active: false } });
    expect(offboarding?.row).not.toHaveProperty('pin');
    expect(offboarding?.row).not.toHaveProperty('password');
  });

  test('emits complete elevated clinic and product updates through the normal delta stream', async () => {
    const loginResponse = await fetch(`${mock.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ staff_id: 's1', pin: '1234' }),
    });
    const login = await loginResponse.json() as { token: string };
    const headers = { authorization: `Bearer ${login.token}`, 'content-type': 'application/json' };
    const bootstrapResponse = await fetch(`${mock.baseUrl}/bootstrap`, { headers });
    const bootstrap = await bootstrapResponse.json() as { cursor: number };
    const elevateResponse = await fetch(`${mock.baseUrl}/auth/elevate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ password: 'eden', screen: 'm5-contract' }),
    });
    const elevation = await elevateResponse.json() as { elevation_token: string };
    const elevatedHeaders = { ...headers, 'x-elevation': elevation.elevation_token };

    const clinicResponse = await fetch(`${mock.baseUrl}/clinic`, {
      method: 'PATCH',
      headers: elevatedHeaders,
      body: JSON.stringify({ receipt_qr: false, receipt_template: 'boxed' }),
    });
    expect(clinicResponse.status).toBe(200);
    await expect(clinicResponse.json()).resolves.toMatchObject({
      id: 'clinic-1', receipt_qr: false, receipt_template: 'boxed', receipt_header_font: 'sans', receipt_divider: 'line',
    });

    const productResponse = await fetch(`${mock.baseUrl}/products/p1`, {
      method: 'PATCH',
      headers: elevatedHeaders,
      body: JSON.stringify({ price: 33_000, sold_by: 'weight' }),
    });
    expect(productResponse.status).toBe(200);
    await expect(productResponse.json()).resolves.toMatchObject({ id: 'p1', price: 33_000, sold_by: 'weight' });

    const deltaResponse = await fetch(`${mock.baseUrl}/delta?since=${bootstrap.cursor}`, { headers });
    const delta = await deltaResponse.json() as { changes: Array<{ entity: string; op: string; row: Record<string, unknown> }> };
    expect(delta.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity: 'clinic', op: 'upsert', row: expect.objectContaining({ receipt_qr: false }) }),
      expect.objectContaining({ entity: 'product', op: 'upsert', row: expect.objectContaining({ id: 'p1', price: 33_000 }) }),
    ]));
  });

  test('rejects non-elevated and structurally invalid M5 configuration writes', async () => {
    const loginResponse = await fetch(`${mock.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ staff_id: 's1', pin: '1234' }),
    });
    const login = await loginResponse.json() as { token: string };
    const headers = { authorization: `Bearer ${login.token}`, 'content-type': 'application/json' };

    const missingElevation = await fetch(`${mock.baseUrl}/clinic`, {
      method: 'PATCH', headers, body: JSON.stringify({ receipt_qr: false }),
    });
    await expect(missingElevation.json()).resolves.toMatchObject({ status: 403, code: 'ELEVATION_REQUIRED' });

    const elevateResponse = await fetch(`${mock.baseUrl}/auth/elevate`, {
      method: 'POST', headers, body: JSON.stringify({ password: 'eden', screen: 'm5-contract' }),
    });
    const elevation = await elevateResponse.json() as { elevation_token: string };
    const elevatedHeaders = { ...headers, 'x-elevation': elevation.elevation_token };
    const malformedClinic = await fetch(`${mock.baseUrl}/clinic`, {
      method: 'PATCH', headers: elevatedHeaders, body: JSON.stringify({ addons: { recall: false } }),
    });
    await expect(malformedClinic.json()).resolves.toMatchObject({ status: 400, code: 'MALFORMED' });

    const stockWrite = await fetch(`${mock.baseUrl}/products/p1`, {
      method: 'PATCH', headers: elevatedHeaders, body: JSON.stringify({ stock_qty: 999 }),
    });
    await expect(stockWrite.json()).resolves.toMatchObject({ status: 400, code: 'MALFORMED' });

    const duplicateBarcode = await fetch(`${mock.baseUrl}/products/p1`, {
      method: 'PATCH', headers: elevatedHeaders, body: JSON.stringify({ barcode: '4005900123456' }),
    });
    const duplicateBody = await duplicateBarcode.json() as { status: number; code: string; message: string };
    expect(duplicateBody).toMatchObject({ status: 400, code: 'DUPLICATE_BARCODE' });
    expect(duplicateBody.message).toContain('p2');
  });
});
