import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

// Changes to tokens.css require Dan's explicit approval.
test('tokens.css retains the approved canonical bytes', () => {
  const tokens = readFileSync(resolve(process.cwd(), 'tokens.css'));

  expect(tokens.byteLength).toBe(597);
  expect(createHash('sha256').update(tokens).digest('hex')).toBe(
    '8d39f41e6710fa1edce202af74f118e76547a4172f5dc8073135e0f76eb09e82',
  );
});
