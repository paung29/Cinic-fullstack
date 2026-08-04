import { paymentMethodTotals, patientOutstanding, type MethodTotals } from '@/data/money';
import type { OutboxStatusView } from '@/data/outbox';
import type { PatientRow, ProductRow, SaleRow, StaffRow } from '@/data/types';

export type BusinessDayWindow = {
  day: string;
  startMs: number;
  endMs: number;
};

export type DebtorAgingBand = '0-7' | '8-30' | '31-60' | '61+';

export type TodayDebtor = {
  patient: PatientRow;
  outstanding: number;
  oldestCreditAt: string;
  daysOutstanding: number;
  band: DebtorAgingBand;
};

export type TodayStaffTotal = {
  staffId: string;
  name: string;
  total: number;
};

export type TodaySummaryInput = {
  now: number;
  sales: readonly SaleRow[];
  patients: readonly PatientRow[];
  products: readonly ProductRow[];
  staff: readonly StaffRow[];
  outbox: OutboxStatusView;
};

export type TodaySummary = {
  window: BusinessDayWindow;
  currentDaySales: SaleRow[];
  methodTotals: MethodTotals;
  staffBreakdown: TodayStaffTotal[];
  needsReviewCount: number;
  pendingCount: number;
  attentionCount: number;
  debtors: TodayDebtor[];
  lowStock: ProductRow[];
};

export function businessDayWindow(now: number): BusinessDayWindow {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    day: localDay(start),
    startMs: start.getTime(),
    endMs: end.getTime(),
  };
}

export function summarizeToday(input: TodaySummaryInput): TodaySummary {
  const window = businessDayWindow(input.now);
  const currentDaySales = input.sales
    .filter((sale) => sale.status === 'completed' && isInWindow(sale.at, window))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
  const staffById = new Map(input.staff.map((member) => [member.id, member]));
  const totalsByStaff = new Map<string, number>();

  for (const sale of currentDaySales) {
    totalsByStaff.set(sale.staffId, (totalsByStaff.get(sale.staffId) ?? 0) + sale.total);
  }

  return {
    window,
    currentDaySales,
    methodTotals: paymentMethodTotals(currentDaySales),
    staffBreakdown: [...totalsByStaff.entries()]
      .map(([staffId, total]) => ({ staffId, name: staffById.get(staffId)?.name ?? staffId, total }))
      .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name)),
    needsReviewCount: currentDaySales.filter((sale) => sale.needsReview).length,
    pendingCount: input.outbox.pendingCount,
    attentionCount: input.outbox.attentionCount,
    debtors: summarizeDebtors(input.sales, input.patients, input.now),
    lowStock: input.products.filter((product) => product.active && product.stockQty <= product.lowStockAt),
  };
}

function summarizeDebtors(sales: readonly SaleRow[], patients: readonly PatientRow[], now: number): TodayDebtor[] {
  const patientsById = new Map(patients.map((patient) => [patient.id, patient]));
  const salesByPatient = new Map<string, SaleRow[]>();

  for (const sale of sales) {
    if (sale.status !== 'completed' || sale.patientId === null || sale.credit <= 0) continue;
    const rows = salesByPatient.get(sale.patientId) ?? [];
    rows.push(sale);
    salesByPatient.set(sale.patientId, rows);
  }

  return [...salesByPatient.entries()]
    .flatMap(([patientId, patientSales]) => {
      const patient = patientsById.get(patientId);
      const outstanding = patientOutstanding(patientSales);
      const oldest = patientSales.reduce((earliest, sale) => Date.parse(sale.at) < Date.parse(earliest.at) ? sale : earliest);
      if (patient === undefined || outstanding <= 0) return [];
      const daysOutstanding = Math.floor((now - Date.parse(oldest.at)) / (24 * 60 * 60 * 1_000));
      return [{
        patient,
        outstanding,
        oldestCreditAt: oldest.at,
        daysOutstanding,
        band: agingBand(daysOutstanding),
      }];
    })
    .sort((left, right) => right.outstanding - left.outstanding || left.patient.name.localeCompare(right.patient.name));
}

function isInWindow(at: string, window: BusinessDayWindow): boolean {
  const value = Date.parse(at);
  return value >= window.startMs && value < window.endMs;
}

function agingBand(days: number): DebtorAgingBand {
  if (days <= 7) return '0-7';
  if (days <= 30) return '8-30';
  if (days <= 60) return '31-60';
  return '61+';
}

function localDay(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
