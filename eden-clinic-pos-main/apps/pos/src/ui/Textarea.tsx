import { forwardRef, type TextareaHTMLAttributes } from 'react';
import styles from './Textarea.module.css';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, rows = 3, ...props }, ref) {
  return <textarea {...props} className={[styles.textarea, className].filter(Boolean).join(' ')} ref={ref} rows={rows} />;
});
