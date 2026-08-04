'use client';

import { useCallback } from 'react';
import { useLocaleControl } from './I18nProvider';
import { translate } from './translate';
import type { TranslationKey } from './types';

export function useT() {
  const { locale } = useLocaleControl();
  const t = useCallback((key: TranslationKey) => translate(locale, key), [locale]);

  return { locale, t };
}
