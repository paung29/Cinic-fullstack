import type { HTMLAttributes } from 'react';
import styles from './StatTile.module.css';

export type StatTileProps = HTMLAttributes<HTMLElement> & {
  label: string;
  value: string;
  valueTone?: 'default' | 'ok' | 'danger' | 'ai';
};

export function StatTile({ className, label, value, valueTone = 'default', ...props }: StatTileProps) {
  return (
    <section {...props} className={[styles.tile, className].filter(Boolean).join(' ')}>
      <span className={styles.label}>{label}</span>
      <strong className={[styles.value, styles[valueTone]].join(' ')}>{value}</strong>
    </section>
  );
}
