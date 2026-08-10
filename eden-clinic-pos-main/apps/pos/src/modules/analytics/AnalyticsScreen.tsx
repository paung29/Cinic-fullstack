'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { useClinicRuntimeStatus, type ClinicRuntime } from '@/app/providers';
import { elevationFailureKey } from '@/data/elevationErrors';
import { useClinicBranding } from '@/data/useClinicBranding';
import { fmtMMK } from '@/data/money';
import type { ProductRow, SaleRow, StaffRow } from '@/data/types';
import { useT } from '@/i18n';
import { AppShell, Button, Field, Input, Modal, Select, Skeleton, Tag, useToast } from '@/ui';
import {
  EXPENSE_CATEGORIES,
  abbreviateKs,
  activeMonthsInWindow,
  expensesForMonth,
  expensesInWindow,
  localDayIso,
  revenueSeries,
  sumAmounts,
  type AnalyticsRange,
  type ExpenseCategory,
  type ExpenseEntry,
} from './analyticsSelectors';
import { readExpenses, readPayroll, writeExpenses, writePayroll } from './analyticsStore';
import styles from './AnalyticsScreen.module.css';

type AnalyticsTab = 'overview' | 'payroll' | 'expenses';

const CHART_W = 720;
const CHART_H = 170;
const BAR_TOP = 24;
const BAR_BOTTOM = 146;

export function AnalyticsScreen() {
  const { runtime } = useClinicRuntimeStatus();
  if (runtime === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;
  return <ActiveAnalyticsScreen runtime={runtime} />;
}

function ActiveAnalyticsScreen({ runtime }: { runtime: ClinicRuntime }) {
  const router = useRouter();
  const { locale, t } = useT();
  const { enqueue } = useToast();
  const { revision } = useClinicRuntimeStatus();
  const branding = useClinicBranding(runtime, { brand: t('brand.name'), location: t('brand.location') });
  const [unlocked, setUnlocked] = useState(runtime.elevation.state().kind === 'active');
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState<AnalyticsTab>('overview');
  const [range, setRange] = useState<AnalyticsRange>('daily');
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [payroll, setPayroll] = useState<Record<string, number>>({});
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseLabel, setExpenseLabel] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCat, setExpenseCat] = useState<ExpenseCategory>('rent');
  const session = runtime.session.state();
  const identity = session.kind === 'active' || session.kind === 'auth-required' ? session.identity : undefined;

  useEffect(() => {
    if (identity === undefined) router.replace('/login');
  }, [identity, router]);

  const refreshLocal = async () => {
    const [nextSales, nextProducts, nextStaff, nextPayroll, nextExpenses] = await Promise.all([
      runtime.db.sales.toArray(),
      runtime.db.products.toArray(),
      runtime.db.staff.toArray(),
      readPayroll(runtime.db),
      readExpenses(runtime.db),
    ]);
    setSales(nextSales);
    setProducts(nextProducts);
    setStaff(nextStaff.filter((member) => member.active));
    setPayroll(nextPayroll);
    setExpenses(nextExpenses);
  };

  // Reactive local tables refresh after bootstrap, capture, and sync completion.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = window.setTimeout(() => { void refreshLocal(); }, 0); return () => window.clearTimeout(timer); }, [revision, runtime]);

  if (identity === undefined) return <main className={styles.loading}><Skeleton size="loading" /></main>;

  const submitUnlock = async () => {
    try {
      await runtime.elevation.elevate(password, 'analytics');
      setUnlocked(runtime.elevation.state().kind === 'active');
      setUnlockOpen(false);
      setPassword('');
    } catch (error) {
      setPassword('');
      enqueue(elevationFailureKey(error, t));
    }
  };

  const saveSalary = (staffId: string, value: string) => {
    const amount = Number(value.replace(/\D/g, '')) || 0;
    const next = { ...payroll, [staffId]: amount };
    setPayroll(next);
    void writePayroll(runtime.db, next);
  };

  const saveExpense = async () => {
    const amount = Number(expenseAmount) || 0;
    if (expenseLabel.trim() === '' || amount <= 0) return;
    const entry: ExpenseEntry = { id: crypto.randomUUID(), label: expenseLabel.trim(), cat: expenseCat, amount, date: localDayIso(new Date()) };
    const next = [entry, ...expenses];
    setExpenses(next);
    await writeExpenses(runtime.db, next);
    setExpenseOpen(false);
    setExpenseLabel('');
    setExpenseAmount('');
  };

  const removeExpense = async (id: string) => {
    const next = expenses.filter((entry) => entry.id !== id);
    setExpenses(next);
    await writeExpenses(runtime.db, next);
  };

  const nowDay = localDayIso(new Date());
  const series = revenueSeries(sales, products, range, nowDay);
  const revenue = series.reduce((total, point) => total + point.revenue, 0);
  const cogs = series.reduce((total, point) => total + point.cost, 0);
  const payrollMonthly = staff.reduce((total, member) => total + (payroll[member.id] ?? 0), 0);
  const payrollWindow = Math.round(payrollMonthly * activeMonthsInWindow(sales, range, nowDay));
  const expensesWindow = sumAmounts(expensesInWindow(expenses, range, nowDay));
  const net = revenue - cogs - payrollWindow - expensesWindow;
  const monthExpenses = expensesForMonth(expenses, nowDay.slice(0, 7));
  const busyBuckets = series.filter((point) => point.revenue > 0).length || 1;
  const maxRevenue = Math.max(1, ...series.map((point) => point.revenue));
  const barGap = 8;
  const barWidth = (CHART_W - barGap * (series.length + 1)) / Math.max(1, series.length);
  const rangeLabels: Record<AnalyticsRange, string> = {
    daily: t('analytics.range.daily'), weekly: t('analytics.range.weekly'), monthly: t('analytics.range.monthly'), yearly: t('analytics.range.yearly'),
  };
  const avgLabels: Record<AnalyticsRange, string> = {
    daily: t('analytics.avg.daily'), weekly: t('analytics.avg.weekly'), monthly: t('analytics.avg.monthly'), yearly: t('analytics.avg.yearly'),
  };
  const catLabels: Record<ExpenseCategory, string> = {
    rent: t('analytics.cat.rent'), utilities: t('analytics.cat.utilities'), supplies: t('analytics.cat.supplies'),
    marketing: t('analytics.cat.marketing'), equipment: t('analytics.cat.equipment'), other: t('analytics.cat.other'),
  };
  const chartLabel = (key: string): string => {
    if (range === 'monthly') return new Date(`${key}-01T00:00:00`).toLocaleDateString(locale === 'zh' ? 'zh-Hans' : locale, { month: 'short' });
    if (range === 'yearly') return key;
    return new Date(`${key}T00:00:00`).toLocaleDateString(locale === 'zh' ? 'zh-Hans' : locale, { day: 'numeric', month: 'short' });
  };
  const route = (id: string) => id === 'today' ? '/' : id === 'calendar' ? '/calendar' : id === 'clients' ? '/clients' : id === 'sale' ? '/sale' : id === 'stocks' ? '/stocks' : id === 'setup' ? '/setup' : '/analytics';

  return <main className={styles.root} data-locale={locale} data-testid="analytics-root" lang={locale === 'zh' ? 'zh-Hans' : locale}>
    <AppShell activeTab="analytics" brand={branding.brand} location={branding.location} logoutLabel={t('shell.logout')} switchUserLabel={t('shell.switchUser')} onSwitchUser={() => { runtime.session.switchUser(); router.push('/login'); }} storageAttention={runtime.storageDiagnostics.state().kind === 'granted' ? undefined : t('shell.storageTag')} onLogout={() => { void runtime.outbox.status().then((next) => { if (next.pendingCount > 0 || next.attentionCount > 0) enqueue(t('auth.logout.blocked')); else { void runtime.session.logout(); router.push('/login'); } }); }} onTabChange={(id) => router.push(route(id))} sync={{ label: t('sync.synced'), state: 'synced', count: 0, onClick: () => { void runtime.refreshSync().then(refreshLocal); } }} tabs={[{ id: 'today', label: t('shell.tab.today') }, { id: 'calendar', label: t('shell.tab.calendar') }, { id: 'clients', label: t('shell.tab.clients') }, { id: 'sale', label: t('shell.tab.sale') }, { id: 'stocks', label: t('shell.tab.stocks') }, { id: 'analytics', label: t('shell.tab.analytics') }, { id: 'setup', label: t('shell.tab.setup') }]} userName={identity.name} userRole={identity.role === 'admin' ? t('auth.role.admin') : t('auth.role.staff')}>
      <div className={styles.content}>
        {unlocked ? null : <section className={styles.lockedCard} data-testid="analytics-locked">
          <Lock aria-hidden="true" size={34} />
          <strong>{t('analytics.locked')}</strong>
          <p>{t('analytics.lockedBody')}</p>
          <Button data-testid="analytics-unlock" onClick={() => setUnlockOpen(true)} pill>{t('analytics.unlock')}</Button>
        </section>}

        {unlocked ? <>
          <header className={styles.toolbar}>
            <h1>{t('shell.tab.analytics')}</h1>
            <div className={styles.tabRow}>
              {(['overview', 'payroll', 'expenses'] as const).map((id) => <Button aria-pressed={tab === id} className={tab === id ? styles.tabChipActive : undefined} data-testid={`analytics-tab-${id}`} key={id} onClick={() => setTab(id)} pill size="sm" variant="ghost">{t(`analytics.tab.${id}`)}</Button>)}
            </div>
          </header>

          {tab === 'overview' ? <>
            <section className={styles.kpis}>
              <div className={styles.kpi}><span>{t('analytics.revenue')}</span><strong data-testid="analytics-kpi-revenue">{fmtMMK(revenue)}</strong></div>
              <div className={styles.kpi}><span>{t('analytics.costOfGoods')}</span><strong>{fmtMMK(cogs)}</strong></div>
              <div className={styles.kpi}><span>{t('analytics.tab.payroll')}</span><strong>{fmtMMK(payrollWindow)}</strong></div>
              <div className={styles.kpi}><span>{t('analytics.tab.expenses')}</span><strong>{fmtMMK(expensesWindow)}</strong></div>
              <div className={styles.kpi}><span>{t('analytics.netProfit')}</span><strong className={net >= 0 ? styles.netUp : styles.netDown} data-testid="analytics-kpi-net">{fmtMMK(net)}</strong></div>
            </section>

            <section className={styles.chartCard}>
              <div className={styles.chartHead}>
                <div className={styles.chartTitle}><h2>{t('analytics.revenue')}</h2><p>{t('analytics.profitLine')}</p></div>
                <div className={styles.tabRow}>
                  {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((id) => <Button aria-pressed={range === id} className={range === id ? styles.rangeChipActive : undefined} data-testid={`analytics-range-${id}`} key={id} onClick={() => setRange(id)} pill size="sm" variant="ghost">{rangeLabels[id]}</Button>)}
                </div>
              </div>
              <div className={styles.chartScroll}>
                <svg aria-hidden="true" className={styles.chart} data-testid="analytics-chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
                  {series.map((point, index) => {
                    const x = barGap + index * (barWidth + barGap);
                    const height = point.revenue > 0 ? Math.max(6, Math.round((point.revenue / maxRevenue) * (BAR_BOTTOM - BAR_TOP))) : 2;
                    const y = BAR_BOTTOM - height;
                    const costHeight = point.revenue > 0 ? Math.round((point.cost / point.revenue) * height) : 0;
                    return <g key={point.key}>
                      <title>{`${chartLabel(point.key)} · ${fmtMMK(point.revenue)}`}</title>
                      <rect className={point.revenue > 0 ? styles.barRev : styles.barEmpty} height={height} rx={4} width={barWidth} x={x} y={y} />
                      {costHeight > 0 ? <rect className={styles.barCost} height={costHeight} rx={2} width={barWidth} x={x} y={BAR_BOTTOM - costHeight} /> : null}
                      {point.revenue > 0 ? <text className={styles.barValue} textAnchor="middle" x={x + barWidth / 2} y={y - 6}>{abbreviateKs(point.revenue).replace(' Ks', '')}</text> : null}
                      <text className={styles.barLabel} textAnchor="middle" x={x + barWidth / 2} y={CHART_H - 8}>{chartLabel(point.key)}</text>
                    </g>;
                  })}
                </svg>
              </div>
              <div className={styles.chartTotals}>
                <div><span>{t('analytics.total')} ({rangeLabels[range].toLowerCase()})</span><strong data-testid="analytics-total">{abbreviateKs(revenue)}</strong></div>
                <div><span>{avgLabels[range]}</span><strong>{abbreviateKs(revenue / busyBuckets)}</strong></div>
              </div>
              <div className={styles.legend}>
                <span className={styles.legendItem}><span className={styles.swatchRev} />{t('analytics.grossProfit')}</span>
                <span className={styles.legendItem}><span className={styles.swatchCost} />{t('analytics.costOfGoods')}</span>
                <span className={styles.legendSpacer} />
                <span>{t('analytics.margin')}</span>
                <strong data-testid="analytics-margin">{revenue > 0 ? `${Math.round(((revenue - cogs) / revenue) * 100)}%` : '—'}</strong>
              </div>
            </section>
          </> : null}

          {tab === 'payroll' ? <section className={styles.panelCard}>
            <div className={styles.panelHead}><h2>{t('analytics.tab.payroll')}</h2><p>{t('analytics.payrollHint')}</p></div>
            <div className={styles.rows}>
              {staff.map((member) => <div className={styles.row} key={member.id}>
                <span aria-hidden="true" className={styles.avatar}>{member.name.replace('Dr. ', '').split(' ').filter((part) => part !== '').slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')}</span>
                <span className={styles.rowNames}><strong>{member.name}</strong><small>{member.role === 'admin' ? t('auth.role.admin') : t('auth.role.staff')}</small></span>
                <label className={styles.salaryField}>
                  <span>{t('analytics.salary')}</span>
                  <Input data-testid={`payroll-input-${member.id}`} inputMode="numeric" onChange={(event) => saveSalary(member.id, event.target.value)} value={String(payroll[member.id] ?? 0)} />
                </label>
              </div>)}
            </div>
            <div className={styles.panelTotal}><span>{t('analytics.totalPayroll')}</span><strong data-testid="payroll-total">{fmtMMK(payrollMonthly)}</strong></div>
          </section> : null}

          {tab === 'expenses' ? <section className={styles.panelCard}>
            <div className={styles.panelHeadRow}>
              <div className={styles.panelHead}><h2>{t('analytics.tab.expenses')}</h2><p>{t('analytics.expensesHint')}</p></div>
              <Button data-testid="expense-add-open" onClick={() => setExpenseOpen(true)} pill>{t('analytics.addExpense')}</Button>
            </div>
            {expenses.length === 0 ? <p className={styles.emptyLine}>{t('analytics.expensesHint')}</p> : <div className={styles.rows}>
              {expenses.map((entry) => <div className={styles.row} data-testid={`expense-row-${entry.id}`} key={entry.id}>
                <span className={styles.rowNames}><strong>{entry.label}</strong><small>{entry.date}</small></span>
                <Tag tone="blue">{catLabels[entry.cat]}</Tag>
                <strong className={styles.rowAmount}>{fmtMMK(entry.amount)}</strong>
                <Button aria-label={t('analytics.removeExpense')} data-testid={`expense-remove-${entry.id}`} onClick={() => { void removeExpense(entry.id); }} size="sm" variant="ghost">✕</Button>
              </div>)}
            </div>}
            {monthExpenses.length === 0 ? null : <div className={styles.splitRows}>
              {EXPENSE_CATEGORIES.map((cat) => {
                const sum = sumAmounts(monthExpenses.filter((entry) => entry.cat === cat));
                if (sum === 0) return null;
                const total = sumAmounts(monthExpenses) || 1;
                return <div className={styles.splitRow} key={cat}>
                  <span className={styles.splitLabel}>{catLabels[cat]}</span>
                  <svg aria-hidden="true" className={styles.splitTrack} preserveAspectRatio="none" viewBox="0 0 100 8">
                    <rect className={styles.splitTrackBg} height={8} rx={4} width={100} x={0} y={0} />
                    <rect className={styles.splitTrackFill} height={8} rx={4} width={Math.max(2, Math.round((sum / total) * 100))} x={0} y={0} />
                  </svg>
                  <strong className={styles.splitAmount}>{fmtMMK(sum)}</strong>
                </div>;
              })}
            </div>}
            <div className={styles.panelTotal}><span>{t('analytics.thisMonth')}</span><strong data-testid="expenses-total">{fmtMMK(sumAmounts(monthExpenses))}</strong></div>
          </section> : null}
        </> : null}
      </div>
    </AppShell>

    <Modal closeLabel={t('modal.close')} onClose={() => { setUnlockOpen(false); setPassword(''); }} open={unlockOpen} testId="analytics-elevation" title={t('setup.elevate')}>
      <div className={styles.modalForm}>
        <label><span>{t('setup.password')}</span><Input data-testid="analytics-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label>
        <Button data-testid="analytics-unlock-submit" disabled={password === ''} onClick={() => { void submitUnlock(); }}>{t('analytics.unlock')}</Button>
      </div>
    </Modal>
    <Modal closeLabel={t('modal.close')} onClose={() => setExpenseOpen(false)} open={expenseOpen} testId="expense-modal" title={t('analytics.addExpense')}>
      <div className={styles.modalForm}>
        <Field htmlFor="expense-label" label={t('analytics.expenseLabel')}><Input data-testid="expense-label" id="expense-label" onChange={(event) => setExpenseLabel(event.target.value)} value={expenseLabel} /></Field>
        <Field htmlFor="expense-amount" label={t('analytics.amount')}><Input data-testid="expense-amount" id="expense-amount" min="0" onChange={(event) => setExpenseAmount(event.target.value)} type="number" value={expenseAmount} /></Field>
        <Field htmlFor="expense-cat" label={t('service.category')}><Select data-testid="expense-cat" id="expense-cat" onChange={(event) => setExpenseCat(event.target.value as ExpenseCategory)} value={expenseCat}>{EXPENSE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{catLabels[cat]}</option>)}</Select></Field>
        <Button data-testid="expense-save" disabled={expenseLabel.trim() === '' || (Number(expenseAmount) || 0) <= 0} onClick={() => { void saveExpense(); }}>{t('analytics.addExpense')}</Button>
      </div>
    </Modal>
  </main>;
}
