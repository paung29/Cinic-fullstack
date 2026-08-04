import { dictEn } from './dict.en';
import { dictMy } from './dict.my';
import { dictZh } from './dict.zh';
import type { Locale, LocaleDictionaries, TranslationKey } from './types';

export const dictionaries: LocaleDictionaries = {
  en: dictEn,
  my: dictMy,
  zh: dictZh,
};

export function translate(
  locale: Locale,
  key: TranslationKey,
  source: LocaleDictionaries = dictionaries,
): string {
  return source[locale][key] ?? source.en[key];
}
