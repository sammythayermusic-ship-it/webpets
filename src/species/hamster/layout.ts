// Cage geometry, in habitat grid px (320x240). The single authority on where the hamster's world is;
// `layout.test.ts` asserts it against the manifest so the two can never drift.
//
// Every number below was measured, not chosen. `assets/3d/scripts/wp_cage.py` builds the cage and
// `CAM_cage` shoots it, so the furniture's position on screen is a fact about the model: the values
// here come from projecting real mesh vertices through that camera with `world_to_camera_view`, the
// same way the bowl's geometry.json is produced. Nothing here is measured off a pixel by eye.
//
// The sites are on the opposite side from where the placeholder put them. The placeholder was drawn
// before the cage existed and guessed; the render has the wheel LEFT, the bottle right of centre and
// the hopper RIGHT, and the art wins.

import type { Rect } from '../../sim/types';
import type { Sites } from '../types';

/**
 * The bedding line the hamster walks along, as the hamster's CENTRE.
 *
 * A cage is not a volume the way a bowl is. The fish's domain is an ellipse of water it moves through
 * in two dimensions; a hamster walks on a floor, so its domain is a span and a height, and every
 * vertical position in the habitat is decided by the furniture rather than by the animal.
 *
 * 118 is where `RIG_ham_root` projects to — the rig the five states are posed on, so it is the row the
 * art is actually drawn around rather than a row picked to look right.
 */
export const CAGE_STAND_Y = 118;

/**
 * Walkable span, measured to the hamster's CENTRE line — the body box is applied on top by the clamp,
 * exactly as the water clamp does it, so this is the bedding's full inside width rather than a
 * pre-inset one. Taken from the inside faces of the tub walls at the bedding line.
 */
export const CAGE_FLOOR_RECT: Readonly<Rect> = Object.freeze({ x: 44, y: CAGE_STAND_Y, w: 232, h: 0 });

/**
 * Where the furniture is: each rect is that prop's own projected bounding box.
 *
 * The fish needed nothing like this: a bowl is empty and every target it picks is computed from the
 * water. Almost everything a hamster does is *going somewhere specific*, so those places are data —
 * which is also what lets the same behaviour be re-laid-out for the terrarium upgrade without touching
 * the state machine.
 *
 * Every site is *stood at* on the bedding line, whatever height the prop itself is drawn at. The wheel
 * and the bottle are the ones that look like they shouldn't be: the wheel's axle is well above the
 * floor and the bottle is clipped to the bars, but a hamster runs at the BOTTOM of the wheel and
 * reaches UP to the spout, so in both cases the animal's body centre is a floor position and the prop
 * is art around it. Only the site's centre x reaches the behaviour. Modelling it any other way would
 * have meant letting the pet leave the floor, and then the walkable domain stops being a line.
 */
export const CAGE_SITES: Sites = Object.freeze({
  wheel: Object.freeze({ x: 58, y: 63, w: 77, h: 75 }),
  bottle: Object.freeze({ x: 180, y: 25, w: 22, h: 65 }),
  hopper: Object.freeze({ x: 220, y: 81, w: 28, h: 57 }),
  // Not a modelled prop: the patch of bedding the hamster sleeps on, set left of centre where the
  // bedding is deepest and clear of the traffic between the wheel and the hopper.
  bed: Object.freeze({ x: 112, y: 142, w: 48, h: 22 }),
});

/** Centre x of a site, which is all the behaviour needs: everything happens on one row. */
export function siteX(r: Rect): number {
  return r.x + r.w / 2;
}

/**
 * Bounding box of the cage's opaque pixels (hit region / hover).
 *
 * This one is not negotiable and not rounded for looks: it is the alpha-0.5 bounding box of the
 * rendered `bg.png` reduced to grid px, and it decides which pixels of an always-on-top window swallow
 * the user's clicks. `habitatArt.test.ts` recomputes it from the PNG on every run.
 */
export const CAGE_OPAQUE_RECT: Readonly<Rect> = Object.freeze({ x: 40, y: 12, w: 261, h: 211 });

/** Where the hamster starts: on the bedding, mid-cage between the wheel and the bottle. */
export const CAGE_PET_ANCHOR: readonly [number, number] = Object.freeze([160, CAGE_STAND_Y] as const);

/** The seed hopper doubles as the pantry gauge; fill is cropped from the bottom up. */
export const CAGE_PANTRY_RECT: Readonly<Rect> = Object.freeze({ x: 222, y: 84, w: 24, h: 50 });

/**
 * Collision box of the drawn hamster, mirroring `sprites.hamster.body` in the manifest.
 *
 * A shade larger than the fish's 50x32, because the hamster is drawn about 63x57 — the size `CAM_cage`
 * itself projects the model at, now that the sprite camera is a crop of that same view rather than a
 * lens of its own. The box sits just inside the drawn extent so the ear tips and tail may overlap the
 * cage bars without the clamp fighting them; the narrowest state (`dead`, 59.0 px, lying on its side)
 * is what caps the width, since the art gate requires every state to be drawn strictly larger than
 * the box it collides with. Unchanged through the remodel: the animal turned 50 degrees toward the
 * camera and grew a head, and still lands inside the same collision box.
 */
export const HAMSTER_BODY: Readonly<{ w: number; h: number }> = Object.freeze({ w: 56, h: 41 });
