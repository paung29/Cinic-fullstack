import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ClinicRuntimeProvider } from './providers';
import { I18nProvider } from '@/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: 'Eden Clinic OS',
  description: 'Offline-capable clinic operations for Eden Clinic.',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body><I18nProvider initialLocale="my"><ClinicRuntimeProvider>{children}</ClinicRuntimeProvider></I18nProvider></body>
    </html>
  );
}
