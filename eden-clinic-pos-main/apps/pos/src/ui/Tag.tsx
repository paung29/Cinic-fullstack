import type { HTMLAttributes } from 'react';
import styles from './Tag.module.css';

export type TagTone = 'ok' | 'low' | 'amber' | 'blue' | 'ai';
export type TagProps = HTMLAttributes<HTMLSpanElement> & { tone?: TagTone };

export function Tag({ className, tone = 'blue', ...props }: TagProps) {
  return <span {...props} className={[styles.tag, styles[tone], className].filter(Boolean).join(' ')} />;
}
