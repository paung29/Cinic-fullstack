import { expect, test, type Page } from '@playwright/test';
import { readMockSales, resetMock } from './mock';
import { captureM6ReferenceComparison, captureM6State } from './visuals';

test.beforeEach(async ({ request }) => { await resetMock(request); });

test('A4 preserves queued attribution across an offline Aye Aye to Su Su handover', async ({ page, request }) => {
  await provision(page, 's1', '1234');
  await switchAndLogin(page, 's2', '0000');
  await switchAndLogin(page, 's3', '0000');
  await switchAndLogin(page, 's2', '0000');

  await page.route('**://127.0.0.1:4010/**', (route) => route.abort());
  await captureCashSale(page);
  await captureCashSale(page);
  await expect(page.getByTestId('switch-user')).toBeEnabled();
  await expect.poll(() => outboxDepth(page)).toBe(2);
  await page.getByTestId('switch-user').click();
  await expect(page.getByTestId('staff-picker')).toBeVisible();
  await expect(page.getByTestId('sale-root')).toHaveCount(0);
  await page.getByTestId('staff-option-s3').click(); await pin(page, '0000');
  await captureCashSale(page); await captureCashSale(page);
  await expect.poll(() => outboxDepth(page)).toBe(4);

  await page.unroute('**://127.0.0.1:4010/**');
  await page.getByTestId('sync-chip').click();
  await expect.poll(async () => (await readMockSales(request)).filter((sale) => sale.staff_id === 's2').length).toBe(2);
  await expect.poll(async () => (await readMockSales(request)).filter((sale) => sale.staff_id === 's3').length).toBe(2);

  await page.getByTestId('catalogue-item-v1').click();
  await expect(page.getByTestId('switch-user')).toBeDisabled();
  await page.getByTestId('sale-line-remove').click();
  await expect(page.getByTestId('switch-user')).toBeEnabled();
  await page.getByTestId('catalogue-item-v1').click(); await page.getByTestId('open-tender').click();
  await expect(page.getByTestId('switch-user')).toBeDisabled();
  await page.keyboard.press('Escape'); await page.getByTestId('sale-line-remove').click();
  await expect(page.getByTestId('switch-user')).toBeEnabled();
  await captureM6State(page, 'switch-user-handover.png');
});

test('Today closes a drained admin shift, exposes storage diagnostics, and renders a COPY reprint', async ({ page }) => {
  await provision(page, 's1', '1234');
  await captureCashSale(page);
  await page.getByTestId('sync-chip').click();
  await page.getByTestId('shell-tab-today').click();
  await expect(page.getByTestId('today-root')).toBeVisible();
  await expect(page.getByTestId('today-method-cash')).toContainText('Ks');
  await captureM6State(page, 'today-home.png');
  await captureM6ReferenceComparison(page, 'home');
  await page.getByTestId('shift-close').click();
  await page.getByTestId('shift-opening').fill('100000');
  await page.getByTestId('shift-counted').fill('100000');
  await expect(page.getByTestId('shift-confirm')).toBeEnabled();
  await captureM6State(page, 'shift-close-modal.png');
  await captureM6ReferenceComparison(page, 'hub-money');
  await page.getByTestId('shift-confirm').click();
  await page.getByTestId('toast-dismiss').click();
  await expect(page.getByTestId('toast-item')).toHaveCount(0);
  await page.getByTestId(/^reprint-sale-/).first().click();
  await expect(page.getByTestId('reprint-receipt-canvas')).toHaveAttribute('data-copy-mode', 'true');
  await captureM6State(page, 'receipt-copy.png');
  await page.keyboard.press('Escape');
  await page.getByTestId('shell-tab-setup').click();
  await expect(page.getByTestId('storage-diagnostics')).toBeVisible();
  await captureM6State(page, 'setup-storage-diagnostics.png');
});

async function provision(page: Page, staffId: string, code: string) {
  await page.goto('/login'); await page.getByTestId('create-clinic-toggle').click(); await page.getByTestId('installer-staff-id').fill(staffId); await pin(page, code);
  await page.getByTestId('staff-option-s1').click(); await pin(page, code);
  await expect(page.getByTestId('sale-root')).toBeVisible();
}
async function switchAndLogin(page: Page, staffId: string, code: string) { await page.getByTestId('switch-user').click(); await page.getByTestId(`staff-option-${staffId}`).click(); await pin(page, code); await expect(page.getByTestId('sale-root')).toBeVisible(); }
async function pin(page: Page, code: string) { for (const digit of code) await page.getByTestId(`pin-key-${digit}`).click(); await page.getByTestId('pin-submit').click(); }
async function captureCashSale(page: Page) { await page.getByTestId('catalogue-item-v1').click(); await page.getByTestId('open-tender').click(); await page.getByTestId('tender-cash').click(); await page.getByTestId('capture-sale').click(); await expect(page.getByTestId('receipt-view')).toBeVisible(); await page.getByTestId('sale-complete').click(); }
async function outboxDepth(page: Page): Promise<number> { return page.evaluate(async () => new Promise<number>((resolve, reject) => { const request = indexedDB.open('eden-clinic'); request.onerror = () => reject(request.error); request.onsuccess = () => { const transaction = request.result.transaction('outbox', 'readonly'); const rows = transaction.objectStore('outbox').getAll(); rows.onerror = () => reject(rows.error); rows.onsuccess = () => resolve((rows.result as Array<{ status: string }>).filter((row) => row.status !== 'done').length); }; })); }
