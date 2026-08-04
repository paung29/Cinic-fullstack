import { describe, expect, test, vi } from 'vitest';
import { createStorageDiagnostics } from '@/data/storageDiagnostics';

describe('storage diagnostics', () => {
  test('requests persistence once and refresh only re-reads status', async () => {
    const storage = { persist: vi.fn(async () => false), persisted: vi.fn(async () => false), estimate: vi.fn(async () => ({ usage: 12, quota: 34 })) };
    const diagnostics = createStorageDiagnostics(storage);
    await expect(diagnostics.requestPersistence()).resolves.toEqual({ kind: 'not-granted', usage: 12, quota: 34 });
    await expect(diagnostics.refresh()).resolves.toEqual({ kind: 'not-granted', usage: 12, quota: 34 });
    expect(storage.persist).toHaveBeenCalledTimes(1);
    expect(storage.persisted).toHaveBeenCalledTimes(2);
  });

  test('degrades safely for unavailable or rejecting browser APIs', async () => {
    await expect(createStorageDiagnostics(undefined).requestPersistence()).resolves.toEqual({ kind: 'unavailable' });
    await expect(createStorageDiagnostics({ persist: async () => { throw new Error('denied'); }, persisted: async () => false, estimate: async () => ({}) }).requestPersistence()).resolves.toEqual({ kind: 'not-granted' });
  });
});
