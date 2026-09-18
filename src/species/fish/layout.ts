// Bowl geometry in 320x240 grid px. Must stay in sync with assets/manifest.json ("fish/bowl") and
// tools/gen_placeholders.py; src/species/fish/layout.test.ts enforces the manifest half of that.
//
// Stage 2 re-measured every number from the real 320x240 art that tools/gen_bg.py derives from
// assets/reference/habitats-hires/fish-bowl.png (run it with --report-only to reproduce the report).
// Stage 1's values were exact doubles of the shipped 160x120 art; that art turns out to be ~3% larger
// than any downscale of the current hi-res reference, anchored at its top-left, so the doubles were
// consistently 1-6px wide of the new art on the right and bottom edges. The art on disk wins: opaqueRect
// in particular MUST equal the alpha bbox of bg.png exactly or the click-through region stops matching
// the bowl. src/render/bgArt.test.ts asserts that.

import type { Rect } from '../../sim/types';
import type { WaterShape } from '../../render/types';

/**
 * Ellipse approximation of the bowl's interior, least-squares fitted to the measured water band and
 * rounded inward: x 81..238 at the widest (y ~104..128), x 137..182 at the gravel.
 *
 * `surfaceY` is the painted WATERLINE, not the top of the glass. It used to be 44, which is the bowl's
 * inner rim, and the fish could therefore drift a quarter of the bowl up into the empty air pocket and
 * read as floating outside the tank. The art puts pale air behind glass down to row 72, the surface
 * band at 73..78, the meniscus highlight at 79..80, and the first row of uniform water body at 81 —
 * true in every column, since the band is drawn flat. The old value came from a measurement bug in
 * tools/gen_bg.py: its water test accepted pale glass, and the row it picked had two qualifying pixels,
 * both inside the feeder rather than the bowl.
 *
 * The ellipse itself is unchanged: refitting to water-only rows gives the same numbers (rms 0.58 either
 * way) because the bowl is a circle, so the fit is driven by the wide middle rows.
 */
export const BOWL_WATER_SHAPE: Readonly<WaterShape> = Object.freeze({
  cx: 160,
  cy: 116,
  rx: 78,
  ry: 80,
  surfaceY: 80,
  floorY: 190,
});

/** Bounding rect of the water pixels below the waterline (x 81..238, y 81..190). */
export const BOWL_WATER_RECT: Readonly<Rect> = Object.freeze({ x: 82, y: 80, w: 156, h: 111 });

/** Bounding box of the bowl's opaque pixels (hit region / hover). Equals bg.png's alpha bbox exactly.
 * Shrank when the feeder was erased: its housing used to be the topmost opaque thing in the art. */
export const BOWL_OPAQUE_RECT: Readonly<Rect> = Object.freeze({ x: 79, y: 44, w: 162, h: 188 });

/** Where the fish starts (body centre), grid px: the middle of the WATER, not of the glass. */
export const BOWL_PET_ANCHOR: readonly [number, number] = Object.freeze([160, 136] as const);

/**
 * Collision box of the drawn fish, mirroring `sprites.fish.body` in the manifest. The behavior clamps
 * this box inside `BOWL_WATER_SHAPE`, so it is deliberately a little smaller than the 64x48 art: the
 * difference is the fin fringe that may overlap the glass without the clamp fighting it. It lives here
 * rather than only in the manifest so tests and behavior share one number instead of hardcoding copies.
 */
export const FISH_BODY: Readonly<{ w: number; h: number }> = Object.freeze({ w: 56, h: 46 });
