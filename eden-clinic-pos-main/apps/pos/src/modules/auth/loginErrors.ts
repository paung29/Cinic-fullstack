import { ApiHttpError, ApiNetworkError } from '@/data/api';
import { InvalidStoredEnvelopeError } from '@/modules/auth/sessionController';
import { WrongPinError } from '@/modules/auth/sessionEnvelope';

export type LoginFailure = 'internet-required' | 'repair' | 'sign-in-failed' | 'wrong-pin';

/**
 * A mistyped PIN reaches the screen as two unrelated types depending on which
 * path checked it: the server answers 401 TOKEN_INVALID, while the offline
 * unlock fails to decrypt the envelope and throws `WrongPinError`. Only the
 * first used to be recognised, so offline — the mode this product is built
 * for — a wrong PIN fell through to "The PIN was accepted, but sign-in could
 * not finish", and skipped the failed-attempt backoff entirely.
 */
export function loginFailureFor(error: unknown): LoginFailure {
  // Checked before the PIN cases: the envelope is missing or structurally
  // broken, so no PIN can open it and retrying one is not the repair.
  if (error instanceof InvalidStoredEnvelopeError) {
    return 'repair';
  }
  if (error instanceof ApiNetworkError) {
    return 'internet-required';
  }
  if (error instanceof WrongPinError) {
    return 'wrong-pin';
  }
  if (error instanceof ApiHttpError && error.status === 401 && error.code === 'TOKEN_INVALID') {
    return 'wrong-pin';
  }

  return 'sign-in-failed';
}
