import { describe, expect, test } from 'vitest';
import { captureWithinBoundary } from '@/modules/sale/captureBoundary';

describe('sale capture boundary', () => {
  test('ends after a successful capture', async () => {
    let ends = 0;
    await expect(captureWithinBoundary(() => () => { ends += 1; }, async () => 'sale-1')).resolves.toBe('sale-1');
    expect(ends).toBe(1);
  });

  test('ends after a rejected capture', async () => {
    let ends = 0;
    await expect(captureWithinBoundary(() => () => { ends += 1; }, async () => Promise.reject(new Error('capture failed')))).rejects.toThrow('capture failed');
    expect(ends).toBe(1);
  });
});
