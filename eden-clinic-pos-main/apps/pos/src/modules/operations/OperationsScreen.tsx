'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClinicRuntimeStatus, type ClinicRuntime } from '@/app/providers';
import { adjustExistingStock } from '@/data/inventoryRecords';
import { fmtMMK } from '@/data/money';
import { toLocalSale, type DailyReportWire, type FollowupWire, type LicenseWire, type ProductRow, type SaleRow } from '@/data/types';
import { useT } from '@/i18n';
import { AppShell, Button, Card, Input, Modal, Select, Skeleton, useToast } from '@/ui';
import styles from './OperationsScreen.module.css';

export function OperationsScreen() {
  const { runtime } = useClinicRuntimeStatus();
  if (runtime === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;
  return <ActiveOperationsScreen runtime={runtime} />;
}

function ActiveOperationsScreen({ runtime }: { runtime: ClinicRuntime }) {
  const router = useRouter();
  const { locale, t } = useT();
  const { enqueue } = useToast();
  const session = runtime.session.state();
  const identity = session.kind === 'active' ? session.identity : undefined;
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [followups, setFollowups] = useState<FollowupWire[]>([]);
  const [report, setReport] = useState<DailyReportWire>();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [password, setPassword] = useState('');
  const [elevationOpen, setElevationOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'report' | 'void' | 'adjust'>('report');
  const [saleId, setSaleId] = useState('');
  const [voidReason, setVoidReason] = useState('Entered incorrectly');
  const [productId, setProductId] = useState('');
  const [delta, setDelta] = useState('0');
  const [reason, setReason] = useState<'adjust' | 'waste' | 'expiry'>('adjust');
  const [license, setLicense] = useState<LicenseWire>();
  const [staffName, setStaffName] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffPin, setStaffPin] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffRole, setStaffRole] = useState<'admin' | 'staff'>('staff');
  const [exportPassword, setExportPassword] = useState('');

  const refreshLocal = async () => {
    const [nextSales, nextProducts] = await Promise.all([runtime.db.sales.toArray(), runtime.db.products.toArray()]);
    setSales(nextSales);
    setProducts(nextProducts);
    if (saleId === '' && nextSales.length > 0) setSaleId(nextSales[0]!.id);
    if (productId === '' && nextProducts.length > 0) setProductId(nextProducts[0]!.id);
  };

  useEffect(() => {
    if (identity === undefined) { router.replace('/login?returnTo=%2Foperations'); return; }
    const timer = window.setTimeout(() => {
      void refreshLocal();
      void runtime.api.followups().then(setFollowups).catch(() => enqueue(t('sync.attention')));
      if (runtime.api.license !== undefined) void runtime.api.license().then(setLicense).catch(() => enqueue(t('sync.attention')));
    }, 0);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, runtime]);

  if (identity === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;

  const withElevation = async (action: typeof pendingAction, token?: string) => {
    const active = runtime.elevation.state();
    const elevationToken = token ?? (active.kind === 'active' ? active.token : undefined);
    if (elevationToken === undefined) { setPendingAction(action); setElevationOpen(true); return; }
    if (action === 'report') setReport(await runtime.api.dailyReport(date, elevationToken));
    if (action === 'void' && saleId !== '') {
      const result = await runtime.api.voidSale(saleId, voidReason, elevationToken);
      await runtime.db.sales.put(toLocalSale(result.sale));
      await refreshLocal();
    }
    if (action === 'adjust' && productId !== '' && Number(delta) !== 0) {
      await adjustExistingStock({ db: runtime.db, api: runtime.api, productId, delta: Number(delta), reason, elevationToken });
      await refreshLocal();
    }
    enqueue(t('sync.synced'));
  };

  const tabs = [{ id: 'today', label: t('shell.tab.today') }, { id: 'calendar', label: t('shell.tab.calendar') }, { id: 'clients', label: t('shell.tab.clients') }, { id: 'sale', label: t('shell.tab.sale') }, { id: 'stocks', label: t('shell.tab.stocks') }, { id: 'setup', label: t('shell.tab.setup') }];
  const createStaff = async () => {
    if (runtime.api.createStaffAccount === undefined) return;
    await runtime.api.createStaffAccount({ name: staffName.trim(), phone: staffPhone.trim(), pin: staffPin, email: staffEmail.trim(), password: staffPassword, role: staffRole, takes_bookings: true });
    setStaffName(''); setStaffPhone(''); setStaffPin(''); setStaffEmail(''); setStaffPassword('');
    await runtime.refreshSync(); enqueue(t('sync.synced'));
  };
  const exportData = async () => {
    if (runtime.api.exportData === undefined) return;
    const data = await runtime.api.exportData(exportPassword);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `eden-clinic-export-${date}.json`; anchor.click(); URL.revokeObjectURL(url);
    setExportPassword('');
  };
  return <main className={styles.root} data-locale={locale} data-testid="operations-root" lang={locale === 'zh' ? 'zh-Hans' : locale}>
    <AppShell activeTab="setup" brand={t('brand.name')} location={t('brand.location')} logoutLabel={t('shell.logout')} onLogout={() => { void runtime.session.logout(); router.push('/login'); }} onTabChange={(id) => router.push(id === 'today' ? '/' : `/${id}`)} sync={{ label: t('sync.synced'), state: 'synced' }} tabs={tabs} userName={identity.name} userRole={identity.role === 'admin' ? t('auth.role.admin') : t('auth.role.staff')}>
      <div className={styles.content}>
        <header><div><p>Administration</p><h1>Operations and reports</h1></div><Button onClick={() => router.push('/setup')} variant="ghost">Back to setup</Button></header>
        <div className={styles.grid}>
          <Card><h2>Daily report</h2><Input data-testid="report-date" onChange={(event) => setDate(event.target.value)} type="date" value={date} /><Button data-testid="report-load" onClick={() => { void withElevation('report'); }}>Load report</Button>{report === undefined ? null : <dl data-testid="daily-report"><dt>Collected</dt><dd>{fmtMMK(report.collected)}</dd><dt>Delivered</dt><dd>{fmtMMK(report.delivered)}</dd><dt>New credit</dt><dd>{fmtMMK(report.new_credit)}</dd><dt>Sales</dt><dd>{report.sales}</dd></dl>}</Card>
          <Card><h2>Upcoming follow-ups</h2>{followups.length === 0 ? <p>No upcoming follow-ups.</p> : followups.map((item) => <p key={`${item.patient_id}-${item.date}`}>{item.date} · {item.service || item.patient_id}</p>)}</Card>
          <Card><h2>Void a sale</h2><Select data-testid="void-sale-select" onChange={(event) => setSaleId(event.target.value)} value={saleId}>{sales.filter((sale) => sale.status !== 'voided').map((sale) => <option key={sale.id} value={sale.id}>{sale.no ?? sale.id} · {fmtMMK(sale.total)}</option>)}</Select><Input data-testid="void-reason" onChange={(event) => setVoidReason(event.target.value)} value={voidReason} /><Button data-testid="void-sale-submit" disabled={saleId === '' || voidReason.trim() === ''} onClick={() => { void withElevation('void'); }} variant="danger">Void sale</Button></Card>
          <Card><h2>Adjust stock</h2><Select data-testid="adjust-product-select" onChange={(event) => setProductId(event.target.value)} value={productId}>{products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.stockQty})</option>)}</Select><Input data-testid="adjust-delta" onChange={(event) => setDelta(event.target.value)} type="number" value={delta} /><Select onChange={(event) => setReason(event.target.value as typeof reason)} value={reason}><option value="adjust">Correction</option><option value="waste">Waste</option><option value="expiry">Expiry</option></Select><Button data-testid="adjust-stock-submit" disabled={productId === '' || Number(delta) === 0} onClick={() => { void withElevation('adjust'); }}>Save adjustment</Button></Card>
          <Card><h2>License</h2>{license === undefined ? <p>Loading license…</p> : <dl data-testid="license-status"><dt>Status</dt><dd>{license.effective_status}</dd><dt>Term ends</dt><dd>{license.term_ends_on}</dd><dt>Grace ends</dt><dd>{license.grace_ends_on}</dd></dl>}</Card>
          <Card><h2>Add staff account</h2><Input data-testid="staff-name" onChange={(event) => setStaffName(event.target.value)} placeholder="Name" value={staffName} /><Input onChange={(event) => setStaffPhone(event.target.value)} placeholder="Phone" value={staffPhone} /><Input data-testid="staff-pin" maxLength={4} onChange={(event) => setStaffPin(event.target.value)} placeholder="4-digit PIN" value={staffPin} /><Input onChange={(event) => setStaffEmail(event.target.value)} placeholder="Email" type="email" value={staffEmail} /><Input onChange={(event) => setStaffPassword(event.target.value)} placeholder="Password" type="password" value={staffPassword} /><Select onChange={(event) => setStaffRole(event.target.value as typeof staffRole)} value={staffRole}><option value="staff">Staff</option><option value="admin">Administrator</option></Select><Button data-testid="staff-create" disabled={staffName.trim() === '' || staffPhone.trim() === '' || !/^\d{4}$/.test(staffPin) || staffEmail.trim() === '' || staffPassword.length < 8} onClick={() => { void createStaff(); }}>Create staff login</Button></Card>
          <Card><h2>Server data export</h2><p>Export patients, staff, catalogue, and sales. The administrator password is always required.</p><Input data-testid="server-export-password" onChange={(event) => setExportPassword(event.target.value)} type="password" value={exportPassword} /><Button data-testid="server-export" disabled={exportPassword === ''} onClick={() => { void exportData(); }}>Download export</Button></Card>
        </div>
      </div>
    </AppShell>
    <Modal closeLabel={t('modal.close')} onClose={() => setElevationOpen(false)} open={elevationOpen} testId="operations-elevation" title={t('setup.elevate')}><div className={styles.stack}><label><span>{t('setup.password')}</span><Input data-testid="operations-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label><Button data-testid="operations-elevation-submit" onClick={() => { void runtime.elevation.elevate(password, 'operations').then(() => { const active = runtime.elevation.state(); setElevationOpen(false); setPassword(''); return active.kind === 'active' ? withElevation(pendingAction, active.token) : undefined; }).catch(() => enqueue(t('sync.attention'))); }}>{t('setup.elevate')}</Button></div></Modal>
  </main>;
}
