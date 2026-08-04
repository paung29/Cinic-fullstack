'use client';

import styles from './Tabs.module.css';

export type TabItem = { id: string; label: string };
export type TabsProps = {
  tabs: readonly TabItem[];
  activeId: string;
  onChange(id: string): void;
  label: string;
  testId?: string;
  testIdPrefix?: string;
};

export function Tabs({ activeId, label, onChange, tabs, testId, testIdPrefix = 'shell-tab' }: TabsProps) {
  return (
    <div aria-label={label} className={styles.tabs} data-testid={testId} role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
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
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
