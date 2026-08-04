import { fmtMMK } from '@/data/money';
import type { ClinicRow, SaleRow } from '@/data/types';

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
};

export type ReceiptHeaderFont = 'sans' | 'serif' | 'display';

export type ReceiptRun = {
  kind: 'header-latin' | 'header-burmese' | 'body' | 'total' | 'divider' | 'qr' | 'copy-marker';
  text: string;
  font: 'Inter' | 'Padauk' | 'Lora' | 'Playfair Display';
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
  headerFont: 'Inter' | 'Lora' | 'Playfair Display';
  runs: ReceiptRun[];
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

  if (headerFont === 'serif') {
    pending.push(fonts.load('700 24px Lora', latinHeader));
  }
  if (headerFont === 'display') {
    pending.push(fonts.load('700 24px "Playfair Display"', latinHeader));
  }

  // Best-effort: a rejected face load (offline cold cache) must never block a receipt;
  // the canvas falls back to the closest available face instead.
  await Promise.allSettled(pending);
}

export function buildReceiptLayout(input: ReceiptRenderInput): ReceiptLayout {
  const { clinic, sale, width } = input;
  const headerFont = resolveHeaderFont(clinic.receiptHeaderFont);
  const align = clinic.receiptTemplate === 'modern' || clinic.receiptTemplate === 'minimal' ? 'center' : 'left';
  const runs: UnmeasuredReceiptRun[] = [
    { kind: 'header-latin', text: clinic.name || latinHeader, font: headerFont, locale: 'en', align, weight: 700 },
    { kind: 'header-burmese', text: burmeseSample, font: 'Padauk', locale: 'my', align, weight: 400 },
    { kind: 'body', text: `Receipt ${sale.no ?? sale.id}`, font: 'Inter', locale: 'en', align: 'left', weight: 400 },
    { kind: 'divider', text: clinic.receiptDivider, font: 'Inter', locale: 'en', align: 'left', weight: 400 },
  ];

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
  if (clinic.receiptQr) {
    runs.push({ kind: 'qr', text: qrMarker, font: 'Inter', locale: 'en', align: 'center', weight: 700 });
    runs.push({ kind: 'body', text: qrCaption, font: 'Inter', locale: 'en', align: 'center', weight: 400 });
  }

  const measuredRuns = runs.map((run) => withMetrics(run, width));
  const baseHeight = clinic.receiptTemplate === 'boxed' ? 42 : clinic.receiptTemplate === 'minimal' ? 20 : 30;
  return {
    width,
    height: baseHeight + measuredRuns.reduce((height, run) => height + run.spacingBefore + run.advance, 0),
    template: clinic.receiptTemplate,
    headerFont,
    runs: measuredRuns,
  };
}

function withMetrics(run: UnmeasuredReceiptRun, width: ReceiptLayout['width']): ReceiptRun {
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

function resolveHeaderFont(headerFont: ReceiptHeaderFont): ReceiptLayout['headerFont'] {
  if (headerFont === 'serif') return 'Lora';
  if (headerFont === 'display') return 'Playfair Display';
  return 'Inter';
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
    context.fillStyle = run.kind === 'qr' || run.kind === 'copy-marker' ? palette.brand : run.kind === 'total' ? palette.ink : palette.muted;
    context.font = `${run.weight} ${run.fontSize}px ${run.font}`;
    context.textAlign = run.align;
    const x = run.align === 'center' ? layout.width / 2 : inset;
    context.fillText(run.text, x, y);
    y += run.advance;
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
