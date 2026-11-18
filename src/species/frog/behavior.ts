// Frog behaviour state machine. Pure: no Pixi, no DOM. One step() = one 8 fps tick.
// Blueprint §8: "Feeding releases crickets that hop along the bank; the frog turns, waits,
// tongue-snaps when one is in range... Idle: still on the pad, blink, occasional hop to the rock;
// throat-bubble croak on hover. Hungry: stops hunting, sinks lower."
//
// The third implementation of the one contract, and the first whose pet does not travel: a fish
// swims through a volume, a hamster walks a line, a frog SITS, on one of two perches, and everything
// it does is done from there. So there is no speed, no wander target and no clamp in this file; the
// only motion is the hop between the perches, which is an arc with a beginning and an end.
//
// What it hunts is `input.flakes`, as for every species -- here they are crickets (render/crickets.ts)
// that move by themselves, so the frog aims at where one IS and can miss when it hops.

import type { PetAct, PetAnim, PetBehavior, PetInput, PetOutput } from '../../render/types';
import type { Drives } from '../../sim/needs';
import type { Sites } from '../types';
import { FROG_MOUTH, POND_SITES } from './layout';

/** How far the tongue reaches from the mouth, grid px (about one and a half frogs). */
export const TONGUE_RANGE = 70;
/** Ticks a hop takes, and how far along it the frog is on each (it gathers, springs, lands). */
export const HOP_TICKS = 5;
const HOP_PROFILE: readonly number[] = [0.04, 0.34, 0.7, 0.95, 1];
/** How high the hop's arc rises above the straight line between the perches, grid px. */
const HOP_ARC = 15;
/**
 * Ticks a frog watches a cricket SITTING STILL in range before it strikes, least and most. A cricket
 * that hops starts the wait again: a frog strikes at what has settled, which is also what gives the
 * tongue a fair chance of finding it still there a tick later.
 */
const AIM_MIN = 3;
const AIM_MAX = 8;
/** The tongue is out for two ticks and the mouth shuts on the third. */
export const SNAP_TICKS = 3;
/** Ticks between two strikes. */
const SNAP_COOLDOWN = 7;
/** A cricket this close to where the tongue landed is caught; one a little further off is frightened. */
const CATCH_RADIUS = 7;
const SCARE_RADIUS = 18;
/** Even a well-aimed tongue misses now and then. */
const MISS_CHANCE = 0.1;
/** Ticks with crickets about but none in reach before it hops to the other perch for a better angle. */
const OUT_OF_REACH_TICKS = 18;
/** Minimum ticks between two facing changes. */
const TURN_COOLDOWN = 6;
/** A croak: two swells of the throat. */
export const CROAK_TICKS = 11;
/** Ticks before it will croak again at the same pointer. */
const CROAK_COOLDOWN = 56;
/** Chance per tick of a hop to the other perch, a croak for no reason, and a look the other way. */
const HOP_URGE = 0.0035;
const CROAK_URGE = 0.004;
const TURN_URGE = 0.003;
/** Ticks it sits after a hop before it may want another. */
const HOP_COOLDOWN = 64;
/** How much the pointer must interest it before it croaks at you. */
const HOVER_CROAK = 0.3;

/** With no needs model wired: a rested, settled frog. */
const DEFAULT_DRIVES: Drives = { activity: 0.65, approach: 1, hide: 0, nap: false, greet: false, surface: 0 };

type Perch = 'pad' | 'rock';

/** `sites` is where this habitat put the lily pad and the rock; the pond's by default. */
export function createFrogBehavior(sites: Sites = POND_SITES): PetBehavior {
  const at = (p: Perch): { x: number; y: number } => {
    const r = sites[p] ?? sites['pad'] ?? { x: 160, y: 120 };
    return { x: r.x, y: r.y };
  };
  const other = (p: Perch): Perch => (p === 'pad' ? 'rock' : 'pad');

  let perch: Perch = 'pad';
  let x = at('pad').x;
  let y = at('pad').y;
  let facing: 1 | -1 = 1;
  let turnCooldown = 0;
  let hop: { to: Perch; tick: number } | null = null;
  let hopCooldown = 0;
  let croakTicks = 0;
  let croakCooldown = 0;
  let greeted = false;
  /** Ticks spent watching a cricket in reach, and how many this strike needs. */
  let aim = 0;
  let aimNeeded = AIM_MIN;
  /** Where the cricket it is watching was last tick, to tell sitting from hopping. */
  let watched: { x: number; y: number } | null = null;
  let snap: { tick: number; x: number; y: number; caught: boolean } | null = null;
  let snapCooldown = 0;
  let outOfReach = 0;

  const reset = (): void => {
    perch = 'pad';
    x = at('pad').x;
    y = at('pad').y;
    facing = 1;
    turnCooldown = 0;
    hop = null;
    hopCooldown = 0;
    croakTicks = 0;
    croakCooldown = 0;
    greeted = false;
    aim = 0;
    aimNeeded = AIM_MIN;
    watched = null;
    snap = null;
    snapCooldown = 0;
    outOfReach = 0;
  };

  /** How far a point is from the mouth of a frog sitting on `p` and facing it. */
  const reachFrom = (p: Perch, tx: number, ty: number): number => {
    const o = at(p);
    const f = tx >= o.x ? 1 : -1;
    return Math.hypot(tx - (o.x + f * FROG_MOUTH[0]), ty - (o.y + FROG_MOUTH[1]));
  };

  const startHop = (to: Perch): void => {
    hop = { to, tick: 0 };
    hopCooldown = HOP_COOLDOWN;
    croakTicks = 0;
    aim = 0;
    outOfReach = 0;
  };

  const step = (input: PetInput): PetOutput => {
    const { rng } = input;
    const drives = input.drives ?? DEFAULT_DRIVES;
    const out = (anim: PetAnim, more: Partial<PetOutput> = {}): PetOutput => ({ x, y, facing, turning: false, anim, biteFlakeIndex: null, ...more });
    if (turnCooldown > 0) turnCooldown -= 1;
    if (hopCooldown > 0) hopCooldown -= 1;
    if (croakCooldown > 0) croakCooldown -= 1;
    if (snapCooldown > 0) snapCooldown -= 1;

    // ---- dead: on its back where it sat
    if (!input.alive) {
      if (hop) {
        // it does not die in mid-air: it lands first
        perch = hop.to;
        hop = null;
      }
      const o = at(perch);
      x = o.x;
      y = o.y;
      snap = null;
      croakTicks = 0;
      return out('dead');
    }

    // ---- in the air: a hop finishes whatever else is going on
    if (hop) {
      const from = at(perch);
      const to = at(hop.to);
      const u = HOP_PROFILE[Math.min(HOP_TICKS - 1, hop.tick)] ?? 1;
      hop.tick += 1;
      x = from.x + (to.x - from.x) * u;
      y = from.y + (to.y - from.y) * u - HOP_ARC * Math.sin(Math.PI * u);
      if (hop.tick >= HOP_TICKS) {
        perch = hop.to;
        x = to.x;
        y = to.y;
        hop = null;
      }
      return out('idle', { act: 'hop' });
    }

    // ---- the tongue is out: finish the strike
    if (snap) {
      snap.tick += 1;
      if (snap.tick === 2) {
        // It lands where the cricket WAS a tick ago. One still there is caught; one that hopped is not.
        const s = snap;
        let best = -1;
        let bestD = Infinity;
        input.flakes.forEach((f, i) => {
          const d = Math.hypot(f.x - s.x, f.y - s.y);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        if (best >= 0 && bestD <= CATCH_RADIUS && rng() >= MISS_CHANCE) {
          snap.caught = true;
          return out('idle', { act: 'snap', reach: { x: snap.x, y: snap.y, caught: true }, biteFlakeIndex: best, speciesDelta: { cricketsCaught: 1 } });
        }
        return out('idle', {
          act: 'snap',
          reach: { x: snap.x, y: snap.y },
          ...(best >= 0 && bestD <= SCARE_RADIUS ? { scareFlakeIndex: best } : {}),
        });
      }
      // the mouth shuts
      snap = null;
      snapCooldown = SNAP_COOLDOWN;
      aim = 0;
      return out('idle', { act: 'snap' });
    }

    const starving = input.label === 'starving';
    const hungry = input.label === 'hungry' || starving;
    let anim: PetAnim = 'idle';
    let act: PetAct | undefined;
    let turning = false;
    const face = (want: 1 | -1): boolean => {
      if (want === facing) return true;
      if (turnCooldown > 0) return false;
      facing = want;
      turning = true;
      turnCooldown = TURN_COOLDOWN;
      return false;
    };

    if (input.flakes.length > 0 && !starving) {
      // ---- crickets on the bank: turn to the nearest, wait for it, strike
      croakTicks = 0;
      const mx = (f: 1 | -1): number => x + f * FROG_MOUTH[0];
      const my = y + FROG_MOUTH[1];
      let best = 0;
      let bestD = Infinity;
      input.flakes.forEach((f, i) => {
        const d = reachFrom(perch, f.x, f.y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      const target = input.flakes[best];
      if (target) {
        const want: 1 | -1 = Math.abs(target.x - x) < 4 ? facing : target.x > x ? 1 : -1;
        const facingIt = face(want);
        const d = Math.hypot(target.x - mx(facing), target.y - my);
        if (facingIt && d <= TONGUE_RANGE) {
          outOfReach = 0;
          const still = watched !== null && Math.hypot(target.x - watched.x, target.y - watched.y) < 1;
          watched = { x: target.x, y: target.y };
          if (!still) aim = 0;
          if (aim === 0) aimNeeded = AIM_MIN + Math.floor(rng() * (AIM_MAX - AIM_MIN + 1));
          aim += 1;
          if (aim >= aimNeeded && snapCooldown === 0) {
            snap = { tick: 1, x: target.x, y: target.y, caught: false };
            return out('idle', { act: 'snap', reach: { x: target.x, y: target.y } });
          }
        } else if (facingIt) {
          aim = 0;
          outOfReach += 1;
          // nothing in reach for a while: the other perch, if it is any nearer to one
          if (outOfReach >= OUT_OF_REACH_TICKS) {
            const there = other(perch);
            const nearer = input.flakes.some((f) => reachFrom(there, f.x, f.y) <= TONGUE_RANGE);
            outOfReach = 0;
            if (nearer && face(at(there).x >= x ? 1 : -1)) startHop(there);
          }
        }
      }
      // a hungry frog hunts low to the pad; a fed one sits up to watch
      anim = hungry ? 'hungry' : 'idle';
    } else if (input.asleep || drives.nap) {
      // ---- night, or worn out: asleep where it sits
      croakTicks = 0;
      anim = 'sleep';
    } else if (hungry) {
      // ---- hungry: it stops everything and sinks lower
      croakTicks = 0;
      anim = 'hungry';
    } else if (input.tap) {
      // ---- a tap on the glass: a frog's answer to a fright is to be somewhere else
      const there = other(perch);
      facing = at(there).x >= x ? 1 : -1;
      startHop(there);
      act = 'hop';
    } else {
      // ---- content: sit, blink (that is in the idle art), croak, and now and then cross over
      const cheer = Math.max(-1, Math.min(1, drives.cheer ?? 0));
      const cheering = cheer > 0.5;
      const sulking = cheer < -0.5;
      const attract = input.attract && input.attract.strength > 0 ? input.attract : null;
      if (croakTicks > 0) {
        croakTicks -= 1;
        act = 'croak';
      } else if (!sulking && croakCooldown === 0) {
        // at you, when you come to look; when it knows you (a greeting); and for no reason at all
        const greet = drives.greet && !greeted && attract !== null;
        const hover = attract !== null && attract.strength * drives.approach >= HOVER_CROAK;
        if (greet || hover || rng() < CROAK_URGE * (0.5 + drives.activity) * (cheering ? 4 : 1)) {
          if (greet) greeted = true;
          if (attract) face(attract.x >= x ? 1 : -1);
          croakTicks = CROAK_TICKS;
          croakCooldown = CROAK_COOLDOWN;
          act = 'croak';
        }
      }
      if (!drives.greet) greeted = false;
      if (act === undefined && hopCooldown === 0 && drives.hide < 0.3 && rng() < HOP_URGE * (0.5 + drives.activity)) {
        const there = other(perch);
        if (face(at(there).x >= x ? 1 : -1)) {
          startHop(there);
          act = 'hop';
        }
      } else if (act === undefined && turnCooldown === 0 && rng() < TURN_URGE) {
        face(facing === 1 ? -1 : 1);
      }
      if (sulking && act === undefined) act = 'sulk';
    }

    const res = out(anim, { turning });
    if (act !== undefined) res.act = act;
    return res;
  };

  return { step, reset };
}
