import { expect, test } from '@playwright/test';
import { resetMock } from './mock';
import { captureM5ReferenceComparison, captureM5State } from './visuals';

async function provisionAdmin(page: import('@playwright/test').Page): Promise<void> {
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

test('the real production locale picker changes immediately and persists through a static-export reload', async ({ page }) => {
  await provisionAdmin(page);
  await page.getByTestId('shell-tab-setup').click();
  await expect(page.getByTestId('setup-root')).toBeVisible();
  await expect(page.getByTestId('setup-clinic-name-field')).toContainText('ဆေးခန်းအမည်');
  await page.getByTestId('locale-picker').selectOption('en');
  await expect(page.getByTestId('setup-root')).toHaveAttribute('data-locale', 'en');
  await expect(page.getByTestId('setup-root')).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('setup-save')).toContainText('Save');
  await page.reload();
  await expect(page.getByTestId('login-root')).toHaveAttribute('data-locale', 'en');
});

test('an elevated confirmed receipt setting controls the next renderer result without a config outbox row', async ({ page }) => {
  await provisionAdmin(page);
  await page.getByTestId('shell-tab-setup').click();
  await page.getByRole('switch', { name: /Telegram/ }).click();
  await page.getByTestId('setup-save').click();
  await page.getByTestId('setup-password').fill('eden');
  await page.getByTestId('setup-elevation-submit').click();
  await expect(page.getByTestId('setup-elevation')).toBeHidden();
  await page.getByTestId('shell-tab-sale').click();
  await page.getByTestId('catalogue-item-v1').click();
  await page.getByTestId('open-tender').click();
  await page.getByTestId('tender-cash').click();
  await page.getByTestId('capture-sale').click();
  await expect(page.getByTestId('receipt-canvas')).toBeVisible();
  await expect(page.getByTestId('receipt-view')).toHaveAttribute('data-qr-present', 'false');
  await captureM5State(page, 'receipt-completed-80.png');
  await page.getByTestId('sale-complete').click();
  await expect(page.getByTestId('modal-backdrop')).toHaveCount(0);
});

test('the one receipt renderer captures every clinic template at 80 mm and classic at 58 mm', async ({ page }) => {
  await provisionAdmin(page);
  await page.getByTestId('shell-tab-setup').click();
  await expect(page.getByTestId('receipt-preview')).toBeVisible();
  for (const template of ['classic', 'modern', 'minimal', 'boxed']) {
    await page.getByTestId('receipt-template').selectOption(template);
    await expect(page.getByTestId('receipt-preview')).toBeVisible();
    await captureM5State(page, `setup-${template}-80.png`);
  }
  await page.getByTestId('receipt-template').selectOption('classic');
  await page.getByTestId('printer-width').selectOption('384');
  await expect(page.getByTestId('receipt-preview')).toBeVisible();
  await captureM5State(page, 'setup-classic-58.png');
  await captureM5ReferenceComparison(page, 'setup');
  await page.getByTestId('shell-tab-sale').click();
  await page.getByTestId('catalogue-item-v1').click();
  await page.getByTestId('open-tender').click();
  await page.getByTestId('tender-cash').click();
  await page.getByTestId('capture-sale').click();
  await expect(page.getByTestId('receipt-canvas')).toBeVisible();
  await captureM5State(page, 'receipt-completed-58.png');
});

test('Stocks captures a barcode-first weight product and injectable receive surface', async ({ page }) => {
  await provisionAdmin(page);
  await page.getByTestId('shell-tab-stocks').click();
  await expect(page.getByTestId('stocks-root')).toBeVisible();
  await page.route('**://127.0.0.1:4010/stock/receive', (route) => route.abort());
  await page.getByTestId('receive-open-p7').click();
  await page.getByTestId('receive-lot').fill('BTX-2311');
  await page.getByTestId('receive-expiry').fill('2027-01');
  await page.getByTestId('receive-save').click();
  await expect(page.getByTestId('stock-row-p7')).toContainText('BTX-2311 exp 2027-01');
  await captureM5State(page, 'stocks-table.png');
  await captureM5ReferenceComparison(page, 'stocks');
  await page.unroute('**://127.0.0.1:4010/stock/receive');
  await page.getByTestId('add-product-open').click();
  await page.getByTestId('add-product-barcode').fill('4005900654321');
  await page.getByTestId('add-product-lookup').click();
  await expect(page.getByTestId('add-product-save')).toBeEnabled();
  await page.getByTestId('add-product-sold-by').selectOption('weight');
  await page.getByTestId('add-product-save').click();
  await expect(page.getByTestId('add-product-modal')).toBeHidden();
  await captureM5State(page, 'stocks-add-weight.png');
  await captureM5State(page, 'stocks-receive-injectable.png');
});

test('M4 visual evidence includes the standalone Clients list and all calendar status blocks', async ({ page }) => {
  await provisionAdmin(page);
  await page.getByTestId('shell-tab-clients').click();
  await expect(page.getByTestId('clients-root')).toBeVisible();
  await captureM5State(page, 'clients-list.png');
  await captureM5ReferenceComparison(page, 'clients');

  await seedCalendarStatusBlocks(page);
  await page.getByTestId('shell-tab-calendar').click();
  await expect(page.getByTestId('calendar-root')).toBeVisible();
  for (const id of ['booked', 'here', 'done', 'cancelled']) {
    await expect(page.getByTestId(`calendar-appointment-evidence-${id}`)).toBeVisible();
  }
  await captureM5State(page, 'calendar-status-blocks.png');
  await captureM5ReferenceComparison(page, 'calendar');
});

async function seedCalendarStatusBlocks(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('eden-clinic');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction('appointments', 'readwrite');
      const store = transaction.objectStore('appointments');
      const rows = [
        { id: 'evidence-booked', date: '2026-07-31', time: '09:00', staffId: 's1', patientId: 'c1', serviceId: 'v1', status: 'booked', syncConflict: false },
        { id: 'evidence-here', date: '2026-07-31', time: '09:30', staffId: 's1', patientId: 'c2', serviceId: 'v1', status: 'here', syncConflict: false },
        { id: 'evidence-done', date: '2026-07-31', time: '10:00', staffId: 's3', patientId: 'c1', serviceId: 'v1', status: 'done', syncConflict: false },
        { id: 'evidence-cancelled', date: '2026-07-31', time: '10:30', staffId: 's3', patientId: 'c2', serviceId: 'v1', status: 'cancelled', syncConflict: false },
      ];
      rows.forEach((row) => store.put(row));
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    };
  }));
}
