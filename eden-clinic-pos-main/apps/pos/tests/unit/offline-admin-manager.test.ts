import { describe, expect, test } from 'vitest';
import { ApiNetworkError } from '@/data/api';
import { shouldUseOfflineRemovalProof } from '@/modules/auth/OfflineAdminEnvelopeManager';

describe('offline admin envelope manager', () => {
  test('offers fresh PIN proof only after a real elevate transport failure', () => {
    expect(shouldUseOfflineRemovalProof(new ApiNetworkError())).toBe(true);
    expect(shouldUseOfflineRemovalProof(new Error('wrong password'))).toBe(false);
  });
});
