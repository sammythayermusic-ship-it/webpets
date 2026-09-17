import { inflateSync } from 'node:zlib';

/** Placeholder stamp colour written by tools/gen_placeholders.py (STAMP). */
export const STAMP = [255, 40, 200] as const;

export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array; // RGBA, row-major
}

/** Minimal decoder for the 8-bit RGBA non-interlaced PNGs the generator writes. */
export function decodePng(bytes: Uint8Array): Rgba {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8; // signature
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (pos < bytes.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const body = bytes.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      const bitDepth = bytes[pos + 16];
      const colorType = bytes[pos + 17];
      const interlace = bytes[pos + 20];
      if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
        throw new Error(`unsupported PNG: depth ${bitDepth} color ${colorType} interlace ${interlace}`);
      }
    } else if (type === 'IDAT') {
      idat.push(body);
    }
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat.map((c) => Buffer.from(c))));
  const bpp = 4;
  const stride = width * bpp;
  const data = new Uint8Array(width * height * bpp);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[src + i] ?? 0;
      const a = i >= bpp ? (data[dst + i - bpp] ?? 0) : 0;
      const b = y > 0 ? (data[dst - stride + i] ?? 0) : 0;
      const c = y > 0 && i >= bpp ? (data[dst - stride + i - bpp] ?? 0) : 0;
      let v: number;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + Math.floor((a + b) / 2); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`bad PNG filter ${filter}`);
      }
      data[dst + i] = v & 0xff;
    }
  }
  return { width, height, data };
}
