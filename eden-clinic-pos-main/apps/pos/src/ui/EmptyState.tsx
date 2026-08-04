import type { HTMLAttributes, ReactNode } from 'react';
import styles from './EmptyState.module.css';

export type EmptyStateProps = HTMLAttributes<HTMLElement> & { heading: string; body: string; action?: ReactNode };

export function EmptyState({ action, body, className, heading, ...props }: EmptyStateProps) {
  return (
    <section {...props} className={[styles.empty, className].filter(Boolean).join(' ')}>
      <h3>{heading}</h3>
      <p>{body}</p>
      {action ? <div>{action}</div> : null}
    </section>
  );
}