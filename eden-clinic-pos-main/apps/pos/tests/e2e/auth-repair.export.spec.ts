import { expect, test, type Page } from '@playwright/test';
import { forgetMockStaff, resetMock } from './mock';

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('a server that has forgotten this staff member cannot lock the device out of trading', async ({ page, request }) => {
  await provisionAsAdmin(page);

  // The database is reset behind the device's back — no offboarding delta, so
  // the envelope survives and the device still believes it is provisioned.
  await forgetMockStaff(request, 's1');

  // Take a sale so the device is holding real unsynced work, then try to drain
  // it. The POST 401s, the refresh behind it 401s too, and the device flags
  // itself for online repair.
  await page.getByTestId('catalogue-item-v1').click();
  await page.getByTestId('open-tender').click();
  await page.getByTestId('tender-cash').click();
  await page.getByTestId('capture-sale').click();
  await expect(page.getByTestId('receipt-view')).toBeVisible();
  await page.getByTestId('sale-complete').click();
  await page.getByTestId('sync-chip').click();
  await expect
    .poll(() => page.evaluate(async () => {
      const request_ = indexedDB.open('eden-clinic');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request_.onsuccess = () => resolve(request_.result);
        request_.onerror = () => reject(request_.error);
      });
      return await new Promise((resolve) => {
        const row = db.transaction('meta').objectStore('meta').get('auth-repair:s1');
        row.onsuccess = () => resolve(row.result !== undefined);
        row.onerror = () => resolve(false);
      });
    }), { timeout: 15_000 })
    .toBe(true);

  // The repair flag is set, so the next login prefers a real sign-in — which
  // the server refuses, with the same 401 it would give a wrong PIN. The
  // clinic must still get in: the envelope on this device is intact and it
  // holds the patients and the queued sales.
  // Sessions are memory-only, so a reload is the real scenario: the tablet
  // reboots after a power cut and she has to log in again.
  await page.reload();
  await expect(page.getByTestId('staff-picker')).toBeVisible();
  await page.getByTestId('staff-option-s1').click();
  await enterPin(page, '1234');
  await expect(page.getByTestId('sale-root')).toBeVisible();

  // A genuinely wrong PIN is still refused, so the fallback has not turned the
  // lock screen into a formality.
  await page.reload();
  await expect(page.getByTestId('staff-picker')).toBeVisible();
  await page.getByTestId('staff-option-s1').click();
  await enterPin(page, '9999');
  await expect(page.getByTestId('sale-root')).toHaveCount(0);
});

async function provisionAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await expect(page.getByTestId('device-setup')).toBeVisible();
  await page.getByTestId('installer-staff-id').fill('s1');
  await enterPin(page, '1234');
  await expect(page.getByTestId('staff-picker')).toBeVisible();
  await page.getByTestId('staff-option-s1').click();
  await enterPin(page, '1234');
  await expect(page.getByTestId('sale-root')).toBeVisible();
}

async function enterPin(page: Page, pin: string): Promise<void> {
  for (const digit of pin) await page.getByTestId(`pin-key-${digit}`).click();
  await page.getByTestId('pin-submit').click();
}
