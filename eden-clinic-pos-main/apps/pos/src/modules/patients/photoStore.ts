import type { ClinicDb } from '@/data/db';
import type { PhotoSessionRow } from '@/data/types';
import { sortPhotoSessions } from './photoSelectors';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

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

// Tablet cameras produce multi-megabyte captures; IndexedDB holds every photo
// on the device, so frames are re-encoded to a bounded JPEG before storage.
// Any decode/encode failure falls back to storing the original file untouched.
export async function preparePhotoBlob(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) return file;
      context.drawImage(bitmap, 0, 0, width, height);
      const encoded = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
      });
      return encoded ?? file;
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
