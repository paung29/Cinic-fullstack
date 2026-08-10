'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authEnvelopeMetaKey, authRepairMetaKey } from '@/data/db';
import { returnToAfterSignIn } from '@/data/returnTo';
import { useClinicRuntimeStatus } from '@/app/providers';
import { useLocaleControl, useT, type Locale } from '@/i18n';
import { loginFailureFor } from '@/modules/auth/loginErrors';
import { pinDelayMs, type SessionIdentity } from '@/modules/auth/sessionController';
import { Button, Card, Field, Input, PinPad, SecretInput, Skeleton } from '@/ui';
import styles from './LoginScreen.module.css';

const showDevelopmentLocaleOverride = process.env.NODE_ENV === 'development';

type LoginMessage = 'internet-required' | 'repair' | 'sign-in-failed' | 'wrong-pin' | 'wait' | undefined;

export function LoginScreen() {
  const router = useRouter();
  const { locale, t } = useT();
  const { setLocale } = useLocaleControl();
  const { initializationError, revision, runtime } = useClinicRuntimeStatus();
  const [staff, setStaff] = useState<SessionIdentity[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<SessionIdentity | undefined>();
  const [installerStaffId, setInstallerStaffId] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  // A device with no staff on it opens straight into create-clinic. Leading
  // with the installer staff ID stranded the one user who cannot possibly have
  // one — a brand-new clinic whose server is still empty — behind a secondary
  // ghost button. Joining an existing clinic is a technician's job and stays
  // one tap away on the toggle.
  const [showClinicSetup, setShowClinicSetup] = useState(true);
  const [clinicName, setClinicName] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [pin, setPin] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isWaiting, setWaiting] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const [message, setMessage] = useState<LoginMessage>();
  const [needsOnlineRepair, setNeedsOnlineRepair] = useState(false);
  const [returnTo, setReturnTo] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setReturnTo(new URLSearchParams(window.location.search).get('returnTo'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (runtime === undefined) return undefined;
    let active = true;

    void runtime.db.staff.toArray().then((rows) => {
      if (!active) return;
      setStaff(rows.filter((row) => row.active).map((row) => ({
        staffId: row.id,
        name: row.name,
        role: row.role,
        validUntil: '',
      })));
    });

    return () => {
      active = false;
    };
  }, [revision, runtime]);

  useEffect(() => {
    if (!isWaiting) return undefined;

    const timeout = window.setTimeout(() => {
      setWaiting(false);
      setMessage(undefined);
    }, pinDelayMs(failedAttempts));

    return () => window.clearTimeout(timeout);
  }, [failedAttempts, isWaiting]);

  const lang = locale === 'zh' ? 'zh-Hans' : locale;
  const isDeviceSetup = runtime !== undefined && staff.length === 0;
  const activeStaffId = isDeviceSetup ? installerStaffId : selectedStaff?.staffId;
  // showClinicSetup is only meaningful on the first-run card. Reading it on the
  // everyday PIN screen is what killed sign-in: it defaults to true, so the
  // create-a-clinic validation ran against empty clinic fields and refused
  // every submit — the pad looked alive and did nothing.
  const creatingClinic = isDeviceSetup && showClinicSetup;
  // Owner email wins when it is filled in. The staff-ID field stays for the
  // technician rolling out devices, and for the e2e suite that pairs by ID.
  const pairingByEmail = isDeviceSetup && !creatingClinic && ownerEmail.trim() !== '' && ownerPassword !== '';
  // Mirrors the guards in handleSubmit so the button can say "not yet" by being
  // disabled, rather than looking alive and then silently doing nothing.
  const setupReady = pin.length === 4 && !isBusy && (creatingClinic
    ? clinicName.trim() !== '' && adminName.trim() !== '' && adminPhone.trim() !== '' && adminEmail.trim() !== '' && adminPassword.length >= 8
    : pairingByEmail || (activeStaffId !== undefined && activeStaffId !== ''));

  const clearForFailedPin = () => {
    setPin('');
    setNeedsOnlineRepair(false);
    setFailedAttempts((current) => current + 1);
    setWaiting(true);
    setMessage('wrong-pin');
  };

  const handleSubmit = async () => {
    const invalidExistingClinic = !creatingClinic && !pairingByEmail && (activeStaffId === undefined || activeStaffId === '');
    const invalidNewClinic = creatingClinic && (clinicName.trim() === '' || adminName.trim() === '' || adminPhone.trim() === '' || adminEmail.trim() === '' || adminPassword.length < 8);
    if (runtime === undefined || invalidExistingClinic || invalidNewClinic || pin.length !== 4 || isBusy) {
      return;
    }
    if (isWaiting) {
      // Naming the backoff matters: the submit is refused for up to 30s, and
      // without a message the pad just goes dead and staff retype into a
      // screen they read as broken. Deliberately does not restart the timer.
      setMessage('wait');
      return;
    }

    setBusy(true);
    setMessage(undefined);
    try {
      if (creatingClinic) {
        await runtime.install({
          clinic_name: clinicName.trim(),
          clinic_phone: clinicPhone.trim(),
          clinic_address: clinicAddress.trim(),
          time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Yangon',
          admin_name: adminName.trim(),
          admin_phone: adminPhone.trim(),
          email: adminEmail.trim(),
          password: adminPassword,
          pin,
        });
      } else if (pairingByEmail) {
        await runtime.provisionByEmail({ email: ownerEmail.trim(), password: ownerPassword, pin });
      } else if (isDeviceSetup) {
        await runtime.provision({ staff_id: activeStaffId!, pin });
      } else if (needsOnlineRepair || await runtime.db.meta.get(authEnvelopeMetaKey(activeStaffId!)) === undefined) {
        await runtime.signInOnline({ staff_id: activeStaffId!, pin });
      } else if (await runtime.db.meta.get(authRepairMetaKey(activeStaffId!)) !== undefined) {
        // The server previously rejected this stored credential. Prefer a real
        // sign-in so the device stops unlocking into a session that cannot use
        // any protected feature — but ANY failure falls back to the envelope,
        // not just an unreachable server. A server that has forgotten this
        // staff member — reset database, redeploy, backup restored from before
        // the account existed — answers 401 TOKEN_INVALID, indistinguishable
        // from a wrong PIN. Treating that as a refusal would lock the clinic
        // out of the one device holding its patients and its queued sales,
        // which is the exact failure offline-first exists to prevent.
        try {
          await runtime.signInOnline({ staff_id: activeStaffId!, pin });
        } catch {
          // The offline attempt's own error is the one worth surfacing, so the
          // server's is deliberately dropped here. A wrong PIN throws
          // WrongPinError below and reads as a wrong PIN; an envelope no PIN
          // can open throws InvalidStoredEnvelopeError and asks for repair.
          // Preferring the server's 401 over either would relabel a broken
          // envelope as a bad PIN and send staff retyping one that cannot work.
          await runtime.unlockOffline(activeStaffId!, pin);
        }
      } else {
        await runtime.unlockOffline(activeStaffId!, pin);
      }
      const destination = returnToAfterSignIn(isDeviceSetup, returnTo);
      if (destination !== undefined) router.push(destination);
    } catch (error) {
      const failure = loginFailureFor(error);
      if (failure === 'wrong-pin') {
        clearForFailedPin();
      } else if (failure === 'repair') {
        setPin('');
        setNeedsOnlineRepair(true);
        setMessage('repair');
      } else if (failure === 'internet-required') {
        setMessage('internet-required');
      } else {
        setPin('');
        setMessage('sign-in-failed');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.root} data-locale={locale} data-testid="login-root" lang={lang}>
      <div className={styles.cardWrap}>
        {runtime === undefined ? (
          <Card className={styles.loadingCard}>
            <p>{initializationError === undefined ? t('auth.login.loading') : t('auth.setup.repair')}</p>
            <Skeleton size="line" />
          </Card>
        ) : isDeviceSetup ? (
          <Card className={styles.card} data-testid="device-setup">
            <header className={styles.header}>
              <p>{t('brand.name')}</p>
              <h1>{t('auth.setup.title')}</h1>
              <span>{t('auth.setup.internetRequired')}</span>
            </header>
            {showClinicSetup ? null : <div className={styles.setupFields}>
              <Field htmlFor="owner-email" label={t('auth.setup.ownerEmail')}>
                <Input autoComplete="email" data-testid="owner-email" id="owner-email" onChange={(event) => setOwnerEmail(event.target.value)} type="email" value={ownerEmail} />
              </Field>
              <Field htmlFor="owner-password" label={t('auth.setup.ownerPassword')}>
                <SecretInput autoComplete="current-password" data-testid="owner-password" hideLabel={t('field.hide')} id="owner-password" onChange={(event) => setOwnerPassword(event.target.value)} revealLabel={t('field.reveal')} value={ownerPassword} />
              </Field>
              <p>{t('auth.setup.pairHint')}</p>
            </div>}
            <Field htmlFor="installer-staff-id" label={t('auth.setup.staffId')}>
              <Input data-testid="installer-staff-id" id="installer-staff-id" onChange={(event) => setInstallerStaffId(event.target.value)} value={installerStaffId} />
            </Field>
            <Button data-testid="create-clinic-toggle" onClick={() => setShowClinicSetup((current) => !current)} pill variant="ghost">
              {showClinicSetup ? t('auth.setup.useExisting') : t('auth.setup.createClinic')}
            </Button>
            {showClinicSetup ? <div className={styles.setupFields}>
              <Field htmlFor="clinic-name" label={t('auth.setup.clinicName')}><Input data-testid="clinic-name" id="clinic-name" onChange={(event) => setClinicName(event.target.value)} value={clinicName} /></Field>
              <Field htmlFor="clinic-phone" label={t('auth.setup.clinicPhone')}><Input id="clinic-phone" onChange={(event) => setClinicPhone(event.target.value)} value={clinicPhone} /></Field>
              <Field htmlFor="clinic-address" label={t('auth.setup.clinicAddress')}><Input id="clinic-address" onChange={(event) => setClinicAddress(event.target.value)} value={clinicAddress} /></Field>
              <Field htmlFor="admin-name" label={t('auth.setup.adminName')}><Input data-testid="admin-name" id="admin-name" onChange={(event) => setAdminName(event.target.value)} value={adminName} /></Field>
              <Field htmlFor="admin-phone" label={t('auth.setup.adminPhone')}><Input id="admin-phone" onChange={(event) => setAdminPhone(event.target.value)} value={adminPhone} /></Field>
              <Field htmlFor="admin-email" label={t('auth.setup.adminEmail')}><Input id="admin-email" onChange={(event) => setAdminEmail(event.target.value)} type="email" value={adminEmail} /></Field>
              <Field htmlFor="admin-password" label={t('auth.setup.adminPassword')}><SecretInput autoComplete="new-password" data-testid="admin-password" hideLabel={t('field.hide')} id="admin-password" onChange={(event) => setAdminPassword(event.target.value)} revealLabel={t('field.reveal')} value={adminPassword} /></Field>
              <p>{t('auth.setup.passwordHint')}</p>
            </div> : null}
            <LoginMessage message={message} t={t} />
            {/* The pad is the second of two secrets on this card and staff had
                no way to tell it apart from the account password above it. */}
            <p>{showClinicSetup ? t('auth.setup.pinNew') : t('auth.setup.pinExisting')}</p>
            <div className={message === 'wrong-pin' ? styles.shake : undefined}>
              <PinPad backspaceLabel={t('pin.backspace')} onChange={setPin} onSubmit={handleSubmit} submitLabel={t('pin.submit')} testId="login-pinpad" displayTestId="login-pin-display" value={pin} />
            </div>
            {/* The tick on the pad reads as another key, so the real action
                gets its own named button. The pad still submits on ✓. */}
            <Button data-testid="device-setup-submit" disabled={!setupReady} onClick={() => { void handleSubmit(); }}>
              {showClinicSetup ? t('auth.setup.createSubmit') : t('auth.setup.pairSubmit')}
            </Button>
          </Card>
        ) : selectedStaff === undefined ? (
          <Card className={styles.card} data-testid="staff-picker">
            <header className={styles.header}>
              <p>{t('brand.name')}</p>
              <h1>{t('auth.login.who')}</h1>
            </header>
            <div className={styles.staffList}>
              {staff.map((member) => (
                <Button data-testid={`staff-option-${member.staffId}`} key={member.staffId} onClick={() => {
                  setSelectedStaff(member);
                  setMessage(undefined);
                  setPin('');
                }} pill variant="ghost">
                  <span aria-hidden="true" className={styles.staffAvatar}>{member.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
                  <span className={styles.staffIdentity}>
                    <strong>{member.name}</strong>
                    <small>{member.role === 'admin' ? t('auth.role.admin') : t('auth.role.staff')}</small>
                  </span>
                  <span aria-hidden="true" className={styles.staffChevron}>&rsaquo;</span>
                </Button>
              ))}
            </div>
          </Card>
        ) : (
          <Card className={styles.card}>
            <header className={styles.header}>
              <p>{selectedStaff.name}</p>
              <h1>{t('auth.login.pin')}</h1>
            </header>
            <LoginMessage message={message} t={t} />
            <div className={message === 'wrong-pin' ? styles.shake : undefined}>
              <PinPad backspaceLabel={t('pin.backspace')} onChange={setPin} onSubmit={handleSubmit} submitLabel={t('pin.submit')} testId="login-pinpad" displayTestId="login-pin-display" value={pin} />
            </div>
            <Button onClick={() => {
              setSelectedStaff(undefined);
              setPin('');
              setMessage(undefined);
              setNeedsOnlineRepair(false);
            }} pill variant="ghost">
              {t('auth.login.notYou')}
            </Button>
          </Card>
        )}
        {showDevelopmentLocaleOverride ? (
          <>
            <label className={styles.localeOverride}>
              <span>{t('locale.label')}</span>
              <select data-testid="dev-locale-override" onChange={(event) => setLocale(event.target.value as Locale)} value={locale}>
                <option value="my">{t('locale.my')}</option>
                <option value="en">{t('locale.en')}</option>
                <option value="zh">{t('locale.zh')}</option>
              </select>
            </label>
            <p className={styles.devFallback} data-testid="demo-fallback-probe">{t('demo.fallbackProbe')}</p>
          </>
        ) : null}
      </div>
    </main>
  );
}

function LoginMessage({ message, t }: { message: LoginMessage; t(key: Parameters<ReturnType<typeof useT>['t']>[0]): string }) {
  if (message === undefined) return null;
  const key = message === 'internet-required'
    ? 'auth.setup.internetRequired'
    : message === 'repair'
      ? 'auth.setup.repair'
      : message === 'wait'
        ? 'auth.login.wait'
        : message === 'sign-in-failed'
          ? 'auth.login.signInFailed'
          : 'auth.login.wrongPin';
  return <p className={styles.message} role="status">{t(key)}</p>;
}
