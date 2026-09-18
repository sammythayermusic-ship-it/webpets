import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng, type Rgba } from '../../tests/unit/decodePng';
import { parseManifest } from './manifest';

/**
 * The bowl background and the fish strips stopped being placeholders in Stage 2: `tools/gen_bg.py`
 * derives bg.png from `assets/reference/habitats-hires/fish-bowl.png` and `tools/gen_fish.py` derives the
 * strips from the goldfish painted into that same render. This file asserts the three properties that
 * make that derivation safe to ship.
 *
 * The load-bearing one is the alpha bbox. `habitatHitRect()` is `pad + opaqueRect * scale`
 * (src/render/scene.ts), so if opaqueRect drifts from the art either the bowl's edge stops receiving
 * clicks or the transparent pad stops being click-through and the always-on-top window starts stealing
 * clicks from every app behind it. Neither crashes; both are miserable to diagnose. It is an exact
 * equality on purpose -- "close enough" is what silently rots.
 */

const assets = new URL('../../assets/', import.meta.url);
const manifest = parseManifest(JSON.parse(readFileSync(new URL('manifest.json', assets), 'utf8')) as unknown);
const load = (file: string): Rgba => decodePng(new Uint8Array(readFileSync(new URL(file, assets))));

/** The 38 opaque colours of the shipped Phase 0 art. gen_bg.py quantizes against exactly this set. */
const SHIPPED_PALETTE_SRC = 'habitats-160x120/fish-bowl.png';

function opaqueColours(png: Rgba): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < png.data.length; i += 4) {
    if ((png.data[i + 3] ?? 0) === 0) continue;
    out.add(((png.data[i] ?? 0) << 16) | ((png.data[i + 1] ?? 0) << 8) | (png.data[i + 2] ?? 0));
  }
  return out;
}

function alphaBbox(png: Rgba): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if ((png.data[(y * png.width + x) * 4 + 3] ?? 0) === 0) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return x1 < x0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const palette = opaqueColours(load(SHIPPED_PALETTE_SRC));

describe('bowl background art', () => {
  const bowl = manifest.habitats['fish/bowl'];
  if (!bowl) throw new Error('manifest has no fish/bowl habitat');
  const bg = bowl.layers.find((l) => l.name === 'bg');
  if (!bg?.file) throw new Error('manifest has no bg layer file');
  const png = load(bg.file);

  it('is exactly the habitat grid', () => {
    expect([png.width, png.height]).toEqual([...bowl.grid]);
  });

  it('alpha is hard: every pixel is fully transparent or fully opaque', () => {
    const alphas = new Set<number>();
    for (let i = 3; i < png.data.length; i += 4) alphas.add(png.data[i] ?? 0);
    expect([...alphas].sort((a, b) => a - b)).toEqual([0, 255]);
  });

  it('alpha bbox equals opaqueRect exactly (the click-through regression guard)', () => {
    expect(alphaBbox(png)).toEqual(bowl.opaqueRect);
  });

  it('uses only colours from the shipped 38-colour palette', () => {
    expect(palette.size).toBe(38);
    const extra = [...opaqueColours(png)].filter((c) => !palette.has(c));
    expect(extra.map((c) => `#${c.toString(16).padStart(6, '0')}`)).toEqual([]);
  });

  it('pantryRect sits on the feeder window, above the water surface', () => {
    // pantryRect is the bounding box of an irregular enclosed region, so a handful of its corner pixels
    // fall outside the feeder's silhouette. The pantry layer paints an opaque box over pantryRect
    // inflated by 2px, so those pixels are backed anyway; what this guards is the rect having wandered
    // off the feeder entirely.
    const r = bowl.pantryRect;
    let opaque = 0;
    for (let y = r.y; y < r.y + r.h; y += 1) {
      for (let x = r.x; x < r.x + r.w; x += 1) {
        if ((png.data[(y * png.width + x) * 4 + 3] ?? 0) > 0) opaque += 1;
      }
    }
    expect(opaque / (r.w * r.h)).toBeGreaterThan(0.98);
    expect(r.y + r.h).toBeLessThanOrEqual(bowl.waterShape.surfaceY);
  });
});

describe('fish sprite art', () => {
  const fish = manifest.sprites['fish'];
  if (!fish) throw new Error('manifest has no fish sprite');

  for (const [state, def] of Object.entries(fish.states)) {
    it(`${state}: drawn from the bowl's own palette, hard alpha`, () => {
      const png = load(def.file);
      const alphas = new Set<number>();
      for (let i = 3; i < png.data.length; i += 4) alphas.add(png.data[i] ?? 0);
      expect([...alphas].sort((a, b) => a - b)).toEqual([0, 255]);
      const extra = [...opaqueColours(png)].filter((c) => !palette.has(c));
      expect(extra.map((c) => `#${c.toString(16).padStart(6, '0')}`)).toEqual([]);
    });
  }
});
