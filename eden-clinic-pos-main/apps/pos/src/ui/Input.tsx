import { forwardRef, type InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...props }, ref) {
  return <input {...props} className={[styles.input, className].filter(Boolean).join(' ')} ref={ref} />;
});
