'use client';

import { useState } from 'react';
import { useClinicRuntime } from '@/app/providers';
import { fmtMMK, patientOutstanding } from '@/data/money';
import { useClinicAddon } from '@/flags/useClinicAddon';
import { useT } from '@/i18n';
import { Button, Card, Input, Modal, StatTile, Tag } from '@/ui';
import type { PatientRow, SaleRow } from '@/data/types';
import { counterAlertText } from './patientSelectors';
import styles from './PatientProfileScreen.module.css';

export function PatientProfileScreen({
  patient,
  sales,
  onBook,
  onNewSale,
}: {
  patient: PatientRow;
  sales: readonly SaleRow[];
  onBook(): void;
  onNewSale(): void;
}) {
  const runtime = useClinicRuntime();
  const { t } = useT();
  const recallEnabled = useClinicAddon('recall');
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [failedUnlock, setFailedUnlock] = useState(false);
  const alert = counterAlertText(patient);
  const outstanding = patientOutstanding(sales);
  const visits = sales.filter((sale) => sale.status === 'completed').length;

  const unlockClinical = async () => {
    try {
      await runtime.elevation.elevate(password, 'patient-clinical-history');
      setUnlocked(true);
      setUnlockOpen(false);
      setPassword('');
      setFailedUnlock(false);
    } catch {
      setFailedUnlock(true);
    }
  };

  return (
    <section className={styles.profile} data-testid="patient-profile">
      <Card className={styles.hero}>
        <div>
          <p className={styles.code}>{patient.code ?? t('clients.profile.localCode')}</p>
          <h1>{patient.name}</h1>
          <p>{patient.phone}</p>
        </div>
        <div className={styles.actions}>
          <Button data-testid="patient-profile-book" onClick={onBook} pill size="sm" variant="ghost">{t('clients.profile.book')}</Button>
          <Button data-testid="patient-profile-new-sale" onClick={onNewSale} pill size="sm">{t('clients.profile.newSale')}</Button>
        </div>
      </Card>
      {alert === undefined ? null : <Card className={styles.alert} data-testid="allergy-banner"><strong>{t('clients.profile.alert')}</strong><span>{alert}</span></Card>}
      <div className={styles.stats}>
        <StatTile label={t('clients.profile.outstanding')} value={fmtMMK(outstanding)} valueTone={outstanding > 0 ? 'danger' : 'default'} />
        <StatTile label={t('clients.profile.visits')} value={String(visits)} />
        <StatTile label={t('clients.profile.followup')} value={patient.followupDate ?? t('clients.profile.none')} />
      </div>
      <Card className={styles.clinical}>
        <div className={styles.sectionHeading}>
          <div><p>{t('clients.profile.clinical')}</p><h2>{t('clients.profile.clinicalHistory')}</h2></div>
          {unlocked ? <Tag tone="ok">{t('clients.profile.unlocked')}</Tag> : <Button data-testid="unlock-clinical" onClick={() => setUnlockOpen(true)} pill size="sm" variant="ghost">{t('clients.profile.unlock')}</Button>}
        </div>
        {unlocked ? <div data-testid="clinical-record">{sales.length === 0 ? <p>{t('clients.profile.noVisits')}</p> : sales.map((sale) => <p key={sale.id}>{sale.lines.map((line) => line.nameSnapshot).join(', ')}</p>)}</div> : <p data-testid="clinical-locked">{t('clients.profile.locked')}</p>}
        {unlocked && recallEnabled ? <Card className={styles.recall} data-testid="recall-card"><Tag tone="ai">{t('clients.profile.recall')}</Tag><p>{t('clients.profile.recallBody')}</p></Card> : null}
      </Card>
      <Modal closeLabel={t('modal.close')} onClose={() => { setUnlockOpen(false); setFailedUnlock(false); }} open={unlockOpen} testId="clinical-elevation-modal" title={t('clients.profile.unlock')}>
        <div className={styles.unlockForm}>
          <Input aria-label={t('clients.profile.password')} data-testid="clinical-elevation-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
          {failedUnlock ? <p role="status">{t('clients.profile.unlockFailed')}</p> : null}
          <Button data-testid="clinical-elevation-confirm" onClick={() => { void unlockClinical(); }}>{t('clients.profile.unlock')}</Button>
        </div>
      </Modal>
    </section>
  );
}
