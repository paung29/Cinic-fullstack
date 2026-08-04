'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useClinicRuntimeStatus } from '@/app/providers';
import { useT } from '@/i18n';
import { OfflineAdminEnvelopeManager } from '@/modules/auth/OfflineAdminEnvelopeManager';
import { Button, Skeleton } from '@/ui';

export default function SecurityPage() {
  const router = useRouter();
  const { locale, t } = useT();
  const { runtime } = useClinicRuntimeStatus();
  const state = runtime?.session.state();
  const identity = state?.kind === 'active' ? state.identity : undefined;

  useEffect(() => {
    if (runtime !== undefined && (identity === undefined || identity.role !== 'admin')) {
      router.replace('/sale');
    }
  }, [identity, router, runtime]);

  if (runtime === undefined || identity === undefined || identity.role !== 'admin') {
    return <main data-locale={locale} lang={locale === 'zh' ? 'zh-Hans' : locale}><Skeleton size="loading" /></main>;
  }

  return (
    <main data-locale={locale} lang={locale === 'zh' ? 'zh-Hans' : locale}>
      <Button onClick={() => router.push('/sale')} pill variant="ghost">{t('shell.tab.sale')}</Button>
      <OfflineAdminEnvelopeManager currentAdminId={identity.staffId} onRemoved={() => router.replace('/sale')} />
    </main>
  );
}
