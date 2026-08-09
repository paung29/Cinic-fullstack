import type { ClinicDb } from '@/data/db';

export const RECEIPT_LOGO_KEY = 'receipt-logo:v1';

// A thermal head prints one bit per dot: it cannot render grey. Downscaling a
// colour logo and letting the printer threshold it destroys detail, so the
// image is reduced here and dithered to pure black and white first.
export const LOGO_MAX_WIDTH = 384;
export const LOGO_MAX_HEIGHT = 160;

export type LogoBitmap = {
  width: number;
  height: number;
  /** Row-major, one entry per pixel: true = burn a dot. */
  dots: Uint8Array;
};

export function fitLogoBox(width: number, height: number, maxWidth = LOGO_MAX_WIDTH, maxHeight = LOGO_MAX_HEIGHT): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { height: 0, width: 0 };
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { height: Math.max(1, Math.round(height * scale)), width: Math.max(1, Math.round(width * scale)) };
}

export function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Floyd–Steinberg: the error diffusion keeps photographic logos and soft
// gradients legible at one bit, where a flat threshold would blow them out.
export function ditherToDots(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, alphaFloor = 32): LogoBitmap {
  const grey = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const alpha = rgba[i * 4 + 3] ?? 0;
    // Transparent pixels are paper, not black.
    grey[i] = alpha < alphaFloor ? 255 : luminance(rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0);
  }

  const dots = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const old = grey[index] ?? 255;
      const next = old < 128 ? 0 : 255;
      dots[index] = next === 0 ? 1 : 0;
      const error = old - next;
      spread(grey, width, height, x + 1, y, error * 7 / 16);
      spread(grey, width, height, x - 1, y + 1, error * 3 / 16);
      spread(grey, width, height, x, y + 1, error * 5 / 16);
      spread(grey, width, height, x + 1, y + 1, error * 1 / 16);
    }
  }

  return { dots, height, width };
}

function spread(grey: Float32Array, width: number, height: number, x: number, y: number, error: number): void {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const index = y * width + x;
  grey[index] = (grey[index] ?? 0) + error;
}

export async function readReceiptLogo(db: ClinicDb): Promise<Blob | undefined> {
  const row = await db.receiptAssets.get(RECEIPT_LOGO_KEY);
  return row?.blob;
}

export async function writeReceiptLogo(db: ClinicDb, logo: Blob): Promise<void> {
  await db.receiptAssets.put({ blob: logo, key: RECEIPT_LOGO_KEY });
}

export async function clearReceiptLogo(db: ClinicDb): Promise<void> {
  await db.receiptAssets.delete(RECEIPT_LOGO_KEY);
}
