import Dexie from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AuthClient } from '@/data/auth';
import { createClinicDb, type ClinicDb } from '@/data/db';
import { buildOutboxRow } from '@/data/outbox';
import type { LoginResponseWire } from '@/data/types';
import {
  createSessionController,
  IdentityExpiredError,
  InvalidStoredEnvelopeError,
  pinDelayMs,
} from '@/modules/auth/sessionController';
import type { SessionCrypto } from '@/modules/auth/sessionEnvelope';

const ninetyDaysMs = 90 * 24 * 60 * 60 * 1_000;
const databaseNames: string[] = [];
let databases: ClinicDb[] = [];

function createClock(initialNow = Date.parse('2026-07-31T12:00:00.000Z')): {
  clock: { now(): number };
  setNow(value: number): void;
} {
  let currentNow = initialNow;

  return {
    clock: { now: () => currentNow },
    setNow(value) {
      currentNow = value;
    },
  };
}

function createCrypto(): SessionCrypto & { decrypt: ReturnType<typeof vi.fn> } {
  let offset = 0;
  const decrypt = vi.fn(async (_key: CryptoKey, _iv: Uint8Array, ciphertext: Uint8Array) => {
    return Uint8Array.from(ciphertext, (byte) => byte ^ 0xff);
  });

  return {
    randomBytes(length) {
      const initialOffset = offset;
      offset += length;
      return Uint8Array.from({ length }, (_, index) => (initialOffset + index + 1) % 256);
    },
    async deriveKey() {
      return {} as CryptoKey;
    },
    async encrypt(_key, _iv, plaintext) {
      return Uint8Array.from(plaintext, (byte) => byte ^ 0xff);
    },
    decrypt,
  };
}

function loginResponse(overrides: Partial<LoginResponseWire> = {}): LoginResponseWire {
  return {
    token: 'access-first',
    refresh: 'refresh-first',
    staff: {
      id: 's1',
      name: 'Dr. Hkawn Mai',
      role: 'admin',
      takes_bookings: true,
    },
    clinic: {
      id: 'clinic-1',
      name: 'Eden Clinic',
      phone: '',
      address: '',
      rounding_step: 100,
      credit_limit_mmk: 100_000,
      receipt: {},
      receipt_footer: '',
      logo_url: '',
      telegram_handle: '',
      receipt_qr: true,
      receipt_next_visit: true,
      receipt_template: 'classic',
      receipt_header_font: 'sans',
      receipt_divider: 'line',
      consent_mode: 'warn',
      addons: {},
      feature_flags: {},
    },
    server_time: '2026-07-31T12:00:00.000Z',
    ...overrides,
  };
}

function createAuth(overrides: Partial<AuthClient> = {}): AuthClient {
  return {
    login: vi.fn(async () => loginResponse()),
    refresh: vi.fn(async () => ({ token: 'access-rotated', refresh: 'refresh-rotated' })),
    ...overrides,
  };
}

async function createDatabase(): Promise<ClinicDb> {
  const name = `eden-session-controller-${crypto.randomUUID()}`;
  databaseNames.push(name);
  const db = createClinicDb(name);
  databases.push(db);
  await db.open();
  return db;
}

async function createCommittedController(options: {
  db: ClinicDb;
  auth?: AuthClient;
  clock?: { now(): number };
  crypto?: SessionCrypto;
}) {
  const controller = createSessionController({
    db: options.db,
    auth: options.auth ?? createAuth(),
    clock: options.clock ?? createClock().clock,
    crypto: options.crypto ?? createCrypto(),
  });
  const pending = await controller.beginOnlineSignIn({ staff_id: 's1', pin: '1234' });
  await pending.commit();
  return controller;
}

beforeEach(() => {
  Dexie.dependencies.indexedDB = indexedDB;
  Dexie.dependencies.IDBKeyRange = IDBKeyRange;
  databases = [];
});

afterEach(async () => {
  for (const db of databases) {
    db.close();
  }
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe('session controller', () => {
  test('keeps a pending online sign-in memory-only until bootstrap commits it', async () => {
    const db = await createDatabase();
    const controller = createSessionController({ db, auth: createAuth(), clock: createClock().clock, crypto: createCrypto() });

    const pending = await controller.beginOnlineSignIn({ staff_id: 's1', pin: '1234' });

    expect(controller.provider.getAccessToken()).toBe('access-first');
    expect(await db.meta.get('auth-envelope:s1')).toBeUndefined();
    expect(pending.identity).toMatchObject({ staffId: 's1', role: 'admin' });

    pending.abandon();

    expect(controller.provider.getAccessToken()).toBeUndefined();
    expect(await db.meta.get('auth-envelope:s1')).toBeUndefined();
  });

  test('persists an opaque per-staff envelope only on commit and unlocks it offline', async () => {
    const db = await createDatabase();
    const auth = createAuth();
    const clock = createClock();
    const controller = createSessionController({ db, auth, clock: clock.clock, crypto: createCrypto() });
    const pending = await controller.beginOnlineSignIn({ staff_id: 's1', pin: '1234' });

    await pending.commit();
    const stored = await db.meta.get('auth-envelope:s1');
    const serialized = JSON.stringify(stored?.value);
    expect(serialized).not.toContain('access-first');
    expect(serialized).not.toContain('refresh-first');

    const offlineAuth = createAuth({
      login: vi.fn(async () => {
        throw new Error('Offline unlock must not call login.');
      }),
    });
    const laterController = createSessionController({ db, auth: offlineAuth, clock: clock.clock, crypto: createCrypto() });

    await expect(laterController.unlockOffline('s1', '1234')).resolves.toMatchObject({
      staffId: 's1',
      name: 'Dr. Hkawn Mai',
      role: 'admin',
    });
    expect(offlineAuth.login).not.toHaveBeenCalled();
  });

  test('refreshes through the injected provider, exposes the token, and rotates the envelope', async () => {
    const db = await createDatabase();
    const clock = createClock();
    const auth = createAuth();
    await db.meta.put({ key: 'serverTimeOffset', value: 1_500 });
    const controller = await createCommittedController({ db, auth, clock: clock.clock });
    const before = JSON.stringify((await db.meta.get('auth-envelope:s1'))?.value);
    let observedToken: string | undefined;
    auth.refresh = vi.fn(async (refreshToken) => {
      expect(refreshToken).toBe('refresh-first');
      observedToken = controller.provider.getAccessToken() as string | undefined;
      return { token: 'access-rotated', refresh: 'refresh-rotated' };
    });

    await controller.provider.refresh();

    expect(observedToken).toBe('access-first');
    expect(controller.provider.getAccessToken()).toBe('access-rotated');
    expect(JSON.stringify((await db.meta.get('auth-envelope:s1'))?.value)).not.toBe(before);
    expect(controller.state()).toMatchObject({
      kind: 'active',
      identity: { validUntil: new Date(clock.clock.now() + 1_500 + ninetyDaysMs).toISOString() },
    });
  });

  test('preserves envelope and outbox bytes when refresh fails, while retaining the offline identity', async () => {
    const db = await createDatabase();
    const auth = createAuth({
      refresh: vi.fn(async () => Promise.reject(new Error('server rejected credential')) as never),
    });
    const controller = await createCommittedController({ db, auth, clock: createClock().clock });
    await db.outbox.add(buildOutboxRow({
      kind: 'sale',
      uuid: 'queued-sale',
      payloadRef: {
        source: 'entity',
        entity: { table: 'sales', id: 'sale-1' },
        protectedEntities: [{ table: 'sales', id: 'sale-1' }],
      },
      now: 0,
    }));
    const envelopeBefore = JSON.stringify((await db.meta.get('auth-envelope:s1'))?.value);
    const outboxBefore = JSON.stringify(await db.outbox.toArray());

    await expect(controller.provider.refresh()).rejects.toThrow('server rejected credential');
    await controller.provider.onAuthFailure();

    expect(controller.provider.getAccessToken()).toBeUndefined();
    expect(controller.state()).toMatchObject({ kind: 'auth-required', identity: { staffId: 's1' } });
    expect(JSON.stringify((await db.meta.get('auth-envelope:s1'))?.value)).toBe(envelopeBefore);
    expect(JSON.stringify(await db.outbox.toArray())).toBe(outboxBefore);
  });

  test('logout leaves the durable envelope in place', async () => {
    const db = await createDatabase();
    const controller = await createCommittedController({ db });

    controller.logout();

    expect(controller.state()).toEqual({ kind: 'signed-out' });
    expect(await db.meta.get('auth-envelope:s1')).toBeDefined();
  });

  test('switch user clears only memory while preserving envelopes, queue rows, and device state', async () => {
    const db = await createDatabase();
    const controller = await createCommittedController({ db });
    await db.meta.put({ key: 'deviceId', value: 'device-1' });
    await db.outbox.add(buildOutboxRow({
      kind: 'sale',
      uuid: 'queued-sale',
      payloadRef: {
        source: 'entity',
        entity: { table: 'sales', id: 'sale-1' },
        protectedEntities: [{ table: 'sales', id: 'sale-1' }],
      },
      now: 0,
    }));
    const envelopeBefore = JSON.stringify((await db.meta.get('auth-envelope:s1'))?.value);
    const queueBefore = JSON.stringify(await db.outbox.toArray());
    const deviceBefore = JSON.stringify((await db.meta.get('deviceId'))?.value);

    controller.switchUser();

    expect(controller.state()).toEqual({ kind: 'signed-out' });
    expect(controller.provider.getAccessToken()).toBeUndefined();
    expect(JSON.stringify((await db.meta.get('auth-envelope:s1'))?.value)).toBe(envelopeBefore);
    expect(JSON.stringify(await db.outbox.toArray())).toBe(queueBefore);
    expect(JSON.stringify((await db.meta.get('deviceId'))?.value)).toBe(deviceBefore);
    await expect(controller.unlockOffline('s1', '1234')).resolves.toMatchObject({ staffId: 's1' });
  });

  test('defers an active staff revocation until the current capture boundary ends', async () => {
    const db = await createDatabase();
    const controller = await createCommittedController({ db });

    const endCapture = controller.beginCaptureBoundary();
    controller.requestRevocation('s1');
    expect(controller.state()).toMatchObject({ kind: 'active', identity: { staffId: 's1' } });

    endCapture();
    expect(controller.state()).toEqual({ kind: 'signed-out' });
  });

  test('verifies only a separately provisioned admin without replacing the active cashier', async () => {
    const db = await createDatabase();
    const cashierAuth = createAuth({
      login: vi.fn(async () => loginResponse({
        staff: { id: 's2', name: 'Naw Seng', role: 'staff', takes_bookings: false },
        token: 'cashier-token',
        refresh: 'cashier-refresh',
      })),
    });
    const cashier = await createCommittedController({ db, auth: cashierAuth });
    const admin = await createCommittedController({ db, auth: createAuth() });
    admin.logout();

    await expect(cashier.verifyOfflineAdmin('s1', '1234')).resolves.toMatchObject({ staffId: 's1', role: 'admin' });
    expect(cashier.state()).toMatchObject({ kind: 'active', identity: { staffId: 's2', role: 'staff' } });
    await expect(cashier.verifyOfflineAdmin('s2', '1234')).rejects.toThrow('not an administrator');
  });

  test('decrypts the actor envelope afresh for every offline admin proof', async () => {
    const db = await createDatabase();
    const crypto = createCrypto();
    const controller = await createCommittedController({ db, crypto });

    await controller.verifyOfflineAdmin('s1', '1234');
    await controller.verifyOfflineAdmin('s1', '1234');

    expect(crypto.decrypt).toHaveBeenCalledTimes(2);
  });

  test('uses server-adjusted identity expiry and distinguishes invalid envelopes from wrong PIN attempts', async () => {
    const db = await createDatabase();
    const clock = createClock();
    await db.meta.put({ key: 'serverTimeOffset', value: 2_000 });
    const committed = await createCommittedController({ db, clock: clock.clock });
    committed.logout();

    clock.setNow(clock.clock.now() + ninetyDaysMs + 2_001);
    const expired = createSessionController({ db, auth: createAuth(), clock: clock.clock, crypto: createCrypto() });
    await expect(expired.unlockOffline('s1', '1234')).rejects.toBeInstanceOf(IdentityExpiredError);
    expect(expired.state()).toMatchObject({ kind: 'identity-expired', identity: { staffId: 's1' } });

    await db.meta.put({
      key: 'auth-envelope:s1',
      value: {
        version: 2,
        kdf: 'PBKDF2-HMAC-SHA-256',
        iterations: 600_000,
        saltBase64: 'AQIDBAUGBwgJCgsMDQ4PEA==',
        ivBase64: 'AQIDBAUGBwgJCgsM',
        ciphertextBase64: 'AQIDBAUGBwgJCgsMDQ4PEBES',
      },
    });
    const invalid = createSessionController({ db, auth: createAuth(), clock: clock.clock, crypto: createCrypto() });

    await expect(invalid.unlockOffline('s1', '1234')).rejects.toBeInstanceOf(InvalidStoredEnvelopeError);
    expect(invalid.state()).toEqual({ kind: 'invalid-envelope', staffId: 's1' });
  });

  test('keeps the PIN throttle memory-only and bounded without any hard lockout', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(pinDelayMs)).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
  });
});

describe('session controller auth failure recovery', () => {
  // Regression: a revoked/expired refresh token used to leave the device in a
  // dead loop — the PIN screen kept unlocking the stale envelope offline, and
  // every protected call 401'd, which staff saw as "wrong PIN" with no way out.
  test('flags the staff member for online repair without touching the offline envelope', async () => {
    const db = await createDatabase();
    const controller = await createCommittedController({ db });
    const envelopeBefore = JSON.stringify((await db.meta.get('auth-envelope:s1'))?.value);

    await controller.provider.onAuthFailure();

    // The envelope survives so the device can still trade offline...
    expect(JSON.stringify((await db.meta.get('auth-envelope:s1'))?.value)).toBe(envelopeBefore);
    // ...but the login screen is told to re-authenticate for real next time.
    expect((await db.meta.get('auth-repair:s1'))?.value).toBe(true);
    expect(controller.provider.getAccessToken()).toBeUndefined();
    expect(controller.state().kind).toBe('auth-required');
  });

  test('a successful online sign-in clears the repair flag', async () => {
    const db = await createDatabase();
    const controller = await createCommittedController({ db });
    await controller.provider.onAuthFailure();
    expect(await db.meta.get('auth-repair:s1')).toBeDefined();

    const pending = await controller.beginOnlineSignIn({ staff_id: 's1', pin: '1234' });
    await pending.commit();

    expect(await db.meta.get('auth-repair:s1')).toBeUndefined();
  });

  test('an abandoned sign-in leaves the repair flag set', async () => {
    const db = await createDatabase();
    const controller = await createCommittedController({ db });
    await controller.provider.onAuthFailure();

    const pending = await controller.beginOnlineSignIn({ staff_id: 's1', pin: '1234' });
    pending.abandon();

    expect((await db.meta.get('auth-repair:s1'))?.value).toBe(true);
  });

  test('a signed-out controller tolerates an auth failure with no active secret', async () => {
    const db = await createDatabase();
    const controller = createSessionController({ db, auth: createAuth(), clock: createClock().clock, crypto: createCrypto() });

    await controller.provider.onAuthFailure();

    expect(controller.state().kind).toBe('signed-out');
  });
});
