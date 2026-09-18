// Bowl geometry in 320x240 grid px. Must stay in sync with assets/manifest.json ("fish/bowl") and
// tools/gen_placeholders.py; src/species/fish/layout.test.ts enforces the manifest half of that.
//
// Stage 1 doubled every number here (the old 160x120 values x2) so the art, which is a 2x nearest
// upscale of the 160x120 art, still lines up pixel for pixel.

import type { Rect } from '../../sim/types';
import type { WaterShape } from '../../render/types';

/**
 * Ellipse approximation of the concept bowl's water, measured from the art: the water spans y 46..192,
 * x 118..208 at the surface, x 82..242 at the widest (y ~102..134) and x 128..196 near the gravel.
 */
export const BOWL_WATER_SHAPE: Readonly<WaterShape> = Object.freeze({
  cx: 162,
  cy: 116,
  rx: 80,
  ry: 84,
  surfaceY: 46,
  floorY: 192,
});

/** Bounding rect of the water (x 82..241, y 46..193). */
export const BOWL_WATER_RECT: Readonly<Rect> = Object.freeze({ x: 82, y: 46, w: 160, h: 148 });

/** Inner box of the clip-on feeder at the top-right rim; pantry_fill's opaque pixels lie inside it. */
export const BOWL_PANTRY_RECT: Readonly<Rect> = Object.freeze({ x: 186, y: 10, w: 36, h: 30 });

/** Bounding box of the bowl's opaque pixels (hit region / hover). */
export const BOWL_OPAQUE_RECT: Readonly<Rect> = Object.freeze({ x: 80, y: 8, w: 168, h: 230 });

/** Where the fish starts (body center), grid px. */
export const BOWL_PET_ANCHOR: readonly [number, number] = Object.freeze([160, 120] as const);
