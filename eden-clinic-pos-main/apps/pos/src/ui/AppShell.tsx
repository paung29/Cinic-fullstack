'use client';

import type { ReactNode } from 'react';
import { LogOut, UsersRound } from 'lucide-react';
import { Button } from './Button';
import { SyncChip, type SyncChipProps } from './SyncChip';
import { Tabs, type TabItem } from './Tabs';
import { Tag } from './Tag';
import styles from './AppShell.module.css';

export type AppShellProps = {
  brand: string;
  location: string;
  tabs: readonly TabItem[];
  activeTab: string;
  onTabChange(id: string): void;
  sync: SyncChipProps;
  userName: string;
  userRole: string;
  logoutLabel: string;
  onLogout(): void;
  switchUserLabel?: string;
  switchUserDisabled?: boolean;
  onSwitchUser?(): void;
  storageAttention?: string;
  offlineAdminAttention?: string;
  children: ReactNode;
};

export function AppShell({
  activeTab,
  brand,
  children,
  location,
  logoutLabel,
  onLogout,
  onSwitchUser,
  onTabChange,
  offlineAdminAttention,
  sync,
  storageAttention,
  switchUserDisabled = false,
  switchUserLabel,
  tabs,
  userName,
  userRole,
}: AppShellProps) {
  return (
    <div className={styles.shell} data-testid="app-shell">
      <header className={styles.brandBar} data-testid="brand-bar">
        <div className={styles.brandLockup}>
          <strong>{brand}</strong>
          <span>{location}</span>
        </div>
        <div className={styles.grow} />
        <SyncChip {...sync} />
        <div className={styles.user}>
          <strong>{userName}</strong>
          <span>{userRole}</span>
        </div>
        {onSwitchUser === undefined || switchUserLabel === undefined ? null : <Button aria-label={switchUserLabel} data-testid="switch-user" disabled={switchUserDisabled} onClick={onSwitchUser} pill size="sm" variant="ghost"><UsersRound aria-hidden="true" size={16} /><span className={styles.logoutText}>{switchUserLabel}</span></Button>}
        <Button aria-label={logoutLabel} data-testid="logout-button" onClick={onLogout} pill size="sm" variant="ghost">
          <LogOut aria-hidden="true" size={16} />
          <span className={styles.logoutText}>{logoutLabel}</span>
        </Button>
      </header>
      <nav className={styles.tabRail} data-testid="tab-rail">
        <Tabs activeId={activeTab} label={brand} onChange={onTabChange} tabs={tabs} />
      </nav>
      {offlineAdminAttention === undefined ? null : <div className={styles.attention}><Tag data-testid="offline-admin-attention" role="status" tone="amber">{offlineAdminAttention}</Tag></div>}
      {storageAttention === undefined ? null : <p className={styles.storageAttention} data-testid="storage-persistence-banner" role="status">{storageAttention}</p>}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
