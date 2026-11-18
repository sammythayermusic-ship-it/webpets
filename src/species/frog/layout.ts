// Pond and jar geometry, in habitat grid px (320x240). The single authority on where the frog's world
// is; `layout.test.ts` holds it to the manifest and to each habitat's `geometry.json`.
//
// Measured, not chosen: `assets/3d/scripts/frog.py` builds the pond, the jar and the frog, projects
// the lily pad, the rock and the bank through the plate camera, and `s5_finish.py` writes what it
// found beside the plates. The numbers below are those.
//
// A frog does not walk. Its world is two perches -- the lily pad it sits on and the rock it hops to --
// and the strip of bank in front where crickets are let loose. So the "sites" here are points, and the
// walkable span the manifest's schema asks for is only the stretch between the two perches.

import type { Rect } from '../../sim/types';
import type { Sites } from '../types';

/** A perch: where the frog's centre is when it sits there. A zero-size rect, since a site is a rect. */
const perch = (x: number, y: number): Rect => Object.freeze({ x, y, w: 0, h: 0 });

/** Collision box of the drawn frog, mirroring `sprites.frog.body` in the manifest. */
export const FROG_BODY: Readonly<{ w: number; h: number }> = Object.freeze({ w: 55, h: 37 });

/**
 * Where the frog's mouth is from its centre, facing right: measured off the snap frames (the red of
 * the open mouth). The tongue is drawn from here, and its reach is measured from here.
 */
export const FROG_MOUTH: readonly [number, number] = Object.freeze([16, 6] as const);

// ---- the pond
export const POND_STAND_Y = 111;
export const POND_FLOOR_RECT: Readonly<Rect> = Object.freeze({ x: 140, y: POND_STAND_Y, w: 65, h: 0 });
export const POND_SITES: Sites = Object.freeze({ pad: perch(144, 111.1), rock: perch(200.7, 97.6) });
export const POND_BANK = Object.freeze({ kind: 'crickets' as const, x0: 98.2, x1: 221.8, y: 158.3 });
export const POND_OPAQUE_RECT: Readonly<Rect> = Object.freeze({ x: 46, y: 7, w: 237, h: 203 });
export const POND_PET_ANCHOR: readonly [number, number] = Object.freeze([144, POND_STAND_Y] as const);

// ---- the jar
export const JAR_STAND_Y = 126;
export const JAR_FLOOR_RECT: Readonly<Rect> = Object.freeze({ x: 137, y: JAR_STAND_Y, w: 60, h: 0 });
export const JAR_SITES: Sites = Object.freeze({ pad: perch(141.1, 125.9), rock: perch(193.4, 119.7) });
export const JAR_BANK = Object.freeze({ kind: 'crickets' as const, x0: 116.4, x1: 203.6, y: 167.1 });
export const JAR_OPAQUE_RECT: Readonly<Rect> = Object.freeze({ x: 92, y: 56, w: 143, h: 149 });
export const JAR_PET_ANCHOR: readonly [number, number] = Object.freeze([141, JAR_STAND_Y] as const);
