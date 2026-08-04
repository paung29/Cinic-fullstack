import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('Skeleton cannot emit an inline style attribute under the strict CSP', async () => {
  const source = await readFile(join(appRoot, 'src/ui/Skeleton.tsx'), 'utf8');

  expect(source).not.toMatch(/\bstyle\s*=/);
  expect(source).not.toContain('CSSProperties');
});
