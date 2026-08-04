'use client';

import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { Locale } from './types';

export type LocaleControl = {
  locale: Locale;
  setLocale: Dispatch<SetStateAction<Locale>>;
};

const LocaleContext = createContext<LocaleControl | null>(null);
const allowDevelopmentOverride = process.env.NODE_ENV === 'development';

export function I18nProvider({ children, initialLocale = 'my' }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    if (!allowDevelopmentOverride) return;

    const localeFromQuery = new URLSearchParams(window.location.search).get('__devLocale');
    if (localeFromQuery !== 'my' && localeFromQuery !== 'en' && localeFromQuery !== 'zh') return;

    const timeout = window.setTimeout(() => setLocale(localeFromQuery), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocaleControl(): LocaleControl {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error('useLocaleControl must be used inside I18nProvider.');
  }

  return context;
}
