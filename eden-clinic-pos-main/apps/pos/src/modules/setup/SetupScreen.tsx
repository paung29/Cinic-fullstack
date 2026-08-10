'use client';

/* eslint-disable @next/next/no-img-element -- The preview is a local Canvas-rasterized Blob URL. */

import { useEffect, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useClinicRuntimeStatus, type ClinicRuntime } from '@/app/providers';
import { saveClinicConfig } from '@/data/clinicConfig';
import { ApiNetworkError } from '@/data/api';
import { elevationFailureKey } from '@/data/elevationErrors';
import { type OutboxStatusView } from '@/data/outbox';
import { readPrinterProfile, savePrinterProfile, saveReceiptDesignerDraft, type PrinterProfile } from '@/data/printerProfile';
import { buildSupportOutboxExport } from '@/data/supportExport';
import type { ClinicPatchWire, ClinicRow, SaleRow } from '@/data/types';
import { useLocaleControl, useT } from '@/i18n';
import { decodeLogoBitmap } from '@/print/logoDecode';
import { renderReceipt, type ReceiptPalette, type RenderedReceipt } from '@/print/receipt';
import { RECEIPT_FONTS } from '@/print/receiptFonts';
import { clearReceiptLogo, readReceiptLogo, writeReceiptLogo, type LogoBitmap } from '@/print/receiptLogo';
import { buildConfirmedReceiptInput } from '@/print/receiptInput';
import { createM5PrinterTransport, NoHardwarePrinterError } from '@/print/transport';
import { AppShell, Button, Input, Modal, Select, Skeleton, Switch, Tag, Textarea, useToast } from '@/ui';
import { isClinicSaveOffline } from './setupSelectors';
import styles from './SetupScreen.module.css';

type ReceiptDraft = Pick<ClinicPatchWire, 'name' | 'phone' | 'address' | 'telegram_handle' | 'receipt_header' | 'receipt_footer' | 'logo_url' | 'rounding_step' | 'credit_limit_mmk' | 'consent_mode' | 'receipt_qr' | 'receipt_next_visit' | 'receipt_template' | 'receipt_header_font' | 'receipt_divider'>;

const defaultProfile: PrinterProfile = { version: 1, transport: 'generic-escpos', width: 576 };

export function SetupScreen() {
  const { runtime } = useClinicRuntimeStatus();
  if (runtime === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;
  return <ActiveSetupScreen runtime={runtime} />;
}

function ActiveSetupScreen({ runtime }: { runtime: ClinicRuntime }) {
  const router = useRouter();
  const { locale, t } = useT();
  const { setLocale } = useLocaleControl();
  const { enqueue } = useToast();
  const [clinic, setClinic] = useState<ClinicRow | undefined>();
  const [draft, setDraft] = useState<ReceiptDraft>({});
  const [profile, setProfile] = useState<PrinterProfile>(defaultProfile);
  const [status, setStatus] = useState<OutboxStatusView>({ state: 'synced', pendingCount: 0, attentionCount: 0, drainProgress: 0 });
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [previewReceipt, setPreviewReceipt] = useState<RenderedReceipt | undefined>();
  const [logo, setLogo] = useState<LogoBitmap | undefined>();
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [logoRevision, setLogoRevision] = useState(0);
  const [elevateOpen, setElevateOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPassword, setDrawerPassword] = useState('');
  const [password, setPassword] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [storageStatus, setStorageStatus] = useState(runtime.storageDiagnostics.state());
  const session = runtime.session.state();
  const identity = session.kind === 'active' || session.kind === 'auth-required' ? session.identity : undefined;

  useEffect(() => {
    if (identity === undefined) router.replace('/login');
  }, [identity, router]);

  const refresh = async () => {
    const [nextClinic, nextProfile, nextStatus] = await Promise.all([
      runtime.db.clinic.toCollection().first(),
      readPrinterProfile(runtime.db, runtime.deviceId),
      runtime.outbox.status(),
    ]);
    if (nextClinic !== undefined) {
      setClinic(nextClinic);
      setDraft(toReceiptDraft(nextClinic));
    }
    setProfile(nextProfile ?? defaultProfile);
    setStatus(nextStatus);
  };

  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const [nextClinic, nextProfile, nextStatus] = await Promise.all([
          runtime.db.clinic.toCollection().first(),
          readPrinterProfile(runtime.db, runtime.deviceId),
          runtime.outbox.status(),
        ]);
        if (disposed) return;
        if (nextClinic !== undefined) {
          setClinic(nextClinic);
          setDraft(toReceiptDraft(nextClinic));
        }
        setProfile(nextProfile ?? defaultProfile);
        setStatus(nextStatus);
      })();
    }, 0);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [runtime]);

  useEffect(() => {
    if (Object.keys(draft).length === 0) return;
    void saveReceiptDesignerDraft(runtime.db, runtime.deviceId, { version: 1, fields: draft });
  }, [draft, runtime.db, runtime.deviceId]);

  const pickLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    // Guard the device store: an unbounded upload would sit in IndexedDB for
    // the life of the install and the dither only needs a modest source.
    if (file.size > 4_000_000) {
      enqueue(t('setup.logoTooBig'));
      return;
    }
    await writeReceiptLogo(runtime.db, file);
    setLogoRevision((current) => current + 1);
  };

  const removeLogo = async () => {
    await clearReceiptLogo(runtime.db);
    setLogoRevision((current) => current + 1);
  };

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | undefined;
    void readReceiptLogo(runtime.db).then(async (blob) => {
      if (disposed || blob === undefined) {
        if (!disposed) { setLogo(undefined); setLogoUrl(undefined); }
        return;
      }
      const bitmap = await decodeLogoBitmap(blob, profile.width === 576 ? undefined : 288);
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob);
      setLogo(bitmap);
      setLogoUrl(objectUrl);
    });
    return () => {
      disposed = true;
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [logoRevision, profile.width, runtime.db]);

  useEffect(() => {
    if (clinic === undefined) return undefined;
    let disposed = false;
    let objectUrl: string | undefined;
    const previewClinic = applyDraft(clinic, draft);
    void renderReceipt(buildConfirmedReceiptInput({
      sale: previewSale(), clinic: previewClinic, width: profile.width, palette: readPalette(),
      ...(logo === undefined ? {} : { logo }),
    }), { fonts: document.fonts }).then((rendered) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(rendered.png);
      setPreviewReceipt(rendered);
      setPreviewUrl(objectUrl);
    }).catch(() => enqueue(t('sync.attention')));
    return () => {
      disposed = true;
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [clinic, draft, enqueue, logo, profile.width, t]);

  if (identity === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;
  const offline = isClinicSaveOffline(status);
  const activeElevation = runtime.elevation.state();
  const storageAttention = storageStatus.kind === 'granted' ? undefined : t('shell.storageTag');

  const exportOutbox = async () => {
    try {
      await runtime.elevation.elevate(exportPassword, 'support-export');
      const [rows, currentStatus] = await Promise.all([runtime.db.outbox.toArray(), runtime.outbox.status()]);
      const payload = buildSupportOutboxExport({ deviceId: runtime.deviceId, now: runtime.now(), status: currentStatus, rows });
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `eden-outbox-${runtime.deviceId}-${runtime.now()}.json`; link.click(); URL.revokeObjectURL(url);
      setExportOpen(false); setExportPassword(''); enqueue(t('sync.synced'));
    } catch (error) { enqueue(error instanceof ApiNetworkError ? t('setup.storage.internetRequired') : t('sync.attention')); }
  };

  // A no-sale till open is the classic way cash walks out of a shop, so it
  // sits behind the administrator password rather than the staff PIN.
  const openDrawerWithPassword = async () => {
    try {
      await runtime.elevation.elevate(drawerPassword, 'cash-drawer');
      setDrawerOpen(false);
      setDrawerPassword('');
      const transport = createM5PrinterTransport(profile);
      if (transport.openDrawer === undefined) throw new Error('This transport has no till.');
      await transport.openDrawer();
      enqueue(t('setup.drawerOpened'));
    } catch (error) {
      setDrawerPassword('');
      // Unlike the sale path this is an explicit request, so a failure is
      // reported rather than swallowed.
      enqueue(error instanceof NoHardwarePrinterError ? t('setup.drawerFailed') : elevationFailureKey(error, t));
    }
  };

  const save = async (elevationToken = activeElevation.kind === 'active' ? activeElevation.token : undefined) => {
    if (offline || clinic === undefined || elevationToken === undefined) return;
    try {
      const confirmed = await saveClinicConfig({ db: runtime.db, api: runtime.api, patch: draft, elevationToken });
      setClinic(confirmed);
      setDraft(toReceiptDraft(confirmed));
      enqueue(t('sync.synced'));
    } catch {
      enqueue(t('sync.attention'));
    }
  };

  const route = (id: string) => id === 'sale' ? '/sale' : id === 'calendar' ? '/calendar' : id === 'clients' ? '/clients' : id === 'stocks' ? '/stocks' : id === 'analytics' ? '/analytics' : '/setup';

  return <main className={styles.root} data-locale={locale} data-testid="setup-root" lang={locale === 'zh' ? 'zh-Hans' : locale}>
    <AppShell activeTab="setup" brand={t('brand.name')} location={t('brand.location')} logoutLabel={t('shell.logout')} switchUserLabel={t('shell.switchUser')} onSwitchUser={() => { runtime.session.switchUser(); router.push('/login'); }} storageAttention={storageAttention} onLogout={() => { void runtime.outbox.status().then((next) => { if (next.pendingCount > 0 || next.attentionCount > 0) enqueue(t('auth.logout.blocked')); else { void runtime.session.logout(); router.push('/login'); } }); }} onTabChange={(id) => router.push(id === 'today' ? '/' : route(id))} sync={{ label: t(`sync.${status.state}`), state: status.state, count: status.pendingCount, onClick: () => { void runtime.refreshSync().then(refresh); } }} tabs={[{ id: 'today', label: t('shell.tab.today') }, { id: 'calendar', label: t('shell.tab.calendar') }, { id: 'clients', label: t('shell.tab.clients') }, { id: 'sale', label: t('shell.tab.sale') }, { id: 'stocks', label: t('shell.tab.stocks') }, { id: 'analytics', label: t('shell.tab.analytics') }, { id: 'setup', label: t('shell.tab.setup') }]} userName={identity.name} userRole={identity.role === 'admin' ? t('auth.role.admin') : t('auth.role.staff')}>
      <div className={styles.content}>
        <section className={styles.card}>
          <h1>{t('setup.title')}</h1>
          <h2>{t('setup.receipt')}</h2>
          <div className={styles.fields}>
            <label data-testid="setup-clinic-name-field"><span>{t('setup.clinicName')}</span><Input data-testid="setup-clinic-name" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} value={draft.name ?? ''} /></label>
            <label><span>{t('setup.receiptFooter')}</span><Input onChange={(event) => setDraft((current) => ({ ...current, receipt_footer: event.target.value }))} value={draft.receipt_footer ?? ''} /></label>
            <label><span>{t('setup.phone')}</span><Input onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} value={draft.phone ?? ''} /></label>
            <label><span>{t('setup.address')}</span><Input onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} value={draft.address ?? ''} /></label>
            <label><span>{t('setup.telegramHandle')}</span><Input data-testid="setup-telegram-handle" onChange={(event) => setDraft((current) => ({ ...current, telegram_handle: event.target.value }))} placeholder="edenclinic" value={draft.telegram_handle ?? ''} /></label>
            <label><span>{t('setup.rounding')}</span><Select onChange={(event) => setDraft((current) => ({ ...current, rounding_step: Number(event.target.value) as ReceiptDraft['rounding_step'] }))} value={draft.rounding_step ?? 500}>{[1, 100, 500, 1000].map((value) => <option key={value} value={value}>{value}</option>)}</Select></label>
            <label><span>{t('setup.creditLimit')}</span><Input min="0" onChange={(event) => setDraft((current) => ({ ...current, credit_limit_mmk: Number(event.target.value) || 0 }))} type="number" value={draft.credit_limit_mmk ?? 0} /></label>
            <label><span>{t('setup.consent')}</span><Select onChange={(event) => setDraft((current) => ({ ...current, consent_mode: event.target.value as ReceiptDraft['consent_mode'] }))} value={draft.consent_mode ?? 'warn'}>{(['off', 'warn', 'block'] as const).map((value) => <option key={value} value={value}>{t(`setup.consent.${value}`)}</option>)}</Select></label>
            <label><span>{t('setup.template')}</span><Select data-testid="receipt-template" onChange={(event) => setDraft((current) => ({ ...current, receipt_template: event.target.value as ReceiptDraft['receipt_template'] }))} value={draft.receipt_template ?? 'classic'}>{(['classic', 'modern', 'minimal', 'boxed'] as const).map((value) => <option key={value} value={value}>{t(`setup.template.${value}`)}</option>)}</Select></label>
            <label><span>{t('setup.headerFont')}</span><Select data-testid="receipt-header-font" onChange={(event) => setDraft((current) => ({ ...current, receipt_header_font: event.target.value as ReceiptDraft['receipt_header_font'] }))} value={draft.receipt_header_font ?? 'sans'}>{RECEIPT_FONTS.map((font) => <option key={font.id} value={font.id}>{t(`setup.font.${font.id}`)}</option>)}</Select></label>
            <label><span>{t('setup.divider')}</span><Select data-testid="receipt-divider" onChange={(event) => setDraft((current) => ({ ...current, receipt_divider: event.target.value as ReceiptDraft['receipt_divider'] }))} value={draft.receipt_divider ?? 'line'}>{(['line', 'dots', 'none'] as const).map((value) => <option key={value} value={value}>{t(`setup.divider.${value}`)}</option>)}</Select></label>
          </div>
          <label className={styles.headerField}>
            <span>{t('setup.receiptHeader')}</span>
            <Textarea
              data-testid="setup-receipt-header"
              onChange={(event) => setDraft((current) => ({ ...current, receipt_header: event.target.value }))}
              placeholder={t('setup.receiptHeaderPlaceholder')}
              value={draft.receipt_header ?? ''}
            />
            <small>{t('setup.receiptHeaderHint')}</small>
          </label>
          <div className={styles.switchRow}><span>{t('setup.receiptQr')}</span><Switch checked={draft.receipt_qr ?? true} label={t('setup.receiptQr')} onCheckedChange={(receipt_qr) => setDraft((current) => ({ ...current, receipt_qr }))} /></div>
          <div className={styles.switchRow}><span>{t('setup.receiptNextVisit')}</span><Switch checked={draft.receipt_next_visit ?? true} label={t('setup.receiptNextVisit')} onCheckedChange={(receipt_next_visit) => setDraft((current) => ({ ...current, receipt_next_visit }))} /></div>
          {offline ? <p className={styles.notice}>{t('setup.saveOffline')}</p> : null}
          <Button data-testid="setup-save" disabled={offline} onClick={() => activeElevation.kind === 'active' ? void save() : setElevateOpen(true)}>{t('setup.save')}</Button>
        </section>
        <aside className={styles.stack}>
          <section className={styles.card}><h2>{t('setup.receipt')}</h2>{previewUrl === undefined ? <Skeleton size="preview" /> : <img alt={t('setup.receipt')} className={styles.preview} data-testid="receipt-preview" src={previewUrl} />}</section>
          <section className={styles.card} data-testid="receipt-logo-card">
            <h2>{t('setup.logo')}</h2>
            <p className={styles.notice}>{t('setup.logoHint')}</p>
            {logoUrl === undefined
              ? <p data-testid="receipt-logo-empty">{t('setup.logoNone')}</p>
              : <img alt={t('setup.logo')} className={styles.logoPreview} data-testid="receipt-logo-preview" src={logoUrl} />}
            <div className={styles.cardActions}>
              <label className={styles.logoPick}>
                <span>{logoUrl === undefined ? t('setup.logoChoose') : t('setup.logoReplace')}</span>
                <input accept="image/*" className={styles.logoInput} data-testid="receipt-logo-input" onChange={(event) => { void pickLogo(event); }} type="file" />
              </label>
              {logoUrl === undefined ? null : <Button data-testid="receipt-logo-remove" onClick={() => { void removeLogo(); }} pill size="sm" variant="ghost">{t('setup.logoRemove')}</Button>}
            </div>
          </section>
          <section className={styles.card}><h2>{t('setup.hardware')}</h2><label><span>{t('setup.width')}</span><Select data-testid="printer-width" onChange={(event) => { const width = Number(event.target.value) as 576 | 384; const next = { ...profile, width }; setProfile(next); void savePrinterProfile(runtime.db, runtime.deviceId, next); }} value={profile.width}><option value="576">{t('setup.width80')}</option><option value="384">{t('setup.width58')}</option></Select></label><label><span>{t('setup.transport')}</span><Select onChange={(event) => { const next = { ...profile, transport: event.target.value as PrinterProfile['transport'] }; setProfile(next); void savePrinterProfile(runtime.db, runtime.deviceId, next); }} value={profile.transport}>{(['sunmi-sdk', 'xprinter-lan', 'xprinter-bluetooth', 'epson-epos', 'generic-escpos'] as const).map((value) => <option key={value} value={value}>{value}</option>)}</Select></label><Button data-testid="open-drawer" onClick={() => setDrawerOpen(true)} pill variant="ghost">{t('setup.openDrawer')}</Button><p className={styles.notice}>{t('setup.openDrawerHint')}</p><Button data-testid="printer-test" disabled={previewReceipt === undefined} onClick={() => { if (previewReceipt === undefined) return; void createM5PrinterTransport(profile).send(previewReceipt).catch(() => enqueue(t('sync.attention'))); }} pill variant="ghost">{t('setup.testPrint')}</Button></section>
          <section className={styles.card}><h2>{t('setup.locale')}</h2><Select data-testid="locale-picker" onChange={(event) => setLocale(event.target.value as typeof locale)} value={locale}><option value="my">{t('locale.my')}</option><option value="en">{t('locale.en')}</option><option value="zh">{t('locale.zh')}</option></Select></section>
          <section className={styles.card} data-testid="storage-diagnostics"><h2>{t('setup.storage')}</h2><p>{storageStatus.kind === 'granted' ? t('setup.storage.granted') : storageStatus.kind === 'unavailable' ? t('setup.storage.unavailable') : t('setup.storage.notGranted')}</p>{storageStatus.kind === 'unavailable' ? null : <p>{t('setup.storage.usage')}: {storageStatus.usage ?? 0} / {storageStatus.quota ?? 0}</p>}<Button data-testid="storage-refresh" onClick={() => { void runtime.storageDiagnostics.refresh().then(setStorageStatus); }} pill size="sm" variant="ghost">{t('setup.storage.refresh')}</Button><Button data-testid="storage-export" onClick={() => setExportOpen(true)} pill size="sm" variant="ghost">{t('setup.storage.export')}</Button></section>
          <section className={styles.card}><h2>{t('setup.operations')}</h2><p>{t('setup.operationsBody')}</p><div className={styles.cardActions}><Button data-testid="open-operations" onClick={() => router.push('/operations')} pill>{t('setup.operationsOpen')}</Button><Button data-testid="open-envelopes" onClick={() => router.push('/security')} pill variant="ghost">{t('auth.envelopes.open')}</Button></div></section>
          <section className={styles.card}><h2>{t('setup.addons')}</h2>{Object.entries(clinic?.addons ?? {}).map(([name, enabled]) => <div className={styles.addon} key={name}><span>{name}</span><Tag tone={enabled === true ? 'ok' : 'amber'}>{enabled === true ? t('tag.ok') : t('tag.amber')}</Tag></div>)}</section>
        </aside>
      </div>
    </AppShell>
    <Modal closeLabel={t('modal.close')} onClose={() => { setDrawerOpen(false); setDrawerPassword(''); }} open={drawerOpen} testId="drawer-elevation" title={t('setup.openDrawer')}><div className={styles.stack}><label><span>{t('setup.password')}</span><Input data-testid="drawer-password" onChange={(event) => setDrawerPassword(event.target.value)} type="password" value={drawerPassword} /></label><Button data-testid="drawer-submit" onClick={() => { void openDrawerWithPassword(); }}>{t('setup.openDrawer')}</Button></div></Modal>
    <Modal closeLabel={t('modal.close')} onClose={() => setElevateOpen(false)} open={elevateOpen} testId="setup-elevation" title={t('setup.elevate')}><div className={styles.stack}><label><span>{t('setup.password')}</span><Input data-testid="setup-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label><Button data-testid="setup-elevation-submit" onClick={() => { void runtime.elevation.elevate(password, 'setup').then(() => { const next = runtime.elevation.state(); setElevateOpen(false); setPassword(''); return next.kind === 'active' ? save(next.token) : undefined; }).catch(() => enqueue(t('sync.attention'))); }}>{t('setup.elevate')}</Button></div></Modal>
    <Modal closeLabel={t('modal.close')} onClose={() => setExportOpen(false)} open={exportOpen} title={t('setup.storage.export')}><div className={styles.stack}><label><span>{t('setup.storage.exportPassword')}</span><Input data-testid="storage-export-password" onChange={(event) => setExportPassword(event.target.value)} type="password" value={exportPassword} /></label><Button data-testid="storage-export-confirm" onClick={() => { void exportOutbox(); }}>{t('setup.storage.exportConfirm')}</Button></div></Modal>
  </main>;
}

function toReceiptDraft(clinic: ClinicRow): ReceiptDraft {
  return { name: clinic.name, phone: clinic.phone, address: clinic.address, telegram_handle: clinic.telegramHandle, receipt_header: clinic.receiptHeader, receipt_footer: clinic.receiptFooter, logo_url: clinic.logoUrl, rounding_step: clinic.roundingStep, credit_limit_mmk: clinic.creditLimitMmk, consent_mode: clinic.consentMode, receipt_qr: clinic.receiptQr, receipt_next_visit: clinic.receiptNextVisit, receipt_template: clinic.receiptTemplate, receipt_header_font: clinic.receiptHeaderFont, receipt_divider: clinic.receiptDivider };
}

function applyDraft(clinic: ClinicRow, draft: ReceiptDraft): ClinicRow {
  return { ...clinic, name: draft.name ?? clinic.name, phone: draft.phone ?? clinic.phone, address: draft.address ?? clinic.address, telegramHandle: draft.telegram_handle ?? clinic.telegramHandle, receiptHeader: draft.receipt_header ?? clinic.receiptHeader, receiptFooter: draft.receipt_footer ?? clinic.receiptFooter, logoUrl: draft.logo_url ?? clinic.logoUrl, roundingStep: draft.rounding_step ?? clinic.roundingStep, creditLimitMmk: draft.credit_limit_mmk ?? clinic.creditLimitMmk, consentMode: draft.consent_mode ?? clinic.consentMode, receiptQr: draft.receipt_qr ?? clinic.receiptQr, receiptNextVisit: draft.receipt_next_visit ?? clinic.receiptNextVisit, receiptTemplate: draft.receipt_template ?? clinic.receiptTemplate, receiptHeaderFont: draft.receipt_header_font ?? clinic.receiptHeaderFont, receiptDivider: draft.receipt_divider ?? clinic.receiptDivider };
}

function previewSale(): SaleRow {
  return { id: 'preview', patientId: null, staffId: 'preview', practitionerId: null, appointmentId: null, at: '2026-08-01T08:00:00.000Z', lines: [], payments: [], subtotal: 0, discountPct: null, discountApprovedBy: null, total: 0, credit: 0, creditApprovedBy: null, followupDate: null, deviceId: null, createdOffline: false, no: 'PREVIEW', status: 'completed', needsReview: false, reviewReason: null, receivedAt: null };
}

function readPalette(): ReceiptPalette {
  const styles = getComputedStyle(document.body);
  return { background: styles.getPropertyValue('--panel').trim(), ink: styles.getPropertyValue('--ink').trim(), brand: styles.getPropertyValue('--brand').trim(), muted: styles.getPropertyValue('--mut').trim(), line: styles.getPropertyValue('--line').trim() };
}
