// Brooder and coop geometry, in habitat grid px (320x240). The single authority on where the chicken's
// world is; `layout.test.ts` holds it to the manifest and to each habitat's `geometry.json`.
//
// Measured, not chosen: `assets/3d/scripts/chicken.py` builds both habitats and both birds, projects
// the furniture through the plate camera, and `s5_finish.py` writes what it found beside the plates.
//
// A chicken is two animals in two places. For its first seven days it is a chick in a brooder, under
// a heat lamp; then the sim moves it to the coop as a hen (`src/sim/chicken.ts`). Each is a floor to
// walk along with a few places to be, exactly as the hamster's cage is, so the sites are data here too.

import type { Rect } from '../../sim/types';
import type { Sites } from '../types';

/** A place to stand: only its x matters (everything happens on the floor), so it is a point. */
const spot = (x: number, y: number): Rect => Object.freeze({ x, y, w: 0, h: 0 });

/** Centre x of a site. */
export function siteX(r: Rect): number {
  return r.x + r.w / 2;
}

// ---- the brooder (the chick)
/** Collision box of the drawn chick, mirroring `sprites["chicken/brooder"].body`. */
export const CHICK_BODY: Readonly<{ w: number; h: number }> = Object.freeze({ w: 22, h: 19 });
export const BROODER_STAND_Y = 137;
export const BROODER_FLOOR_RECT: Readonly<Rect> = Object.freeze({ x: 73, y: BROODER_STAND_Y, w: 174, h: 0 });
/** Under the heat lamp (where it naps), the feeder, the waterer. */
export const BROODER_SITES: Sites = Object.freeze({
  lamp: spot(105.5, 136.9),
  feeder: spot(178.9, 136.9),
  water: spot(218.2, 136.9),
});
/** The row dropped feed comes to rest on: the straw just in front of the chick's feet. */
export const BROODER_FOOD_ROW = 159.3;
export const BROODER_OPAQUE_RECT: Readonly<Rect> = Object.freeze({ x: 50, y: 34, w: 237, h: 156 });
export const BROODER_PET_ANCHOR: readonly [number, number] = Object.freeze([160, BROODER_STAND_Y] as const);

// ---- the coop (the hen)
/** Collision box of the drawn hen, mirroring `sprites.chicken.body`. */
export const HEN_BODY: Readonly<{ w: number; h: number }> = Object.freeze({ w: 33, h: 30 });
export const COOP_STAND_Y = 140;
export const COOP_FLOOR_RECT: Readonly<Rect> = Object.freeze({ x: 65, y: COOP_STAND_Y, w: 190, h: 0 });
/** The house's doorway (where she roosts), the hanging feeder, the dust bath. */
export const COOP_SITES: Sites = Object.freeze({
  door: spot(94.5, 139.7),
  feeder: spot(148.4, 139.7),
  dust: spot(189.1, 139.7),
});
export const COOP_FOOD_ROW = 167;
export const COOP_OPAQUE_RECT: Readonly<Rect> = Object.freeze({ x: 38, y: 51, w: 249, h: 144 });
export const COOP_PET_ANCHOR: readonly [number, number] = Object.freeze([170, COOP_STAND_Y] as const);
