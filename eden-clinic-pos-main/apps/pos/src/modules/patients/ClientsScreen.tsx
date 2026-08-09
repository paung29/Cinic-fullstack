'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClinicRuntimeStatus, type ClinicRuntime } from '@/app/providers';
import { offlineApprovalsState } from '@/data/adminEnvelopes';
import { fmtMMK, patientOutstanding } from '@/data/money';
import { createPatient } from '@/data/patientRecords';
import { useT } from '@/i18n';
import { AppShell, Button, EmptyState, Field, Input, Modal, Skeleton, useToast } from '@/ui';
import type { PatientRow, SaleRow } from '@/data/types';
import { PatientProfileScreen } from './PatientProfileScreen';
import { selectedPatientIdFromSearch, selectPatients } from './patientSelectors';
import styles from './ClientsScreen.module.css';

export function ClientsScreen() {
  const { runtime } = useClinicRuntimeStatus();
  if (runtime === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;
  return <ActiveClientsScreen runtime={runtime} />;
}

function ActiveClientsScreen({ runtime }: { runtime: ClinicRuntime }) {
  const router = useRouter();
  const { locale, t } = useT();
  const { enqueue } = useToast();
  const { revision } = useClinicRuntimeStatus();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [newPatientOpen, setNewPatientOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sex, setSex] = useState('Female');
  const [allergies, setAllergies] = useState('');
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [hasAdminEnvelope, setHasAdminEnvelope] = useState(true);

  const refreshLocal = async () => {
    const [nextPatients, nextSales, approvals] = await Promise.all([
      runtime.db.patients.toArray(),
      runtime.db.sales.toArray(),
      offlineApprovalsState(runtime.db),
    ]);
    setPatients(nextPatients);
    setSales(nextSales);
    setHasAdminEnvelope(approvals.hasAdminEnvelope);
    setLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshLocal(); }, 0);
    return () => window.clearTimeout(timer);
  // Local tables change after bootstrap and sync completion.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, runtime]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedId(selectedPatientIdFromSearch(window.location.search));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const session = runtime.session.state();
  const activeIdentity = session.kind === 'active' || session.kind === 'auth-required' ? session.identity : undefined;
  useEffect(() => {
    if (activeIdentity === undefined) {
      const returnTo = `/clients${window.location.search}`;
      router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [activeIdentity, router]);

  if (activeIdentity === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;

  const visiblePatients = selectPatients(patients, query);
  const selectedPatient = selectedId === undefined ? undefined : patients.find((patient) => patient.id === selectedId);
  const selectPatient = (id: string) => {
    setSelectedId(id);
    router.push(`/clients?patient=${encodeURIComponent(id)}`);
  };
  const savePatient = async () => {
    if (name.trim() === '' || phone.trim() === '') return;
    const created = await createPatient(runtime.db, {
      id: crypto.randomUUID(),
      name: name.trim(),
      phone: phone.trim(),
      sex: sex === '' ? null : sex,
      telegramLinked,
      allergies: allergies.trim() === '' ? null : allergies.trim(),
      alertNote: null,
      now: Date.now(),
    });
    setNewPatientOpen(false);
    setName('');
    setPhone('');
    setSex('Female');
    setAllergies('');
    setTelegramLinked(false);
    await refreshLocal();
    selectPatient(created.patient.id);
    void runtime.refreshSync().then(refreshLocal, refreshLocal);
  };

  return (
    <main className={styles.root} data-locale={locale} data-testid="clients-root" lang={locale === 'zh' ? 'zh-Hans' : locale}>
      <AppShell
        activeTab="clients"
        brand={t('brand.name')}
        location={t('brand.location')}
        logoutLabel={t('shell.logout')}
        switchUserLabel={t('shell.switchUser')}
        onSwitchUser={() => { runtime.session.switchUser(); router.push('/login'); }}
        storageAttention={runtime.storageDiagnostics.state().kind === 'granted' ? undefined : t('shell.storageTag')}
        offlineAdminAttention={hasAdminEnvelope ? undefined : t('shell.offlineAdminAttention')}
        onLogout={() => { void runtime.outbox.status().then((status) => {
          if (status.pendingCount > 0 || status.attentionCount > 0) enqueue(t('auth.logout.blocked'));
          else { void runtime.session.logout(); router.push('/login'); }
        }); }}
        onTabChange={(id) => { router.push(id === 'today' ? '/' : id === 'sale' ? '/sale' : id === 'calendar' ? '/calendar' : id === 'stocks' ? '/stocks' : id === 'analytics' ? '/analytics' : id === 'setup' ? '/setup' : '/clients'); }}
        sync={{ label: t('sync.synced'), state: 'synced', onClick: () => { void runtime.refreshSync().then(refreshLocal, refreshLocal); } }}
        tabs={[{ id: 'today', label: t('shell.tab.today') }, { id: 'calendar', label: t('shell.tab.calendar') }, { id: 'clients', label: t('shell.tab.clients') }, { id: 'sale', label: t('shell.tab.sale') }, { id: 'stocks', label: t('shell.tab.stocks') }, { id: 'analytics', label: t('shell.tab.analytics') }, { id: 'setup', label: t('shell.tab.setup') }]}
        userName={activeIdentity.name}
        userRole={activeIdentity.role === 'admin' ? t('auth.role.admin') : t('auth.role.staff')}
      >
        <div className={styles.content}>
          {selectedPatient === undefined ? (
            <>
              <div className={styles.toolbar}>
                <Input data-testid="client-search" onChange={(event) => setQuery(event.target.value)} placeholder={t('clients.search')} value={query} />
                <Button data-testid="new-patient-open" onClick={() => setNewPatientOpen(true)} pill>{t('clients.new')}</Button>
              </div>
              {loading ? <Skeleton size="list" /> : visiblePatients.length === 0 ? <EmptyState body={query === '' ? t('clients.emptyBody') : t('clients.noMatches')} heading={query === '' ? t('clients.emptyTitle') : t('clients.noMatches')} /> : <div className={styles.list}>{visiblePatients.map((patient) => {
                const outstanding = patientOutstanding(sales.filter((sale) => sale.patientId === patient.id));
                return <button className={styles.patientRow} data-testid={`client-row-${patient.id}`} key={patient.id} onClick={() => selectPatient(patient.id)} type="button"><span><strong>{patient.name}</strong><small>{patient.code ?? t('clients.profile.localCode')} · {patient.phone}</small></span><strong className={outstanding > 0 ? styles.outstanding : undefined}>{outstanding === 0 ? t('clients.profile.none') : fmtMMK(outstanding)}</strong></button>;
              })}</div>}
            </>
          ) : <PatientProfileScreen onBook={() => router.push(`/calendar?patient=${encodeURIComponent(selectedPatient.id)}`)} onNewSale={() => router.push(`/sale?patient=${encodeURIComponent(selectedPatient.id)}`)} onUpdated={() => { void refreshLocal(); }} patient={selectedPatient} sales={sales.filter((sale) => sale.patientId === selectedPatient.id)} />}
        </div>
      </AppShell>
      <Modal closeLabel={t('modal.close')} onClose={() => setNewPatientOpen(false)} open={newPatientOpen} testId="new-patient-modal" title={t('clients.new')}>
        <div className={styles.form}>
          <Field htmlFor="patient-name" label={t('clients.form.name')}><Input data-testid="new-patient-name" id="patient-name" onChange={(event) => setName(event.target.value)} value={name} /></Field>
          <Field htmlFor="patient-phone" label={t('clients.form.phone')}><Input data-testid="new-patient-phone" id="patient-phone" onChange={(event) => setPhone(event.target.value)} value={phone} /></Field>
          <div className={styles.sexField}><span>{t('clients.form.sex')}</span><div className={styles.sexChoices}>
            <Button aria-pressed={sex === 'Female'} className={sex === 'Female' ? styles.sexChoiceActive : undefined} data-testid="patient-sex-f" onClick={() => setSex('Female')} pill size="sm" variant="ghost">{t('clients.form.sexF')}</Button>
            <Button aria-pressed={sex === 'Male'} className={sex === 'Male' ? styles.sexChoiceActive : undefined} data-testid="patient-sex-m" onClick={() => setSex('Male')} pill size="sm" variant="ghost">{t('clients.form.sexM')}</Button>
          </div></div>
          <Field htmlFor="patient-allergies" label={t('clients.form.allergies')}><Input id="patient-allergies" onChange={(event) => setAllergies(event.target.value)} value={allergies} /></Field>
          <label className={styles.telegram}><input checked={telegramLinked} onChange={(event) => setTelegramLinked(event.target.checked)} type="checkbox" />{t('clients.form.telegram')}</label>
          <Button data-testid="new-patient-save" disabled={name.trim() === '' || phone.trim() === ''} onClick={() => { void savePatient(); }}>{t('clients.form.save')}</Button>
        </div>
      </Modal>
    </main>
  );
}
