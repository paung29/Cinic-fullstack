import { authEnvelopeMetaKey, type ClinicDb } from '@/data/db';

export type EnvelopeAuditEntry = {
  id: string;
  at: string;
  action: 'manual-removal' | 'server-offboarding';
  targetStaffId: string;
  actorStaffId: string | null;
};

export class LastAdminEnvelopeError extends Error {
  constructor() {
    super('The final active admin envelope cannot be removed locally.');
    this.name = 'LastAdminEnvelopeError';
  }
}

export function envelopeAuditMetaKey(id: string): string {
  return `envelope-audit:${id}`;
}

export async function offlineApprovalsState(db: ClinicDb): Promise<{ hasAdminEnvelope: boolean }> {
  const activeAdmins = await db.staff.filter((staff) => staff.active && staff.role === 'admin').toArray();
  const envelopes = await Promise.all(activeAdmins.map((staff) => db.meta.get(authEnvelopeMetaKey(staff.id))));
  return { hasAdminEnvelope: envelopes.some((envelope) => envelope !== undefined) };
}

export async function removeLocalEnvelope(
  db: ClinicDb,
  input: { targetStaffId: string; actorStaffId: string; now: number },
): Promise<void> {
  await db.transaction('rw', db.meta, db.staff, async () => {
    const target = await db.staff.get(input.targetStaffId);
    const targetEnvelope = await db.meta.get(authEnvelopeMetaKey(input.targetStaffId));
    if (target?.active === true && target.role === 'admin' && targetEnvelope !== undefined) {
      const activeAdmins = await db.staff.filter((staff) => staff.active && staff.role === 'admin').toArray();
      const envelopes = await Promise.all(activeAdmins.map((staff) => db.meta.get(authEnvelopeMetaKey(staff.id))));
      if (envelopes.filter((envelope) => envelope !== undefined).length <= 1) {
        throw new LastAdminEnvelopeError();
      }
    }

    await db.meta.delete(authEnvelopeMetaKey(input.targetStaffId));
    await writeAudit(db, {
      action: 'manual-removal',
      targetStaffId: input.targetStaffId,
      actorStaffId: input.actorStaffId,
      now: input.now,
    });
  });
}

export async function purgeOffboardedEnvelope(
  db: Pick<ClinicDb, 'meta'>,
  input: { targetStaffId: string; now: number },
): Promise<void> {
  await db.meta.delete(authEnvelopeMetaKey(input.targetStaffId));
  await writeAudit(db, {
    action: 'server-offboarding',
    targetStaffId: input.targetStaffId,
    actorStaffId: null,
    now: input.now,
  });
}

async function writeAudit(
  db: Pick<ClinicDb, 'meta'>,
  input: { action: EnvelopeAuditEntry['action']; targetStaffId: string; actorStaffId: string | null; now: number },
): Promise<void> {
  const entry: EnvelopeAuditEntry = {
    id: crypto.randomUUID(),
    at: new Date(input.now).toISOString(),
    action: input.action,
    targetStaffId: input.targetStaffId,
    actorStaffId: input.actorStaffId,
  };
  await db.meta.put({ key: envelopeAuditMetaKey(entry.id), value: entry });
}
