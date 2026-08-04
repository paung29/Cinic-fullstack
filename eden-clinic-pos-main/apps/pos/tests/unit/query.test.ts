import { describe, expect, test } from 'vitest';
import { createClinicQueryClient } from '@/data/query';

describe('createClinicQueryClient', () => {
  test('returns independent clients with indefinitely fresh Dexie-backed queries', () => {
    const first = createClinicQueryClient();
    const second = createClinicQueryClient();

    expect(first).not.toBe(second);
    expect(first.getDefaultOptions().queries?.staleTime).toBe(Infinity);
  });
});
