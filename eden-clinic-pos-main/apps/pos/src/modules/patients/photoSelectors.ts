import type { PhotoGrade, PhotoSessionRow } from '@/data/types';
import type { TranslationKey } from '@/i18n';

export const PHOTO_GRADES: readonly PhotoGrade[] = ['none', 'slight', 'moderate', 'marked'];

const GRADE_KEYS: Record<PhotoGrade, TranslationKey> = {
  none: 'photo.grNone',
  slight: 'photo.grSlight',
  moderate: 'photo.grModerate',
  marked: 'photo.grMarked',
};

export function isPhotoGrade(value: unknown): value is PhotoGrade {
  return typeof value === 'string' && (PHOTO_GRADES as readonly string[]).includes(value);
}

export function gradeLabelKey(grade: PhotoGrade | null): TranslationKey {
  return grade === null ? 'photo.grPending' : GRADE_KEYS[grade];
}

export function sortPhotoSessions(rows: readonly PhotoSessionRow[]): PhotoSessionRow[] {
  return [...rows].sort((a, b) => (a.at === b.at ? b.id.localeCompare(a.id) : b.at.localeCompare(a.at)));
}

export function photoSessionTitle(row: PhotoSessionRow, fallback: string): string {
  const title = row.title.trim();
  return title === '' ? fallback : title;
}

export function newPhotoSession(patientId: string, id: string, dayIso: string): PhotoSessionRow {
  return { after: null, at: dayIso, before: null, grade: null, id, note: '', patientId, title: '' };
}
