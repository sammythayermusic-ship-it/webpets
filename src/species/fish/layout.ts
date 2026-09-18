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
 * Ellipse approximation of the bowl's interior, least-squares fitted to the measured water band
 * (rms 0.58px over 147 rows) and rounded inward: the water spans y 44..190, x 115..190 on the top row,
 * x 81..238 at the widest (y ~104..128) and x 137..182 at the gravel. `surfaceY` is the bowl's inner
 * top, not the painted meniscus -- that is the Phase 0 semantic and behavior depends on it.
 */
export const BOWL_WATER_SHAPE: Readonly<WaterShape> = Object.freeze({
  cx: 160,
  cy: 116,
  rx: 78,
  ry: 80,
  surfaceY: 44,
  floorY: 190,
});

/** Bounding rect of the measured water pixels (x 81..238, y 44..190). */
export const BOWL_WATER_RECT: Readonly<Rect> = Object.freeze({ x: 81, y: 44, w: 158, h: 147 });

/**
 * Inner window of the clip-on feeder at the top-right rim; pantry_fill's opaque pixels lie inside it.
 * Found structurally: the region enclosed by the feeder's dark housing above the water surface.
 */
export const BOWL_PANTRY_RECT: Readonly<Rect> = Object.freeze({ x: 180, y: 11, w: 36, h: 29 });

/** Bounding box of the bowl's opaque pixels (hit region / hover). Equals bg.png's alpha bbox exactly. */
export const BOWL_OPAQUE_RECT: Readonly<Rect> = Object.freeze({ x: 79, y: 8, w: 162, h: 224 });

/** Where the fish starts (body center), grid px. */
export const BOWL_PET_ANCHOR: readonly [number, number] = Object.freeze([160, 120] as const);

/**
 * Collision box of the drawn fish, mirroring `sprites.fish.body` in the manifest. The behavior clamps
 * this box inside `BOWL_WATER_SHAPE`, so it is deliberately a little smaller than the 64x48 art: the
 * difference is the fin fringe that may overlap the glass without the clamp fighting it. It lives here
 * rather than only in the manifest so tests and behavior share one number instead of hardcoding copies.
 */
export const FISH_BODY: Readonly<{ w: number; h: number }> = Object.freeze({ w: 56, h: 46 });
