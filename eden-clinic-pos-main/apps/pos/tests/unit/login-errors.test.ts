import { describe, expect, test } from 'vitest';
import { ApiHttpError, ApiNetworkError } from '@/data/api';
import { loginFailureFor } from '@/modules/auth/loginErrors';
import { InvalidStoredEnvelopeError } from '@/modules/auth/sessionController';
import { WrongPinError } from '@/modules/auth/sessionEnvelope';

describe('loginFailureFor', () => {
  test('a wrong PIN rejected by the server is a wrong PIN', () => {
    expect(loginFailureFor(new ApiHttpError(401, 'TOKEN_INVALID', 'nope'))).toBe('wrong-pin');
  });

  test('a wrong PIN that cannot open the offline envelope is also a wrong PIN', () => {
    // The regression this helper exists for. Offline is the mode the clinic
    // spends most of its day in, and a mistyped digit there used to report
    // "The PIN was accepted, but sign-in could not finish" — telling staff the
    // PIN was right when it was not — and slipped past the attempt backoff.
    expect(loginFailureFor(new WrongPinError())).toBe('wrong-pin');
  });

  test('an unopenable envelope asks for online repair rather than another PIN', () => {
    expect(loginFailureFor(new InvalidStoredEnvelopeError())).toBe('repair');
  });

  test('an unreachable server asks for internet', () => {
    expect(loginFailureFor(new ApiNetworkError('offline'))).toBe('internet-required');
  });

  test('a 401 that is not a bad credential is not blamed on the PIN', () => {
    expect(loginFailureFor(new ApiHttpError(401, 'STAFF_INACTIVE', 'nope'))).toBe('sign-in-failed');
  });

  test('anything unrecognised stays the generic failure', () => {
    expect(loginFailureFor(new Error('boom'))).toBe('sign-in-failed');
  });
});
