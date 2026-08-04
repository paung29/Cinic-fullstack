import { expect, test } from '@playwright/test';

test('the exported token page uses local assets and the approved visual baseline', async ({ page }) => {
  const externalRequests: string[] = [];

  page.on('request', (request) => {
    const { hostname } = new URL(request.url());

    if (!['127.0.0.1', 'localhost'].includes(hostname)) {
      externalRequests.push(request.url());
    }
  });

  await page.goto('/');

  await expect
    .poll(() => page.evaluate(() => document.fonts.check('16px Padauk', 'ကျေးဇူးတင်ပါသည်')))
    .toBe(true);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 249, 247)');
  await expect(page.getByTestId('primary-button')).toHaveCSS('background-color', 'rgb(0, 104, 249)');
  await expect(page.getByTestId('burmese-sample')).toHaveCSS('font-family', /Padauk/);
  expect(externalRequests).toEqual([]);
});
