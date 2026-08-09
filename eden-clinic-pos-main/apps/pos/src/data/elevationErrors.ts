import { ApiAuthError, ApiNetworkError } from '@/data/api';
import type { TranslationKey } from '@/i18n';

// Three very different failures used to share one "wrong PIN" message, which
// sent staff hunting for a password problem when the real cause was a dead
// session or no connection. Keep them distinct wherever elevation is prompted.
export function elevationFailureKey(error: unknown, t: (key: TranslationKey) => string): string {
  if (error instanceof ApiNetworkError) return t('auth.setup.internetRequired');
  if (error instanceof ApiAuthError) return t('auth.sessionExpired');
  return t('auth.adminPasswordWrong');
}
