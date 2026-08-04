import { expect, test } from 'vitest';
import { z } from '@/data/zod';

test('data validation uses Zod\'s CSP-safe JIT-less path', () => {
  expect(z.config()).toMatchObject({ jitless: true });
  expect(z.object({ clinicId: z.string() }).parse({ clinicId: 'c1' })).toEqual({ clinicId: 'c1' });
});
