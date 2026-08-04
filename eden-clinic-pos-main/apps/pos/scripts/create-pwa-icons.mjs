import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const crcTable = Uint32Array.from({ length: 256 }, (_, seed) => {
  let value = seed;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(kind, data) {
  const type = Buffer.from(kind);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([type, data])));
  return Buffer.concat([length, type, data, checksum]);
}

function createIcon(size) {
  const rows = [];
  const center = (size - 1) / 2;
  const radius = size * 0.39;
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      const pixel = 1 + (x * 4);
      const distance = Math.hypot(x - center, y - center);
      const insideMark = distance < radius;
      const leaf = ((x - center) * 0.72) ** 2 + ((y - center + size * 0.04) * 1.25) ** 2 < (size * 0.17) ** 2;
      if (insideMark && !leaf) row.set([0, 104, 249, 255], pixel);
      else row.set([250, 249, 247, 255], pixel);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function createPwaIcons(outputDir) {
  await mkdir(outputDir, { recursive: true });
  await Promise.all([192, 512].map((size) => writeFile(join(outputDir, `eden-${size}.png`), createIcon(size))));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await createPwaIcons(join(dirname(fileURLToPath(import.meta.url)), '../public/icons'));
}
