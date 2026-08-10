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

/**
 * The server's own explanation, when it gave one worth reading.
 *
 * Without this every rejection collapsed into "the PIN was accepted, but
 * sign-in could not finish" — which is true and useless. A malformed email or
 * an already-initialised server both arrive as a 400 carrying a perfectly
 * clear sentence, and throwing it away sent people hunting for a network fault
 * that was never there.
 *
 * 5xx bodies are withheld deliberately: an internal stack detail is not
 * something to put in front of clinic staff. A 401 is already named as a wrong
 * PIN by the caller above.
 */
export function loginFailureDetail(error: unknown): string | undefined {
  if (!(error instanceof ApiHttpError)) return undefined;
  if (error.status >= 500 || error.status === 401) return undefined;
  const message = error.message.trim();
  return message === '' ? undefined : message;
}
