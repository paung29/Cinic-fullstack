import { expect, test } from '@playwright/test';
import { resetMock } from './mock';
import { captureM3ReferenceComparison, captureM3Screenshots, captureM3State } from './visuals';

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('the exported login keeps every offline baseline and makes the dev override inert', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const { hostname } = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(hostname)) externalRequests.push(request.url());
  });

  await page.goto('/login?__devLocale=en');

  await expect.poll(() => page.evaluate(() => document.fonts.check('16px Padauk', 'ကျေးဇူးတင်ပါသည်'))).toBe(true);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(250, 249, 247)');
  await expect(page.getByTestId('pin-submit')).toHaveCSS('background-color', 'rgb(0, 104, 249)');
  await expect(page.getByTestId('login-root')).toHaveCSS('font-family', /Padauk/);
  await expect(page.getByTestId('login-root')).toHaveAttribute('data-locale', 'my');
  await expect(page.getByTestId('login-root')).toHaveAttribute('lang', 'my');
  await expect(page.getByTestId('dev-locale-override')).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test('the static workflow provisions, captures offline, and manually drains one sale', async ({ context, page }) => {
  await page.goto('/login');
  await expect(page.getByTestId('device-setup')).toBeVisible();
  await page.getByTestId('installer-staff-id').fill('s1');
  for (const digit of ['1', '2', '3', '4']) await page.getByTestId(`pin-key-${digit}`).click();
  await page.getByTestId('pin-submit').click();
  await expect(page.getByTestId('staff-picker')).toBeVisible();
  await captureM3State(page, 'login-staff-picker.png');
  await captureM3ReferenceComparison(page, 'login');

  await page.getByTestId('staff-option-s2').click();
  await captureM3State(page, 'login-pin.png');
  for (const digit of ['0', '0', '0', '0']) await page.getByTestId(`pin-key-${digit}`).click();
  await expect(page.getByTestId('login-pin-display')).toHaveAttribute('data-length', '4');
  await page.getByTestId('pin-submit').click();
  await expect(page.getByTestId('sale-root')).toBeVisible();
  await captureM3Screenshots(page);

  await page.getByTestId('patient-select').selectOption('c1');
  await expect(page.getByTestId('allergy-banner')).toBeVisible();
  await page.getByTestId('catalogue-tab-products').click();
  await page.getByTestId('catalogue-item-p1').click();
  await page.getByTestId('catalogue-tab-services').click();
  await page.getByTestId('catalogue-item-v4').click();
  await expect(page.getByTestId('lot-modal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('lot-modal')).toBeHidden();
  await page.getByTestId('catalogue-item-v4').click();
  await page.getByTestId('lot-prefill').click();
  await page.getByTestId('lot-add').click();

  await context.setOffline(true);
  await page.getByTestId('discount-custom').click();
  await page.getByTestId('discount-input').fill('25');
  await page.getByTestId('open-tender').click();
  await page.getByTestId('tender-split').click();
  await page.getByTestId('capture-sale').click();
  await expect(page.getByTestId('approval-modal')).toBeVisible();
  await captureM3State(page, 'tender-approval.png');
  await page.getByTestId('approval-admin-select').selectOption('s1');
  for (const digit of ['1', '2', '3', '4']) await page.getByTestId(`pin-key-${digit}`).click();
  await expect(page.getByTestId('approval-pin-display')).toHaveAttribute('data-length', '4');
  await page.getByTestId('pin-submit').click();
  await expect(page.getByTestId('approval-modal')).toBeHidden();
  await page.getByTestId('capture-sale').click();
  await expect(page.getByTestId('receipt-view')).toBeVisible();
  await expect(page.getByTestId('receipt-canvas')).toBeVisible();
  await page.getByTestId('receipt-print').click();
  await expect(page.getByTestId('toast-item')).toBeVisible();
  await expect(page.getByTestId('receipt-share')).toBeVisible();
  await captureM3State(page, 'receipt-confirmation.png');
  await page.getByTestId('sale-complete').click();
  await expect(page.getByTestId('modal-backdrop')).toHaveCount(0);
  await page.getByTestId('logout-button').click();
  await expect(page.getByTestId('toast-item')).toHaveCount(1);
  await captureM3State(page, 'sync-pending.png');
  await captureM3ReferenceComparison(page, 'sale');

  await context.setOffline(false);
  await page.getByTestId('sync-chip').click();
  await expect.poll(async () => page.getByTestId('sync-chip').locator('strong').textContent()).toBe('0');
});
