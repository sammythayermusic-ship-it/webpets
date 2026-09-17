import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseManifest } from './manifest';

/** Placeholder stamp colour written by tools/gen_placeholders.py (STAMP). */
const STAMP = [255, 40, 200] as const;

interface Rgba {
  width: number;
  height: number;
  data: Uint8Array; // RGBA, row-major
}

/** Minimal decoder for the 8-bit RGBA non-interlaced PNGs the generator writes. */
function decodePng(bytes: Uint8Array): Rgba {
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

const assets = new URL('../../assets/', import.meta.url);
const manifest = parseManifest(JSON.parse(readFileSync(new URL('manifest.json', assets), 'utf8')) as unknown);

describe('placeholder fish strips', () => {
  const fish = manifest.sprites['fish'];
  if (!fish) throw new Error('manifest has no fish sprite');
  const [fw, fh] = fish.frame;
  const halfW = fish.body.w / 2;
  const halfH = fish.body.h / 2;

  for (const [state, def] of Object.entries(fish.states)) {
    it(`${state}: every PH stamp pixel lies inside the body box behavior keeps in the water`, () => {
      const png = decodePng(new Uint8Array(readFileSync(new URL(def.file, assets))));
      expect(png.width).toBe(fw * def.frames);
      expect(png.height).toBe(fh);
      const outside: string[] = [];
      let stamped = 0;
      for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
          const i = (y * png.width + x) * 4;
          const isStamp = png.data[i] === STAMP[0] && png.data[i + 1] === STAMP[1]
            && png.data[i + 2] === STAMP[2] && (png.data[i + 3] ?? 0) > 0;
          if (!isStamp) continue;
          stamped += 1;
          // anchor 0.5: the pet position maps to the frame centre, so the box is centred in each frame
          const fx = x % fw;
          const dx = fx + 0.5 - fw / 2;
          const dy = y + 0.5 - fh / 2;
          if (Math.abs(dx) > halfW || Math.abs(dy) > halfH) outside.push(`${x},${y}`);
        }
      }
      expect(stamped).toBeGreaterThan(0);
      expect(outside).toEqual([]);
    });
  }
});
