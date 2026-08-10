import { expect, test, type Page } from '@playwright/test';
import { resetMock } from './mock';

// Laser hair removal 45,000 + Hydra facial 40,000. The pair is chosen so the
// split button's fixed 50,000 first leg leaves a real 35,000 wallet remainder.
const TOTAL = '85,000 Ks';
const CASH_LEG = '50,000 Ks';

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('the cash pad computes change against the cash leg and never blocks a wallet sale', async ({ page }) => {
  await provisionAsAdmin(page);
  await page.getByTestId('patient-select').selectOption('c1');
  await page.getByTestId('catalogue-item-v1').click();
  await page.getByTestId('catalogue-item-v8').click();
  await page.getByTestId('open-tender').click();

  // Cash: an untouched field means the customer handed over the exact amount,
  // so the sale is completable before anyone types a digit.
  await page.getByTestId('tender-cash').click();
  await expect(page.getByTestId('cash-pad')).toBeVisible();
  await expect(page.getByTestId('cash-received')).toHaveAttribute('placeholder', TOTAL);
  await expect(page.getByTestId('cash-change')).toHaveText('0 Ks');
  await expect(page.getByTestId('capture-sale')).toBeEnabled();

  await page.getByTestId('cash-received').fill('100000');
  await expect(page.getByTestId('cash-change')).toHaveText('15,000 Ks');
  await expect(page.getByTestId('cash-short')).toHaveCount(0);

  // Underpayment names the gap and holds the sale rather than banking a short till.
  await page.getByTestId('cash-received').fill('80000');
  await expect(page.getByTestId('cash-short')).toHaveText(/5,000 Ks/);
  await expect(page.getByTestId('capture-sale')).toBeDisabled();

  // Switching to a wallet must release the cash hold outright — the reported
  // failure was a wallet sale wedged at zero behind a stale cash shortfall.
  await page.getByTestId('tender-kbzpay').click();
  await expect(page.getByTestId('cash-pad')).toHaveCount(0);
  await expect(page.getByTestId('cash-change')).toHaveText('0 Ks');
  await expect(page.getByTestId('capture-sale')).toBeEnabled();

  // A split re-arms the pad against the 50,000 cash leg only, and the earlier
  // figure is gone: a carried-over 80,000 would have claimed 30,000 change.
  await page.getByTestId('tender-split').click();
  await expect(page.getByTestId('cash-received')).toHaveValue('');
  await expect(page.getByTestId('cash-received')).toHaveAttribute('placeholder', CASH_LEG);
  await expect(page.getByTestId('cash-change')).toHaveText('0 Ks');

  await page.getByTestId('cash-received').fill('60000');
  await expect(page.getByTestId('cash-change')).toHaveText('10,000 Ks');
  await expect(page.getByTestId('capture-sale')).toBeEnabled();

  await page.getByTestId('capture-sale').click();
  await expect(page.getByTestId('receipt-view')).toBeVisible();
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
