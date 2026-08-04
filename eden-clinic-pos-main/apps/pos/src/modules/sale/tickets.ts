import type { ClinicDb } from '@/data/db';
import type { SaleDraft } from './types';

export type SaleTicket = {
  id: string;
  staffId: string;
  savedAt: string;
  draft: SaleDraft;
};

export function ticketMetaKey(ticketId: string): string {
  return `sale-ticket:${ticketId}`;
}

export async function saveTicket(db: ClinicDb, ticket: SaleTicket): Promise<void> {
  await db.meta.put({ key: ticketMetaKey(ticket.id), value: ticket });
}

export async function resumeTicket(db: ClinicDb, ticketId: string): Promise<SaleTicket> {
  const row = await db.meta.get(ticketMetaKey(ticketId));
  if (row === undefined || !isSaleTicket(row.value)) {
    throw new Error('The saved sale ticket is unavailable.');
  }

  await db.meta.delete(ticketMetaKey(ticketId));
  return row.value;
}

function isSaleTicket(value: unknown): value is SaleTicket {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string'
    && typeof candidate.staffId === 'string'
    && typeof candidate.savedAt === 'string'
    && candidate.draft !== null
    && typeof candidate.draft === 'object';
}
