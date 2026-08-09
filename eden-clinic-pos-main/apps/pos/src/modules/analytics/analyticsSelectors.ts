import type { ProductRow, SaleRow } from '@/data/types';

export type AnalyticsRange = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type RevenuePoint = {
  key: string;
  revenue: number;
  cost: number;
};

export type ExpenseCategory = 'rent' | 'utilities' | 'supplies' | 'marketing' | 'equipment' | 'other';

export type ExpenseEntry = {
  id: string;
  label: string;
  cat: ExpenseCategory;
  amount: number;
  date: string;
};

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = ['rent', 'utilities', 'supplies', 'marketing', 'equipment', 'other'];

export const RANGE_BUCKETS: Record<AnalyticsRange, number> = { daily: 14, weekly: 12, monthly: 12, yearly: 4 };

// Payroll is a monthly figure; each range window covers this many months.
export const RANGE_MONTHS: Record<AnalyticsRange, number> = { daily: 14 / 30, weekly: 84 / 30, monthly: 12, yearly: 48 };

export function localDayIso(at: string | Date): string {
  const date = at instanceof Date ? at : new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function bucketKey(dayIso: string, range: AnalyticsRange): string {
  if (range === 'daily') return dayIso;
  if (range === 'monthly') return dayIso.slice(0, 7);
  if (range === 'yearly') return dayIso.slice(0, 4);
  const date = new Date(`${dayIso}T00:00:00`);
  const monday = new Date(date);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localDayIso(monday);
}

function shiftBucket(key: string, range: AnalyticsRange, back: number): string {
  if (range === 'yearly') return String(Number(key) - back);
  if (range === 'monthly') {
    const [year, month] = key.split('-').map(Number);
    const date = new Date(year ?? 1970, (month ?? 1) - 1 - back, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() - back * (range === 'weekly' ? 7 : 1));
  return localDayIso(date);
}

export function bucketKeys(nowDayIso: string, range: AnalyticsRange): string[] {
  const head = bucketKey(nowDayIso, range);
  const count = RANGE_BUCKETS[range];
  const keys: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) keys.push(shiftBucket(head, range, back));
  return keys;
}

export function saleCost(sale: SaleRow, products: ReadonlyMap<string, ProductRow>): number {
  return sale.lines.reduce((total, line) => {
    if (line.kind !== 'product') return total;
    const product = products.get(line.itemId);
    return product === undefined ? total : total + product.cost * line.qty;
  }, 0);
}

export function revenueSeries(sales: readonly SaleRow[], products: readonly ProductRow[], range: AnalyticsRange, nowDayIso: string): RevenuePoint[] {
  const productMap = new Map(products.map((product) => [product.id, product]));
  const keys = bucketKeys(nowDayIso, range);
  const buckets = new Map<string, RevenuePoint>(keys.map((key) => [key, { key, revenue: 0, cost: 0 }]));
  for (const sale of sales) {
    if (sale.status === 'voided') continue;
    const bucket = buckets.get(bucketKey(localDayIso(sale.at), range));
    if (bucket === undefined) continue;
    bucket.revenue += sale.total;
    bucket.cost += saleCost(sale, productMap);
  }
  return keys.map((key) => buckets.get(key) as RevenuePoint);
}

export function windowStartIso(nowDayIso: string, range: AnalyticsRange): string {
  return bucketKeys(nowDayIso, range)[0] ?? nowDayIso;
}

export function expensesInWindow(expenses: readonly ExpenseEntry[], range: AnalyticsRange, nowDayIso: string): ExpenseEntry[] {
  const start = windowStartIso(nowDayIso, range);
  const startDay = start.length === 4 ? `${start}-01-01` : start.length === 7 ? `${start}-01` : start;
  return expenses.filter((entry) => entry.date >= startDay && entry.date <= nowDayIso);
}

export function expensesForMonth(expenses: readonly ExpenseEntry[], monthIso: string): ExpenseEntry[] {
  return expenses.filter((entry) => entry.date.slice(0, 7) === monthIso);
}

export function sumAmounts(entries: readonly { amount: number }[]): number {
  return entries.reduce((total, entry) => total + entry.amount, 0);
}

export function abbreviateKs(amount: number): string {
  const thousands = Math.round((amount || 0) / 1000);
  if (thousands >= 1000) return `${(thousands / 1000).toFixed(thousands >= 100000 ? 0 : 1)}M Ks`;
  return `${thousands}k Ks`;
}

export function isExpenseEntry(value: unknown): value is ExpenseEntry {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string'
    && typeof candidate.label === 'string'
    && typeof candidate.cat === 'string'
    && (EXPENSE_CATEGORIES as readonly string[]).includes(candidate.cat)
    && typeof candidate.amount === 'number'
    && typeof candidate.date === 'string';
}

export function isPayrollMap(value: unknown): value is Record<string, number> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((entry) => typeof entry === 'number');
}
