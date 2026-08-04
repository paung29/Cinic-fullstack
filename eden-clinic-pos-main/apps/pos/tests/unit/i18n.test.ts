import { expect, test } from 'vitest';
import { dictionaries, translate } from '@/i18n/translate';
import { translationKeys } from '@/i18n/types';

test('English exactly covers the declared key tuple', () => {
  expect(Object.keys(dictionaries.en).sort()).toEqual([...translationKeys].sort());
});

test('draft locale dictionaries omit only the explicit demo fallback fixture', () => {
  for (const locale of [dictionaries.my, dictionaries.zh]) {
    const missing = translationKeys.filter((key) => locale[key] === undefined);
    expect(missing).toEqual(['demo.fallbackProbe']);
  }
});

test('draft locales provide their own Set-up copy instead of exposing English labels', () => {
  const m5Keys = [
    'setup.clinicName', 'setup.title', 'setup.receipt', 'setup.receiptFooter', 'setup.phone', 'setup.address', 'setup.logoUrl',
    'setup.rounding', 'setup.creditLimit', 'setup.consent', 'setup.receiptQr', 'setup.receiptNextVisit',
    'setup.template', 'setup.headerFont', 'setup.divider', 'setup.save', 'setup.saveOffline',
    'setup.elevate', 'setup.password', 'setup.hardware', 'setup.width', 'setup.transport',
    'setup.testPrint', 'setup.locale', 'setup.addons', 'stocks.title', 'stocks.add', 'stocks.receive',
    'stocks.edit', 'stocks.name', 'stocks.category', 'stocks.barcode', 'stocks.soldBy', 'stocks.each',
    'stocks.weight', 'stocks.cost', 'stocks.price', 'stocks.stock', 'stocks.lowStock', 'stocks.type',
    'stocks.lot', 'stocks.expiry', 'stocks.lookup', 'stocks.save', 'stocks.pending',
    'stocks.duplicateBarcode', 'stocks.margin', 'stocks.retire',
  ] as const;

  for (const locale of ['my', 'zh'] as const) {
    expect(m5Keys.filter((key) => dictionaries[locale][key] === dictionaries.en[key])).toEqual([]);
  }
});

test('test-local missing Burmese and Chinese entries fall back to English', () => {
  const fixture = {
    ...dictionaries,
    my: { ...dictionaries.my },
    zh: { ...dictionaries.zh },
  };

  delete fixture.my['shell.tab.home'];
  delete fixture.zh['shell.tab.home'];

  expect(translate('my', 'shell.tab.home', fixture)).toBe(dictionaries.en['shell.tab.home']);
  expect(translate('zh', 'shell.tab.home', fixture)).toBe(dictionaries.en['shell.tab.home']);
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- This function is deliberately never executed; tsc checks the expected error.
function typecheckOnlyUnknownKeyFixture(): void {
  // @ts-expect-error unknown translation keys must be rejected by TypeScript.
  translate('en', 'demo.notDeclared');
}

test('the public i18n module imports without browser storage globals', async () => {
  expect(Reflect.get(globalThis, 'window')).toBeUndefined();
  await expect(import('@/i18n')).resolves.toBeDefined();
});
