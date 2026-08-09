'use client';

import type { ReactNode } from 'react';
import { CalendarDays, ChartColumn, LayoutDashboard, LogOut, Package, Settings, ShoppingCart, Users, UsersRound } from 'lucide-react';
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

// v5 shell: the nav ids are stable product sections, so the shell owns their
// glyphs — call sites keep passing plain {id, label} tabs unchanged.
const NAV_ICONS: Record<string, ReactNode> = {
  today: <LayoutDashboard aria-hidden="true" size={17} />,
  calendar: <CalendarDays aria-hidden="true" size={17} />,
  clients: <Users aria-hidden="true" size={17} />,
  sale: <ShoppingCart aria-hidden="true" size={17} />,
  stocks: <Package aria-hidden="true" size={17} />,
  analytics: <ChartColumn aria-hidden="true" size={17} />,
  setup: <Settings aria-hidden="true" size={17} />,
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
        {storageAttention === undefined ? null : <Tag className={styles.attentionTag} data-testid="storage-persistence-banner" role="status" tone="amber" title={storageAttention}>{storageAttention}</Tag>}
        {offlineAdminAttention === undefined ? null : <Tag className={styles.attentionTag} data-testid="offline-admin-attention" role="status" tone="amber" title={offlineAdminAttention}>{offlineAdminAttention}</Tag>}
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
      <nav className={styles.sideRail} data-testid="tab-rail">
        <Tabs activeId={activeTab} icons={NAV_ICONS} label={brand} onChange={onTabChange} orientation="vertical" tabs={tabs} />
      </nav>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
