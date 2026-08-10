import type { ClinicDb } from '@/data/db';
import { downscaleToJpeg } from '@/data/photoBlob';
import type { PhotoSessionRow } from '@/data/types';
import { sortPhotoSessions } from './photoSelectors';

const MAX_DIMENSION = 1600;

export async function readPhotoSessions(db: ClinicDb, patientId: string): Promise<PhotoSessionRow[]> {
  const rows = await db.photoSessions.where('patientId').equals(patientId).toArray();
  return sortPhotoSessions(rows);
}

export async function putPhotoSession(db: ClinicDb, row: PhotoSessionRow): Promise<void> {
  await db.photoSessions.put(row);
}

export async function patchPhotoSession(db: ClinicDb, id: string, patch: Partial<Omit<PhotoSessionRow, 'id' | 'patientId'>>): Promise<void> {
  await db.photoSessions.update(id, patch);
}

export async function deletePhotoSession(db: ClinicDb, id: string): Promise<void> {
  await db.photoSessions.delete(id);
}

// Clinical frames keep their own generous bound: a before/after pair is
// evidence of a treatment result and is looked at closely, unlike a shelf
// thumbnail. The encoding itself is shared.
export async function preparePhotoBlob(file: Blob): Promise<Blob> {
  return downscaleToJpeg(file, MAX_DIMENSION);
}
