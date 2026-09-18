import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STAMP, decodePng, type Rgba } from '../../tests/unit/decodePng';
import { parseManifest } from './manifest';

/**
 * Blueprint section 12: generated placeholder art is marked PLACEHOLDER visibly. tools/gen_placeholders.py
 * stamps the full word on every synthetic habitat layer and abbreviates it to `PH` (in the STAMP colour) only
 * inside pantryRect, which is too narrow for the word. This decodes the checked-in PNGs and looks for the
 * glyph pattern, so a hand-drawn or half-clipped stamp fails here and not in a review.
 *
 * Two assets are deliberately NOT stamped, because as of Stage 2 they are not placeholders:
 *   - `bg` is derived from assets/reference/habitats-hires/fish-bowl.png by tools/gen_bg.py;
 *   - the fish strips are derived from the goldfish painted into that same render by tools/gen_fish.py.
 * The stamp contract is therefore two-sided: the synthetic layers must carry the word, and the real art must
 * carry no stamp pixel at all. The second half is what fails if someone regenerates the strips with the old
 * placeholder code path. src/render/bgArt.test.ts asserts the rest of what makes that art real.
 *
 * The stamp is drawn at the generator's font scale, which is the art-unit multiplier `grid width / 160`
 * (2 at 320x240): one font pixel becomes a SCALE x SCALE block. `findWord` takes that scale, so raising the
 * resolution keeps the assertion instead of silently finding nothing.
 */

/** The glyphs of the generator's 3x5 bitmap font that the two stamp words use (mirror of FONT in the script). */
const FONT: Record<string, readonly string[]> = {
  A: ['010', '101', '111', '101', '101'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  H: ['101', '101', '111', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
};
const GLYPH_W = 3;
const GLYPH_H = 5;
const ADVANCE = 4;
/** The grid the generator's art (and its font scale) is authored on; mirrors ART_W in gen_placeholders.py. */
const ART_GRID_W = 160;

interface Box { x: number; y: number; w: number; h: number }

function pixel(png: Rgba, x: number, y: number): [number, number, number, number] {
  const i = (y * png.width + x) * 4;
  return [png.data[i] ?? 0, png.data[i + 1] ?? 0, png.data[i + 2] ?? 0, png.data[i + 3] ?? 0];
}

function same(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Find `word` rendered in the 3x5 font at `scale` image px per font px anywhere inside `box`: every lit font
 * pixel shares one colour with alpha > 0 (optionally a required RGB), and every unlit pixel inside the glyph
 * cells differs from it, so the match is colour independent and a glyph clipped by a mask does not count.
 * Every image pixel of a scaled font pixel is checked, so a stamp drawn at the wrong scale does not match.
 */
function findWord(
  png: Rgba,
  word: string,
  box: Box,
  scale: number,
  rgb?: readonly [number, number, number],
): [number, number] | null {
  const wordW = (word.length * ADVANCE - 1) * scale;
  for (let oy = box.y; oy + GLYPH_H * scale <= box.y + box.h; oy += 1) {
    for (let ox = box.x; ox + wordW <= box.x + box.w; ox += 1) {
      let colour: [number, number, number, number] | null = null;
      let ok = true;
      for (let i = 0; ok && i < word.length; i += 1) {
        const glyph = FONT[word[i] ?? ''];
        if (!glyph) throw new Error(`no glyph for ${word[i] ?? '?'}`);
        for (let gy = 0; ok && gy < GLYPH_H; gy += 1) {
          for (let gx = 0; ok && gx < GLYPH_W; gx += 1) {
            const lit = glyph[gy]?.[gx] === '1';
            for (let sy = 0; ok && sy < scale; sy += 1) {
              for (let sx = 0; ok && sx < scale; sx += 1) {
                const p = pixel(png, ox + (i * ADVANCE + gx) * scale + sx, oy + gy * scale + sy);
                if (lit) {
                  if (p[3] === 0 || (rgb && !same(p.slice(0, 3), rgb)) || (colour && !same(p, colour))) ok = false;
                  colour = p;
                } else if (colour && same(p, colour)) {
                  ok = false;
                }
              }
            }
          }
        }
      }
      if (ok) return [ox, oy];
    }
  }
  return null;
}

const assets = new URL('../../assets/', import.meta.url);
const manifest = parseManifest(JSON.parse(readFileSync(new URL('manifest.json', assets), 'utf8')) as unknown);
const load = (file: string): Rgba => decodePng(new Uint8Array(readFileSync(new URL(file, assets))));

describe('placeholder habitat layers', () => {
  const bowl = manifest.habitats['fish/bowl'];
  if (!bowl) throw new Error('manifest has no fish/bowl habitat');
  const [gw, gh] = bowl.grid;
  const whole: Box = { x: 0, y: 0, w: gw, h: gh };
  const scale = Math.max(1, Math.round(gw / ART_GRID_W));

  for (const layer of bowl.layers) {
    const file = layer.file;
    if (!file || layer.name === 'bg') continue; // bg is real derived art, not placeholder geometry
    if (layer.name === 'pantry_fill') {
      it('pantry_fill: too small for the word, so PH in the stamp colour inside pantryRect', () => {
        const png = load(file);
        expect(findWord(png, 'PH', bowl.pantryRect, scale, STAMP)).not.toBeNull();
      });
      continue;
    }
    it(`${layer.name}: stamped with the full word PLACEHOLDER`, () => {
      const png = load(file);
      expect([png.width, png.height]).toEqual([gw, gh]);
      expect(findWord(png, 'PLACEHOLDER', whole, scale)).not.toBeNull();
    });
  }
});

describe('real fish strips', () => {
  const fish = manifest.sprites['fish'];
  if (!fish) throw new Error('manifest has no fish sprite');

  for (const [state, def] of Object.entries(fish.states)) {
    it(`${state}: carries no placeholder stamp -- it is art, not scaffolding`, () => {
      const png = load(def.file);
      const stamped: string[] = [];
      for (let y = 0; y < png.height && stamped.length < 8; y += 1) {
        for (let x = 0; x < png.width && stamped.length < 8; x += 1) {
          const i = (y * png.width + x) * 4;
          if (png.data[i] === STAMP[0] && png.data[i + 1] === STAMP[1]
            && png.data[i + 2] === STAMP[2] && (png.data[i + 3] ?? 0) > 0) {
            stamped.push(`${x},${y}`);
          }
        }
      }
      expect(stamped).toEqual([]);
    });
  }
});
