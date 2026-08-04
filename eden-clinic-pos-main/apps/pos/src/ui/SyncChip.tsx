import { Check, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import styles from './SyncChip.module.css';

export type SyncState = 'synced' | 'syncing' | 'offline' | 'attention';
export type SyncChipProps = { state: SyncState; label: string; count?: number; progress?: number; onClick?(): void };

const icons = { synced: Check, syncing: RefreshCw, offline: CloudOff, attention: TriangleAlert };

export function SyncChip({ count, label, onClick, progress, state }: SyncChipProps) {
  const Icon = icons[state];
  const contents = (
    <>
      <Icon aria-hidden="true" className={state === 'syncing' ? styles.spinning : undefined} size={15} />
      <span>{label}</span>
      {typeof count === 'number' ? <strong>{count}</strong> : null}
      {typeof progress === 'number' ? <progress aria-label={label} max="100" value={progress} /> : null}
    </>
  );

  if (onClick === undefined) {
    return <span className={styles.chip} data-testid="sync-chip">{contents}</span>;
  }

  return <button className={styles.chip} data-testid="sync-chip" onClick={onClick} type="button">{contents}</button>;
}
