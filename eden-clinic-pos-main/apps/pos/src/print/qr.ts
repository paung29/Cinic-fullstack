import qrcode from 'qrcode-generator';

export type QrMatrix = {
  size: number;
  isDark(row: number, column: number): boolean;
};

// Medium correction survives the speckling and fading typical of thermal paper
// without inflating the module count enough to matter at 80mm.
const ERROR_CORRECTION = 'M';
const AUTO_VERSION = 0;

export function buildQrMatrix(value: string): QrMatrix {
  const code = qrcode(AUTO_VERSION, ERROR_CORRECTION);
  code.addData(value);
  code.make();
  const size = code.getModuleCount();
  return { isDark: (row, column) => code.isDark(row, column), size };
}

export function normalizeTelegramHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').replace(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\//i, '').replace(/\/+$/, '');
}

export function telegramLink(handle: string): string {
  return `https://t.me/${normalizeTelegramHandle(handle)}`;
}

export function telegramDisplayHandle(handle: string): string {
  return `@${normalizeTelegramHandle(handle)}`;
}
