'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createApiClient, type ApiClient } from '@/data/api';
import { createAuthClient } from '@/data/auth';
import { bootstrap, pullDelta, type Clock, type SyncStaffResult } from '@/data/bootstrap';
import { createClinicDb, type ClinicDb } from '@/data/db';
import { createElevationController, type ElevationController } from '@/data/elevation';
import { createOutbox, type OutboxStatusView } from '@/data/outbox';
import { readApiBaseUrl } from '@/data/runtimeConfig';
import { createStorageDiagnostics, type StorageDiagnostics } from '@/data/storageDiagnostics';
import { readLocalePreference, saveLocalePreference } from '@/data/printerProfile';
import type { LoginWire, SetupRequestWire } from '@/data/types';
import { useLocaleControl, useT } from '@/i18n';
import { createSessionController, type SessionController, type SessionIdentity } from '@/modules/auth/sessionController';
import { createWebCryptoSessionCrypto } from '@/modules/auth/sessionEnvelope';
import { ToastProvider } from '@/ui';
import { PwaUpdateProvider } from './pwaUpdate';

export type ClinicRuntime = {
  db: ClinicDb;
  api: ApiClient;
  outbox: ReturnType<typeof createOutbox>;
  session: SessionController;
  elevation: ElevationController;
  storageDiagnostics: StorageDiagnostics;
  deviceId: string;
  now(): number;
  beginCaptureBoundary(): () => void;
  refreshSync(): Promise<OutboxStatusView>;
  provision(input: LoginWire): Promise<SessionIdentity>;
  install(input: SetupRequestWire): Promise<SessionIdentity>;
  signInOnline(input: LoginWire): Promise<SessionIdentity>;
  unlockOffline(staffId: string, pin: string): Promise<SessionIdentity>;
  verifyOfflineAdmin(staffId: string, pin: string): Promise<SessionIdentity>;
};

type RuntimeContextValue = {
  runtime: ClinicRuntime | undefined;
  initializationError: Error | undefined;
  revision: number;
};

const RuntimeContext = createContext<RuntimeContextValue>({
  runtime: undefined,
  initializationError: undefined,
  revision: 0,
});

const clock: Clock = { now: () => Date.now() };

export function ClinicRuntimeProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [context, setContext] = useState<RuntimeContextValue>({
    runtime: undefined,
    initializationError: undefined,
    revision: 0,
  });
  const [queryClient, setQueryClient] = useState<QueryClient | undefined>();

  useEffect(() => {
    let disposed = false;
    let db: ClinicDb | undefined;
    let removeSessionListener: (() => void) | undefined;
    let removeOnlineListener: (() => void) | undefined;

    const initialize = async () => {
      try {
        const clinicDb = createClinicDb();
        db = clinicDb;
        await clinicDb.open();
        // LAW-6: browser storage is read only after mount, never at module scope.
        const storageDiagnostics = createStorageDiagnostics(navigator.storage);
        const deviceId = await ensureDeviceId(clinicDb);
        const baseUrl = readApiBaseUrl();
        const auth = createAuthClient({ baseUrl });
        const session = createSessionController({ db: clinicDb, auth, clock, crypto: createWebCryptoSessionCrypto() });
        const api = createApiClient({ baseUrl, session: session.provider });
        const elevation = createElevationController({ api, clock });
        const outbox = createOutbox({ db: clinicDb, api, clock, jitter: (baseMs) => baseMs });
        const applySyncStaffResult = (result: SyncStaffResult) => {
          for (const staffId of result.offboardedStaffIds) {
            session.requestRevocation(staffId);
          }
        };
        const refreshSync = async () => {
          await clinicDb.outbox.where('status').equals('pending').modify({ nextAt: clock.now() });
          const status = await outbox.drain();
          if (await session.provider.getAccessToken() !== undefined) {
            try {
              applySyncStaffResult(await pullDelta({ db: clinicDb, api, clock }));
            } catch {
              // Outbox network failure remains the only offline health signal (M2).
            }
          }
          return status;
        };
        const bump = () => {
          if (!disposed) {
            setContext((current) => ({ ...current, revision: current.revision + 1 }));
          }
        };
        const completeOnlineSignIn = async (input: LoginWire): Promise<SessionIdentity> => {
          const pending = await session.beginOnlineSignIn(input);
          try {
            const syncStaffResult = await bootstrap({ db: clinicDb, api, deviceId, clock });
            await pending.commit();
            applySyncStaffResult(syncStaffResult);
            bump();
            void refreshSync().then(bump, bump);
            return pending.identity;
          } catch (error) {
            pending.abandon();
            throw error;
          }
        };
        const runtime: ClinicRuntime = {
          db: clinicDb,
          api,
          outbox,
          session,
          elevation,
          storageDiagnostics,
          deviceId,
          now: () => clock.now(),
          beginCaptureBoundary() {
            return session.beginCaptureBoundary();
          },
          refreshSync,
          provision: completeOnlineSignIn,
          async install(input) {
            if (auth.setup === undefined) throw new Error('Clinic setup is unavailable.');
            const created = await auth.setup(input);
            return completeOnlineSignIn({ staff_id: created.staff_id, pin: input.pin });
          },
          signInOnline: completeOnlineSignIn,
          async unlockOffline(staffId, pin) {
            const identity = await session.unlockOffline(staffId, pin);
            void refreshSync().then(bump, bump);
            return identity;
          },
          verifyOfflineAdmin(staffId, pin) {
            return session.verifyOfflineAdmin(staffId, pin);
          },
        };

        removeSessionListener = session.subscribe(() => {
          if (session.state().kind !== 'active') {
            elevation.clear();
          }
          bump();
        });
        const handleOnline = () => {
          void refreshSync().then(bump, bump);
        };
        window.addEventListener('online', handleOnline);
        removeOnlineListener = () => window.removeEventListener('online', handleOnline);

        if (!disposed) {
          setQueryClient(new QueryClient());
          setContext((current) => ({ runtime, initializationError: undefined, revision: current.revision + 1 }));
          void storageDiagnostics.requestPersistence().then(bump, bump);
        }
      } catch (error) {
        if (!disposed) {
          setContext((current) => ({
            runtime: undefined,
            initializationError: error instanceof Error ? error : new Error('Could not initialize the clinic runtime.'),
            revision: current.revision + 1,
          }));
        }
      }
    };

    void initialize();

    return () => {
      disposed = true;
      removeSessionListener?.();
      removeOnlineListener?.();
      db?.close();
    };
  }, []);

  const providerValue = useMemo(() => context, [context]);
  const content = <ToastProvider dismissLabel={t('action.dismiss')}><PwaUpdateProvider>{children}</PwaUpdateProvider></ToastProvider>;

  return (
    <RuntimeContext.Provider value={providerValue}>
      {context.runtime === undefined ? null : <LocalePreferenceBridge runtime={context.runtime} />}
      {queryClient === undefined ? content : <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>}
    </RuntimeContext.Provider>
  );
}

function LocalePreferenceBridge({ runtime }: { runtime: ClinicRuntime }) {
  const { locale, setLocale } = useLocaleControl();
  const [ready, setReady] = useState(false);
  const restoredLocale = useRef<ReturnType<typeof useLocaleControl>['locale'] | undefined>(undefined);

  useEffect(() => {
    let disposed = false;
    void readLocalePreference(runtime.db, runtime.deviceId).then((stored) => {
      if (disposed) return;
      restoredLocale.current = stored;
      // The dev-only locale override is an explicit choice; the persisted device
      // preference must never clobber it (CI-observed effect-ordering race).
      const devOverride = process.env.NODE_ENV === 'development'
        && ['my', 'en', 'zh'].includes(new URLSearchParams(window.location.search).get('__devLocale') ?? '');
      if (stored !== undefined && !devOverride) setLocale(stored);
      setReady(true);
    });
    return () => {
      disposed = true;
    };
  }, [runtime.db, runtime.deviceId, setLocale]);

  useEffect(() => {
    if (!ready) return;
    if (restoredLocale.current === locale) {
      restoredLocale.current = undefined;
      return;
    }
    void saveLocalePreference(runtime.db, runtime.deviceId, locale);
  }, [locale, ready, runtime.db, runtime.deviceId]);

  return null;
}

export function useClinicRuntime(): ClinicRuntime {
  const { runtime } = useContext(RuntimeContext);
  if (runtime === undefined) {
    throw new Error('useClinicRuntime must be used after ClinicRuntimeProvider finishes initialization.');
  }
  return runtime;
}

export function useClinicRuntimeStatus(): RuntimeContextValue {
  return useContext(RuntimeContext);
}

async function ensureDeviceId(db: ClinicDb): Promise<string> {
  const stored = await db.meta.get('deviceId');
  if (typeof stored?.value === 'string') {
    return stored.value;
  }

  const deviceId = crypto.randomUUID();
  await db.meta.put({ key: 'deviceId', value: deviceId });
  return deviceId;
}
