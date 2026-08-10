'use client';

import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import styles from './SecretInput.module.css';

export type SecretInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Announced on the toggle while the value is masked. */
  revealLabel: string;
  /** Announced on the toggle while the value is visible. */
  hideLabel: string;
};

/**
 * A credential field that can be unmasked. Staff mistype PINs and passwords on
 * counter tablets constantly, and a permanently masked field gives them no way
 * to check what they typed — only a silent retry loop. Every secret we ask
 * someone to type therefore gets a reveal control.
 */
export const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(function SecretInput(
  { className, hideLabel, revealLabel, ...props },
  ref,
) {
  const [revealed, setRevealed] = useState(false);
  const label = revealed ? hideLabel : revealLabel;

  return (
    <span className={styles.wrap}>
      <input
        {...props}
        className={[styles.input, className].filter(Boolean).join(' ')}
        ref={ref}
        type={revealed ? 'text' : 'password'}
      />
      <button
        aria-label={label}
        aria-pressed={revealed}
        className={styles.toggle}
        // A convenience, not a step in the form: kept out of the tab order so
        // it never lands between the field and the submit button.
        onClick={() => setRevealed((current) => !current)}
        tabIndex={-1}
        title={label}
        type="button"
      >
        {revealed ? <EyeOffGlyph /> : <EyeGlyph />}
      </button>
    </span>
  );
});

function EyeGlyph() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24" width="18">
      <path d="M1.8 12S5.5 5.4 12 5.4 22.2 12 22.2 12 18.5 18.6 12 18.6 1.8 12 1.8 12Z" />
      <circle cx="12" cy="12" r="3.1" />
    </svg>
  );
}

function EyeOffGlyph() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24" width="18">
      <path d="M9.9 5.7A9 9 0 0 1 12 5.4c6.5 0 10.2 6.6 10.2 6.6a17.6 17.6 0 0 1-3.4 4.2" />
      <path d="M6.4 7.6A17.4 17.4 0 0 0 1.8 12S5.5 18.6 12 18.6a9.4 9.4 0 0 0 4-.85" />
      <path d="m3 3 18 18" />
      <path d="M10.1 10.3a3.1 3.1 0 0 0 4.3 4.4" />
    </svg>
  );
}
