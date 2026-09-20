// Terrarium geometry, in habitat grid px (320x240). The hamster's home; the cage is the fallback.
//
// Same discipline as the cage's: every number here was measured by projecting real mesh vertices
// through `CAM_terr` with `world_to_camera_view`, not read off a pixel. `assets/3d/scripts/
// wp_terrarium.py` builds the tank and that camera shoots it, so where the furniture sits on screen
// is a fact about the model.

import type { Rect } from '../../sim/types';
import type { Sites } from '../types';

/** The bedding surface the hamster walks on, as the hamster's CENTRE. */
export const TERR_STAND_Y = 119;

/**
 * Walkable span, measured to the hamster's centre. The body box is applied on top by the clamp, so
 * this is the glass's full inside width rather than a pre-inset one.
 */
export const TERR_FLOOR_RECT: Readonly<Rect> = Object.freeze({ x: 20, y: TERR_STAND_Y, w: 250, h: 0 });

/**
 * Where the furniture is: each rect is that prop's own projected bounding box.
 *
 * Two of these are deliberately not what their names suggest, and both are improvements the tank
 * made possible:
 *
 * `bed` is the wooden HOUSE. In the cage it was a bare patch of bedding, so "go to bed" meant
 * walking to an unmarked spot and lying down on it. Now the sleep errand has somewhere to be.
 *
 * `hopper` is the FOOD BOWL, not the wall hopper. The hopper is where food is stored -- it is the
 * pantry gauge -- but the bowl is where a hamster eats, and it is also the one the animal can
 * actually reach: the wall hopper's centre projects to x=254, and with the body box on, the clamp
 * stops at 242. The cage's layout test caught exactly this class of mistake once before, with a
 * water bottle 9 px out of reach.
 */
export const TERR_SITES: Sites = Object.freeze({
  bed: Object.freeze({ x: 21, y: 47, w: 76, h: 83 }),
  wheel: Object.freeze({ x: 104, y: 42, w: 62, h: 62 }),
  hopper: Object.freeze({ x: 165, y: 95, w: 48, h: 34 }),
  bottle: Object.freeze({ x: 214, y: 25, w: 20, h: 64 }),
});

/**
 * Bounding box of the tank's opaque pixels: the alpha-0.5 bbox of the rendered `bg`, exactly.
 *
 * It includes the cast shadow, which is why it reaches further right than the glass does. That is
 * not a mistake -- the shadow is part of the drawn habitat, and this rect is the window's
 * click-through contract, so it has to cover everything the user can see.
 */
export const TERR_OPAQUE_RECT: Readonly<Rect> = Object.freeze({ x: 14, y: 15, w: 303, h: 200 });

/** Where the hamster starts: on the bedding, mid-tank. */
export const TERR_PET_ANCHOR: readonly [number, number] = Object.freeze([145, TERR_STAND_Y] as const);

/** The wall hopper doubles as the pantry gauge; fill is cropped from the bottom up. */
export const TERR_PANTRY_RECT: Readonly<Rect> = Object.freeze({ x: 242, y: 18, w: 24, h: 50 });
