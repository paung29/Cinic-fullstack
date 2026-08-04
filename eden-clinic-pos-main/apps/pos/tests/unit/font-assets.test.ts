import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const fontsDir = join(dirname(fileURLToPath(import.meta.url)), '../../public/fonts');

test('font checksum manifest exactly covers every bundled WOFF2 asset with actual SHA-256 values', async () => {
  const manifest = await readFile(join(fontsDir, 'checksums.txt'), 'utf8');
  const entries = manifest.trim().split(/\r?\n/).map((line) => {
    const match = line.match(/^([a-f0-9]{64})  ([\w-]+\.woff2)$/);
    expect(match).not.toBeNull();
    if (match === null) throw new Error(`Invalid font manifest row: ${line}`);
    return { hash: match[1], file: match[2] };
  });
  expect(entries.map((entry) => entry.file).sort()).toEqual([
    'inter-400.woff2', 'inter-500.woff2', 'inter-600.woff2', 'inter-700.woff2',
    'lora-700.woff2', 'padauk-400.woff2', 'padauk-700.woff2', 'playfair-display-700.woff2',
  ]);

  await Promise.all(entries.map(async ({ file, hash }) => {
    const bytes = await readFile(join(fontsDir, file));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
  }));
});
