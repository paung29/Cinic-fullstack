import { expect, test, type Page } from '@playwright/test';
import { offboardMockStaff, resetMock } from './mock';
import { captureM4ReferenceComparison, captureM4State } from './visuals';

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('the M4 static export retains the complete offline baseline before workflow coverage', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const hostname = new URL(request.url()).hostname;
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

test('a static offline client deep link survives reload and PIN re-entry', async ({ page }) => {
  await provisionAsAdmin(page);
  await page.getByTestId('logout-button').click();
  await expect(page.getByTestId('staff-picker')).toBeVisible();

  await page.route('**://127.0.0.1:4010/**', (route) => route.abort());
  await page.goto('/clients?patient=c1');
  await page.reload();
  await expect(page.getByTestId('staff-picker')).toBeVisible();
  await page.getByTestId('staff-option-s1').click();
  await enterPin(page, '1234');
  await expect(page.getByTestId('patient-profile')).toBeVisible();
  await expect(page.getByTestId('patient-profile')).toContainText('Ma Thida');
  await captureM4State(page, 'client-profile-offline.png');
});

test('offline patient creation merges safely after a dependent booking drains', async ({ page }) => {
  await provisionAsAdmin(page);
  await page.route('**://127.0.0.1:4010/**', (route) => route.abort());
  await openClients(page);
  await page.getByTestId('new-patient-open').click();
  await page.getByTestId('new-patient-name').fill('Ma Thida duplicate');
  await page.getByTestId('new-patient-phone').fill('09 771 234 560');
  await page.getByTestId('new-patient-save').click();
  await expect(page.getByTestId('patient-profile')).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('patient')).not.toBeNull();
  const provisionalId = new URL(page.url()).searchParams.get('patient');
  expect(provisionalId).not.toBeNull();

  await page.getByTestId('patient-profile-book').click();
  await page.getByTestId('calendar-slot-s1-09:00').click();
  await expect(page.getByTestId('booking-patient')).toHaveValue(provisionalId!);
  await page.getByTestId('booking-service').selectOption('v1');
  await page.getByTestId('calendar-save-appointment').click();
  await expect(page.getByTestId(/^calendar-appointment-/)).toBeVisible();

  await page.unroute('**://127.0.0.1:4010/**');
  await page.getByTestId('sync-chip').click();
  await expect.poll(async () => {
    const patients = await readStore(page, 'patients');
    const appointments = await readStore(page, 'appointments');
    return patients.every((patient) => patient.id !== provisionalId)
      && appointments.some((appointment) => appointment.patientId === 'c1');
  }).toBe(true);
});

test('clinical view requires online elevation and recall respects its bootstrap add-on flag', async ({ browser, page, request }) => {
  await provisionAsAdmin(page);
  await openClientProfile(page, 'c1');
  await expect(page.getByTestId('clinical-locked')).toBeVisible();
  await captureM4State(page, 'client-clinical-locked.png');
  await page.getByTestId('unlock-clinical').click();
  await page.getByTestId('clinical-elevation-password').fill('eden');
  await page.getByTestId('clinical-elevation-confirm').click();
  await expect(page.getByTestId('clinical-record')).toBeVisible();
  await expect(page.getByTestId('recall-card')).toBeVisible();
  await captureM4State(page, 'client-clinical-elevated.png');
  await captureM4ReferenceComparison(page, 'clients');

  await resetMock(request, { addons: { recall: false } });
  const recallContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 800 } });
  const recallOffPage = await recallContext.newPage();
  await provisionAsAdmin(recallOffPage);
  await openClientProfile(recallOffPage, 'c1');
  await recallOffPage.getByTestId('unlock-clinical').click();
  await recallOffPage.getByTestId('clinical-elevation-password').fill('eden');
  await recallOffPage.getByTestId('clinical-elevation-confirm').click();
  await expect(recallOffPage.getByTestId('clinical-record')).toBeVisible();
  await expect(recallOffPage.getByTestId('recall-card')).toHaveCount(0);
  await recallContext.close();
});

test('calendar books slots, blocks a duplicate, and keeps a new patient selected in the booking form', async ({ page }) => {
  await provisionAsAdmin(page);
  await page.getByTestId('shell-tab-calendar').click();
  await expect(page.getByTestId('calendar-root')).toBeVisible();
  await captureM4State(page, 'calendar-day.png');
  await captureM4ReferenceComparison(page, 'calendar');
  await page.getByTestId('calendar-slot-s1-09:00').click();
  await captureM4State(page, 'calendar-booking-modal.png');
  await page.getByTestId('booking-patient').selectOption('c1');
  await page.getByTestId('booking-service').selectOption('v1');
  await page.getByTestId('calendar-save-appointment').click();
  await expect(page.getByTestId(/^calendar-appointment-/)).toBeVisible();

  await page.getByTestId('calendar-book').click();
  await page.getByTestId('booking-patient').selectOption('c1');
  await page.getByTestId('booking-service').selectOption('v1');
  await page.getByTestId('calendar-save-appointment').click();
  await expect(page.getByTestId('toast-item')).toBeVisible();
  await page.getByTestId('calendar-new-patient').click();
  await page.getByTestId('calendar-patient-name').fill('Daw Nu');
  await page.getByTestId('calendar-patient-phone').fill('09 450 111 222');
  await page.getByTestId('calendar-create-patient').click();
  await expect(page.getByTestId('calendar-new-patient-modal')).toBeHidden();
  await expect(page.getByTestId('booking-patient')).not.toHaveValue('');
});

test('server offboarding advertises degradation for staff and ends a revoked live session', async ({ page, request }) => {
  await provisionAsAdmin(page);
  await page.getByTestId('logout-button').click();
  await page.getByTestId('staff-option-s2').click();
  await enterPin(page, '0000');
  await expect(page.getByTestId('sale-root')).toBeVisible();
  await page.getByTestId('catalogue-item-v1').click();
  await page.getByTestId('open-tender').click();
  await page.getByTestId('tender-cash').click();
  await page.getByTestId('capture-sale').click();
  await expect(page.getByTestId('receipt-view')).toBeVisible();
  await page.getByTestId('sale-complete').click();
  await expect(page.getByTestId('modal-backdrop')).toHaveCount(0);

  await offboardMockStaff(request, 's1');
  await page.getByTestId('sync-chip').click();
  await expect(page.getByTestId('offline-admin-attention')).toBeVisible();
  await offboardMockStaff(request, 's2');
  await page.getByTestId('sync-chip').click();
  await expect(page.getByTestId('staff-picker')).toBeVisible();
  await expect(page.getByTestId('staff-option-s2')).toHaveCount(0);
});

async function provisionAsAdmin(page: Page): Promise<void> {
  await page.goto('/login');
  await expect(page.getByTestId('device-setup')).toBeVisible();
  await page.getByTestId('create-clinic-toggle').click();
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

async function openClients(page: Page): Promise<void> {
  await page.getByTestId('shell-tab-clients').click();
  await expect(page.getByTestId('clients-root')).toBeVisible();
}

async function openClientProfile(page: Page, patientId: string): Promise<void> {
  await openClients(page);
  await page.getByTestId(`client-row-${patientId}`).click();
  await expect(page.getByTestId('patient-profile')).toBeVisible();
}

async function readStore(page: Page, storeName: string): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async (store) => new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
    const request = indexedDB.open('eden-clinic');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction(store, 'readonly');
      const rows = transaction.objectStore(store).getAll();
      rows.onerror = () => reject(rows.error);
      rows.onsuccess = () => resolve(rows.result as Array<Record<string, unknown>>);
    };
  }), storeName);
}
