// Bowl geometry in 160x120 grid px. Must stay in sync with assets/manifest.json ("fish/bowl") and
// tools/gen_placeholders.py; src/species/fish/layout.test.ts enforces the manifest half of that.

import type { Rect } from '../../sim/types';
import type { WaterShape } from '../../render/types';

/**
 * Ellipse approximation of the concept bowl's water, measured from the art: the water spans y 23..96,
 * x 59..104 at the surface, x 41..121 at the widest (y ~51..67) and x 64..98 near the gravel.
 */
export const BOWL_WATER_SHAPE: Readonly<WaterShape> = Object.freeze({
  cx: 81,
  cy: 58,
  rx: 40,
  ry: 42,
  surfaceY: 23,
  floorY: 96,
});

/** Bounding rect of the water (x 41..120, y 23..96). */
export const BOWL_WATER_RECT: Readonly<Rect> = Object.freeze({ x: 41, y: 23, w: 80, h: 74 });

/** Inner box of the clip-on feeder at the top-right rim; pantry_fill's opaque pixels lie inside it. */
export const BOWL_PANTRY_RECT: Readonly<Rect> = Object.freeze({ x: 93, y: 5, w: 18, h: 15 });

/** Bounding box of the bowl's opaque pixels (hit region / hover). */
export const BOWL_OPAQUE_RECT: Readonly<Rect> = Object.freeze({ x: 40, y: 4, w: 84, h: 115 });

/** Where the fish starts (body center), grid px. */
export const BOWL_PET_ANCHOR: readonly [number, number] = Object.freeze([80, 60] as const);
