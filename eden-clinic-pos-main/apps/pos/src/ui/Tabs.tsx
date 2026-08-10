'use client';

import type { ReactNode } from 'react';
import styles from './Tabs.module.css';

export type TabItem = { id: string; label: string };
export type TabsProps = {
  tabs: readonly TabItem[];
  activeId: string;
  onChange(id: string): void;
  label: string;
  testId?: string;
  testIdPrefix?: string;
  orientation?: 'horizontal' | 'vertical';
  icons?: Record<string, ReactNode>;
};

export function Tabs({ activeId, icons, label, onChange, orientation = 'horizontal', tabs, testId, testIdPrefix = 'shell-tab' }: TabsProps) {
  return (
    <div aria-label={label} className={[styles.tabs, orientation === 'vertical' ? styles.vertical : ''].filter(Boolean).join(' ')} data-testid={testId} role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const icon = icons?.[tab.id];
        return (
          <button
            aria-selected={active}
            className={[styles.tab, active ? styles.active : ''].filter(Boolean).join(' ')}
            data-testid={`${testIdPrefix}-${tab.id}`}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            role="tab"
            type="button"
          >
            {icon === undefined ? null : <span aria-hidden="true" className={styles.icon}>{icon}</span>}
            <span className={styles.label}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
