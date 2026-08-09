'use client';

import { useState } from 'react';
import { useClinicRuntime } from '@/app/providers';
import { fmtMMK, patientOutstanding } from '@/data/money';
import { updatePatient } from '@/data/patientRecords';
import { useClinicAddon } from '@/flags/useClinicAddon';
import { useT } from '@/i18n';
import { Button, Card, Input, Modal, StatTile, Tag, useToast } from '@/ui';
import type { ClinicalRecordWire, PatientRow, SaleRow } from '@/data/types';
import { counterAlertText } from './patientSelectors';
import { PhotoLibrary } from './PhotoLibrary';
import styles from './PatientProfileScreen.module.css';

export function PatientProfileScreen({
  patient,
  sales,
  onBook,
  onNewSale,
  onUpdated,
}: {
  patient: PatientRow;
  sales: readonly SaleRow[];
  onBook(): void;
  onNewSale(): void;
  onUpdated(): void;
}) {
  const runtime = useClinicRuntime();
  const { t } = useT();
  const { enqueue } = useToast();
  const recallEnabled = useClinicAddon('recall');
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [failedUnlock, setFailedUnlock] = useState(false);
  const [clinicalRecords, setClinicalRecords] = useState<ClinicalRecordWire[]>([]);
  const [visitNotes, setVisitNotes] = useState('');
  const [prescriptions, setPrescriptions] = useState('');
  const [clinicalBusy, setClinicalBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(patient.name);
  const [editPhone, setEditPhone] = useState(patient.phone);
  const [editAllergies, setEditAllergies] = useState(patient.allergies ?? '');
  const alert = counterAlertText(patient);
  const outstanding = patientOutstanding(sales);
  const visits = sales.filter((sale) => sale.status === 'completed').length;

  const unlockClinical = async () => {
    try {
      await runtime.elevation.elevate(password, 'patient-clinical-history');
      const elevation = runtime.elevation.state();
      if (elevation.kind !== 'active') throw new Error('Elevation did not become active.');
      if (runtime.api.clinicalRecords === undefined) throw new Error('Clinical records are unavailable.');
      setClinicalRecords(await runtime.api.clinicalRecords(patient.id, elevation.token));
      setUnlocked(true);
      setUnlockOpen(false);
      setPassword('');
      setFailedUnlock(false);
    } catch {
      setFailedUnlock(true);
    }
  };

  const addClinicalRecord = async () => {
    const elevation = runtime.elevation.state();
    const session = runtime.session.state();
    if (elevation.kind !== 'active' || session.kind !== 'active' || visitNotes.trim() === '' || runtime.api.createClinicalRecord === undefined) return;
    setClinicalBusy(true);
    try {
      const created = await runtime.api.createClinicalRecord(patient.id, {
        staff_id: session.identity.staffId,
        visit_notes: visitNotes.trim(),
        prescriptions: prescriptions.trim() === '' ? null : prescriptions.trim(),
      }, elevation.token);
      setClinicalRecords((current) => [created, ...current]);
      setVisitNotes('');
      setPrescriptions('');
      enqueue(t('clients.profile.recordSaved'));
    } catch {
      enqueue(t('clients.profile.saveFailed'));
    } finally {
      setClinicalBusy(false);
    }
  };

  const savePatient = async () => {
    try {
      await updatePatient({ db: runtime.db, api: runtime.api, patient: { ...patient, name: editName.trim(), phone: editPhone.trim(), allergies: editAllergies.trim() || null } });
      setEditOpen(false);
      enqueue(t('clients.profile.updated'));
      onUpdated();
    } catch {
      enqueue(t('clients.profile.saveFailed'));
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
          <Button data-testid="patient-profile-edit" onClick={() => { setEditName(patient.name); setEditPhone(patient.phone); setEditAllergies(patient.allergies ?? ''); setEditOpen(true); }} pill size="sm" variant="ghost">{t('clients.profile.edit')}</Button>
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
        {unlocked ? <div className={styles.clinicalRecords} data-testid="clinical-record">
          {clinicalRecords.length === 0 ? <p>{t('clients.profile.noVisits')}</p> : clinicalRecords.map((record) => <Card compact key={record.id}><strong>{new Date(record.created_at).toLocaleString()}</strong><p>{record.visit_notes}</p>{record.prescriptions ? <small>{record.prescriptions}</small> : null}</Card>)}
          <label><span>{t('clients.profile.visitNotes')}</span><Input data-testid="clinical-visit-notes" onChange={(event) => setVisitNotes(event.target.value)} value={visitNotes} /></label>
          <label><span>{t('clients.profile.prescriptions')}</span><Input data-testid="clinical-prescriptions" onChange={(event) => setPrescriptions(event.target.value)} value={prescriptions} /></label>
          <Button data-testid="clinical-record-save" disabled={clinicalBusy || visitNotes.trim() === ''} onClick={() => { void addClinicalRecord(); }}>{t('clients.profile.saveRecord')}</Button>
        </div> : <p data-testid="clinical-locked">{t('clients.profile.locked')}</p>}
        {unlocked && recallEnabled ? <Card className={styles.recall} data-testid="recall-card"><Tag tone="ai">{t('clients.profile.recall')}</Tag><p>{t('clients.profile.recallBody')}</p></Card> : null}
      </Card>
      {unlocked ? <PhotoLibrary db={runtime.db} patientId={patient.id} /> : null}
      <Modal closeLabel={t('modal.close')} onClose={() => { setUnlockOpen(false); setFailedUnlock(false); }} open={unlockOpen} testId="clinical-elevation-modal" title={t('clients.profile.unlock')}>
        <div className={styles.unlockForm}>
          <Input aria-label={t('clients.profile.password')} data-testid="clinical-elevation-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
          {failedUnlock ? <p role="status">{t('clients.profile.unlockFailed')}</p> : null}
          <Button data-testid="clinical-elevation-confirm" onClick={() => { void unlockClinical(); }}>{t('clients.profile.unlock')}</Button>
        </div>
      </Modal>
      <Modal closeLabel={t('modal.close')} onClose={() => setEditOpen(false)} open={editOpen} testId="patient-edit-modal" title={t('clients.profile.editTitle')}>
        <div className={styles.unlockForm}>
          <label><span>{t('clients.form.name')}</span><Input data-testid="patient-edit-name" onChange={(event) => setEditName(event.target.value)} value={editName} /></label>
          <label><span>{t('clients.form.phone')}</span><Input data-testid="patient-edit-phone" onChange={(event) => setEditPhone(event.target.value)} value={editPhone} /></label>
          <label><span>{t('clients.form.allergies')}</span><Input onChange={(event) => setEditAllergies(event.target.value)} value={editAllergies} /></label>
          <Button data-testid="patient-edit-save" disabled={editName.trim() === '' || editPhone.trim() === ''} onClick={() => { void savePatient(); }}>{t('clients.form.save')}</Button>
        </div>
      </Modal>
    </section>
  );
}
