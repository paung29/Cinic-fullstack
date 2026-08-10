const DEFAULT_MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Re-encode an image to a bounded JPEG before it goes into IndexedDB.
 *
 * Tablet cameras produce multi-megabyte captures and the device holds every
 * one of them, so an unbounded original would sit there for the life of the
 * install. Any decode or encode failure falls back to the original file: a
 * photo stored large beats a photo lost.
 */
export async function downscaleToJpeg(file: Blob, maxDimension = DEFAULT_MAX_DIMENSION): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) return file;
      context.drawImage(bitmap, 0, 0, width, height);
      const encoded = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
      });
      return encoded ?? file;
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
