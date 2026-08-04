'use client';

import { Delete } from 'lucide-react';
import styles from './PinPad.module.css';

export type PinPadProps = {
  value: string;
  maxLength?: number;
  onChange(value: string): void;
  onSubmit(): void;
  backspaceLabel: string;
  submitLabel: string;
  testId?: string;
  displayTestId?: string;
};

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

export function PinPad({
  backspaceLabel,
  displayTestId = 'pin-display',
  maxLength = 4,
  onChange,
  onSubmit,
  submitLabel,
  testId = 'demo-pinpad',
  value,
}: PinPadProps) {
  const enterDigit = (digit: string) => {
    if (value.length < maxLength) onChange(`${value}${digit}`);
  };

  return (
    <section aria-label={submitLabel} className={styles.pinpad} data-testid={testId}>
      <output aria-label={submitLabel} className={styles.display} data-length={value.length} data-testid={displayTestId}>
        {value.split('').map((digit, index) => <span key={`${digit}-${index}`}>•</span>)}
      </output>
      <div className={styles.keys}>
        {keys.map((key) => (
          <button aria-label={key} className={styles.key} data-testid={`pin-key-${key}`} key={key} onClick={() => enterDigit(key)} type="button">{key}</button>
        ))}
        <button aria-label={backspaceLabel} className={styles.key} onClick={() => onChange(value.slice(0, -1))} type="button"><Delete aria-hidden="true" size={18} /></button>
        <button aria-label={submitLabel} className={[styles.key, styles.submit].join(' ')} data-testid="pin-submit" onClick={onSubmit} type="button">✓</button>
      </div>
    </section>
  );
}
