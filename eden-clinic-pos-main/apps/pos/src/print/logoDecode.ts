import { ditherToDots, fitLogoBox, type LogoBitmap } from './receiptLogo';

// Browser-only: turns a stored logo Blob into the one-bit bitmap the receipt
// renderer paints. Kept apart from receiptLogo.ts so the pure dithering maths
// stays testable without a DOM.
export async function decodeLogoBitmap(blob: Blob, maxWidth?: number): Promise<LogoBitmap | undefined> {
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      const box = fitLogoBox(bitmap.width, bitmap.height, maxWidth);
      if (box.width === 0 || box.height === 0) return undefined;
      const canvas = document.createElement('canvas');
      canvas.width = box.width;
      canvas.height = box.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) return undefined;
      context.drawImage(bitmap, 0, 0, box.width, box.height);
      const { data } = context.getImageData(0, 0, box.width, box.height);
      return ditherToDots(data, box.width, box.height);
    } finally {
      bitmap.close();
    }
  } catch {
    // A corrupt or unsupported upload must never block a receipt from printing.
    return undefined;
  }
}
