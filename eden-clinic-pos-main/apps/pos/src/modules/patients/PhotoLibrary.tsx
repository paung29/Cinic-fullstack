'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { Camera, Eye } from 'lucide-react';
import type { ClinicDb } from '@/data/db';
import type { PhotoGrade, PhotoSessionRow } from '@/data/types';
import { useT } from '@/i18n';
import { Button, Card, Input, Modal } from '@/ui';
import { PHOTO_GRADES, gradeLabelKey, newPhotoSession, photoSessionTitle } from './photoSelectors';
import { deletePhotoSession, patchPhotoSession, preparePhotoBlob, putPhotoSession, readPhotoSessions } from './photoStore';
import styles from './PhotoLibrary.module.css';

type PhotoSlot = 'before' | 'after';
type ViewerDraft = { title: string; note: string };

const SLOTS: readonly PhotoSlot[] = ['before', 'after'];

function urlKey(sessionId: string, slot: PhotoSlot): string {
  return `${sessionId}:${slot}`;
}

// Consistency model: IndexedDB is the single source of truth. Every write
// bumps `revision`, which restarts the load effect; the effect's cancel flag
// discards any read that a newer write has superseded, so state never applies
// a stale snapshot. Title and note edits live in a local draft while the
// viewer is open and are committed once, when the viewer closes.
export function PhotoLibrary({ db, patientId }: { db: ClinicDb; patientId: string }) {
  const { t } = useT();
  const [sessions, setSessions] = useState<PhotoSessionRow[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ViewerDraft>({ note: '', title: '' });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(0);

  // Blob object URLs are created only here, once per load, and revoked when the
  // load is superseded or the library unmounts.
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    void readPhotoSessions(db, patientId).then((rows) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const session of rows) {
        if (session.before !== null) {
          next[urlKey(session.id, 'before')] = URL.createObjectURL(session.before);
        }
        if (session.after !== null) {
          next[urlKey(session.id, 'after')] = URL.createObjectURL(session.after);
        }
      }
      created.push(...Object.values(next));
      setSessions(rows);
      setUrls(next);
    });
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [db, patientId, revision]);

  const viewer = viewerId === null ? undefined : sessions.find((session) => session.id === viewerId);

  const openViewer = (session: PhotoSessionRow) => {
    setDraft({ note: session.note, title: session.title });
    setViewerId(session.id);
  };

  // No toast here on purpose: the viewer opens immediately with the empty
  // before-frame prompting the next step, and app toasts persist until
  // dismissed, which would cover the viewer's footer actions.
  const addSession = async () => {
    const session = newPhotoSession(patientId, crypto.randomUUID(), new Date().toISOString().slice(0, 10));
    await putPhotoSession(db, session);
    setDraft({ note: '', title: '' });
    setViewerId(session.id);
    setRevision((current) => current + 1);
  };

  const commitAndClose = async () => {
    setViewerId(null);
    if (viewer !== undefined && (viewer.title !== draft.title || viewer.note !== draft.note)) {
      await patchPhotoSession(db, viewer.id, { note: draft.note, title: draft.title });
      setRevision((current) => current + 1);
    }
  };

  const setGrade = async (id: string, grade: PhotoGrade | null) => {
    await patchPhotoSession(db, id, { grade });
    setRevision((current) => current + 1);
  };

  const setPhoto = async (id: string, slot: PhotoSlot, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    const blob = await preparePhotoBlob(file);
    await patchPhotoSession(db, id, { [slot]: blob });
    setRevision((current) => current + 1);
  };

  const removeSession = async (id: string) => {
    setViewerId(null);
    await deletePhotoSession(db, id);
    setRevision((current) => current + 1);
  };

  return (
    <Card className={styles.library} data-testid="photo-library">
      <div className={styles.heading}>
        <div>
          <h2>{t('photo.library')}</h2>
          <p>{t('photo.hint')}</p>
        </div>
        <Button data-testid="photo-add-session" onClick={() => { void addSession(); }} pill size="sm">{t('photo.addSession')}</Button>
      </div>
      {sessions.length === 0 ? (
        <div className={styles.empty} data-testid="photo-empty">
          <Camera aria-hidden="true" size={38} />
          <strong>{t('photo.noPhotosTitle')}</strong>
          <p>{t('photo.noPhotosBody')}</p>
        </div>
      ) : (
        <div className={styles.sessions}>
          {sessions.map((session) => (
            <article className={styles.session} data-testid={`photo-session-row-${session.id}`} key={session.id}>
              <div className={styles.sessionHead}>
                <div>
                  <strong>{photoSessionTitle(session, t('photo.defaultTitle'))}</strong>
                  <span>{session.at}</span>
                </div>
                <span className={styles.gradePill} data-grade={session.grade ?? 'pending'} data-testid={`photo-session-grade-${session.id}`}>{t(gradeLabelKey(session.grade))}</span>
              </div>
              <button className={styles.sessionOpen} data-testid={`photo-session-open-${session.id}`} onClick={() => openViewer(session)} type="button">
                <Eye aria-hidden="true" size={17} />
                <span className={styles.sessionTags}>
                  <span className={styles.tagBefore}>{t('photo.before')}</span>
                  <span className={styles.tagAfter}>{t('photo.after')}</span>
                  <span className={styles.pairLabel}>{t('photo.framePair')}</span>
                </span>
                <span className={styles.viewLink}>{t('photo.viewPhotos')}</span>
              </button>
              {session.note === '' ? null : <p className={styles.sessionNote}>{session.note}</p>}
            </article>
          ))}
        </div>
      )}
      <Modal
        closeLabel={t('modal.close')}
        onClose={() => { void commitAndClose(); }}
        open={viewer !== undefined}
        size="lg"
        testId="photo-viewer"
        title={viewer === undefined ? t('photo.defaultTitle') : photoSessionTitle(viewer, t('photo.defaultTitle'))}
      >
        {viewer === undefined ? null : (
          <div className={styles.viewer}>
            <p className={styles.viewerMeta}>{viewer.at} · {t(gradeLabelKey(viewer.grade))}</p>
            <div className={styles.frames}>
              {SLOTS.map((slot) => {
                const url = urls[urlKey(viewer.id, slot)];
                return (
                  <label className={styles.frame} data-testid={`photo-frame-${slot}`} key={slot}>
                    <span className={slot === 'before' ? styles.tagBefore : styles.tagAfter}>{t(slot === 'before' ? 'photo.before' : 'photo.after')}</span>
                    <span className={styles.frameBody}>
                      {url === undefined ? (
                        <span className={styles.framePlaceholder}>
                          <Camera aria-hidden="true" size={30} />
                          {t(slot === 'before' ? 'photo.dropBefore' : 'photo.dropAfter')}
                        </span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- object URLs from IndexedDB blobs cannot go through next/image.
                        <img alt={t(slot === 'before' ? 'photo.before' : 'photo.after')} className={styles.frameImage} src={url} />
                      )}
                    </span>
                    <input
                      accept="image/*"
                      aria-label={t(slot === 'before' ? 'photo.dropBefore' : 'photo.dropAfter')}
                      className={styles.frameInput}
                      data-testid={`photo-input-${slot}`}
                      onChange={(event) => { void setPhoto(viewer.id, slot, event); }}
                      type="file"
                    />
                  </label>
                );
              })}
            </div>
            <div className={styles.gradeRow}>
              <span className={styles.gradeCaption}>{t('photo.improvement')}</span>
              {PHOTO_GRADES.map((grade) => (
                <button
                  className={styles.gradeChip}
                  data-active={viewer.grade === grade ? 'true' : 'false'}
                  data-grade={grade}
                  data-testid={`photo-grade-${grade}`}
                  key={grade}
                  onClick={() => { void setGrade(viewer.id, viewer.grade === grade ? null : grade); }}
                  type="button"
                >
                  {t(gradeLabelKey(grade))}
                </button>
              ))}
            </div>
            <Input
              aria-label={t('photo.title')}
              data-testid="photo-title"
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder={t('photo.title')}
              value={draft.title}
            />
            <Input
              aria-label={t('photo.note')}
              data-testid="photo-note"
              onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
              placeholder={t('photo.note')}
              value={draft.note}
            />
            <div className={styles.viewerActions}>
              <Button className={styles.removeButton} data-testid="photo-remove-session" onClick={() => { void removeSession(viewer.id); }} size="sm" variant="ghost">{t('photo.removeSession')}</Button>
              <Button data-testid="photo-viewer-done" onClick={() => { void commitAndClose(); }} pill size="sm">{t('photo.done')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
