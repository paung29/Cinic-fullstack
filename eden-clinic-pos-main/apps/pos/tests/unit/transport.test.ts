import { expect, test, vi } from 'vitest';
import { createM5PrinterTransport, createPngShareTransport, NoHardwarePrinterError } from '@/print/transport';
import type { RenderedReceipt } from '@/print/receipt';

const receipt: RenderedReceipt = {
  width: 384,
  png: new Blob(['receipt'], { type: 'image/png' }),
  raster: new Uint8Array([1, 2, 3]),
  layout: { width: 384, height: 50, template: 'classic', headerFont: 'Inter', runs: [] },
};

test('M5 hardware stub consumes a receipt without re-rendering and identifies unavailable hardware', async () => {
  const transport = createM5PrinterTransport({ version: 1, transport: 'generic-escpos', width: 384 });
  expect(transport.id).toBe('generic-escpos');
  await expect(transport.send(receipt)).rejects.toBeInstanceOf(NoHardwarePrinterError);
  expect(receipt.raster).toEqual(new Uint8Array([1, 2, 3]));
});

test('PNG-share transport forwards the already-rendered PNG file', async () => {
  const share = vi.fn(async () => undefined);
  const transport = createPngShareTransport(share);
  await transport.send(receipt);
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png', name: 'eden-receipt.png' }));
});
