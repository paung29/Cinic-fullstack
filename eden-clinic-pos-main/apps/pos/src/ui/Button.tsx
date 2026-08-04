import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'ai';
export type ButtonSize = 'md' | 'sm';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pill?: boolean;
};

export function Button({
  className,
  pill = false,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={[styles.button, styles[variant], styles[size], pill ? styles.pill : '', className]
        .filter(Boolean)
        .join(' ')}
      type={type}
    />
  );
}
