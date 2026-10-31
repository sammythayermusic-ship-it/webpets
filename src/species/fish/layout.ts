// Bowl geometry in 320x240 LOGICAL grid px. Must stay in sync with assets/manifest.json ("fish/bowl");
// src/species/fish/layout.test.ts enforces that, and src/render/bgArt.test.ts re-derives these numbers
// from the shipped art so neither can drift from the pixels.
//
// Stage 3 replaced the painted bowl with a Blender render, and with it the way these numbers are
// produced. They used to be MEASURED off someone else's painting by `tools/gen_bg.py`, which is how
// `surfaceY` came to mean the top of the glass rather than the top of the water: the tool's water test
// accepted pale glass, and the row it settled on had two qualifying pixels, both inside the feeder.
// They are now PROJECTED out of the 3D scene through the orthographic bowl camera and exported to
// `assets/habitats/fish/bowl/geometry.json`, then divided by the art's 4x scale. A renderer knows where
// its own water surface is; nothing has to be inferred from colour.

import type { Rect } from '../../sim/types';
import type { WaterShape } from '../../render/types';

/**
 * The inside of the glass: the volume the fish may swim in, clipped to surfaceY..floorY.
 *
 * `surfaceY` is the NEAR edge of the water surface, not its centre. The surface is an ellipse seen from
 * slightly above, so on screen it spans rows 56..78: the back of it is 22 px higher than the front.
 * Clamping to the centre (67) would let the fish rise in front of the visible waterline and read as
 * floating in the air pocket, which is the same complaint the painted bowl produced for a different
 * reason. The near edge is the only row that is under water in every column.
 *
 * `floorY` is the top of the gravel at the centre of the bed, which is its lowest point — the bed is
 * dished, so the fish can sit deepest in the middle.
 */
export const BOWL_WATER_SHAPE: Readonly<WaterShape> = Object.freeze({
  cx: 160,
  cy: 101,
  rx: 82,
  ry: 81,
  surfaceY: 78,
  floorY: 139,
});

/** Bounding rect of the water: the ellipse's full width, from the surface down to the gravel. */
export const BOWL_WATER_RECT: Readonly<Rect> = Object.freeze({ x: 78, y: 78, w: 164, h: 61 });

/**
 * Bounding box of the bowl's opaque pixels (hit region / hover). Equals bg.png's alpha bbox at
 * alpha > 0.5, divided by the art scale, with the minimum floored and the maximum ceiled so the rect
 * never under-covers the art.
 *
 * The threshold matters now in a way it did not for hard-alpha pixel art: the render's contact shadow
 * is a soft gradient reaching well outside the bowl, and including it would make the window swallow
 * clicks over empty desk.
 */
export const BOWL_OPAQUE_RECT: Readonly<Rect> = Object.freeze({ x: 74, y: 22, w: 172, h: 203 });

/** Where the fish starts (body centre), grid px: the middle of the WATER, not of the glass. */
export const BOWL_PET_ANCHOR: readonly [number, number] = Object.freeze([160, 108] as const);

/**
 * Collision box of the drawn fish, mirroring `sprites.fish.body` in the manifest. The behavior clamps
 * this box inside `BOWL_WATER_SHAPE`, so it is deliberately smaller than the drawn fish (about 59x39
 * logical px at the 80x80 frame): the difference is the fin fringe, which may brush the glass without
 * the water clamp fighting it.
 *
 * The height is the number that had to be chosen rather than measured. The rendered bowl has a much
 * shallower water volume than the painted one did -- 61 logical px between surface and gravel, where
 * the old art had 110 -- so a box tall enough to contain the dorsal and pelvic fins would leave the
 * fish barely 20 px of vertical travel and kill the figure-eight. 32 keeps the body proper inside the
 * water and lets the fins overlap the glass, which is what the box was always for.
 */
export const FISH_BODY: Readonly<{ w: number; h: number }> = Object.freeze({ w: 36, h: 18 });

/**
 * How long the live goldfish is drawn, nose to tail tip, grid px. Sammy asked for a smaller fish with
 * more room to swim (2026-10-31): 44 is three quarters of the September fish's 59.5, and the body box
 * above shrank with it (36x18 from 50x32), which gives the body centre 14 px more travel across the
 * bowl and 14 px more top to bottom. The box still holds the body proper; the fins and most of the
 * flowing tail overhang it, which is what the box has always allowed. The bitmap sprite frames (the
 * fallback when there is no live layer) are the September fish's and are drawn larger than this.
 */
export const FISH_DRAWN_LENGTH = 44;

/**
 * Where the mouth is, ahead of the body centre along the facing, grid px. The goldfish's root sits
 * mid-length (nose at +0.062 m of a 0.123 m mesh), so at 44 px long the mouth is ~22 px ahead. The
 * fish bites with its MOUTH: a flake within MOUTH_REACH of this point is eaten, so a feed reads as
 * the fish snapping each flake rather than inhaling food that touched its flank.
 */
export const FISH_MOUTH_AHEAD = 22;
export const FISH_MOUTH_REACH = 7;
