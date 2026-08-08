import { expect, test, type Page } from '@playwright/test';
import { resetMock } from './mock';

async function provisionAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('installer-staff-id').fill('s1');
  for (const digit of ['1', '2', '3', '4']) await page.getByTestId(`pin-key-${digit}`).click();
  await page.getByTestId('pin-submit').click();
  await page.getByTestId('staff-option-s1').click();
  for (const digit of ['1', '2', '3', '4']) await page.getByTestId(`pin-key-${digit}`).click();
  await page.getByTestId('pin-submit').click();
  await expect(page.getByTestId('sale-root')).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('operations connects license, reports, and elevated stock adjustment', async ({ page }) => {
  await provisionAdmin(page);
  await page.getByTestId('shell-tab-setup').click();
  await page.getByTestId('open-operations').click();

  await expect(page.getByTestId('operations-root')).toBeVisible();
  await expect(page.getByTestId('license-status')).toContainText('ACTIVE');

  await page.getByTestId('report-load').click();
  await page.getByTestId('operations-password').fill('eden');
  await page.getByTestId('operations-elevation-submit').click();
  await expect(page.getByTestId('daily-report')).toContainText('Sales');

  await page.getByTestId('adjust-product-select').selectOption('p1');
  await page.getByTestId('adjust-delta').fill('2');
  await page.getByTestId('adjust-stock-submit').click();
  await expect(page.getByTestId('adjust-product-select')).toContainText('Aftercare cream 50g (16)');
});
