import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';

const appRoot = process.cwd();
const outputDirectory = resolve(appRoot, '..', '..', 'outputs', 'm3');
const m4OutputDirectory = resolve(appRoot, '..', '..', 'outputs', 'm4');
const m5OutputDirectory = resolve(appRoot, '..', '..', 'outputs', 'm5');
const m6OutputDirectory = resolve(appRoot, '..', '..', 'outputs', 'm6');
const m7OutputDirectory = resolve(appRoot, '..', '..', 'outputs', 'm7');
const referencePath = resolve(appRoot, '..', '..', 'docs', 'reference', 'demo-v4.html');
const fontDirectory = resolve(appRoot, 'public', 'fonts');

const fontFiles = {
  'inter-400.woff2': join(fontDirectory, 'inter-400.woff2'),
  'inter-500.woff2': join(fontDirectory, 'inter-500.woff2'),
  'inter-600.woff2': join(fontDirectory, 'inter-600.woff2'),
  'inter-700.woff2': join(fontDirectory, 'inter-700.woff2'),
  'padauk-400.woff2': join(fontDirectory, 'padauk-400.woff2'),
  'padauk-700.woff2': join(fontDirectory, 'padauk-700.woff2'),
} as const;

function outputPath(name: string): string {
  return join(outputDirectory, name);
}

async function ensureOutputDirectory(): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
}

export async function captureM3Screenshots(page: Page): Promise<void> {
  await ensureOutputDirectory();
  await page.screenshot({ path: outputPath('sale-workspace-my.png') });
}

export async function captureM3State(page: Page, name: string): Promise<void> {
  await ensureOutputDirectory();
  await page.screenshot({ path: outputPath(name) });
}

export async function captureM3LocaleScreenshot(page: Page, locale: 'my' | 'en' | 'zh'): Promise<void> {
  await ensureOutputDirectory();
  await page.screenshot({ path: outputPath(`locale-${locale}.png`) });
}

export async function captureM4State(page: Page, name: string): Promise<void> {
  await mkdir(m4OutputDirectory, { recursive: true });
  await page.screenshot({ path: join(m4OutputDirectory, name) });
}

export async function captureM5State(page: Page, name: string): Promise<void> {
  await mkdir(m5OutputDirectory, { recursive: true });
  await page.screenshot({ path: join(m5OutputDirectory, name) });
}

export async function captureM6State(page: Page, name: string, target?: Locator): Promise<void> {
  await mkdir(m6OutputDirectory, { recursive: true });
  await target?.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(m6OutputDirectory, name) });
}

export async function captureM7State(page: Page, name: string, target?: Locator): Promise<void> {
  await mkdir(m7OutputDirectory, { recursive: true });
  await target?.scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(m7OutputDirectory, name) });
}

export async function captureM6ReferenceComparison(page: Page, name: 'home' | 'hub-money'): Promise<void> {
  await mkdir(m6OutputDirectory, { recursive: true });
  await fulfillReferenceFonts(page);
  const reference = await page.context().newPage();
  const referenceHtml = await readFile(referencePath, 'utf8');
  const preparedHtml = referenceHtml.replace("let S={screen:'login',user:null", "let S={screen:'home',user:staff[0]");
  await reference.setContent(preparedHtml, { waitUntil: 'domcontentloaded' });
  await reference.waitForFunction(() => document.fonts.status === 'loaded');
  if (name === 'hub-money') {
    await reference.evaluate(() => (window as typeof window & { go(target: string): void }).go('hub'));
    await reference.getByRole('button', { name: 'Money' }).click();
  }
  const referenceImage = await reference.screenshot();
  const implementationImage = await page.screenshot();
  await reference.close();
  await captureM6SideBySide(page, `comparison-${name}.png`, referenceImage, implementationImage);
}

export async function captureM5ReferenceComparison(page: Page, name: 'setup' | 'stocks' | 'clients' | 'calendar'): Promise<void> {
  await mkdir(m5OutputDirectory, { recursive: true });
  await fulfillReferenceFonts(page);
  const reference = await page.context().newPage();
  const referenceHtml = await readFile(referencePath, 'utf8');
  const preparedHtml = referenceHtml.replace("let S={screen:'login',user:null", "let S={screen:'home',user:staff[0]");
  await reference.setContent(preparedHtml, { waitUntil: 'domcontentloaded' });
  await reference.waitForFunction(() => document.fonts.status === 'loaded');
  await reference.evaluate((screen) => (window as typeof window & { go(target: string): void }).go(screen), name);
  const referenceImage = await reference.screenshot();
  const implementationImage = await page.screenshot();
  await reference.close();
  await captureM5SideBySide(page, `comparison-${name}.png`, referenceImage, implementationImage);
}

export async function captureM4ReferenceComparison(page: Page, name: 'clients' | 'calendar'): Promise<void> {
  await mkdir(m4OutputDirectory, { recursive: true });
  await fulfillReferenceFonts(page);
  const reference = await page.context().newPage();
  const referenceHtml = await readFile(referencePath, 'utf8');
  const preparedHtml = referenceHtml.replace("let S={screen:'login',user:null", "let S={screen:'home',user:staff[0]");
  await reference.setContent(preparedHtml, { waitUntil: 'domcontentloaded' });
  await reference.waitForFunction(() => document.fonts.status === 'loaded');
  await reference.evaluate((screen) => (window as typeof window & { go(target: string): void }).go(screen), name);
  const referenceImage = await reference.screenshot();
  const implementationImage = await page.screenshot();
  await reference.close();
  await captureM4SideBySide(page, `comparison-${name}.png`, referenceImage, implementationImage);
}

export async function captureM3ReferenceComparison(page: Page, name: 'login' | 'sale'): Promise<void> {
  await ensureOutputDirectory();
  await fulfillReferenceFonts(page);
  const reference = await page.context().newPage();
  const referenceHtml = await readFile(referencePath, 'utf8');
  const preparedHtml = name === 'sale'
    ? referenceHtml.replace("let S={screen:'login',user:null", "let S={screen:'home',user:staff[0]")
    : referenceHtml;
  await reference.setContent(preparedHtml, { waitUntil: 'domcontentloaded' });
  await reference.waitForFunction(() => document.fonts.status === 'loaded');
  if (name === 'sale') {
    await reference.evaluate(() => (window as typeof window & { go(screen: string): void }).go('sale'));
  }
  const referenceImage = await reference.screenshot();
  const implementationImage = await page.screenshot();
  await reference.close();
  await captureSideBySide(page, `comparison-${name}.png`, referenceImage, implementationImage);
}

async function fulfillReferenceFonts(page: Page): Promise<void> {
  const fontCss = Object.entries(fontFiles).map(([fileName]) => {
    const [family, weight] = fileName.replace('.woff2', '').split('-');
    const fontFamily = family === 'padauk' ? 'Padauk' : 'Inter';
    return `@font-face{font-family:'${fontFamily}';font-style:normal;font-weight:${weight};font-display:swap;src:url('https://fonts.gstatic.com/eden-m3/${fileName}') format('woff2');}`;
  }).join('');
  await page.context().route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: fontCss, contentType: 'text/css' }));
  await page.context().route('https://fonts.gstatic.com/eden-m3/**', async (route) => {
    const fileName = new URL(route.request().url()).pathname.split('/').at(-1);
    const fontPath = fileName === undefined ? undefined : fontFiles[fileName as keyof typeof fontFiles];
    if (fontPath === undefined) return route.abort();
    return route.fulfill({ body: await readFile(fontPath), contentType: 'font/woff2' });
  });
}

async function captureSideBySide(page: Page, name: string, reference: Buffer, implementation: Buffer): Promise<void> {
  const comparison = await page.context().newPage();
  await comparison.setContent(`<!doctype html><html><body><main><img alt="Reference" src="data:image/png;base64,${reference.toString('base64')}"><img alt="Implementation" src="data:image/png;base64,${implementation.toString('base64')}"></main></body></html>`);
  await comparison.addStyleTag({ content: 'html,body{margin:0;background:#faf9f7}main{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}img{width:100%;height:auto;display:block}' });
  await comparison.screenshot({ fullPage: true, path: outputPath(name) });
  await comparison.close();
}

async function captureM4SideBySide(page: Page, name: string, reference: Buffer, implementation: Buffer): Promise<void> {
  const comparison = await page.context().newPage();
  await comparison.setContent(`<!doctype html><html><body><main><img alt="Reference" src="data:image/png;base64,${reference.toString('base64')}"><img alt="Implementation" src="data:image/png;base64,${implementation.toString('base64')}"></main></body></html>`);
  await comparison.addStyleTag({ content: 'html,body{margin:0;background:#faf9f7}main{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}img{width:100%;height:auto;display:block}' });
  await comparison.screenshot({ fullPage: true, path: join(m4OutputDirectory, name) });
  await comparison.close();
}

async function captureM5SideBySide(page: Page, name: string, reference: Buffer, implementation: Buffer): Promise<void> {
  const comparison = await page.context().newPage();
  await comparison.setContent(`<!doctype html><html><body><main><img alt="Reference" src="data:image/png;base64,${reference.toString('base64')}"><img alt="Implementation" src="data:image/png;base64,${implementation.toString('base64')}"></main></body></html>`);
  await comparison.addStyleTag({ content: 'html,body{margin:0;background:#faf9f7}main{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}img{width:100%;height:auto;display:block}' });
  await comparison.screenshot({ fullPage: true, path: join(m5OutputDirectory, name) });
  await comparison.close();
}

async function captureM6SideBySide(page: Page, name: string, reference: Buffer, implementation: Buffer): Promise<void> {
  const comparison = await page.context().newPage();
  await comparison.setContent(`<!doctype html><html><body><main><img alt="Reference" src="data:image/png;base64,${reference.toString('base64')}"><img alt="Implementation" src="data:image/png;base64,${implementation.toString('base64')}"></main></body></html>`);
  await comparison.addStyleTag({ content: 'html,body{margin:0;background:#faf9f7}main{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px}img{width:100%;height:auto;display:block}' });
  await comparison.screenshot({ fullPage: true, path: join(m6OutputDirectory, name) });
  await comparison.close();
}
