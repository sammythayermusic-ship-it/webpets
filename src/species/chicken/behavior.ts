// Chicken behaviour state machine. Pure: no Pixi, no DOM. One step() = one 8 fps tick.
// Blueprint §8: "A new chicken is a chick under a heat lamp in the brooder... Hen behaviors: peck,
// scratch, dust-bathe, chase a bug, roost inside at night (doorway glows)... Hungry: stops laying,
// feathers ruffle, stands at the empty feeder."
//
// The same shape as `species/hamster/behavior.ts`, on purpose: a floor to walk along, a table of
// errands to named places, the clamp applied last and once. What differs is the table. One file is
// both birds, because a chick is a small hen with fewer things to do: `stage` picks the errands and
// the speeds, and the habitat's sites say where things are.
//
// Eggs and the move from brooder to coop are NOT here: they are facts about days alive and fed, so
// they live in the sim (`src/sim/chicken.ts`), which works while the app is shut.

import type { MoveBounds, PetAct, PetAnim, PetBehavior, PetInput, PetOutput } from '../../render/types';
import type { HungerLabel, Personality } from '../../sim/types';
import type { Drives } from '../../sim/needs';
import { dartSpeed } from '../../sim/motion';
import type { Sites } from '../types';
import { BROODER_SITES, siteX } from './layout';

export type ChickenStage = 'chick' | 'hen';

/** Ticks the eat animation is held after a bite. */
const EAT_TICKS = 4;
const TURN_COOLDOWN = 5;
const TURN_THRESHOLD = 0.3;
/** Feed within this many px of the body box is eaten. */
const BITE_RANGE = 8;
const ARRIVE_EPS = 2;
const ACCEL = 0.4;
const WALK_THRESHOLD = 0.12;
const WANDER_EVERY = 28;
const ERRAND_COOLDOWN = 24;
/** A bird stops and looks about a lot. */
const PAUSE_CHANCE = 0.05;
const PAUSE_MIN_TICKS = 5;
const PAUSE_MAX_TICKS = 20;
const ATTRACT_MAX = 0.5;
const STARTLE_TICKS = 8;
/** Brisk to bed, whatever the drives say. */
const BED_WALK_SPEED = 2.2;

/** How each bird moves: walking pace by hunger, a fright's peak speed, a greeting's dash. */
const GAIT: Readonly<Record<ChickenStage, { walk: number; hungry: number; startle: number; greet: number }>> = {
  chick: { walk: 1.5, hungry: 1.0, startle: 5.0, greet: 2.6 },
  hen: { walk: 1.9, hungry: 1.2, startle: 6.0, greet: 3.0 },
};

/** Where each bird sleeps: the chick in the lamp's warm spot, the hen in her doorway. */
const BED: Readonly<Record<ChickenStage, string>> = { chick: 'lamp', hen: 'door' };

// ---- the bug (hen only)
/** Chance per tick, while pottering, that a bug shows itself. About once every forty seconds. */
const BUG_URGE = 0.003;
/** How far ahead of her it appears, how fast it runs and she follows, px per tick. */
const BUG_AHEAD_MIN = 26;
const BUG_AHEAD_MAX = 44;
export const BUG_SPEED = 2.1;
export const CHASE_SPEED = 3.0;
/** How often it freezes for a tick (which is when she gains on it). */
const BUG_FREEZE = 0.3;
/** Her beak reaches this far past her body box. */
const BUG_CATCH = 5;
/** Ticks before a bug she has not caught gets under the fence and away. */
export const BUG_ESCAPE_TICKS = 80;

interface Errand {
  /** Where it happens; null means right where the bird stands. */
  readonly site: string | null;
  readonly minTicks: number;
  readonly maxTicks: number;
  /** Chance per tick of choosing this one while pottering. */
  readonly urge: number;
  readonly anim: PetAnim;
  readonly act?: PetAct;
  /** How a tired or lazy bird's urge differs: napping is what a low-activity chick does MORE of. */
  readonly lazy?: boolean;
}

/** Pecking at the ground: what any chicken does between everything else. */
const PECK: Errand = { site: null, minTicks: 8, maxTicks: 22, urge: 0.014, anim: 'eat' };
const AT_FEEDER: Errand = { site: 'feeder', minTicks: 16, maxTicks: 40, urge: 0.006, anim: 'eat' };

const ERRANDS: Readonly<Record<ChickenStage, readonly Errand[]>> = {
  chick: [
    PECK,
    AT_FEEDER,
    // Reuses `eat`, like the hamster's drink: head down, re-issued each tick.
    { site: 'water', minTicks: 12, maxTicks: 26, urge: 0.005, anim: 'eat', act: 'drink' },
    // A nap in the warm spot under the lamp: chicks sleep in short bouts all day.
    { site: 'lamp', minTicks: 64, maxTicks: 180, urge: 0.004, anim: 'sleep', lazy: true },
  ],
  hen: [
    PECK,
    AT_FEEDER,
    // Scratching the litter back with her feet, then looking at what turned up.
    { site: null, minTicks: 14, maxTicks: 30, urge: 0.01, anim: 'idle', act: 'scratch' },
    // A dust bath in the hollow: down, wriggling, shaking it through her feathers.
    { site: 'dust', minTicks: 44, maxTicks: 100, urge: 0.004, anim: 'idle', act: 'dustbathe' },
  ],
};

/** With no needs model wired: a rested, settled bird. */
const DEFAULT_DRIVES: Drives = { activity: 0.65, approach: 1, hide: 0, nap: false, greet: false, surface: 0 };

const PACE: Readonly<Record<Personality, { pace: number; hang: number }>> = {
  zen: { pace: 0.85, hang: 1.3 },
  sarcastic: { pace: 1.0, hang: 1.0 },
  anxious: { pace: 1.1, hang: 0.8 },
  hyper: { pace: 1.2, hang: 0.5 },
};

function moveTowardX(x: number, tx: number, maxStep: number): number {
  const dx = tx - x;
  if (Math.abs(dx) <= maxStep) return tx;
  return x + Math.sign(dx) * maxStep;
}

function ramp(current: number, target: number): number {
  const d = target - current;
  if (Math.abs(d) <= ACCEL) return target;
  return current + Math.sign(d) * ACCEL;
}

/** `stage` is which bird; `sites` is where this habitat put its furniture (the brooder's by default). */
export function createChickenBehavior(stage: ChickenStage = 'chick', sites: Sites = BROODER_SITES): PetBehavior {
  const gait = GAIT[stage];
  const errands = ERRANDS[stage];
  let inited = false;
  let speed = 0;
  let pauseTicks = 0;
  let tripScale = 1;
  let x = 0;
  let y = 0;
  let facing: 1 | -1 = 1;
  let eatTicks = 0;
  let turnCooldown = 0;
  let errand: Errand | null = null;
  let errandTicks = 0;
  let errandCooldown = 0;
  let wanderTo = 0;
  let wanderTicks = 0;
  let startle: { dir: 1 | -1; tick: number } | null = null;
  let greetTo: number | null = null;
  let greeted = false;
  /** The bug she is after: where it is, which way it runs, how long it has been out. */
  let bug: { x: number; dir: 1 | -1; ticks: number } | null = null;

  const reset = (): void => {
    inited = false;
    speed = 0;
    pauseTicks = 0;
    tripScale = 1;
    x = 0;
    y = 0;
    facing = 1;
    eatTicks = 0;
    turnCooldown = 0;
    errand = null;
    errandTicks = 0;
    errandCooldown = 0;
    wanderTo = 0;
    wanderTicks = 0;
    startle = null;
    greetTo = null;
    greeted = false;
    bug = null;
  };

  const init = (bounds: MoveBounds, halfW: number, halfH: number): void => {
    const c = bounds.clamp(bounds.rect.x + bounds.rect.w / 2, bounds.floorY, halfW, halfH);
    x = c.x;
    y = c.y;
    wanderTo = x;
    inited = true;
  };

  /** Drop whatever it was doing (an errand, a chase) and serve the cooldown. */
  const stopErrand = (): void => {
    errand = null;
    errandTicks = 0;
    errandCooldown = ERRAND_COOLDOWN;
    bug = null;
  };

  const step = (input: PetInput): PetOutput => {
    const { bounds, body, rng } = input;
    const halfW = body.w / 2;
    const halfH = body.h / 2;
    if (!inited) init(bounds, halfW, halfH);
    const drives = input.drives ?? DEFAULT_DRIVES;
    const pers = PACE[input.personality ?? 'zen'];
    const attract = input.attract && input.attract.strength > 0 ? input.attract : null;
    const cheer = Math.max(-1, Math.min(1, drives.cheer ?? 0));
    const fedEnough = input.label !== 'hungry' && input.label !== 'starving';
    const sulking = cheer < -0.5 && fedEnough;
    const cheering = cheer > 0.5 && fedEnough;
    const hide = Math.max(drives.hide, sulking ? 0.8 : 0);
    const walkSpeed = (label: HungerLabel): number => (label === 'starving' ? 0.3 : label === 'hungry' ? gait.hungry : gait.walk);
    const pace = (label: HungerLabel): number =>
      walkSpeed(label) * (0.55 + 0.6 * drives.activity) * pers.pace * (sulking ? 0.7 : cheering ? 1.25 : 1);
    if (turnCooldown > 0) turnCooldown -= 1;
    if (eatTicks > 0) eatTicks -= 1;
    if (errandCooldown > 0) errandCooldown -= 1;

    // ---- dead: on its side where it fell
    if (!input.alive) {
      const c = bounds.clamp(x, bounds.floorY, halfW, halfH);
      x = c.x;
      y = c.y;
      eatTicks = 0;
      stopErrand();
      return { x, y, facing, turning: false, anim: 'dead', biteFlakeIndex: null };
    }

    const prevX = x;
    let anim: PetAnim = 'idle';
    let bite: number | null = null;
    let nx = x;
    let lockFacing = false;
    let act: PetAct | undefined;

    if (input.flakes.length > 0) {
      // ---- feed on the floor outranks everything
      stopErrand();
      const reach = (f: { x: number; y: number }): number => Math.max(0, Math.abs(f.x - x) - halfW);
      let best = 0;
      let bestD = Infinity;
      input.flakes.forEach((f, i) => {
        const d = reach(f);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      const food = input.flakes[best];
      if (food !== undefined) {
        if (bestD <= BITE_RANGE) {
          bite = best;
          eatTicks = EAT_TICKS;
        } else {
          speed = ramp(speed, Math.max(walkSpeed(input.label), gait.walk * 0.8));
          nx = moveTowardX(x, food.x, speed);
        }
      }
      anim = fedEnough ? 'idle' : 'hungry';
    } else if (input.asleep || drives.nap) {
      // ---- night, or worn out: to bed (the warm spot, the doorway), then down
      stopErrand();
      startle = null;
      greetTo = null;
      const bedX = siteX(sites[BED[stage]] ?? bounds.rect);
      const atBed = Math.abs(x - bedX) <= ARRIVE_EPS;
      speed = atBed ? 0 : ramp(speed, Math.max(BED_WALK_SPEED, pace(input.label)));
      nx = atBed ? x : moveTowardX(x, bedX, speed);
      if (atBed || Math.abs(nx - bedX) <= ARRIVE_EPS) {
        anim = 'sleep';
        lockFacing = true;
        // the hen is home: the renderer warms the doorway behind her
        if (stage === 'hen') act = 'roost';
      }
    } else if (input.label === 'starving') {
      // ---- starving: feathers ruffled, does not travel
      stopErrand();
      anim = 'hungry';
      lockFacing = true;
    } else if (input.label === 'hungry') {
      // ---- hungry: stands at the empty feeder
      stopErrand();
      const feeder = siteX(sites['feeder'] ?? bounds.rect);
      nx = moveTowardX(x, feeder, walkSpeed(input.label));
      anim = 'hungry';
      if (Math.abs(nx - feeder) <= ARRIVE_EPS) lockFacing = true;
    } else if (input.tap || startle !== null) {
      // ---- a tap on the box: a flustered dash away from it
      stopErrand();
      greetTo = null;
      if (input.tap && startle === null) startle = { dir: x >= input.tap.x ? 1 : -1, tick: 0 };
      if (startle !== null) {
        const burst = dartSpeed(startle.tick, gait.startle, STARTLE_TICKS);
        startle.tick += 1;
        speed = burst;
        nx = moveTowardX(x, x + startle.dir * 80, burst);
        if (startle.tick > STARTLE_TICKS * 1.5) {
          startle = null;
          pauseTicks = PAUSE_MAX_TICKS;
        }
      }
    } else if (greetTo !== null) {
      // ---- a greeting: a run to where you are
      stopErrand();
      speed = ramp(speed, gait.greet * pers.pace);
      nx = moveTowardX(x, greetTo, speed);
      if (Math.abs(nx - greetTo) <= ARRIVE_EPS) {
        greetTo = null;
        pauseTicks = PAUSE_MIN_TICKS;
      }
    } else if (bug !== null) {
      // ---- a bug: it runs, she runs after it, and mostly she gets it
      bug.ticks += 1;
      const lo = bounds.rect.x + 4;
      const hi = bounds.rect.x + bounds.rect.w - 4;
      if (rng() >= BUG_FREEZE) {
        const bx = bug.x + bug.dir * BUG_SPEED;
        // cornered at the wall: it doubles back past her
        if (bx <= lo || bx >= hi) bug.dir = bug.dir === 1 ? -1 : 1;
        bug.x = Math.max(lo, Math.min(hi, bx));
      }
      speed = ramp(speed, CHASE_SPEED * pers.pace);
      nx = moveTowardX(x, bug.x, speed);
      act = 'chase';
      if (Math.abs(bug.x - nx) - halfW <= BUG_CATCH) {
        // got it: head down
        eatTicks = EAT_TICKS;
        stopErrand();
        act = undefined;
      } else if (bug.ticks >= BUG_ESCAPE_TICKS) {
        // under the fence and away; she stops and looks at where it went
        stopErrand();
        pauseTicks = PAUSE_MAX_TICKS;
        act = undefined;
      }
    } else if (errand !== null) {
      // ---- on an errand: walking to it, then doing it for a while
      const target = errand.site === null ? x : siteX(sites[errand.site] ?? bounds.rect);
      if (errandTicks > 0) {
        errandTicks -= 1;
        nx = target;
        anim = errand.anim;
        act = errand.act;
        lockFacing = true;
        if (errandTicks === 0) stopErrand();
      } else {
        speed = ramp(speed, pace(input.label));
        nx = moveTowardX(x, target, speed);
        if (Math.abs(nx - target) <= ARRIVE_EPS) {
          errandTicks = errand.minTicks + Math.floor(rng() * (errand.maxTicks - errand.minTicks));
        }
      }
    } else {
      // ---- content: potter about, stop and look, and now and then go and do something
      if (drives.greet && !greeted && attract) {
        greeted = true;
        greetTo = attract.x;
      }
      if (!drives.greet) greeted = false;
      const urgeOf = (e: Errand): number =>
        e.urge * (e.lazy ? 1.6 - drives.activity : 0.5 + drives.activity) * (cheering && !e.lazy ? 1.5 : 1) * (hide > 0.3 ? 0 : 1);
      const free = errandCooldown === 0 && greetTo === null;
      const wanted = free ? (errands.find((e) => rng() < urgeOf(e)) ?? null) : null;
      if (wanted) {
        errand = wanted;
        errandTicks = 0;
        // one that happens on the spot starts at once
        if (wanted.site === null) errandTicks = wanted.minTicks + Math.floor(rng() * (wanted.maxTicks - wanted.minTicks));
      } else if (stage === 'hen' && free && hide <= 0.3 && rng() < BUG_URGE * (0.5 + drives.activity) * (cheering ? 2 : 1)) {
        const dir: 1 | -1 = rng() < 0.5 ? -1 : 1;
        const ahead = BUG_AHEAD_MIN + rng() * (BUG_AHEAD_MAX - BUG_AHEAD_MIN);
        const lo = bounds.rect.x + 4;
        const hi = bounds.rect.x + bounds.rect.w - 4;
        const bx = x + dir * (halfW + ahead);
        // if that side has no room, it turns up on the other
        const at = bx < lo || bx > hi ? x - dir * (halfW + ahead) : bx;
        bug = { x: Math.max(lo, Math.min(hi, at)), dir: at >= x ? 1 : -1, ticks: 0 };
      } else {
        wanderTicks += 1;
        if (wanderTicks >= WANDER_EVERY || Math.abs(x - wanderTo) <= ARRIVE_EPS) {
          wanderTicks = 0;
          wanderTo = bounds.rect.x + rng() * bounds.rect.w;
          tripScale = 0.75 + rng() * 0.45;
          if (hide > 0.3) {
            const bed = siteX(sites[BED[stage]] ?? bounds.rect);
            wanderTo = bed + (wanderTo - bed) * (1 - 0.8 * Math.min(1, hide));
          } else if (attract) {
            const k = Math.min(1, attract.strength * drives.approach) * ATTRACT_MAX;
            wanderTo += (attract.x - wanderTo) * k;
          }
        }
        if (pauseTicks > 0) {
          pauseTicks -= 1;
        } else if (rng() < PAUSE_CHANCE * (1.4 - drives.activity) * pers.hang) {
          pauseTicks = PAUSE_MIN_TICKS + Math.floor(rng() * (PAUSE_MAX_TICKS - PAUSE_MIN_TICKS));
        }
        const want = pauseTicks > 0 ? 0 : pace(input.label) * tripScale;
        speed = ramp(speed, want);
        nx = moveTowardX(x, wanderTo, speed);
      }
    }

    if (nx === x) speed = ramp(speed, 0);

    // Clamp LAST, always, exactly once (see the hamster's).
    const c = bounds.clamp(nx, bounds.floorY, halfW, halfH);
    x = c.x;
    y = c.y;

    const vx = x - prevX;
    let turning = false;
    if (!lockFacing && turnCooldown === 0 && Math.abs(vx) >= TURN_THRESHOLD) {
      const want: 1 | -1 = vx > 0 ? 1 : -1;
      if (want !== facing) {
        facing = want;
        turning = true;
        turnCooldown = TURN_COOLDOWN;
      }
    }

    // `walk` from the movement that actually happened, after the clamp. A bird doing something on the
    // spot (scratching, bathing) is not walking even if the clamp nudged it.
    if (anim === 'idle' && act === undefined && Math.abs(x - prevX) >= WALK_THRESHOLD) anim = 'walk';
    if (act === 'chase' && Math.abs(x - prevX) >= WALK_THRESHOLD) anim = 'walk';
    if (eatTicks > 0) anim = 'eat';

    const out: PetOutput = { x, y, facing, turning, anim, biteFlakeIndex: bite };
    if (sulking && anim !== 'sleep') out.act = 'sulk';
    if (act !== undefined) out.act = act;
    // the bug runs along the ground at her feet
    if (bug !== null) out.bug = { x: bug.x, y: y + halfH };
    return out;
  };

  return { step, reset };
}
