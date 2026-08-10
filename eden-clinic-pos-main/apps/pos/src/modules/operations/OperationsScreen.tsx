'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClinicRuntimeStatus, type ClinicRuntime } from '@/app/providers';
import { adjustExistingStock } from '@/data/inventoryRecords';
import { useClinicBranding } from '@/data/useClinicBranding';
import { fmtMMK } from '@/data/money';
import type { OutboxStatusView } from '@/data/outbox';
import { toLocalSale, type DailyReportWire, type FollowupWire, type LicenseWire, type ProductRow, type SaleRow } from '@/data/types';
import { useT } from '@/i18n';
import { AppShell, Button, Card, EmptyState, Input, Modal, SecretInput, Select, Skeleton, Tag, useToast } from '@/ui';
import styles from './OperationsScreen.module.css';

export function OperationsScreen() {
  const { runtime } = useClinicRuntimeStatus();
  if (runtime === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;
  return <ActiveOperationsScreen runtime={runtime} />;
}

/** The clinic's own calendar date (device zone), never the UTC date. */
function localDateIso(): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function licenseTone(status: string): 'ok' | 'amber' | 'low' {
  if (status === 'ACTIVE') return 'ok';
  if (status === 'WARNING' || status === 'GRACE') return 'amber';
  return 'low';
}

function ActiveOperationsScreen({ runtime }: { runtime: ClinicRuntime }) {
  const router = useRouter();
  const { locale, t } = useT();
  const { enqueue } = useToast();
  const { revision } = useClinicRuntimeStatus();
  const branding = useClinicBranding(runtime, { brand: t('brand.name'), location: t('brand.location') });
  const session = runtime.session.state();
  const identity = session.kind === 'active' ? session.identity : undefined;
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [followups, setFollowups] = useState<FollowupWire[]>([]);
  const [report, setReport] = useState<DailyReportWire>();
  const [date, setDate] = useState(localDateIso());
  const [password, setPassword] = useState('');
  const [elevationOpen, setElevationOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'report' | 'void' | 'adjust'>('report');
  const [saleId, setSaleId] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [productId, setProductId] = useState('');
  const [delta, setDelta] = useState('0');
  const [reason, setReason] = useState<'adjust' | 'waste' | 'expiry'>('adjust');
  const [license, setLicense] = useState<LicenseWire>();
  const [licenseUnavailable, setLicenseUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<OutboxStatusView>({ state: 'synced', pendingCount: 0, attentionCount: 0, drainProgress: 0 });
  const [staffName, setStaffName] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffPin, setStaffPin] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRole, setStaffRole] = useState<'admin' | 'staff'>('staff');
  const [exportPassword, setExportPassword] = useState('');

  const isAdmin = identity?.role === 'admin';

  const refreshLocal = async () => {
    const [nextSales, nextProducts, status] = await Promise.all([
      runtime.db.sales.toArray(),
      runtime.db.products.toArray(),
      runtime.outbox.status(),
    ]);
    setSales(nextSales);
    setProducts(nextProducts);
    setSyncStatus(status);
    setSaleId((current) => current !== '' ? current : nextSales.find((sale) => sale.status !== 'voided')?.id ?? '');
    setProductId((current) => current !== '' ? current : nextProducts[0]?.id ?? '');
  };

  useEffect(() => {
    if (identity === undefined) { router.replace('/login?returnTo=%2Foperations'); return; }
    if (!isAdmin) return;
    const timer = window.setTimeout(() => {
      void refreshLocal();
      // Operations surfaces are online admin extras (LAW-12): when the network
      // is away they degrade to their empty copy — never an error loop.
      void runtime.api.followups().then(setFollowups).catch(() => setFollowups([]));
      if (runtime.api.license !== undefined) {
        void runtime.api.license().then((row) => { setLicense(row); setLicenseUnavailable(false); }).catch(() => setLicenseUnavailable(true));
      }
    }, 0);
    return () => window.clearTimeout(timer);
  // Revision changes after bootstrap, auth state, and sync completion.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, isAdmin, revision, runtime]);

  if (identity === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;

  const syncLabels = { synced: t('sync.synced'), syncing: t('sync.syncing'), offline: t('sync.offline'), attention: t('sync.attention') };
  const tabs = [{ id: 'today', label: t('shell.tab.today') }, { id: 'calendar', label: t('shell.tab.calendar') }, { id: 'clients', label: t('shell.tab.clients') }, { id: 'sale', label: t('shell.tab.sale') }, { id: 'stocks', label: t('shell.tab.stocks') }, { id: 'analytics', label: t('shell.tab.analytics') }, { id: 'setup', label: t('shell.tab.setup') }];

  const runAction = async (action: typeof pendingAction, token: string) => {
    if (action === 'report') {
      setReport(await runtime.api.dailyReport(date, token));
      return;
    }
    if (action === 'void' && saleId !== '') {
      const result = await runtime.api.voidSale(saleId, voidReason.trim() === '' ? t('ops.void.defaultReason') : voidReason.trim(), token);
      await runtime.db.sales.put(toLocalSale(result.sale));
      setSaleId('');
      await refreshLocal();
      enqueue(t('ops.void.done'));
      return;
    }
    if (action === 'adjust' && productId !== '' && Number(delta) !== 0) {
      await adjustExistingStock({ db: runtime.db, api: runtime.api, productId, delta: Number(delta), reason, elevationToken: token });
      setDelta('0');
      await refreshLocal();
      enqueue(t('ops.adjust.done'));
    }
  };

  const withElevation = async (action: typeof pendingAction, freshToken?: string) => {
    const active = runtime.elevation.state();
    const token = freshToken ?? (active.kind === 'active' ? active.token : undefined);
    if (token === undefined) { setPendingAction(action); setElevationOpen(true); return; }
    setBusy(true);
    try {
      await runAction(action, token);
    } catch {
      enqueue(t('ops.failed'));
    } finally {
      setBusy(false);
    }
  };

  const submitElevation = async () => {
    try {
      await runtime.elevation.elevate(password, 'operations');
      const active = runtime.elevation.state();
      setElevationOpen(false);
      setPassword('');
      if (active.kind === 'active') await withElevation(pendingAction, active.token);
    } catch {
      setPassword('');
      enqueue(t('ops.failed'));
    }
  };

  const createStaff = async () => {
    if (runtime.api.createStaffAccount === undefined) return;
    setBusy(true);
    try {
      await runtime.api.createStaffAccount({ name: staffName.trim(), phone: staffPhone.trim(), pin: staffPin, email: staffEmail.trim(), password: staffPassword, role: staffRole, takes_bookings: true });
      setStaffName(''); setStaffPhone(''); setStaffPin(''); setStaffEmail(''); setStaffPassword('');
      enqueue(t('ops.staff.done'));
      void runtime.refreshSync().then(refreshLocal);
    } catch {
      enqueue(t('ops.failed'));
    } finally {
      setBusy(false);
    }
  };

  const exportData = async () => {
    if (runtime.api.exportData === undefined) return;
    setBusy(true);
    try {
      const data = await runtime.api.exportData(exportPassword);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `eden-clinic-export-${date}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportPassword('');
    } catch {
      enqueue(t('ops.failed'));
    } finally {
      setBusy(false);
    }
  };

  const voidableSales = sales.filter((sale) => sale.status !== 'voided');

  return <main className={styles.root} data-locale={locale} data-testid="operations-root" lang={locale === 'zh' ? 'zh-Hans' : locale}>
    <AppShell
      activeTab="setup"
      brand={branding.brand}
      location={branding.location}
      logoutLabel={t('shell.logout')}
      onLogout={() => { void runtime.outbox.status().then((status) => {
        if (status.pendingCount > 0 || status.attentionCount > 0) enqueue(t('auth.logout.blocked'));
        else { void runtime.session.logout(); router.push('/login'); }
      }); }}
      onTabChange={(id) => router.push(id === 'today' ? '/' : `/${id}`)}
      sync={{ label: syncLabels[syncStatus.state], state: syncStatus.state, count: syncStatus.pendingCount, onClick: () => { void runtime.refreshSync().then(refreshLocal); } }}
      tabs={tabs}
      userName={identity.name}
      userRole={identity.role === 'admin' ? t('auth.role.admin') : t('auth.role.staff')}
    >
      {isAdmin ? (
        <div className={styles.content}>
          <header className={styles.pageHeader}>
            <div>
              <p className={styles.eyebrow}>{t('ops.eyebrow')}</p>
              <h1>{t('ops.title')}</h1>
            </div>
            <Button onClick={() => router.push('/setup')} pill size="sm" variant="ghost">{t('ops.backToSetup')}</Button>
          </header>
          <div className={styles.grid}>
            <Card className={styles.card}>
              <h2>{t('ops.report.title')}</h2>
              <label className={styles.field}><span>{t('ops.report.date')}</span>
                <Input data-testid="report-date" onChange={(event) => setDate(event.target.value)} type="date" value={date} />
              </label>
              <div className={styles.cardActions}>
                <Button data-testid="report-load" disabled={busy} onClick={() => { void withElevation('report'); }} pill>{t('ops.report.load')}</Button>
              </div>
              {report === undefined ? null : <dl className={styles.kv} data-testid="daily-report">
                <div className={styles.kvRow}><dt>{t('ops.report.collected')}</dt><dd>{fmtMMK(report.collected)}</dd></div>
                <div className={styles.kvRow}><dt>{t('ops.report.delivered')}</dt><dd>{fmtMMK(report.delivered)}</dd></div>
                <div className={styles.kvRow}><dt>{t('ops.report.newCredit')}</dt><dd>{fmtMMK(report.new_credit)}</dd></div>
                <div className={styles.kvRow}><dt>{t('ops.report.sales')}</dt><dd data-testid="report-sales-count">{report.sales}</dd></div>
              </dl>}
            </Card>
            <Card className={styles.card}>
              <h2>{t('ops.followups.title')}</h2>
              {followups.length === 0 ? <p className={styles.emptyLine}>{t('ops.followups.empty')}</p> : <ul className={styles.followups}>
                {followups.map((item) => <li key={`${item.patient_id}-${item.date}`}><strong>{item.date}</strong><span>{item.service === '' || item.service === null || item.service === undefined ? item.patient_id : item.service}</span></li>)}
              </ul>}
            </Card>
            <Card className={styles.card}>
              <h2>{t('ops.void.title')}</h2>
              {voidableSales.length === 0 ? <p className={styles.emptyLine}>{t('ops.void.empty')}</p> : <>
                <label className={styles.field}><span>{t('ops.void.sale')}</span>
                  <Select data-testid="void-sale-select" onChange={(event) => setSaleId(event.target.value)} value={saleId}>
                    <option value="" />
                    {voidableSales.map((sale) => <option key={sale.id} value={sale.id}>{sale.no ?? sale.id.slice(0, 8)} · {fmtMMK(sale.total)}</option>)}
                  </Select>
                </label>
                <label className={styles.field}><span>{t('ops.void.reason')}</span>
                  <Input data-testid="void-reason" onChange={(event) => setVoidReason(event.target.value)} placeholder={t('ops.void.defaultReason')} value={voidReason} />
                </label>
                <div className={styles.cardActions}>
                  <Button data-testid="void-sale-submit" disabled={busy || saleId === ''} onClick={() => { void withElevation('void'); }} pill variant="danger">{t('ops.void.submit')}</Button>
                </div>
              </>}
            </Card>
            <Card className={styles.card}>
              <h2>{t('ops.adjust.title')}</h2>
              <label className={styles.field}><span>{t('ops.adjust.product')}</span>
                <Select data-testid="adjust-product-select" onChange={(event) => setProductId(event.target.value)} value={productId}>
                  <option value="" />
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.stockQty})</option>)}
                </Select>
              </label>
              <div className={styles.fieldRow}>
                <label className={styles.field}><span>{t('ops.adjust.delta')}</span>
                  <Input data-testid="adjust-delta" onChange={(event) => setDelta(event.target.value)} type="number" value={delta} />
                </label>
                <label className={styles.field}><span>{t('ops.adjust.reason')}</span>
                  <Select onChange={(event) => setReason(event.target.value as typeof reason)} value={reason}>
                    <option value="adjust">{t('ops.adjust.reasonAdjust')}</option>
                    <option value="waste">{t('ops.adjust.reasonWaste')}</option>
                    <option value="expiry">{t('ops.adjust.reasonExpiry')}</option>
                  </Select>
                </label>
              </div>
              <div className={styles.cardActions}>
                <Button data-testid="adjust-stock-submit" disabled={busy || productId === '' || Number(delta) === 0} onClick={() => { void withElevation('adjust'); }} pill>{t('ops.adjust.submit')}</Button>
              </div>
            </Card>
            <Card className={styles.card}>
              <h2>{t('ops.license.title')}</h2>
              {license === undefined ? <p className={styles.emptyLine}>{licenseUnavailable ? t('ops.license.offline') : ''}</p> : <dl className={styles.kv} data-testid="license-status">
                <div className={styles.kvRow}><dt>{t('ops.license.status')}</dt><dd><Tag tone={licenseTone(license.effective_status)}>{license.effective_status}</Tag></dd></div>
                <div className={styles.kvRow}><dt>{t('ops.license.termEnds')}</dt><dd>{license.term_ends_on}</dd></div>
                <div className={styles.kvRow}><dt>{t('ops.license.graceEnds')}</dt><dd>{license.grace_ends_on}</dd></div>
              </dl>}
            </Card>
            <Card className={styles.card}>
              <h2>{t('ops.staff.title')}</h2>
              <div className={styles.fieldRow}>
                <label className={styles.field}><span>{t('clients.form.name')}</span>
                  <Input data-testid="staff-name" onChange={(event) => setStaffName(event.target.value)} value={staffName} />
                </label>
                <label className={styles.field}><span>{t('clients.form.phone')}</span>
                  <Input onChange={(event) => setStaffPhone(event.target.value)} value={staffPhone} />
                </label>
              </div>
              <div className={styles.fieldRow}>
                <label className={styles.field}><span>{t('ops.staff.pin')}</span>
                  <SecretInput data-testid="staff-pin" hideLabel={t('field.hide')} inputMode="numeric" maxLength={4} onChange={(event) => setStaffPin(event.target.value)} revealLabel={t('field.reveal')} value={staffPin} />
                </label>
                <label className={styles.field}><span>{t('ops.staff.role')}</span>
                  <Select onChange={(event) => setStaffRole(event.target.value as typeof staffRole)} value={staffRole}>
                    <option value="staff">{t('ops.staff.roleStaff')}</option>
                    <option value="admin">{t('ops.staff.roleAdmin')}</option>
                  </Select>
                </label>
              </div>
              <div className={styles.fieldRow}>
                <label className={styles.field}><span>{t('ops.staff.email')}</span>
                  <Input onChange={(event) => setStaffEmail(event.target.value)} type="email" value={staffEmail} />
                </label>
                <label className={styles.field}><span>{t('ops.staff.password')}</span>
                  <SecretInput data-testid="staff-password" hideLabel={t('field.hide')} onChange={(event) => setStaffPassword(event.target.value)} revealLabel={t('field.reveal')} value={staffPassword} />
                </label>
              </div>
              <div className={styles.cardActions}>
                <Button data-testid="staff-create" disabled={busy || staffName.trim() === '' || staffPhone.trim() === '' || !/^\d{4}$/.test(staffPin) || staffEmail.trim() === '' || staffPassword.length < 8} onClick={() => { void createStaff(); }} pill>{t('ops.staff.submit')}</Button>
              </div>
            </Card>
            <Card className={styles.card}>
              <h2>{t('ops.export.title')}</h2>
              <p className={styles.body}>{t('ops.export.body')}</p>
              <label className={styles.field}><span>{t('clients.profile.password')}</span>
                <Input data-testid="server-export-password" onChange={(event) => setExportPassword(event.target.value)} type="password" value={exportPassword} />
              </label>
              <div className={styles.cardActions}>
                <Button data-testid="server-export" disabled={busy || exportPassword === ''} onClick={() => { void exportData(); }} pill variant="ghost">{t('ops.export.submit')}</Button>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div className={styles.content}>
          <EmptyState
            action={<Button onClick={() => router.push('/setup')} pill size="sm" variant="ghost">{t('ops.backToSetup')}</Button>}
            body={t('ops.adminOnly')}
            data-testid="operations-admin-only"
            heading={t('ops.title')}
          />
        </div>
      )}
    </AppShell>
    <Modal closeLabel={t('modal.close')} onClose={() => { setElevationOpen(false); setPassword(''); }} open={elevationOpen} testId="operations-elevation" title={t('setup.elevate')}>
      <div className={styles.stack}>
        <label className={styles.field}><span>{t('setup.password')}</span>
          <Input data-testid="operations-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
        </label>
        <Button data-testid="operations-elevation-submit" disabled={password === ''} onClick={() => { void submitElevation(); }} pill>{t('setup.elevate')}</Button>
      </div>
    </Modal>
  </main>;
}
