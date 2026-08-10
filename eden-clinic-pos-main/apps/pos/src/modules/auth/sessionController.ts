import type { SessionProvider } from '@/data/api';
import type { AuthClient } from '@/data/auth';
import type { Clock } from '@/data/bootstrap';
import { authEnvelopeMetaKey, authRepairMetaKey, type ClinicDb } from '@/data/db';
import type { EmailLoginWire, LoginResponseWire, LoginWire } from '@/data/types';
import {
  decryptSessionSecret,
  encryptSessionSecret,
  InvalidSessionEnvelopeError,
  type SessionCrypto,
  type SessionIdentity,
  type SessionSecret,
} from '@/modules/auth/sessionEnvelope';

export type { SessionIdentity } from '@/modules/auth/sessionEnvelope';

const identityLifetimeMs = 90 * 24 * 60 * 60 * 1_000;

export type SessionState =
  | { kind: 'signed-out' }
  | { kind: 'active'; identity: SessionIdentity }
  | { kind: 'auth-required'; identity: SessionIdentity }
  | { kind: 'identity-expired'; identity: SessionIdentity }
  | { kind: 'invalid-envelope'; staffId: string };

export type PendingOnlineSignIn = {
  identity: SessionIdentity;
  commit(): Promise<void>;
  abandon(): void;
};

export type SessionController = {
  provider: SessionProvider;
  state(): SessionState;
  subscribe(listener: () => void): () => void;
  beginOnlineSignIn(input: LoginWire): Promise<PendingOnlineSignIn>;
  beginOnlineSignInWithEmail(input: EmailLoginWire): Promise<PendingOnlineSignIn>;
  unlockOffline(staffId: string, pin: string): Promise<SessionIdentity>;
  verifyOfflineAdmin(staffId: string, pin: string): Promise<SessionIdentity>;
  beginCaptureBoundary(): () => void;
  requestRevocation(staffId: string): void;
  switchUser(): void;
  logout(): Promise<void>;
};

export class IdentityExpiredError extends Error {
  constructor() {
    super('The offline identity has expired and needs an online sign-in.');
    this.name = 'IdentityExpiredError';
  }
}

export class InvalidStoredEnvelopeError extends Error {
  constructor() {
    super('The stored session envelope is invalid and needs an online sign-in.');
    this.name = 'InvalidStoredEnvelopeError';
  }
}

export class OfflineAdminRequiredError extends Error {
  constructor() {
    super('The selected staff member is not an administrator.');
    this.name = 'OfflineAdminRequiredError';
  }
}

/**
 * This delay is intentionally memory-only. It discourages shoulder-surfing at
 * the counter, but a reboot must never become an offline hard lockout.
 */
export function pinDelayMs(failedAttempts: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, failedAttempts - 1));
}

export function createSessionController(options: {
  db: ClinicDb;
  auth: AuthClient;
  clock: Clock;
  crypto: SessionCrypto;
}): SessionController {
  let accessToken: string | undefined;
  let activeSecret: SessionSecret | undefined;
  let activeKey: CryptoKey | undefined;
  let activeSalt: Uint8Array | undefined;
  let currentState: SessionState = { kind: 'signed-out' };
  let captureDepth = 0;
  let pendingRevocationStaffId: string | undefined;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function setState(next: SessionState): void {
    currentState = next;
    notify();
  }

  function clearMemory(): void {
    accessToken = undefined;
    activeSecret = undefined;
    activeKey = undefined;
    activeSalt = undefined;
  }

  function stateIdentity(): SessionIdentity | undefined {
    switch (currentState.kind) {
      case 'active':
      case 'auth-required':
      case 'identity-expired':
        return currentState.identity;
      case 'signed-out':
      case 'invalid-envelope':
        return undefined;
    }
  }

  function applyPendingRevocation(): void {
    if (captureDepth !== 0 || pendingRevocationStaffId === undefined || stateIdentity()?.staffId !== pendingRevocationStaffId) {
      return;
    }

    pendingRevocationStaffId = undefined;
    clearMemory();
    setState({ kind: 'signed-out' });
  }

  async function serverAdjustedNow(): Promise<number> {
    const offset = await serverTimeOffset(options.db);
    return options.clock.now() + offset;
  }

  async function refresh(): Promise<void> {
    if (activeSecret === undefined || activeKey === undefined || activeSalt === undefined) {
      throw new Error('No active refresh credential is available.');
    }

    const refreshed = await options.auth.refresh(activeSecret.credential.refreshToken);
    const identity: SessionIdentity = {
      ...activeSecret.identity,
      validUntil: new Date(await serverAdjustedNow() + identityLifetimeMs).toISOString(),
    };
    const secret: SessionSecret = {
      identity,
      credential: {
        refreshToken: refreshed.refresh,
        refreshedAt: new Date(await serverAdjustedNow()).toISOString(),
      },
    };
    const encrypted = await encryptSessionSecret({
      secret,
      crypto: options.crypto,
      key: activeKey,
      salt: activeSalt,
    });

    accessToken = refreshed.token;
    activeSecret = secret;
    activeKey = encrypted.key;
    activeSalt = encrypted.salt;
    await options.db.meta.put({ key: authEnvelopeMetaKey(identity.staffId), value: encrypted.envelope });
    setState({ kind: 'active', identity });
  }

  /**
   * Everything after a successful server sign-in, shared by the staff-ID and
   * the email paths. The PIN is what encrypts the envelope either way, so the
   * device is left able to unlock offline no matter how it was paired.
   */
  async function completeOnlineSignIn(response: LoginResponseWire, pin: string): Promise<PendingOnlineSignIn> {
    const identity: SessionIdentity = {
      staffId: response.staff.id,
      name: response.staff.name,
      role: response.staff.role,
      validUntil: new Date(Date.parse(response.server_time) + identityLifetimeMs).toISOString(),
    };
    const secret: SessionSecret = {
      identity,
      credential: {
        refreshToken: response.refresh,
        refreshedAt: response.server_time,
      },
    };
    const encrypted = await encryptSessionSecret({ secret, crypto: options.crypto, pin });
    let abandoned = false;
    let committed = false;

    accessToken = response.token;
    activeSecret = secret;
    activeKey = encrypted.key;
    activeSalt = encrypted.salt;
    setState({ kind: 'active', identity });

    return {
      identity,
      async commit() {
        if (abandoned) {
          throw new Error('Cannot commit an abandoned online sign-in.');
        }
        if (committed) {
          return;
        }

        await options.db.meta.put({ key: authEnvelopeMetaKey(identity.staffId), value: encrypted.envelope });
        // A fresh server sign-in is exactly the repair the flag asks for.
        await options.db.meta.delete(authRepairMetaKey(identity.staffId));
        committed = true;
      },
      abandon() {
        if (committed || abandoned) {
          return;
        }

        abandoned = true;
        clearMemory();
        setState({ kind: 'signed-out' });
      },
    };
  }

  return {
    provider: {
      getAccessToken() {
        return accessToken;
      },
      refresh,
      // Reached once the server has answered 401 and a refresh could not rescue
      // it, so the stored credential is dead. The envelope is deliberately KEPT
      // — it carries the offline identity and the device must keep taking sales
      // when the server is unreachable. Instead we flag the staff member for
      // online repair: without it the PIN screen keeps unlocking offline into a
      // session whose every protected call 401s, which staff see as "wrong PIN"
      // with no way out.
      async onAuthFailure() {
        accessToken = undefined;
        const staffId = activeSecret?.identity.staffId;
        if (staffId !== undefined) {
          try {
            await options.db.meta.put({ key: authRepairMetaKey(staffId), value: true });
          } catch {
            // Best effort: a failed flag write must not mask the auth failure.
          }
        }
        if (activeSecret !== undefined) {
          setState({ kind: 'auth-required', identity: activeSecret.identity });
        } else {
          setState({ kind: 'signed-out' });
        }
      },
    },
    state() {
      return currentState;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async beginOnlineSignIn(input) {
      return completeOnlineSignIn(await options.auth.login(input), input.pin);
    },
    async beginOnlineSignInWithEmail(input) {
      if (options.auth.loginWithEmail === undefined) {
        throw new Error('This server does not offer email sign-in.');
      }
      return completeOnlineSignIn(await options.auth.loginWithEmail(input), input.pin);
    },
    async unlockOffline(staffId, pin) {
      let decrypted: { secret: SessionSecret; key: CryptoKey; salt: Uint8Array };
      try {
        decrypted = await decryptEnvelopeForStaff(options, staffId, pin);
      } catch (error) {
        if (error instanceof InvalidStoredEnvelopeError) {
          clearMemory();
          setState({ kind: 'invalid-envelope', staffId });
        }
        throw error;
      }
      if (isExpired(decrypted.secret.identity, await serverAdjustedNow())) {
        clearMemory();
        setState({ kind: 'identity-expired', identity: decrypted.secret.identity });
        throw new IdentityExpiredError();
      }

      accessToken = undefined;
      activeSecret = decrypted.secret;
      activeKey = decrypted.key;
      activeSalt = decrypted.salt;
      setState({ kind: 'active', identity: decrypted.secret.identity });
      return decrypted.secret.identity;
    },
    async verifyOfflineAdmin(staffId, pin) {
      const decrypted = await decryptEnvelopeForStaff(options, staffId, pin);
      if (isExpired(decrypted.secret.identity, await serverAdjustedNow())) {
        throw new IdentityExpiredError();
      }
      if (decrypted.secret.identity.role !== 'admin') {
        throw new OfflineAdminRequiredError();
      }

      return decrypted.secret.identity;
    },
    beginCaptureBoundary() {
      captureDepth += 1;
      let ended = false;
      return () => {
        if (ended) return;
        ended = true;
        captureDepth -= 1;
        applyPendingRevocation();
      };
    },
    requestRevocation(staffId) {
      if (stateIdentity()?.staffId !== staffId) return;
      pendingRevocationStaffId = staffId;
      applyPendingRevocation();
    },
    // A4: this never consults or alters durable rows. Its cart-only UI guard
    // lives at the Sale call site and is intentionally unrelated to LAW-10.
    switchUser() {
      pendingRevocationStaffId = undefined;
      clearMemory();
      setState({ kind: 'signed-out' });
    },
    async logout() {
      pendingRevocationStaffId = undefined;
      const refreshToken = activeSecret?.credential.refreshToken;
      clearMemory();
      setState({ kind: 'signed-out' });
      if (refreshToken !== undefined && options.auth.logout !== undefined) {
        try {
          await options.auth.logout(refreshToken);
        } catch {
          // Local logout must succeed even when the server is unavailable.
        }
      }
    },
  };
}

async function decryptEnvelopeForStaff(
  options: { db: ClinicDb; crypto: SessionCrypto },
  staffId: string,
  pin: string,
): Promise<{ secret: SessionSecret; key: CryptoKey; salt: Uint8Array }> {
  const row = await options.db.meta.get(authEnvelopeMetaKey(staffId));
  if (row === undefined) {
    throw new InvalidStoredEnvelopeError();
  }

  try {
    const decrypted = await decryptSessionSecret({ envelope: row.value, pin, crypto: options.crypto });
    if (decrypted.secret.identity.staffId !== staffId) {
      throw new InvalidStoredEnvelopeError();
    }
    return decrypted;
  } catch (error) {
    if (error instanceof InvalidSessionEnvelopeError || error instanceof InvalidStoredEnvelopeError) {
      throw new InvalidStoredEnvelopeError();
    }
    throw error;
  }
}

function isExpired(identity: SessionIdentity, serverAdjustedTime: number): boolean {
  return Date.parse(identity.validUntil) <= serverAdjustedTime;
}

async function serverTimeOffset(db: ClinicDb): Promise<number> {
  const row = await db.meta.get('serverTimeOffset');
  return typeof row?.value === 'number' ? row.value : 0;
}
