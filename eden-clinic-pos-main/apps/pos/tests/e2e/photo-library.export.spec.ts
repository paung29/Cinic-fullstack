import { expect, test, type Page } from '@playwright/test';
import { resetMock } from './mock';

const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('the photo library keeps graded before/after sessions on the device behind clinical elevation', async ({ page }) => {
  await provisionAsAdmin(page);
  await openClientProfile(page, 'c1');
  await expect(page.getByTestId('photo-library')).toHaveCount(0);

  await unlockClinical(page);
  await expect(page.getByTestId('photo-library')).toBeVisible();
  await expect(page.getByTestId('photo-empty')).toBeVisible();

  await page.getByTestId('photo-add-session').click();
  await expect(page.getByTestId('photo-viewer')).toBeVisible();
  await page.getByTestId('photo-input-before').setInputFiles({ buffer: ONE_PX_PNG, mimeType: 'image/png', name: 'before.png' });
  await expect(page.getByTestId('photo-frame-before').locator('img')).toBeVisible();
  await expect(page.getByTestId('photo-frame-after').locator('img')).toHaveCount(0);
  await page.getByTestId('photo-grade-marked').click();
  await page.getByTestId('photo-title').fill('Laser #1');
  await page.getByTestId('photo-viewer-done').click();
  await expect(page.getByTestId('photo-viewer')).toBeHidden();

  const row = page.getByTestId(/^photo-session-row-/);
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Laser #1');
  // The export suite runs in the default Burmese locale, so the grade is
  // asserted through its locale-independent attribute rather than its label.
  await expect(page.getByTestId(/^photo-session-grade-/)).toHaveAttribute('data-grade', 'marked');

  // A reload drops the memory-only session; the deep link restores the same
  // profile, proving the photos came back from IndexedDB rather than state.
  await page.reload();
  await expect(page.getByTestId('staff-picker')).toBeVisible();
  await page.getByTestId('staff-option-s1').click();
  await enterPin(page, '1234');
  await expect(page.getByTestId('patient-profile')).toBeVisible();
  await unlockClinical(page);
  await expect(page.getByTestId(/^photo-session-row-/)).toContainText('Laser #1');
  await page.getByTestId(/^photo-session-open-/).click();
  await expect(page.getByTestId('photo-frame-before').locator('img')).toBeVisible();

  await page.getByTestId('photo-remove-session').click();
  await expect(page.getByTestId('photo-viewer')).toBeHidden();
  await expect(page.getByTestId('photo-empty')).toBeVisible();
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

async function openClientProfile(page: Page, patientId: string): Promise<void> {
  await page.getByTestId('shell-tab-clients').click();
  await expect(page.getByTestId('clients-root')).toBeVisible();
  await page.getByTestId(`client-row-${patientId}`).click();
  await expect(page.getByTestId('patient-profile')).toBeVisible();
}

async function unlockClinical(page: Page): Promise<void> {
  await expect(page.getByTestId('clinical-locked')).toBeVisible();
  await page.getByTestId('unlock-clinical').click();
  await page.getByTestId('clinical-elevation-password').fill('eden');
  await page.getByTestId('clinical-elevation-confirm').click();
  await expect(page.getByTestId('clinical-record')).toBeVisible();
}
