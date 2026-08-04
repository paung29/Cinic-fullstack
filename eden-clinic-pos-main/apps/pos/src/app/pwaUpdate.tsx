'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useT } from '@/i18n';
import { useToast, type ToastAction } from '@/ui';

export type RestartGate = {
  setHasUncommittedCart(value: boolean): void;
  state(): { disabled: boolean };
  requestRestart(): 'blocked' | 'restarting';
};

export function createRestartGate({
  armControllerChangeReload,
  skipWaiting,
}: {
  armControllerChangeReload(): void;
  skipWaiting(): void;
}): RestartGate {
  let hasUncommittedCart = false;
  return {
    setHasUncommittedCart(value) {
      hasUncommittedCart = value;
    },
    state() {
      return { disabled: hasUncommittedCart };
    },
    requestRestart() {
      if (hasUncommittedCart) return 'blocked';
      armControllerChangeReload();
      skipWaiting();
      return 'restarting';
    },
  };
}

type PwaUpdateValue = { setHasUncommittedCart(value: boolean): void };
const PwaUpdateContext = createContext<PwaUpdateValue | undefined>(undefined);

export function PwaUpdateProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const { enqueue, update } = useToast();
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined);
  const noticeId = useRef<number | undefined>(undefined);
  const [hasUncommittedCart, setHasUncommittedCartState] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const skipWaiting = useCallback(() => {
    registration.current?.waiting?.postMessage({ type: 'skip-waiting' });
  }, []);
  const armControllerChangeReload = useCallback(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const reload = () => window.location.reload();
    // Deliberately armed only by an explicit Restart consent, never at mount.
    navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
  }, []);

  const setHasUncommittedCart = useCallback((value: boolean) => {
    setHasUncommittedCartState(value);
  }, [setHasUncommittedCartState]);
  const requestRestart = useCallback(() => {
    if (hasUncommittedCart) return 'blocked';
    armControllerChangeReload();
    skipWaiting();
    return 'restarting';
  }, [armControllerChangeReload, hasUncommittedCart, skipWaiting]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return undefined;
    let disposed = false;
    const notifyWhenWaiting = (next: ServiceWorkerRegistration) => {
      if (!disposed && next.waiting !== null && navigator.serviceWorker.controller !== null) setUpdateReady(true);
    };
    const register = async () => {
      const next = await navigator.serviceWorker.register('/sw.js');
      if (disposed) return;
      registration.current = next;
      notifyWhenWaiting(next);
      next.addEventListener('updatefound', () => {
        const installing = next.installing;
        if (installing === null) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') notifyWhenWaiting(next);
        });
      });
    };
    void register();
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!updateReady) return;
    const action: ToastAction = {
      label: t('pwa.restart'),
      testId: 'pwa-update-restart',
      disabled: hasUncommittedCart,
      disabledReason: hasUncommittedCart ? t('pwa.finishOrAbandon') : undefined,
      onClick: () => { requestRestart(); },
    };
    if (noticeId.current === undefined) noticeId.current = enqueue(t('pwa.updateReady'), action);
    else update(noticeId.current, action);
  }, [enqueue, hasUncommittedCart, requestRestart, t, update, updateReady]);

  const value = useMemo(() => ({ setHasUncommittedCart }), [setHasUncommittedCart]);
  return <PwaUpdateContext.Provider value={value}>{children}</PwaUpdateContext.Provider>;
}

export function usePwaUpdate(): PwaUpdateValue {
  const context = useContext(PwaUpdateContext);
  if (context === undefined) throw new Error('usePwaUpdate must be used inside PwaUpdateProvider.');
  return context;
}
