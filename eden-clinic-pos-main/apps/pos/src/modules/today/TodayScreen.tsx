'use client';

/* eslint-disable @next/next/no-img-element -- locally rasterized receipt Blob URL. */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClinicRuntimeStatus, type ClinicRuntime } from '@/app/providers';
import { closeShift, type ShiftCloseRecord } from '@/data/shiftClose';
import { cashDifference, expectedCash, fmtMMK } from '@/data/money';
import { readPrinterProfile, type PrinterProfile } from '@/data/printerProfile';
import { summarizeToday, type TodaySummary } from '@/data/todaySummary';
import { drawerDifferenceTone } from '@/modules/today/shiftPresentation';
import { useT } from '@/i18n';
import { buildConfirmedReceiptInput } from '@/print/receiptInput';
import { renderReceipt, type ReceiptPalette } from '@/print/receipt';
import { AppShell, Button, Card, Input, Modal, Skeleton, StatTile, Tag, useToast } from '@/ui';
import type { ClinicRow, PatientRow, ProductRow, SaleRow, StaffRow } from '@/data/types';
import type { OutboxStatusView } from '@/data/outbox';
import styles from './TodayScreen.module.css';

type LocalData = { sales: SaleRow[]; patients: PatientRow[]; products: ProductRow[]; staff: StaffRow[]; status: OutboxStatusView; clinic?: ClinicRow; profile: PrinterProfile };
const defaultProfile: PrinterProfile = { version: 1, transport: 'generic-escpos', width: 576 };

export function TodayScreen() {
  const { runtime } = useClinicRuntimeStatus();
  if (runtime === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;
  return <ActiveTodayScreen runtime={runtime} />;
}

function ActiveTodayScreen({ runtime }: { runtime: ClinicRuntime }) {
  const router = useRouter();
  const { locale, t } = useT();
  const { enqueue } = useToast();
  const { revision } = useClinicRuntimeStatus();
  const session = runtime.session.state();
  // The session boundary deliberately precedes every local data read: an
  // auth-required identity may be useful to the login repair flow, but cannot
  // open Today or inspect its Dexie-backed operational data.
  const identity = session.kind === 'active' ? session.identity : undefined;
  const [data, setData] = useState<LocalData>();
  const [summary, setSummary] = useState<TodaySummary>();
  const [closeOpen, setCloseOpen] = useState(false);
  const [openingCash, setOpeningCash] = useState('0');
  const [countedCash, setCountedCash] = useState('0');
  const [latestClose, setLatestClose] = useState<ShiftCloseRecord>();
  const [reprint, setReprint] = useState<SaleRow>();
  const [reprintUrl, setReprintUrl] = useState<string>();

  useEffect(() => {
    if (identity === undefined) {
      router.replace('/login');
      return;
    }
    let disposed = false;
    void Promise.all([runtime.db.sales.toArray(), runtime.db.patients.toArray(), runtime.db.products.toArray(), runtime.db.staff.toArray(), runtime.outbox.status(), runtime.db.clinic.toCollection().first(), readPrinterProfile(runtime.db, runtime.deviceId)])
      .then(([sales, patients, products, staff, status, clinic, profile]) => {
        if (disposed) return;
        setData({ sales, patients, products, staff, status, clinic, profile: profile ?? defaultProfile });
        setSummary(summarizeToday({ now: runtime.now(), sales, patients, products, staff, outbox: status }));
      });
    return () => { disposed = true; };
  }, [identity, revision, router, runtime]);

  useEffect(() => {
    if (reprint === undefined || data?.clinic === undefined) return undefined;
    let disposed = false;
    let url: string | undefined;
    void renderReceipt(buildConfirmedReceiptInput({ sale: reprint, clinic: data.clinic, width: data.profile.width, palette: receiptPalette(), copyMarker: t('receipt.copy') }), { fonts: document.fonts })
      .then((rendered) => { if (!disposed) { url = URL.createObjectURL(rendered.png); setReprintUrl(url); } })
      .catch(() => enqueue(t('sync.attention')));
    return () => { disposed = true; if (url !== undefined) URL.revokeObjectURL(url); };
  }, [data?.clinic, data?.profile.width, enqueue, reprint, t]);

  if (identity === undefined || summary === undefined || data === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;
  const closing = { opening: Number(openingCash) || 0, counted: Number(countedCash) || 0 };
  const expected = expectedCash(closing.opening, summary.methodTotals.cash);
  const difference = cashDifference(closing.counted, expected);
  const differenceTone = drawerDifferenceTone(difference);
  const blocksClose = data.status.pendingCount > 0 || data.status.attentionCount > 0;
  const storageStatus = runtime.storageDiagnostics.state();
  const storageAttention = storageStatus.kind === 'granted' ? undefined : t('shell.storageTag');
  const tabs = [{ id: 'today', label: t('shell.tab.today') }, { id: 'calendar', label: t('shell.tab.calendar') }, { id: 'clients', label: t('shell.tab.clients') }, { id: 'sale', label: t('shell.tab.sale') }, { id: 'stocks', label: t('shell.tab.stocks') }, { id: 'setup', label: t('shell.tab.setup') }];
  const route = (id: string) => id === 'today' ? '/' : `/${id}`;

  const confirmClose = async () => {
    try {
      const record = await closeShift({ db: runtime.db, now: runtime.now(), deviceId: runtime.deviceId, actor: { staffId: identity.staffId, role: identity.role }, openingCash: closing.opening, countedCash: closing.counted, uuid: crypto.randomUUID() });
      setLatestClose(record); setCloseOpen(false); enqueue(t('shift.saved'));
    } catch {
      enqueue(blocksClose ? t('shift.blockedSync') : t('shift.adminRequired'));
    }
  };

  return <main className={styles.root} data-locale={locale} data-testid="today-root" lang={locale === 'zh' ? 'zh-Hans' : locale}>
    <AppShell activeTab="today" brand={t('brand.name')} location={t('brand.location')} logoutLabel={t('shell.logout')} switchUserLabel={t('shell.switchUser')} switchUserDisabled={false} onSwitchUser={() => { runtime.session.switchUser(); router.push('/login'); }} storageAttention={storageAttention} onLogout={() => { void runtime.outbox.status().then((status) => { if (status.pendingCount > 0 || status.attentionCount > 0) enqueue(t('auth.logout.blocked')); else { void runtime.session.logout(); router.push('/login'); } }); }} onTabChange={(id) => router.push(route(id))} sync={{ label: t(`sync.${data.status.state}`), state: data.status.state, count: data.status.pendingCount, onClick: () => { void runtime.refreshSync(); } }} tabs={tabs} userName={identity.name} userRole={identity.role === 'admin' ? t('auth.role.admin') : t('auth.role.staff')}>
      <div className={styles.content}>
        <header className={styles.heading}><div><p>{t('today.title')}</p><h1>{t('today.totalCollected')}</h1><span className={styles.headingDate}>{new Intl.DateTimeFormat(locale === 'zh' ? 'zh-Hans' : locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}</span></div><strong data-testid="today-total-collected">{fmtMMK(summary.methodTotals.totalCollected)}</strong></header>
        <div className={styles.stats}>{[['cash', summary.methodTotals.cash, t('sale.cash')], ['kbzpay', summary.methodTotals.kbzpay, t('sale.kbzpay')], ['wave', summary.methodTotals.wave, t('sale.wave')], ['credit', summary.methodTotals.credit, t('today.creditOutstanding')]].map(([id, value, label]) => <StatTile data-testid={`today-method-${id}`} key={String(id)} label={String(label)} value={fmtMMK(Number(value))} />)}</div>
        {summary.methodTotals.otherMethods === 0 ? null : <p className={styles.other} data-testid="today-other-methods">{t('today.otherMethods')}: <strong>{fmtMMK(summary.methodTotals.otherMethods)}</strong></p>}
        <div className={styles.grid}>
          <Card><h2>{t('today.staffBreakdown')}</h2>{summary.staffBreakdown.map((row) => <p data-testid={`today-staff-${row.staffId}`} key={row.staffId}>{row.name}<strong>{fmtMMK(row.total)}</strong></p>)}</Card>
          <Card><div className={styles.cardHead}><h2>{t('today.pendingSync')}</h2>{summary.needsReviewCount + summary.pendingCount + summary.attentionCount === 0 ? <Tag tone="ok">{t('today.allClear')}</Tag> : null}</div><div className={styles.queueCells}><div><small>{t('today.needsReview')}</small><strong>{summary.needsReviewCount}</strong></div><div><small>{t('today.pendingSync')}</small><strong>{summary.pendingCount + summary.attentionCount}</strong></div></div></Card>
          <Card><h2>{t('today.debtors')}</h2><div data-testid="today-debtors">{summary.debtors.length === 0 ? <p className={styles.emptyLine}>{t('today.noDebtors')}</p> : summary.debtors.map((row) => <p key={row.patient.id}>{row.patient.name}<span><Tag tone="low">{t(`today.age.${row.band}`)}</Tag> <strong>{fmtMMK(row.outstanding)}</strong></span></p>)}</div></Card>
          <Card><h2>{t('today.lowStock')}</h2><div data-testid="today-low-stock">{summary.lowStock.length === 0 ? <p className={styles.emptyLine}>{t('today.noLowStock')}</p> : summary.lowStock.map((row) => <p key={row.id}>{row.name}<Tag tone="low">{row.stockQty}</Tag></p>)}</div></Card>
        </div>
        <Card><div className={styles.row}><div className={styles.closeCopy}><h2>{t('shift.close')}</h2>{blocksClose ? <span>{t('shift.blockedSync')}</span> : null}</div><Button data-testid="shift-close" disabled={identity.role !== 'admin' || blocksClose} onClick={() => setCloseOpen(true)} pill variant="ghost">{t('shift.close')}</Button></div>{latestClose === undefined ? null : <p>{t('shift.expectedCash')}: {fmtMMK(latestClose.expectedCash)}</p>}</Card>
        <Card><h2>{t('today.recentSales')}</h2>{summary.currentDaySales.map((sale) => <div className={styles.saleRow} data-testid={`sale-history-row-${sale.id}`} key={sale.id}><span>{sale.no ?? sale.id}</span><strong>{fmtMMK(sale.total)}</strong><Button data-testid={`reprint-sale-${sale.id}`} onClick={() => { setReprint(sale); setReprintUrl(undefined); }} pill size="sm" variant="ghost">{t('today.reprint')}</Button></div>)}</Card>
      </div>
    </AppShell>
    <Modal closeLabel={t('modal.close')} onClose={() => setCloseOpen(false)} open={closeOpen} testId="shift-close-modal" title={t('shift.closeTitle')}><div className={styles.modal}><label><span>{t('shift.openingCash')}</span><Input data-testid="shift-opening" onChange={(event) => setOpeningCash(event.target.value)} type="number" value={openingCash} /></label><p>{t('shift.cashSales')}: <strong>{fmtMMK(summary.methodTotals.cash)}</strong></p><p>{t('shift.expectedCash')}: <strong>{fmtMMK(expected)}</strong></p><label><span>{t('shift.countedCash')}</span><Input data-testid="shift-counted" onChange={(event) => setCountedCash(event.target.value)} type="number" value={countedCash} /></label><p>{t('shift.difference')}: <strong className={differenceTone === 'negative' ? styles.negativeDifference : undefined}>{fmtMMK(difference)}</strong></p><Button data-testid="shift-confirm" disabled={blocksClose} onClick={() => { void confirmClose(); }}>{t('shift.close')}</Button></div></Modal>
    <Modal closeLabel={t('modal.close')} onClose={() => { setReprint(undefined); setReprintUrl(undefined); }} open={reprint !== undefined} title={t('today.reprint')}>{reprintUrl === undefined ? <Skeleton size="receipt" /> : <img alt={t('today.reprint')} className={styles.receipt} data-copy-mode="true" data-testid="reprint-receipt-canvas" src={reprintUrl} />}</Modal>
  </main>;
}

function receiptPalette(): ReceiptPalette { const styles = getComputedStyle(document.body); return { background: styles.getPropertyValue('--panel').trim(), ink: styles.getPropertyValue('--ink').trim(), brand: styles.getPropertyValue('--brand').trim(), muted: styles.getPropertyValue('--mut').trim(), line: styles.getPropertyValue('--line').trim() }; }
