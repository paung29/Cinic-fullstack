import { expect, test } from '@playwright/test';
import { resetMock } from './mock';
import { captureM3LocaleScreenshot } from './visuals';

test.beforeEach(async ({ request }) => {
  await resetMock(request);
});

test('the development-only login override renders all three approved locales', async ({ page }) => {
  await page.goto('/login?__devLocale=my');
  const root = page.getByTestId('login-root');
  await expect(root).toHaveAttribute('data-locale', 'my');
  await expect(root).toHaveAttribute('lang', 'my');
  await expect(page.getByTestId('dev-locale-override')).toHaveValue('my');
  await expect(root).toHaveCSS('font-family', /Padauk/);
  await expect.poll(() => root.evaluate((element) => {
    const style = getComputedStyle(element);
    return Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize);
  })).toBeGreaterThanOrEqual(1.7);
  await expect(page.getByTestId('demo-fallback-probe')).toHaveText('English fallback probe');
  await captureM3LocaleScreenshot(page, 'my');

  await page.goto('/login?__devLocale=en');
  await expect(root).toHaveAttribute('data-locale', 'en');
  await expect(root).toHaveAttribute('lang', 'en');
  await expect(page.getByTestId('demo-fallback-probe')).toHaveText('English fallback probe');
  await captureM3LocaleScreenshot(page, 'en');

  await page.goto('/login?__devLocale=zh');
  await expect(root).toHaveAttribute('data-locale', 'zh');
  await expect(root).toHaveAttribute('lang', 'zh-Hans');
  await expect(root).toHaveCSS('font-family', /PingFang SC.*Microsoft YaHei.*Noto Sans CJK SC/);
  await expect(page.getByTestId('demo-fallback-probe')).toHaveText('English fallback probe');
  await captureM3LocaleScreenshot(page, 'zh');
});
