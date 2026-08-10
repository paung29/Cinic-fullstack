import { expect, test, type Page } from '@playwright/test';
import { resetMock } from './mock';

// Deliberately nothing like the seeded clinic: a different name in a
// different city, so a header still showing the first client's identity
// cannot pass by coincidence.
const CLINIC = 'Thiri Skin Clinic';
const CITY = 'Yangon · Myanmar';

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('a clinic that sets the app up itself sees its own name and city, never the first client\'s', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByTestId('device-setup')).toBeVisible();

  await page.getByTestId('create-clinic-toggle').click();
  await page.getByTestId('clinic-name').fill(CLINIC);
  await page.locator('#clinic-phone').fill('09 111 222 333');
  await page.locator('#clinic-address').fill(CITY);
  await page.getByTestId('admin-name').fill('Daw Thiri');
  await page.locator('#admin-phone').fill('09 444 555 666');
  await page.locator('#admin-email').fill('owner@thiri.test');
  await page.locator('#admin-password').fill('thiri-clinic-2026');
  await enterPin(page, '2468');

  // Setup creates the clinic and its first admin, then hands back to the
  // normal login: she picks herself and enters the PIN she just chose.
  await expect(page.getByTestId('staff-picker')).toBeVisible();
  await page.getByRole('button', { name: /Daw Thiri/ }).click();
  await enterPin(page, '2468');
  await expect(page.getByTestId('sale-root')).toBeVisible();

  const brandBar = page.getByTestId('brand-bar');
  await expect(brandBar).toContainText(CLINIC);
  await expect(brandBar).toContainText(CITY);
  await expect(brandBar).not.toContainText('Eden');
  await expect(brandBar).not.toContainText('Lashio');
  // The admin who ran setup is named, and labelled by their real role rather
  // than a hardcoded "Administrator" string.
  await expect(brandBar).toContainText('Daw Thiri');

  // The header is part of the shell, so it has to hold on every screen — the
  // leak was per-call-site and a single-screen check would have missed it.
  for (const [tab, testId] of [
    ['today', 'today-root'],
    ['calendar', 'calendar-root'],
    ['clients', 'clients-root'],
    ['stocks', 'stocks-root'],
    ['analytics', 'analytics-root'],
    ['setup', 'setup-root'],
  ] as const) {
    await page.getByTestId(`shell-tab-${tab}`).click();
    await expect(page.getByTestId(testId)).toBeVisible();
    await expect(page.getByTestId('brand-bar')).toContainText(CLINIC);
    await expect(page.getByTestId('brand-bar')).not.toContainText('Eden');
  }
});

async function enterPin(page: Page, pin: string): Promise<void> {
  for (const digit of pin) await page.getByTestId(`pin-key-${digit}`).click();
  await page.getByTestId('pin-submit').click();
}
