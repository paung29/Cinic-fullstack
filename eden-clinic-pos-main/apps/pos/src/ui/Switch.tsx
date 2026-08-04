'use client';

import styles from './Switch.module.css';

export type SwitchProps = { checked: boolean; onCheckedChange(checked: boolean): void; label: string };

export function Switch({ checked, label, onCheckedChange }: SwitchProps) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={[styles.switch, checked ? styles.checked : ''].filter(Boolean).join(' ')}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
    >
      <span className={styles.knob} />
    </button>
  );
}
