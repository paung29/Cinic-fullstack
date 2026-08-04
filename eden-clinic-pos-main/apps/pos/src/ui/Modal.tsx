'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

export type ModalProps = { open: boolean; title: string; closeLabel: string; onClose(): void; children: ReactNode; testId?: string };

export function Modal({ children, closeLabel, onClose, open, testId = 'demo-modal', title }: ModalProps) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      aria-label={title}
      className={styles.backdrop}
      data-testid="modal-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="presentation"
    >
      <section aria-modal="true" className={styles.modal} data-testid={testId} role="dialog">
        <header className={styles.header}>
          <h2>{title}</h2>
          <button aria-label={closeLabel} className={styles.close} onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </section>
    </div>
  );
}
