import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

export type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  compact?: boolean;
};

export function Card({ children, className, compact = false, ...props }: CardProps) {
  return (
    <section {...props} className={[styles.card, compact ? styles.compact : '', className].filter(Boolean).join(' ')}>
      {children}
    </section>
  );
}
