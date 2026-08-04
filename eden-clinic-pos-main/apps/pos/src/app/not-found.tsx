'use client';

import { useT } from '@/i18n';
import styles from './not-found.module.css';

export default function NotFound() {
  const { locale, t } = useT();
  return <main className={styles.root} data-locale={locale} lang={locale === 'zh' ? 'zh-Hans' : locale}>
    <section className={styles.card}>
      <p>{t('brand.name')}</p>
      <h1>{t('notFound.title')}</h1>
      <span>{t('notFound.body')}</span>
      <a href="/login">{t('notFound.returnToLogin')}</a>
    </section>
  </main>;
}
