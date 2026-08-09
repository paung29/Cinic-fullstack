import { fmtMMK } from '@/data/money';
import type { ClinicRow, SaleRow } from '@/data/types';
import { buildQrMatrix, normalizeTelegramHandle, telegramDisplayHandle, telegramLink, type QrMatrix } from './qr';
import { RECEIPT_FONTS, headerFamilyFor } from './receiptFonts';
import type { LogoBitmap } from './receiptLogo';

export type ReceiptPalette = {
  background: string;
  ink: string;
  brand: string;
  muted: string;
  line: string;
};

export type ReceiptRenderInput = {
  sale: SaleRow;
  clinic: ClinicRow;
  width: 576 | 384;
  palette: ReceiptPalette;
  copyMarker?: string;
  /** Pre-dithered brand mark; omitted when the clinic has not uploaded one. */
  logo?: LogoBitmap;
};

export type ReceiptHeaderFont = string;

export type ReceiptRun = {
  kind: 'header-latin' | 'header-burmese' | 'body' | 'total' | 'divider' | 'qr' | 'copy-marker' | 'contact' | 'logo' | 'qr-code';
  text: string;
  font: string;
  locale: 'en' | 'my';
  align: 'left' | 'center';
  weight: 400 | 700;
  fontSize: number;
  advance: number;
  spacingBefore: number;
};

type UnmeasuredReceiptRun = Omit<ReceiptRun, 'fontSize' | 'advance' | 'spacingBefore'>;

export type ReceiptLayout = {
  width: 576 | 384;
  height: number;
  template: ClinicRow['receiptTemplate'];
  headerFont: string;
  runs: ReceiptRun[];
  logo?: LogoBitmap;
  qr?: QrMatrix;
};

export type RenderedReceipt = {
  width: 576 | 384;
  png: Blob;
  raster: Uint8Array;
  layout: ReceiptLayout;
};

type ReceiptDrawingContext = Pick<CanvasRenderingContext2D, 'fillRect' | 'fillText' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke' | 'setLineDash'> & {
  fillStyle?: CanvasRenderingContext2D['fillStyle'];
  strokeStyle?: CanvasRenderingContext2D['strokeStyle'];
  font?: string;
  textAlign?: CanvasTextAlign;
};

export type ReceiptCanvas = {
  context: ReceiptDrawingContext;
  toBlob(): Promise<Blob>;
};

export type ReceiptRenderDeps = {
  fonts: Pick<FontFaceSet, 'load'>;
  createCanvas?: (width: number, height: number) => ReceiptCanvas;
};

const burmeseSample = 'ကျေးဇူးတင်ပါသည်';
const latinHeader = 'Eden Clinic';
const qrMarker = '▩▩';
const qrCaption = 'Telegram — aftercare & booking';

export async function waitForReceiptFonts(fonts: Pick<FontFaceSet, 'load'>, headerFont: ReceiptHeaderFont): Promise<void> {
  const pending: Array<Promise<unknown>> = [
    fonts.load('700 16px Inter'),
    fonts.load('400 16px Padauk', burmeseSample),
  ];

  // Only the selected face is fetched; the registry keeps this in step with
  // the picker automatically as fonts are added.
  const selected = RECEIPT_FONTS.find((font) => font.id === headerFont);
  if (selected !== undefined && selected.family !== 'Inter') {
    pending.push(fonts.load(`700 24px "${selected.family}"`, latinHeader));
  }

  // Best-effort: a rejected face load (offline cold cache) must never block a receipt;
  // the canvas falls back to the closest available face instead.
  await Promise.allSettled(pending);
}

export function buildReceiptLayout(input: ReceiptRenderInput): ReceiptLayout {
  const { clinic, sale, width } = input;
  const headerFont = resolveHeaderFont(clinic.receiptHeaderFont, clinic.name || latinHeader);
  const align = clinic.receiptTemplate === 'modern' || clinic.receiptTemplate === 'minimal' ? 'center' : 'left';
  const brandName = clinic.name || latinHeader;
  const runs: UnmeasuredReceiptRun[] = [];

  if (input.logo !== undefined && input.logo.width > 0 && input.logo.height > 0) {
    runs.push({ kind: 'logo', text: '', font: 'Inter', locale: 'en', align: 'center', weight: 400 });
  }

  runs.push(
    { kind: 'header-latin', text: brandName, font: headerFont, locale: 'en', align, weight: 700 },
    { kind: 'header-burmese', text: burmeseSample, font: 'Padauk', locale: 'my', align, weight: 400 },
  );

  // Phone and address were captured in Set-up but never reached the paper.
  if (clinic.phone) {
    runs.push({ kind: 'contact', text: clinic.phone, font: 'Inter', locale: 'en', align, weight: 400 });
  }
  if (clinic.address) {
    runs.push({ kind: 'contact', text: clinic.address, font: 'Inter', locale: 'en', align, weight: 400 });
  }

  runs.push(
    { kind: 'body', text: `Receipt ${sale.no ?? sale.id}`, font: 'Inter', locale: 'en', align: 'left', weight: 400 },
    { kind: 'divider', text: clinic.receiptDivider, font: 'Inter', locale: 'en', align: 'left', weight: 400 },
  );

  if (input.copyMarker !== undefined) {
    runs.push({ kind: 'copy-marker', text: input.copyMarker, font: 'Inter', locale: 'en', align: 'center', weight: 700 });
  }

  for (const line of sale.lines) {
    runs.push({ kind: 'body', text: `${line.qty} × ${line.nameSnapshot}  ${fmtMMK(line.lineTotal)}`, font: 'Inter', locale: 'en', align: 'left', weight: 400 });
  }
  runs.push({ kind: 'total', text: `Total  ${fmtMMK(sale.total)}`, font: 'Inter', locale: 'en', align: 'left', weight: 700 });
  if (clinic.receiptNextVisit) {
    runs.push({ kind: 'body', text: 'Next visit: ask our team', font: 'Inter', locale: 'en', align: 'left', weight: 400 });
  }
  if (clinic.receiptFooter) {
    runs.push({ kind: 'body', text: clinic.receiptFooter, font: 'Inter', locale: 'en', align, weight: 400 });
  }
  // A real scannable code replaces the old placeholder glyph whenever the
  // clinic has given us a handle; without one we keep the plain caption
  // rather than printing a QR that leads nowhere.
  const handle = normalizeTelegramHandle(clinic.telegramHandle ?? '');
  const qr = clinic.receiptQr && handle !== '' ? buildQrMatrix(telegramLink(handle)) : undefined;
  if (clinic.receiptQr) {
    if (qr !== undefined) {
      runs.push({ kind: 'qr-code', text: telegramLink(handle), font: 'Inter', locale: 'en', align: 'center', weight: 400 });
      runs.push({ kind: 'body', text: telegramDisplayHandle(handle), font: 'Inter', locale: 'en', align: 'center', weight: 700 });
    } else {
      runs.push({ kind: 'qr', text: qrMarker, font: 'Inter', locale: 'en', align: 'center', weight: 700 });
    }
    runs.push({ kind: 'body', text: qrCaption, font: 'Inter', locale: 'en', align: 'center', weight: 400 });
  }

  const measuredRuns = runs.map((run) => withMetrics(run, width, { logo: input.logo, qr }));
  const baseHeight = clinic.receiptTemplate === 'boxed' ? 42 : clinic.receiptTemplate === 'minimal' ? 20 : 30;
  return {
    width,
    height: baseHeight + measuredRuns.reduce((height, run) => height + run.spacingBefore + run.advance, 0),
    template: clinic.receiptTemplate,
    headerFont,
    runs: measuredRuns,
    ...(input.logo === undefined ? {} : { logo: input.logo }),
    ...(qr === undefined ? {} : { qr }),
  };
}

export const QR_QUIET_MODULES = 4;

export function qrModuleScale(matrix: QrMatrix, width: ReceiptLayout['width']): number {
  // Whole pixels per module only: a fractional scale lands module edges
  // mid-dot and the printer smears them into an unscannable block.
  const target = width === 576 ? 240 : 180;
  return Math.max(2, Math.floor(target / matrix.size));
}

function withMetrics(run: UnmeasuredReceiptRun, width: ReceiptLayout['width'], assets: { logo?: LogoBitmap; qr?: QrMatrix }): ReceiptRun {
  if (run.kind === 'logo') {
    const height = assets.logo?.height ?? 0;
    return { ...run, fontSize: 0, advance: height + 10, spacingBefore: 0 };
  }
  if (run.kind === 'qr-code') {
    if (assets.qr === undefined) return { ...run, fontSize: 0, advance: 0, spacingBefore: 0 };
    const scale = qrModuleScale(assets.qr, width);
    // The spec requires a 4-module light margin on every side; without it
    // scanners lock on unreliably, and the horizontal margin comes free from
    // centring but the vertical one has to be reserved here.
    const quiet = QR_QUIET_MODULES * scale;
    return { ...run, fontSize: 0, advance: assets.qr.size * scale + quiet, spacingBefore: quiet };
  }
  if (run.kind === 'contact') return { ...run, fontSize: 15, advance: 22, spacingBefore: 0 };
  if (run.kind === 'copy-marker') {
    return { ...run, fontSize: width === 576 ? 28 : 24, advance: width === 576 ? 44 : 40, spacingBefore: 12 };
  }
  if (run.kind === 'header-latin') return { ...run, fontSize: 24, advance: 30, spacingBefore: 0 };
  if (run.locale === 'my') return { ...run, fontSize: 18, advance: 30, spacingBefore: 0 };
  if (run.kind === 'total') return { ...run, fontSize: 18, advance: 28, spacingBefore: 4 };
  if (run.kind === 'divider') return { ...run, fontSize: 16, advance: 14, spacingBefore: 4 };
  return { ...run, fontSize: 16, advance: 24, spacingBefore: 0 };
}

export async function renderReceipt(input: ReceiptRenderInput, deps: ReceiptRenderDeps): Promise<RenderedReceipt> {
  await waitForReceiptFonts(deps.fonts, input.clinic.receiptHeaderFont);
  const layout = buildReceiptLayout(input);
  const surface = (deps.createCanvas ?? createBrowserCanvas)(layout.width, layout.height);
  drawReceipt(surface.context, layout, input.palette);
  const png = await surface.toBlob();
  return { width: input.width, png, raster: new Uint8Array(await png.arrayBuffer()), layout };
}

function resolveHeaderFont(headerFont: ReceiptHeaderFont, brandName: string): ReceiptLayout['headerFont'] {
  return headerFamilyFor(brandName, headerFont);
}

function drawReceipt(context: ReceiptDrawingContext, layout: ReceiptLayout, palette: ReceiptPalette): void {
  context.fillStyle = palette.background;
  context.fillRect(0, 0, layout.width, layout.height);
  let y = layout.template === 'boxed' ? 32 : 22;
  const inset = layout.template === 'boxed' ? 24 : 16;

  for (const run of layout.runs) {
    y += run.spacingBefore;
    if (run.kind === 'divider') {
      drawDivider(context, run.text, inset, layout.width - inset, y, palette.line);
      y += run.advance;
      continue;
    }
    if (run.kind === 'logo') {
      if (layout.logo !== undefined) drawLogo(context, layout.logo, layout.width, y, palette.ink);
      y += run.advance;
      continue;
    }
    if (run.kind === 'qr-code') {
      if (layout.qr !== undefined) drawQr(context, layout.qr, layout.width, y, palette.ink);
      y += run.advance;
      continue;
    }
    context.fillStyle = run.kind === 'qr' || run.kind === 'copy-marker' ? palette.brand : run.kind === 'total' ? palette.ink : palette.muted;
    context.font = `${run.weight} ${run.fontSize}px ${run.font}`;
    context.textAlign = run.align;
    const x = run.align === 'center' ? layout.width / 2 : inset;
    context.fillText(run.text, x, y);
    y += run.advance;
  }
}

// Both the logo and the QR are painted as filled rectangles rather than an
// image blit, so the fake canvas used in tests needs no extra capability and
// every dot lands on an exact pixel boundary for the thermal head.
function drawLogo(context: ReceiptDrawingContext, logo: LogoBitmap, width: number, top: number, ink: string): void {
  const left = Math.round((width - logo.width) / 2);
  context.fillStyle = ink;
  for (let row = 0; row < logo.height; row += 1) {
    let run = 0;
    for (let column = 0; column <= logo.width; column += 1) {
      const on = column < logo.width && logo.dots[row * logo.width + column] === 1;
      if (on) {
        run += 1;
        continue;
      }
      if (run > 0) context.fillRect(left + column - run, top + row, run, 1);
      run = 0;
    }
  }
}

function drawQr(context: ReceiptDrawingContext, matrix: QrMatrix, width: number, top: number, ink: string): void {
  const scale = qrModuleScale(matrix, width === 576 ? 576 : 384);
  const side = matrix.size * scale;
  const left = Math.round((width - side) / 2);
  context.fillStyle = ink;
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.isDark(row, column)) context.fillRect(left + column * scale, top + row * scale, scale, scale);
    }
  }
}

function drawDivider(context: ReceiptDrawingContext, divider: string, start: number, end: number, y: number, stroke: string): void {
  if (divider === 'none') return;
  context.beginPath();
  context.setLineDash(divider === 'dots' ? [2, 3] : []);
  context.moveTo(start, y);
  context.lineTo(end, y);
  context.strokeStyle = stroke;
  context.stroke();
  context.setLineDash([]);
}

function createBrowserCanvas(width: number, height: number): ReceiptCanvas {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Receipt canvas is unavailable.');
  return {
    context,
    toBlob: () => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob === null ? reject(new Error('Receipt PNG encoding failed.')) : resolve(blob), 'image/png');
    }),
  };
}
