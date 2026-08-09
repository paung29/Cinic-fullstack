import type { ClinicDb } from '@/data/db';
import { isExpenseEntry, isPayrollMap, type ExpenseEntry } from './analyticsSelectors';

const PAYROLL_KEY = 'analytics:payroll';
const EXPENSES_KEY = 'analytics:expenses';

export async function readPayroll(db: ClinicDb): Promise<Record<string, number>> {
  const row = await db.meta.get(PAYROLL_KEY);
  return row !== undefined && isPayrollMap(row.value) ? row.value : {};
}

export async function writePayroll(db: ClinicDb, payroll: Record<string, number>): Promise<void> {
  await db.meta.put({ key: PAYROLL_KEY, value: payroll });
}

export async function readExpenses(db: ClinicDb): Promise<ExpenseEntry[]> {
  const row = await db.meta.get(EXPENSES_KEY);
  if (row === undefined || !Array.isArray(row.value)) return [];
  return row.value.filter(isExpenseEntry);
}

export async function writeExpenses(db: ClinicDb, expenses: ExpenseEntry[]): Promise<void> {
  await db.meta.put({ key: EXPENSES_KEY, value: expenses });
}
