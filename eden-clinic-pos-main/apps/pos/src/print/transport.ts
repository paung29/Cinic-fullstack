import type { PrinterProfile, PrinterTransportId } from '@/data/printerProfile';
import type { RenderedReceipt } from './receipt';

export type PrinterTransport = {
  readonly id: PrinterTransportId | 'png-share';
  send(receipt: RenderedReceipt): Promise<void>;
};

export class NoHardwarePrinterError extends Error {
  constructor(transport: PrinterTransportId) {
    super(`No ${transport} printer is configured for this device.`);
    this.name = 'NoHardwarePrinterError';
  }
}

export function createM5PrinterTransport(profile: PrinterProfile): PrinterTransport {
  return {
    id: profile.transport,
    async send(receipt): Promise<void> {
      void receipt.raster;
      throw new NoHardwarePrinterError(profile.transport);
    },
  };
}

export function createPngShareTransport(share: (file: File) => Promise<void>): PrinterTransport {
  return {
    id: 'png-share',
    async send(receipt): Promise<void> {
      await share(new File([receipt.png], 'eden-receipt.png', { type: 'image/png' }));
    },
  };
}
