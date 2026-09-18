import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodePng, type Rgba } from '../../tests/unit/decodePng';
import { parseManifest } from './manifest';

/**
 * The layout contract for the fish strips, now that they are real art (tools/gen_fish.py) rather than
 * stamped placeholder geometry.
 *
 * Three things have to hold or the sprite player draws the wrong pixels:
 *   1. Every strip is exactly `frames` cells wide and ONE cell tall. createSpritePlayer slices frame i at
 *      `(i * fw, 0, fw, fh)`, so a strip wrapped onto two rows silently renders the top half of everything.
 *   2. Every frame's art is centred in its cell. The sprite is drawn with anchor 0.5 and mirrored via
 *      scale.x, so an off-centre fish makes the pet jump sideways whenever it turns around.
 *   3. The manifest `body` box is SMALLER than the drawn fish in both dimensions, but not by so much that
 *      it stops describing the animal. `body` is what makeWaterBounds keeps inside the water ellipse; the
 *      deliberate overhang is what lets fins and tail brush the glass without the clamp fighting them.
 *      If `body` ever grew past the art, the fish would be held away from the glass by empty space.
 */

const assets = new URL('../../assets/', import.meta.url);
const manifest = parseManifest(JSON.parse(readFileSync(new URL('manifest.json', assets), 'utf8')) as unknown);
const load = (file: string): Rgba => decodePng(new Uint8Array(readFileSync(new URL(file, assets))));

/**
 * How far past the body box the drawn art may reach, per side, in grid px. Fins and tail, not a whole fish.
 *
 * Vertically this is not just tidiness. `waterShape.surfaceY` is the bowl's topmost opaque row, so the clamp
 * puts the body box's top edge flush with the glass at the top of the swim range and every px of art above
 * the box hangs outside the bowl in the transparent pad. Measured worst case today is 6.5px of dorsal fin,
 * which reads as the fin touching the rim; a box much shorter than the art would read as a broken sprite.
 */
const MAX_OVERHANG = 12;

interface Extent { halfW: number; halfH: number; pixels: number }

/** Furthest opaque pixel from the cell centre, in half-widths (matches the anchor-0.5 body box). */
function frameExtent(png: Rgba, frame: number, fw: number, fh: number): Extent {
  let halfW = 0;
  let halfH = 0;
  let pixels = 0;
  for (let y = 0; y < fh; y += 1) {
    for (let x = 0; x < fw; x += 1) {
      if ((png.data[(y * png.width + frame * fw + x) * 4 + 3] ?? 0) === 0) continue;
      pixels += 1;
      halfW = Math.max(halfW, Math.abs(x + 0.5 - fw / 2));
      halfH = Math.max(halfH, Math.abs(y + 0.5 - fh / 2));
    }
  }
  return { halfW, halfH, pixels };
}

describe('fish sprite strips', () => {
  const fish = manifest.sprites['fish'];
  if (!fish) throw new Error('manifest has no fish sprite');
  const [fw, fh] = fish.frame;
  const halfBodyW = fish.body.w / 2;
  const halfBodyH = fish.body.h / 2;

  for (const [state, def] of Object.entries(fish.states)) {
    describe(state, () => {
      const png = load(def.file);
      const extents = Array.from({ length: def.frames }, (_, f) => frameExtent(png, f, fw, fh));

      it('is one row of frame-sized cells', () => {
        expect([png.width, png.height]).toEqual([fw * def.frames, fh]);
      });

      it('every frame has art in it', () => {
        expect(extents.map((e) => e.pixels > 0)).toEqual(extents.map(() => true));
      });

      it('every frame is centred in its cell with room to spare', () => {
        for (const [f, e] of extents.entries()) {
          expect(e.halfW, `frame ${f} width`).toBeLessThan(fw / 2);
          expect(e.halfH, `frame ${f} height`).toBeLessThan(fh / 2);
        }
      });

      it('the drawn fish overhangs the body box by fins, not by a body', () => {
        for (const [f, e] of extents.entries()) {
          expect(e.halfW, `frame ${f}: art narrower than the body box`).toBeGreaterThan(halfBodyW);
          expect(e.halfH, `frame ${f}: art shorter than the body box`).toBeGreaterThan(halfBodyH);
          expect(e.halfW - halfBodyW, `frame ${f}: horizontal overhang`).toBeLessThanOrEqual(MAX_OVERHANG);
          expect(e.halfH - halfBodyH, `frame ${f}: vertical overhang`).toBeLessThanOrEqual(MAX_OVERHANG);
        }
      });
    });
  }
});

describe('emote overlay strip', () => {
  const size = 16;
  const frames = 6;
  const png = load('sprites/fish/emotes.png');

  it('is one row of six 16x16 cells', () => {
    expect([png.width, png.height]).toEqual([size * frames, size]);
  });

  it('every emote has art in it', () => {
    const filled = Array.from({ length: frames }, (_, f) => frameExtent(png, f, size, size).pixels > 0);
    expect(filled).toEqual(filled.map(() => true));
  });
});
