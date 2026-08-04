import type { ReactNode } from 'react';
import styles from './Field.module.css';

export type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function Field({ children, error, hint, htmlFor, label }: FieldProps) {
  return (
    <label className={styles.field} htmlFor={htmlFor}>
      <span className={styles.label}>{label}</span>
      {children}
      {error ? <span className={styles.error}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}
