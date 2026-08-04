export type StorageManagerLike = {
  persist(): Promise<boolean>;
  persisted(): Promise<boolean>;
  estimate(): Promise<{ usage?: number; quota?: number }>;
};

export type StorageStatus =
  | { kind: 'granted'; usage?: number; quota?: number }
  | { kind: 'not-granted'; usage?: number; quota?: number }
  | { kind: 'unavailable' };

export type StorageDiagnostics = {
  state(): StorageStatus;
  requestPersistence(): Promise<StorageStatus>;
  refresh(): Promise<StorageStatus>;
};

export function createStorageDiagnostics(storage: StorageManagerLike | undefined): StorageDiagnostics {
  let current: StorageStatus = storage === undefined ? { kind: 'unavailable' } : { kind: 'not-granted' };
  const read = async (): Promise<StorageStatus> => {
    if (storage === undefined) return { kind: 'unavailable' };
    try {
      const [persisted, estimate] = await Promise.all([storage.persisted(), storage.estimate()]);
      return persisted ? { kind: 'granted', ...estimate } : { kind: 'not-granted', ...estimate };
    } catch {
      return { kind: 'not-granted' };
    }
  };
  return {
    state: () => current,
    async requestPersistence() {
      if (storage === undefined) return current;
      try { await storage.persist(); } catch { /* status read below is authoritative */ }
      current = await read();
      return current;
    },
    async refresh() { current = await read(); return current; },
  };
}
