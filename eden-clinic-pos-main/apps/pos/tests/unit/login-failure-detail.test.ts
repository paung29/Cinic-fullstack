import { describe, expect, test } from 'vitest';
import { ApiHttpError, ApiNetworkError } from '@/data/api';
import { loginFailureDetail } from '@/modules/auth/loginErrors';

describe('surfacing what the server actually said', () => {
  // The reported symptom: a malformed email came back as "sign-in could not
  // finish", which reads like a network fault and sent people looking in the
  // wrong place entirely.
  test('shows a rejected setup message rather than swallowing it', () => {
    const error = new ApiHttpError(400, 'VALIDATION', 'email must be a well-formed email address');
    expect(loginFailureDetail(error)).toBe('email must be a well-formed email address');
  });

  test('shows a business rule the server enforced', () => {
    const error = new ApiHttpError(400, 'BUSINESS_RULE', 'Initial setup has already been completed.');
    expect(loginFailureDetail(error)).toBe('Initial setup has already been completed.');
  });

  test('withholds server internals from clinic staff', () => {
    expect(loginFailureDetail(new ApiHttpError(500, 'INTERNAL', 'NullPointerException at line 42'))).toBeUndefined();
  });

  test('stays quiet on a wrong PIN, which is already named on screen', () => {
    expect(loginFailureDetail(new ApiHttpError(401, 'TOKEN_INVALID', 'Staff ID or PIN is incorrect.'))).toBeUndefined();
  });

  test('stays quiet when the request never reached a server', () => {
    expect(loginFailureDetail(new ApiNetworkError('Network request failed.'))).toBeUndefined();
    expect(loginFailureDetail(new Error('something else'))).toBeUndefined();
  });

  test('ignores an empty message rather than rendering a blank line', () => {
    expect(loginFailureDetail(new ApiHttpError(400, 'VALIDATION', '   '))).toBeUndefined();
  });
});
