import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

test('auth code cannot import the sale module', async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(
    "import { checkout } from '@/modules/sale/checkout';",
    { filePath: 'src/modules/auth/canary.ts' },
  );

  expect(result.messages.some((message) => message.ruleId === 'no-restricted-imports')).toBe(true);
});
