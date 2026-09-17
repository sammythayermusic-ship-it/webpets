import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STAMP, decodePng, type Rgba } from '../../tests/unit/decodePng';
import { parseManifest } from './manifest';

/**
 * Blueprint section 12: generated placeholder art is marked PLACEHOLDER visibly. tools/gen_placeholders.py
 * stamps the full word on every 160x120 layer and abbreviates it to `PH` (in the STAMP colour) only where the
 * word cannot fit: inside the fish body box and inside pantryRect. This decodes the checked-in PNGs and looks
 * for the glyph pattern, so a hand-drawn or half-clipped stamp fails here and not in a review.
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

interface Box { x: number; y: number; w: number; h: number }

function pixel(png: Rgba, x: number, y: number): [number, number, number, number] {
  const i = (y * png.width + x) * 4;
  return [png.data[i] ?? 0, png.data[i + 1] ?? 0, png.data[i + 2] ?? 0, png.data[i + 3] ?? 0];
}

function same(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Find `word` rendered in the 3x5 font anywhere inside `box`: every lit font pixel shares one colour with
 * alpha > 0 (optionally a required RGB), and every unlit pixel inside the glyph cells differs from it, so the
 * match is colour independent and a glyph clipped by a mask does not count.
 */
function findWord(png: Rgba, word: string, box: Box, rgb?: readonly [number, number, number]): [number, number] | null {
  const wordW = word.length * ADVANCE - 1;
  for (let oy = box.y; oy + GLYPH_H <= box.y + box.h; oy += 1) {
    for (let ox = box.x; ox + wordW <= box.x + box.w; ox += 1) {
      let colour: [number, number, number, number] | null = null;
      let ok = true;
      for (let i = 0; ok && i < word.length; i += 1) {
        const glyph = FONT[word[i] ?? ''];
        if (!glyph) throw new Error(`no glyph for ${word[i] ?? '?'}`);
        for (let gy = 0; ok && gy < GLYPH_H; gy += 1) {
          for (let gx = 0; ok && gx < GLYPH_W; gx += 1) {
            const p = pixel(png, ox + i * ADVANCE + gx, oy + gy);
            if (glyph[gy]?.[gx] === '1') {
              if (p[3] === 0 || (rgb && !same(p.slice(0, 3), rgb)) || (colour && !same(p, colour))) ok = false;
              colour = p;
            } else if (colour && same(p, colour)) {
              ok = false;
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

  for (const layer of bowl.layers) {
    const file = layer.file;
    if (!file || layer.name === 'bg') continue; // bg is the concept render, not generated
    if (layer.name === 'pantry_fill') {
      it('pantry_fill: too small for the word, so PH in the stamp colour inside pantryRect', () => {
        const png = load(file);
        expect(findWord(png, 'PH', bowl.pantryRect, STAMP)).not.toBeNull();
      });
      continue;
    }
    it(`${layer.name}: stamped with the full word PLACEHOLDER`, () => {
      const png = load(file);
      expect([png.width, png.height]).toEqual([gw, gh]);
      expect(findWord(png, 'PLACEHOLDER', whole)).not.toBeNull();
    });
  }
});

describe('placeholder fish strips', () => {
  const fish = manifest.sprites['fish'];
  if (!fish) throw new Error('manifest has no fish sprite');
  const [fw, fh] = fish.frame;

  for (const [state, def] of Object.entries(fish.states)) {
    it(`${state}: every frame carries PH in the stamp colour (the body box is too small for the word)`, () => {
      const png = load(def.file);
      for (let f = 0; f < def.frames; f += 1) {
        expect(findWord(png, 'PH', { x: f * fw, y: 0, w: fw, h: fh }, STAMP), `frame ${f}`).not.toBeNull();
      }
    });
  }
});
