'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClinicRuntimeStatus, type ClinicRuntime } from '@/app/providers';
import { offlineApprovalsState } from '@/data/adminEnvelopes';
import { useClinicBranding } from '@/data/useClinicBranding';
import { createAppointment, isSlotOccupied, setAppointmentStatus } from '@/data/appointmentRecords';
import { createPatient } from '@/data/patientRecords';
import { stageSalePrefill } from '@/data/salePrefill';
import type { AppointmentRow, PatientRow, ServiceRow, StaffRow } from '@/data/types';
import { useT } from '@/i18n';
import { AppShell, Button, Card, Field, Input, Modal, Select, Skeleton, Tag, useToast } from '@/ui';
import { appointmentBlockClass, appointmentsForDay, calendarColumns } from './calendarSelectors';
import styles from './CalendarScreen.module.css';

type Slot = { staffId: string; time: string };

const slotTimes = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30'];

export function CalendarScreen() {
  const { runtime } = useClinicRuntimeStatus();
  if (runtime === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;
  return <ActiveCalendarScreen runtime={runtime} />;
}

function ActiveCalendarScreen({ runtime }: { runtime: ClinicRuntime }) {
  const router = useRouter();
  const { locale, t } = useT();
  const { enqueue } = useToast();
  const { revision } = useClinicRuntimeStatus();
  const branding = useClinicBranding(runtime, { brand: t('brand.name'), location: t('brand.location') });
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [date, setDate] = useState('2026-07-31');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [bookingSlot, setBookingSlot] = useState<Slot>();
  const [serviceId, setServiceId] = useState('');
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentRow>();
  const [newPatientOpen, setNewPatientOpen] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientPhone, setNewPatientPhone] = useState('');
  const [hasAdminEnvelope, setHasAdminEnvelope] = useState(true);

  const refreshLocal = async () => {
    const [nextStaff, nextPatients, nextServices, nextAppointments, approvalState] = await Promise.all([
      runtime.db.staff.toArray(), runtime.db.patients.toArray(), runtime.db.services.toArray(), runtime.db.appointments.toArray(), offlineApprovalsState(runtime.db),
    ]);
    setStaff(nextStaff);
    setPatients(nextPatients);
    setServices(nextServices.filter((service) => service.active));
    setAppointments(nextAppointments);
    setHasAdminEnvelope(approvalState.hasAdminEnvelope);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshLocal(); }, 0);
    return () => window.clearTimeout(timer);
  // Reactive local tables refresh after bootstrap, appointment writes, and sync completion.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, runtime]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const patientId = new URLSearchParams(window.location.search).get('patient');
      if (patientId !== null) setSelectedPatientId(patientId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const session = runtime.session.state();
  const identity = session.kind === 'active' || session.kind === 'auth-required' ? session.identity : undefined;
  useEffect(() => {
    if (identity === undefined) router.replace(`/login?returnTo=${encodeURIComponent('/calendar')}`);
  }, [identity, router]);

  if (identity === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;

  const columns = calendarColumns(staff);
  const dayAppointments = appointmentsForDay(appointments, date);
  const appointmentForSlot = (staffId: string, time: string) => dayAppointments.find((row) => row.staffId === staffId && row.time === time && row.status !== 'cancelled');
  const cancelledAppointmentForSlot = (staffId: string, time: string) => dayAppointments.find((row) => row.staffId === staffId && row.time === time && row.status === 'cancelled');
  const appointmentLabel = (status: AppointmentRow['status']) => t(`calendar.status.${status}`);
  const localDateIso = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const openBooking = (slot: Slot) => {
    setBookingSlot(slot);
    setSelectedAppointment(undefined);
    if (serviceId === '' && services[0] !== undefined) setServiceId(services[0].id);
  };
  const saveBooking = async () => {
    if (bookingSlot === undefined || selectedPatientId === '' || serviceId === '') {
      enqueue(t('calendar.noPatient'));
      return;
    }
    const rows = await runtime.db.appointments.toArray();
    if (isSlotOccupied(rows, bookingSlot.staffId, date, bookingSlot.time)) {
      enqueue(t('calendar.slotOccupied'));
      return;
    }
    await createAppointment(runtime.db, {
      id: crypto.randomUUID(), date, time: bookingSlot.time, staffId: bookingSlot.staffId,
      patientId: selectedPatientId, serviceId, dependsOnUuid: null, now: Date.now(),
    });
    setBookingSlot(undefined);
    await refreshLocal();
    void runtime.refreshSync().then(refreshLocal, refreshLocal);
  };
  const createBookingPatient = async () => {
    if (newPatientName.trim() === '' || newPatientPhone.trim() === '') return;
    const created = await createPatient(runtime.db, {
      id: crypto.randomUUID(), name: newPatientName.trim(), phone: newPatientPhone.trim(), sex: null, telegramLinked: false,
      allergies: null, alertNote: null, now: Date.now(),
    });
    setSelectedPatientId(created.patient.id);
    setNewPatientName('');
    setNewPatientPhone('');
    setNewPatientOpen(false);
    await refreshLocal();
    void runtime.refreshSync().then(refreshLocal, refreshLocal);
  };
  const changeStatus = async (status: AppointmentRow['status']) => {
    if (selectedAppointment === undefined) return;
    await setAppointmentStatus(runtime.db, { appointmentId: selectedAppointment.id, status, dependsOnUuid: null, now: Date.now() });
    setSelectedAppointment(undefined);
    await refreshLocal();
    void runtime.refreshSync().then(refreshLocal, refreshLocal);
  };
  const chargeAppointment = async () => {
    if (selectedAppointment === undefined) return;
    await stageSalePrefill(runtime.db, {
      appointmentId: selectedAppointment.id, patientId: selectedAppointment.patientId, serviceId: selectedAppointment.serviceId,
    });
    router.push('/sale');
  };
  const logout = () => {
    void runtime.outbox.status().then((status) => {
      if (status.pendingCount > 0 || status.attentionCount > 0) enqueue(t('auth.logout.blocked'));
      else { void runtime.session.logout(); router.push('/login'); }
    });
  };

  return (
    <main className={styles.root} data-locale={locale} data-testid="calendar-root" lang={locale === 'zh' ? 'zh-Hans' : locale}>
      <AppShell
        activeTab="calendar"
        brand={branding.brand}
        location={branding.location}
        logoutLabel={t('shell.logout')}
        switchUserLabel={t('shell.switchUser')}
        onSwitchUser={() => { runtime.session.switchUser(); router.push('/login'); }}
        storageAttention={runtime.storageDiagnostics.state().kind === 'granted' ? undefined : t('shell.storageTag')}
        offlineAdminAttention={hasAdminEnvelope ? undefined : t('shell.offlineAdminAttention')}
        onLogout={logout}
        onTabChange={(id) => router.push(id === 'today' ? '/' : id === 'sale' ? '/sale' : id === 'clients' ? '/clients' : id === 'stocks' ? '/stocks' : id === 'analytics' ? '/analytics' : id === 'setup' ? '/setup' : '/calendar')}
        sync={{ label: t('sync.synced'), state: 'synced', onClick: () => { void runtime.refreshSync().then(refreshLocal, refreshLocal); } }}
        tabs={[{ id: 'today', label: t('shell.tab.today') }, { id: 'calendar', label: t('shell.tab.calendar') }, { id: 'clients', label: t('shell.tab.clients') }, { id: 'sale', label: t('shell.tab.sale') }, { id: 'stocks', label: t('shell.tab.stocks') }, { id: 'analytics', label: t('shell.tab.analytics') }, { id: 'setup', label: t('shell.tab.setup') }]}
        userName={identity.name}
        userRole={identity.role === 'admin' ? t('auth.role.admin') : t('auth.role.staff')}
      >
        <section className={styles.content}>
          <header className={styles.toolbar}>
            <div className={styles.toolbarTitle}><p>{t('calendar.day')}</p><h1>{t('calendar.title')}</h1></div>
            <div className={styles.toolbarActions}>
              <Input data-testid="calendar-date" onChange={(event) => setDate(event.target.value)} type="date" value={date} />
              <Button data-testid="calendar-today" onClick={() => setDate(localDateIso())} pill size="sm" variant="ghost">{t('calendar.todayJump')}</Button>
              <Button data-testid="calendar-book" onClick={() => openBooking({ staffId: columns[0]?.id ?? '', time: slotTimes[0]! })} pill>{t('calendar.book')}</Button>
            </div>
          </header>
          {columns.length === 0 ? <Card><p>{t('calendar.noBookings')}</p></Card> : <div className={styles.grid} data-cols={String(Math.min(columns.length, 6))} data-testid="calendar-grid">
            <div className={styles.corner}>{t('calendar.time')}</div>
            {columns.map((member) => <div className={styles.staffHeader} key={member.id}><span aria-hidden="true" className={styles.staffAvatar}>{staffInitials(member.name)}</span><span className={styles.staffMeta}><strong>{member.name}</strong><small>{dayAppointments.filter((row) => row.staffId === member.id && row.status !== 'cancelled').length} · {t('calendar.status.booked')}</small></span></div>)}
            {slotTimes.flatMap((time) => [
              <div className={styles.timeLabel} key={`${time}-label`}>{time}</div>,
              ...columns.map((member) => {
                const appointment = appointmentForSlot(member.id, time);
                const cancelledAppointment = cancelledAppointmentForSlot(member.id, time);
                return <div className={styles.slot} key={`${member.id}-${time}`}>
                  {appointment === undefined ? <>{cancelledAppointment === undefined ? null : <button className={[styles.appointment, styles[appointmentBlockClass(cancelledAppointment.status)]].join(' ')} data-testid={`calendar-appointment-${cancelledAppointment.id}`} disabled type="button"><strong>{patients.find((patient) => patient.id === cancelledAppointment.patientId)?.name ?? t('calendar.patient')}</strong><span>{appointmentLabel(cancelledAppointment.status)}</span></button>}<Button className={styles.slotBook} data-testid={`calendar-slot-${member.id}-${time}`} onClick={() => openBooking({ staffId: member.id, time })} size="sm" variant="ghost">{t('calendar.book')}</Button></> : <button className={[styles.appointment, styles[appointmentBlockClass(appointment.status)]].join(' ')} data-testid={`calendar-appointment-${appointment.id}`} onClick={() => setSelectedAppointment(appointment)} type="button"><strong>{patients.find((patient) => patient.id === appointment.patientId)?.name ?? t('calendar.patient')}</strong><span>{appointmentLabel(appointment.status)}</span>{appointment.syncConflict ? <Tag tone="amber">{t('calendar.conflict')}</Tag> : null}</button>}
                </div>;
              }),
            ])}
          </div>}
          <footer className={styles.legend}>
            <span className={styles.legendItem}><span className={styles.legendDot} />{t('calendar.status.booked')}</span>
            <span className={styles.legendItem}><span className={[styles.legendDot, styles.legendHere].join(' ')} />{t('calendar.status.here')}</span>
            <span className={styles.legendItem}><span className={[styles.legendDot, styles.legendDone].join(' ')} />{t('calendar.status.done')}</span>
            <span className={styles.legendItem}><span className={[styles.legendDot, styles.legendCancelled].join(' ')} />{t('calendar.status.cancelled')}</span>
            <span className={styles.legendItem}><span className={[styles.legendDot, styles.legendConflict].join(' ')} />{t('calendar.conflict')}</span>
          </footer>
        </section>
      </AppShell>
      <Modal closeLabel={t('modal.close')} onClose={() => setBookingSlot(undefined)} open={bookingSlot !== undefined} testId="calendar-booking-modal" title={t('calendar.bookTitle')}>
        <div className={styles.form}>
          <Field htmlFor="booking-staff" label={t('calendar.staff')}><Select id="booking-staff" onChange={(event) => setBookingSlot((slot) => slot === undefined ? undefined : { ...slot, staffId: event.target.value })} value={bookingSlot?.staffId ?? ''}>{columns.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></Field>
          <Field htmlFor="booking-time" label={t('calendar.time')}><Select id="booking-time" onChange={(event) => setBookingSlot((slot) => slot === undefined ? undefined : { ...slot, time: event.target.value })} value={bookingSlot?.time ?? ''}>{slotTimes.map((time) => <option key={time} value={time}>{time}</option>)}</Select></Field>
          <Field htmlFor="booking-patient" label={t('calendar.patient')}><Select data-testid="booking-patient" id="booking-patient" onChange={(event) => setSelectedPatientId(event.target.value)} value={selectedPatientId}><option value="" />{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</Select></Field>
          <Button data-testid="calendar-new-patient" onClick={() => setNewPatientOpen(true)} pill size="sm" variant="ghost">{t('calendar.newPatient')}</Button>
          <Field htmlFor="booking-service" label={t('calendar.service')}><Select data-testid="booking-service" id="booking-service" onChange={(event) => setServiceId(event.target.value)} value={serviceId}><option value="" />{services.map((service) => <option key={service.id} value={service.id}>{service.nameEn ?? service.nameMm}</option>)}</Select></Field>
          <Button data-testid="calendar-save-appointment" onClick={() => { void saveBooking(); }}>{t('calendar.saveAppointment')}</Button>
        </div>
      </Modal>
      <Modal closeLabel={t('modal.close')} onClose={() => setNewPatientOpen(false)} open={newPatientOpen} testId="calendar-new-patient-modal" title={t('calendar.newPatient')}>
        <div className={styles.form}>
          <Field htmlFor="calendar-patient-name" label={t('calendar.patientName')}><Input data-testid="calendar-patient-name" id="calendar-patient-name" onChange={(event) => setNewPatientName(event.target.value)} value={newPatientName} /></Field>
          <Field htmlFor="calendar-patient-phone" label={t('calendar.patientPhone')}><Input data-testid="calendar-patient-phone" id="calendar-patient-phone" onChange={(event) => setNewPatientPhone(event.target.value)} value={newPatientPhone} /></Field>
          <Button data-testid="calendar-create-patient" disabled={newPatientName.trim() === '' || newPatientPhone.trim() === ''} onClick={() => { void createBookingPatient(); }}>{t('calendar.createPatient')}</Button>
        </div>
      </Modal>
      <Modal closeLabel={t('modal.close')} onClose={() => setSelectedAppointment(undefined)} open={selectedAppointment !== undefined} testId="calendar-appointment-modal" title={t('calendar.appointment')}>
        {selectedAppointment === undefined ? null : <div className={styles.form}>
          <p>{patients.find((patient) => patient.id === selectedAppointment.patientId)?.name ?? t('calendar.patient')}</p>
          <Tag tone={selectedAppointment.syncConflict ? 'amber' : 'blue'}>{appointmentLabel(selectedAppointment.status)}</Tag>
          <Button data-testid="appointment-here" disabled={selectedAppointment.status === 'here'} onClick={() => { void changeStatus('here'); }}>{t('calendar.here')}</Button>
          <Button data-testid="appointment-cancel" onClick={() => { void changeStatus('cancelled'); }} variant="danger">{t('calendar.cancel')}</Button>
          <Button data-testid="appointment-charge" onClick={() => { void chargeAppointment(); }} variant="ai">{t('calendar.charge')}</Button>
        </div>}
      </Modal>
    </main>
  );
}

function staffInitials(name: string): string {
  return name.split(' ').filter((part) => part !== '').slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}
