import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STAMP, decodePng } from '../../tests/unit/decodePng';
import { parseManifest } from './manifest';

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
