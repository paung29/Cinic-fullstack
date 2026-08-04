'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import styles from './Toast.module.css';

export type ToastAction = {
  label: string;
  testId: string;
  disabled: boolean;
  disabledReason?: string;
  onClick(): void;
};

export type ToastEntry = { id: number; message: string; action?: ToastAction };
type ToastControl = {
  enqueue(message: string, action?: ToastAction): number;
  update(id: number, action: ToastAction): void;
  dismiss(): void;
};

export function createToastQueue() {
  let nextId = 0;
  let entries: ToastEntry[] = [];
  return {
    enqueue(message: string, action?: ToastAction) {
      const id = nextId;
      nextId += 1;
      entries = [...entries, { id, message, action }];
      return id;
    },
    update(id: number, action: ToastAction) {
      entries = entries.map((entry) => entry.id === id ? { ...entry, action } : entry);
    },
    dismiss() {
      entries = entries.slice(1);
    },
    current() {
      return entries[0];
    },
  };
}

const ToastContext = createContext<ToastControl | null>(null);

export function ToastProvider({ children, dismissLabel }: { children: ReactNode; dismissLabel: string }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);
  const enqueue = useCallback((message: string, action?: ToastAction) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [...current, { id, message, action }]);
    return id;
  }, []);
  const update = useCallback((id: number, action: ToastAction) => {
    setToasts((current) => current.map((entry) => entry.id === id ? { ...entry, action } : entry));
  }, []);
  const dismiss = useCallback(() => {
    setToasts((current) => current.slice(1));
  }, []);
  const value = useMemo(() => ({ enqueue, update, dismiss }), [dismiss, enqueue, update]);

  return <ToastContext.Provider value={value}>{children}<ToastViewport dismiss={dismiss} dismissLabel={dismissLabel} toasts={toasts} /></ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider.');
  return context;
}

export function ToastViewport({ dismiss, dismissLabel, toasts }: { toasts: readonly ToastEntry[]; dismiss(): void; dismissLabel: string }) {
  const toast = toasts[0];
  return (
    <aside aria-live="polite" className={styles.viewport} data-testid="toast-viewport">
      {toast ? (
        <div className={styles.toast} data-testid="toast-item">
          <CheckCircle2 aria-hidden="true" size={18} />
          <span className={styles.message}>{toast.message}</span>
          {toast.action === undefined ? null : <span className={styles.actionGroup}><button className={styles.action} data-testid={toast.action.testId} disabled={toast.action.disabled} onClick={toast.action.onClick} type="button">{toast.action.label}</button>{toast.action.disabledReason === undefined ? null : <small>{toast.action.disabledReason}</small>}</span>}
          <button aria-label={dismissLabel} className={styles.dismiss} data-testid="toast-dismiss" onClick={dismiss} type="button">
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      ) : null}
    </aside>
  );
}
