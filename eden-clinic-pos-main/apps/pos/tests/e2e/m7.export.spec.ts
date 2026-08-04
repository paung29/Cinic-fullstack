import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readMockSales, resetMock } from './mock';
import { captureM7State } from './visuals';

const apiPattern = '**://127.0.0.1:4010/**';
const appRoot = process.cwd();

test.beforeEach(async ({ request }) => { await resetMock(request); });

test('an offline navigation cache miss receives the precached login shell without API traffic', async ({ context, page }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('http://127.0.0.1:4010/')) apiRequests.push(request.url());
  });

  await page.goto('/login');
  await expect(page.getByTestId('login-root')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  const fallback = await page.goto('/not-exported-offline-route');
  await expect(page.getByTestId('login-root')).toBeVisible();
  expect(fallback?.ok()).toBe(true);
  const rscContentType = await page.evaluate(async () => (await fetch('/login.txt')).headers.get('content-type'));
  expect(rscContentType).toContain('text/x-component');
  expect(apiRequests).toEqual([]);
});

test('the generated CSP covers every exported application route with no normal-path violations', async ({ page }) => {
  await installViolationCollector(page);
  for (const route of ['/', '/login', '/sale', '/calendar', '/clients', '/stocks', '/setup', '/security']) {
    const response = await page.goto(route);
    const policy = response?.headers()['content-security-policy'];
    expect(policy).toBeDefined();
    expect(policy).not.toContain('unsafe-inline');
    expect(policy).not.toContain('unsafe-eval');
  }
  expect(await securityPolicyViolations(page)).toEqual([]);
});

test('the CSP tripwire blocks an unhashed inline script and eval without weakening the policy', async ({ page }) => {
  await installViolationCollector(page);
  const response = await page.goto('/__csp-tripwire');
  const policy = response?.headers()['content-security-policy'];
  expect(policy).toBeDefined();
  expect(policy).not.toContain('unsafe-eval');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.evalBlocked)).toBe('true');
  expect(await page.evaluate(() => document.documentElement.dataset.unhashedScript)).toBeUndefined();
  await expect.poll(async () => (await securityPolicyViolations(page)).length).toBeGreaterThanOrEqual(2);
});

test('a reprint Blob image renders under CSP without a policy violation', async ({ page }) => {
  await installViolationCollector(page);
  await provision(page, 's1', '1234');
  await captureCashSale(page);
  await page.getByTestId('sync-chip').click();
  await expect.poll(async () => page.getByTestId('sync-chip').locator('strong').textContent()).toBe('0');
  await page.getByTestId('shell-tab-today').click();
  await page.getByTestId(/^reprint-sale-/).first().click();
  await expect(page.getByTestId('reprint-receipt-canvas')).toBeVisible();
  await expect(page.getByTestId('reprint-receipt-canvas')).toHaveAttribute('src', /^blob:/);
  await captureM7State(page, 'receipt-copy-576.png', page.getByTestId('reprint-receipt-canvas'));
  expect(await securityPolicyViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByTestId('shift-close').click();
  await page.getByTestId('shift-opening').fill('100000');
  await page.getByTestId('shift-counted').fill('0');
  await captureM7State(page, 'shift-close-negative.png', page.getByTestId('shift-close-modal'));
  await page.keyboard.press('Escape');
  await page.getByTestId('shell-tab-setup').click();
  await expect(page.getByTestId('storage-diagnostics')).toBeVisible();
  await captureM7State(page, 'setup-storage-diagnostics.png', page.getByTestId('storage-diagnostics'));
});

test('Restart is cart-guarded, then reloads only after the cart clears', async ({ page }) => {
  const workerPath = resolve(appRoot, 'out/sw.js');
  const originalWorker = await readFile(workerPath, 'utf8');
  try {
    await provision(page, 's1', '1234');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await page.getByTestId('staff-option-s1').click();
    await pin(page, '1234');
    await expect(page.getByTestId('sale-root')).toBeVisible();

    await page.getByTestId('catalogue-item-v1').click();
    await writeFile(workerPath, `${originalWorker}\n// M7 update test artifact\n`);
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
    await expect(page.getByTestId('pwa-update-restart')).toBeVisible();
    await expect(page.getByTestId('pwa-update-restart')).toBeDisabled();
    await captureM7State(page, 'update-cart-blocked.png', page.getByTestId('toast-item'));

    await page.getByTestId('sale-line-remove').click();
    await expect(page.getByTestId('pwa-update-restart')).toBeEnabled();
    await page.getByTestId('pwa-update-restart').click();
    await expect(page.getByTestId('login-root')).toBeVisible();
  } finally {
    await writeFile(workerPath, originalWorker);
  }
});

test('a true offline persistent-browser reboot keeps queued sales and drains them unchanged', async ({ browser, request }) => {
  const profile = await mkdtemp(join(tmpdir(), 'eden-m7-reboot-'));
  let online: BrowserContext | undefined;
  let offline: BrowserContext | undefined;
  try {
    const onlineContext = await browser.browserType().launchPersistentContext(profile, { viewport: { width: 1280, height: 800 } });
    online = onlineContext;
    const onlinePage = onlineContext.pages()[0] ?? await onlineContext.newPage();
    await provision(onlinePage, 's1', '1234', 'http://127.0.0.1:4173');
    await onlinePage.evaluate(() => navigator.serviceWorker.ready);
    await onlinePage.reload();
    await expect.poll(() => onlinePage.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await onlinePage.getByTestId('staff-option-s1').click();
    await pin(onlinePage, '1234');
    await onlinePage.route(apiPattern, (route) => route.abort());
    await captureCashSale(onlinePage);
    await captureCashSale(onlinePage);
    await expect.poll(() => outboxDepth(onlinePage)).toBe(2);
    await captureM7State(onlinePage, 'offline-reboot-before-close.png', onlinePage.getByTestId('sync-chip'));
    await onlineContext.close();
    online = undefined;

    // `offline: true` is set at launch, before this context's first navigation.
    const offlineContext = await browser.browserType().launchPersistentContext(profile, { offline: true, viewport: { width: 1280, height: 800 } });
    offline = offlineContext;
    const offlinePage = offlineContext.pages()[0] ?? await offlineContext.newPage();
    await offlinePage.goto('http://127.0.0.1:4173/login');
    await expect(offlinePage.getByTestId('staff-picker')).toBeVisible();
    await captureM7State(offlinePage, 'offline-reboot-login.png', offlinePage.getByTestId('staff-picker'));
    await offlinePage.getByTestId('staff-option-s1').click();
    await pin(offlinePage, '1234');
    await expect(offlinePage.getByTestId('sale-root')).toBeVisible();
    await expect.poll(() => outboxDepth(offlinePage)).toBe(2);

    await offlineContext.setOffline(false);
    await offlinePage.getByTestId('sync-chip').click();
    await expect.poll(async () => (await readMockSales(request)).length).toBe(2);
    await expect.poll(() => outboxDepth(offlinePage)).toBe(0);
  } finally {
    await offline?.close();
    await online?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

async function installViolationCollector(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as typeof window & { __edenCspViolations?: Array<{ effectiveDirective: string; blockedURI: string }> };
    target.__edenCspViolations = [];
    window.addEventListener('securitypolicyviolation', (event) => {
      target.__edenCspViolations?.push({ effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI });
    });
  });
}

async function securityPolicyViolations(page: Page): Promise<Array<{ effectiveDirective: string; blockedURI: string }>> {
  return page.evaluate(() => (window as typeof window & { __edenCspViolations?: Array<{ effectiveDirective: string; blockedURI: string }> }).__edenCspViolations ?? []);
}

async function provision(page: Page, staffId: string, code: string, baseUrl?: string): Promise<void> {
  await page.goto(baseUrl === undefined ? '/login' : `${baseUrl}/login`);
  await page.getByTestId('installer-staff-id').fill(staffId);
  await pin(page, code);
  await page.getByTestId(`staff-option-${staffId}`).click();
  await pin(page, code);
  await expect(page.getByTestId('sale-root')).toBeVisible();
}

async function pin(page: Page, code: string): Promise<void> {
  for (const digit of code) await page.getByTestId(`pin-key-${digit}`).click();
  await page.getByTestId('pin-submit').click();
}

async function captureCashSale(page: Page): Promise<void> {
  await page.getByTestId('catalogue-item-v1').click();
  await page.getByTestId('open-tender').click();
  await page.getByTestId('tender-cash').click();
  await page.getByTestId('capture-sale').click();
  await expect(page.getByTestId('receipt-view')).toBeVisible();
  await page.getByTestId('sale-complete').click();
  await expect(page.getByTestId('modal-backdrop')).toHaveCount(0);
}

async function outboxDepth(page: Page): Promise<number> {
  return page.evaluate(async () => new Promise<number>((resolve, reject) => {
    const request = indexedDB.open('eden-clinic');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction('outbox', 'readonly');
      const rows = transaction.objectStore('outbox').getAll();
      rows.onerror = () => reject(rows.error);
      rows.onsuccess = () => resolve((rows.result as Array<{ status: string }>).filter((row) => row.status !== 'done').length);
    };
  }));
}
