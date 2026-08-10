import type { PrinterProfile, PrinterTransportId } from '@/data/printerProfile';
import type { RenderedReceipt } from './receipt';
import { drawerKickCommand } from './drawer';

export type PrinterTransport = {
  readonly id: PrinterTransportId | 'png-share';
  send(receipt: RenderedReceipt): Promise<void>;
  /** Absent on transports with no till attached, such as sharing a PNG. */
  openDrawer?(): Promise<void>;
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
    async openDrawer(): Promise<void> {
      // The kick is built and ready; it reaches the till once this transport
      // has a real connection behind it.
      void drawerKickCommand();
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
