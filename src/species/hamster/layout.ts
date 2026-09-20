// Cage geometry, in habitat grid px (320x240). The single authority on where the hamster's world is;
// `layout.test.ts` asserts it against the manifest so the two can never drift.

import type { Rect } from '../../sim/types';
import type { Sites } from '../types';

/**
 * The bedding line the hamster walks along.
 *
 * A cage is not a volume the way a bowl is. The fish's domain is an ellipse of water it moves through
 * in two dimensions; a hamster walks on a floor, so its domain is a span and a height, and every
 * vertical position in the habitat is decided by the furniture rather than by the animal.
 */
export const CAGE_STAND_Y = 185;

/**
 * Walkable span, measured to the hamster's CENTRE line — the body box is applied on top by the clamp,
 * exactly as the water clamp does it, so this is the bedding's full inside width rather than a
 * pre-inset one.
 */
export const CAGE_FLOOR_RECT: Readonly<Rect> = Object.freeze({ x: 58, y: CAGE_STAND_Y, w: 204, h: 0 });

/**
 * Where the furniture is.
 *
 * The fish needed nothing like this: a bowl is empty and every target it picks is computed from the
 * water. Almost everything a hamster does is *going somewhere specific*, so those places are data —
 * which is also what lets the same behaviour be re-laid-out for the terrarium upgrade without touching
 * the state machine.
 *
 * Every site sits ON the bedding line. The wheel is the one that looks like it shouldn't: its axle is
 * well above the floor, but a hamster runs at the BOTTOM of the wheel, so the animal's body centre
 * while running is a floor position and the spinning rim is art behind it. Modelling it any other way
 * would have meant letting the pet leave the floor, and then the walkable domain stops being a line.
 */
export const CAGE_SITES: Sites = Object.freeze({
  wheel: Object.freeze({ x: 180, y: 128, w: 64, h: 64 }),
  hopper: Object.freeze({ x: 68, y: 150, w: 32, h: 38 }),
  bed: Object.freeze({ x: 116, y: 172, w: 48, h: 20 }),
});

/** Centre x of a site, which is all the behaviour needs: everything happens on one row. */
export function siteX(r: Rect): number {
  return r.x + r.w / 2;
}

/** Bounding box of the cage's opaque pixels (hit region / hover). */
export const CAGE_OPAQUE_RECT: Readonly<Rect> = Object.freeze({ x: 40, y: 40, w: 240, h: 170 });

/** Where the hamster starts: on the bedding, by its nest. */
export const CAGE_PET_ANCHOR: readonly [number, number] = Object.freeze([140, CAGE_STAND_Y] as const);

/** The seed hopper doubles as the pantry gauge; fill is cropped from the bottom up. */
export const CAGE_PANTRY_RECT: Readonly<Rect> = Object.freeze({ x: 70, y: 152, w: 28, h: 34 });

/**
 * Collision box of the drawn hamster, mirroring `sprites.hamster.body` in the manifest. Shorter and
 * stubbier than the fish's 50x32: a hamster is a rounded lump, and the box excludes the tail and the
 * ear tips so they may overlap the cage bars without the clamp fighting them.
 */
export const HAMSTER_BODY: Readonly<{ w: number; h: number }> = Object.freeze({ w: 44, h: 30 });
