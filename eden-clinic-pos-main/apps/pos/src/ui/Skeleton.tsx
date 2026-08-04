import type { HTMLAttributes } from 'react';
import styles from './Skeleton.module.css';

export type SkeletonSize = 'line' | 'loading' | 'list' | 'receipt' | 'preview';

export type SkeletonProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  size?: SkeletonSize;
};

export function Skeleton({ className, size = 'line', ...props }: SkeletonProps) {
  return <div {...props} className={[styles.skeleton, className].filter(Boolean).join(' ')} data-size={size} />;
}
