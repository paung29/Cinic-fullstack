'use client';

import { useEffect, useState } from 'react';
import { useClinicRuntime } from '@/app/providers';
import { LastAdminEnvelopeError, removeLocalEnvelope } from '@/data/adminEnvelopes';
import { ApiNetworkError } from '@/data/api';
import { authEnvelopeMetaKey } from '@/data/db';
import { useT } from '@/i18n';
import { Button, Input, Modal, PinPad } from '@/ui';
import styles from './OfflineAdminEnvelopeManager.module.css';

export type OfflineAdminEnvelopeManagerProps = {
  currentAdminId: string;
  onRemoved(): void;
};

type RemovalMode = 'online' | 'offline';

export function shouldUseOfflineRemovalProof(error: unknown): boolean {
  return error instanceof ApiNetworkError;
}

export function OfflineAdminEnvelopeManager({ currentAdminId, onRemoved }: OfflineAdminEnvelopeManagerProps) {
  const runtime = useClinicRuntime();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [targetStaffId, setTargetStaffId] = useState<string>();
  const [staff, setStaff] = useState<Array<{ id: string; name: string; role: 'admin' | 'staff' }>>([]);
  const [mode, setMode] = useState<RemovalMode>('online');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<'failed' | 'last-admin' | undefined>();

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    void (async () => {
      const rows = await runtime.db.staff.filter((row) => row.active).toArray();
      const envelopes = await Promise.all(rows.map((row) => runtime.db.meta.get(authEnvelopeMetaKey(row.id))));
      if (active) {
        setStaff(rows.filter((_row, index) => envelopes[index] !== undefined).map((row) => ({ id: row.id, name: row.name, role: row.role })));
      }
    })();
    return () => {
      active = false;
    };
  }, [open, runtime]);

  const close = () => {
    setOpen(false);
    setTargetStaffId(undefined);
    setMode('online');
    setPassword('');
    setPin('');
    setMessage(undefined);
  };

  const remove = async () => {
    if (targetStaffId === undefined) return;
    try {
      await removeLocalEnvelope(runtime.db, { targetStaffId, actorStaffId: currentAdminId, now: Date.now() });
      onRemoved();
      close();
    } catch (error) {
      setMessage(error instanceof LastAdminEnvelopeError ? 'last-admin' : 'failed');
    }
  };

  const proveOnline = async () => {
    if (password === '' || targetStaffId === undefined) return;
    setMessage(undefined);
    try {
      await runtime.elevation.elevate(password, 'offline-admin-envelope-removal');
      await remove();
    } catch (error) {
      if (shouldUseOfflineRemovalProof(error)) {
        setMode('offline');
      } else {
        setMessage('failed');
      }
    }
  };

  const proveOffline = async () => {
    if (pin.length !== 4 || targetStaffId === undefined) return;
    setMessage(undefined);
    try {
      await runtime.verifyOfflineAdmin(currentAdminId, pin);
      await remove();
    } catch (error) {
      setMessage(error instanceof LastAdminEnvelopeError ? 'last-admin' : 'failed');
      setPin('');
    }
  };

  return (
    <section className={styles.manager} data-testid="offline-admin-manager">
      <Button onClick={() => setOpen(true)} pill size="sm" variant="ghost">{t('auth.envelopes.open')}</Button>
      <Modal closeLabel={t('modal.close')} onClose={close} open={open} testId="offline-admin-removal-modal" title={t('auth.envelopes.title')}>
        <div className={styles.content}>
          <div className={styles.staffList}>
            {staff.map((member) => (
              <Button data-testid={`remove-envelope-${member.id}`} key={member.id} onClick={() => { setTargetStaffId(member.id); setMessage(undefined); }} pill size="sm" variant="ghost">
                {member.name}
              </Button>
            ))}
          </div>
          {targetStaffId === undefined ? null : mode === 'online' ? (
            <>
              <Input aria-label={t('auth.envelopes.password')} onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
              <Button onClick={() => { void proveOnline(); }}>{t('auth.envelopes.confirmOnline')}</Button>
            </>
          ) : (
            <>
              <p className={styles.warning}>{t('auth.envelopes.offlineWarning')}</p>
              <PinPad backspaceLabel={t('pin.backspace')} displayTestId="offline-removal-pin-display" onChange={setPin} onSubmit={() => { void proveOffline(); }} submitLabel={t('auth.envelopes.confirmOffline')} testId="offline-removal-pinpad" value={pin} />
            </>
          )}
          {message === 'last-admin' ? <p role="status">{t('auth.envelopes.lastAdmin')}</p> : null}
          {message === 'failed' ? <p role="status">{t('auth.envelopes.failed')}</p> : null}
        </div>
      </Modal>
    </section>
  );
}
