/// <reference types="vite/client" />
import { expect, test } from 'vitest';

// LAW-6 enforcement: every source module must import cleanly under plain Node
// (no DOM, no IndexedDB). Module-scope storage access throws here and fails CI.
const sourceModules = import.meta.glob('/src/**/*.{ts,tsx}', { eager: false });

test('source modules load without browser globals at module scope', async () => {
  expect(Reflect.get(globalThis, 'window')).toBeUndefined();
  expect(Reflect.get(globalThis, 'document')).toBeUndefined();
  expect(Reflect.get(globalThis, 'indexedDB')).toBeUndefined();
  expect(Object.keys(sourceModules).length).toBeGreaterThan(0);

  for (const load of Object.values(sourceModules)) {
    await expect(load()).resolves.toBeDefined();
  }
});
