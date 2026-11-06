// Hamster behavior state machine. Pure: no Pixi, no DOM. One step() = one 8 fps tick.
// Blueprint §8: "wander on bedding, run wheel (wheel spins; RPM scales with hunger fullness, 0 when
// hungry), drink from bottle, stuff cheeks at hopper, nap in a bedding pile." The bottle and the cheek
// stuffing are not built yet; everything else here is.
//
// The shape of this file deliberately mirrors `species/fish/behavior.ts` — same guard order, same
// clamp-last discipline, same continuous positions — because the two are the only implementations of
// one contract and a reader who knows the fish should not have to relearn anything to read the hamster.
//
// The difference that matters: a fish moves through a volume and picks targets by computing them; a
// hamster moves along a line and picks targets by NAME. Almost every branch below resolves to "walk to
// this site, then do the thing that happens there".

import type { MoveBounds, PetAct, PetAnim, PetBehavior, PetInput, PetOutput } from '../../render/types';
import type { HungerLabel, Personality } from '../../sim/types';
import type { Drives } from '../../sim/needs';
import { dartSpeed } from '../../sim/motion';
import type { Sites } from '../types';
import { CAGE_SITES, siteX } from './layout';

/** Ticks the eat animation is held after a bite. */
const EAT_TICKS = 4;
/** Minimum ticks between two facing changes. */
const TURN_COOLDOWN = 5;
/** Horizontal velocity (px/tick) needed before the hamster commits to a new facing. */
const TURN_THRESHOLD = 0.3;
/** Food within this many px of the body box is eaten. */
const BITE_RANGE = 10;
/** Close enough to a site to count as arrived, in px. */
const ARRIVE_EPS = 2;

/**
 * The things a content hamster goes and does.
 *
 * Every one is "walk to a named place, stay a while, then potter off again" -- which the wheel already
 * was, spread across three branches and four pieces of state. Making it a table means the two §8
 * behaviours this species was missing are DATA rather than two more branches, and that adding the
 * terrarium's upgrades later is an entry rather than a rewrite.
 *
 * `available` is what stops a hamster miming at an empty hopper or running on an empty stomach.
 */
interface Errand {
  /** Where it happens; null means right where the hamster stands (a groom). */
  readonly site: string | null;
  readonly minTicks: number;
  readonly maxTicks: number;
  /** Chance per tick of choosing this one while idle. */
  readonly urge: number;
  readonly anim: PetAnim;
  available(input: PetInput): boolean;
}

const ERRANDS: readonly Errand[] = [
  {
    site: 'wheel',
    minTicks: 48,
    maxTicks: 160,
    urge: 0.012,
    // No art for running; the wheel spinning behind it is what reads as motion.
    anim: 'idle',
    // Redundant with the branch order above -- the `hungry` branch outranks errands, and `hungry` is
    // exactly the band where `wheelRate` is zero -- so no test can distinguish it. Kept anyway,
    // because the two would come apart the moment the label and the number are allowed to disagree,
    // which the dev panel can already do.
    available: (i) => wheelRate(i.hunger) > 0,
  },
  {
    site: 'bottle',
    minTicks: 16,
    maxTicks: 34,
    urge: 0.006,
    // Reuses `eat`: it is the one-shot head-down animation, and re-issuing it each tick loops it.
    // Inventing a `drink` state would mean a new PetAnim member, a new manifest entry and a new
    // fallback sequence, with no art behind any of them.
    anim: 'eat',
    available: () => true,
  },
  {
    site: 'hopper',
    minTicks: 20,
    maxTicks: 44,
    urge: 0.008,
    anim: 'eat',
    // Cosmetic only. The hopper IS the pantry (the holiday feeder), and the sim alone takes food from
    // it, one meal per auto-feed; a hamster that actually consumed seed while miming would empty the
    // feeder behind the sim's back. It mimes.
    available: (i) => i.pantryFraction > 0,
  },
  {
    // A groom, wherever it happens to be standing: the same head-down one-shot as a drink, held a
    // little longer. It is what a hamster does between everything else, and it is the one errand
    // that needs no site, which is why `site` became nullable.
    site: null,
    minTicks: 12,
    maxTicks: 28,
    urge: 0.004,
    anim: 'eat',
    available: () => true,
  },
];

/** With no needs model wired: a rested, settled hamster. */
const DEFAULT_DRIVES: Drives = { activity: 0.65, approach: 1, hide: 0, nap: false, greet: false, surface: 0 };

/** Pace and restlessness per personality; the rest of a personality's effect on motion comes through the drives. */
const PACE: Readonly<Record<Personality, { pace: number; hang: number }>> = {
  zen: { pace: 0.85, hang: 1.3 },
  sarcastic: { pace: 1.0, hang: 1.0 },
  anxious: { pace: 1.1, hang: 0.8 },
  hyper: { pace: 1.2, hang: 0.5 },
};

/** How far toward something interesting a wander target can be pulled, at full strength. */
const ATTRACT_MAX = 0.55;
/** A startle: peak speed and the ticks it takes to bleed. */
const STARTLE_PEAK = 4.5;
const STARTLE_TICKS = 8;
/** A greeting dash's speed. */
const GREET_SPEED = 3.6;

/** Making its bed before it sleeps: two seconds of digging. */
export const DIG_TICKS = 16;

/** Ticks the hamster potters after any errand before it may want another. */
const ERRAND_COOLDOWN = 40;

/**
 * Your team won (drives.cheer): a victory sprint on the wheel about this often, in ticks (25 s, as the
 * fish's excited lap), on top of wanting the wheel more and running it harder in between.
 */
const CHEER_SPRINT_TICKS = 200;
/** How much more a cheering hamster wants the wheel, and how much harder it runs it. */
const CHEER_WHEEL_URGE = 3;
const CHEER_WHEEL_PACE = 1.5;
/** Your team lost (drives.cheer < 0): it keeps to its house, like a hiding animal, and walks slower. */
const SULK_HIDE = 0.8;
const SULK_PACE = 0.7;

/**
 * Distance covered per tick at a full belly, in kilometres.
 *
 * Sized against a real animal rather than picked to look busy: 0.0002 km/tick at 8 ticks/s is about
 * 5.8 km/h, which is a plausible hamster sprint, and a night of intermittent running lands in the low
 * single-digit kilometres — the range a real hamster actually covers. `speciesData.wheelKm` is meant
 * to be a number someone could one day put on a leaderboard, so a fantasy rate would be worse than none.
 */
export const WHEEL_KM_PER_TICK = 0.0002;

/** Ticks between re-rolls of the wander target while pottering on the bedding. */
const WANDER_EVERY = 24;

/**
 * How fast the hamster may change speed, in px per tick per tick.
 *
 * Without this the animal is a conveyor: `walkSpeed` is a constant per hunger band, applied in full on
 * the first tick of a trip and dropped to nothing on the last. Ramping in and out is most of what
 * separates something that walks from something that is being slid.
 */
const ACCEL = 0.45;

/** Below this much movement in a tick, the hamster counts as standing still rather than walking. */
const WALK_THRESHOLD = 0.12;

/** How often a pottering hamster stops to sniff about, and for how long. */
const PAUSE_CHANCE = 0.035;
const PAUSE_MIN_TICKS = 6;
const PAUSE_MAX_TICKS = 22;

function walkSpeed(label: HungerLabel): number {
  switch (label) {
    case 'starving':
      return 0.3;
    case 'hungry':
      return 1.4;
    default:
      return 2.2;
  }
}

/**
 * Wheel RPM as a fraction of full, from hunger.
 *
 * §8 says the RPM scales with fullness and is zero when hungry, so this is a ramp that reaches zero at
 * the hungry boundary rather than at zero hunger: a hamster that is merely peckish still runs, just
 * less. The caller refuses to start a session at all once the label is hungry, so this only ever
 * shapes the speed of a run that was already allowed.
 */
export function wheelRate(hunger: number): number {
  const h = Math.max(0, Math.min(100, hunger));
  if (h <= 30) return 0;
  return (h - 30) / 70;
}

function moveTowardX(x: number, tx: number, maxStep: number): number {
  const dx = tx - x;
  if (Math.abs(dx) <= maxStep) return tx;
  return x + Math.sign(dx) * maxStep;
}

/** Ease `current` toward `target` by at most ACCEL. */
function ramp(current: number, target: number): number {
  const d = target - current;
  if (Math.abs(d) <= ACCEL) return target;
  return current + Math.sign(d) * ACCEL;
}

/**
 * `sites` is where this habitat put the wheel, the house (`bed`), the hopper and the bottle; the
 * cage's by default, which is what every test was written against. The terrarium passes its own.
 */
export function createHamsterBehavior(sites: Sites = CAGE_SITES): PetBehavior {
  let inited = false;
  /** Current ground speed, px/tick. Ramped toward what the branch wants rather than set outright. */
  let speed = 0;
  /** Ticks left of a deliberate stop. */
  let pauseTicks = 0;
  /** Per-trip speed scale, so two walks across the same bedding are not identical. */
  let tripScale = 1;
  let x = 0;
  let y = 0;
  let facing: 1 | -1 = 1;
  let eatTicks = 0;
  let turnCooldown = 0;
  /** The errand in progress, whether walking to it (`ticks === 0`) or doing it. */
  let errand: Errand | null = null;
  let errandTicks = 0;
  let errandCooldown = 0;
  let wanderTo = 0;
  let wanderTicks = 0;
  /** A startle in progress: which way it runs and how many ticks it has been running. */
  let startle: { dir: 1 | -1; tick: number } | null = null;
  /** A greeting dash in progress, toward this x. */
  let greetTo: number | null = null;
  let greeted = false;
  /** Ticks of cheering since the last victory sprint. */
  let cheerTicks = 0;
  /** Making its bed: ticks of digging left, and whether this sleep has had its dig yet. */
  let digTicks = 0;
  let dugThisSleep = false;

  const reset = (): void => {
    inited = false;
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
    speed = 0;
    pauseTicks = 0;
    tripScale = 1;
    startle = null;
    greetTo = null;
    greeted = false;
    cheerTicks = 0;
    digTicks = 0;
    dugThisSleep = false;
  };

  const init = (bounds: MoveBounds, halfW: number, halfH: number): void => {
    const c = bounds.clamp(bounds.rect.x + bounds.rect.w / 2, bounds.floorY, halfW, halfH);
    x = c.x;
    y = c.y;
    wanderTo = x;
    inited = true;
  };

  /** Abandon whatever it was doing and serve the cooldown. Called by every branch that outranks one. */
  const stopErrand = (): void => {
    errand = null;
    errandTicks = 0;
    errandCooldown = ERRAND_COOLDOWN;
  };

  const step = (input: PetInput): PetOutput => {
    const { bounds, body, rng } = input;
    const halfW = body.w / 2;
    const halfH = body.h / 2;
    if (!inited) init(bounds, halfW, halfH);
    const drives = input.drives ?? DEFAULT_DRIVES;
    const pers = PACE[input.personality ?? 'zen'];
    const attract = input.attract && input.attract.strength > 0 ? input.attract : null;
    // Your team's result (drives.cheer): a win puts it on the wheel, a loss puts it in its house.
    const cheer = Math.max(-1, Math.min(1, drives.cheer ?? 0));
    const fedEnough = input.label !== 'hungry' && input.label !== 'starving';
    const sulking = cheer < -0.5 && fedEnough;
    const cheering = cheer > 0.5 && fedEnough;
    /** How much it keeps to the house: what the needs model asks, or a sulk, whichever is more. */
    const hide = Math.max(drives.hide, sulking ? SULK_HIDE : 0);
    /** The pace this hamster walks at right now: hunger, how rested it is, who it is, and its mood. */
    const pace = (label: HungerLabel): number =>
      walkSpeed(label) * (0.55 + 0.6 * drives.activity) * pers.pace * (sulking ? SULK_PACE : 1);
    if (cheering) cheerTicks += 1;
    else cheerTicks = 0;
    if (!input.asleep && !drives.nap) {
      dugThisSleep = false;
      digTicks = 0;
    }
    if (turnCooldown > 0) turnCooldown -= 1;
    if (eatTicks > 0) eatTicks -= 1;
    if (errandCooldown > 0) errandCooldown -= 1;

    // ---- dead: on its side where it fell, nothing else moves
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
    let ranThisTick = 0;
    let act: PetAct | undefined;

    if (input.flakes.length > 0) {
      // ---- food on the bedding outranks everything, including the wheel
      // Measured from the body BOX rather than its centre, for the same reason the fish does it: a
      // hamster picks food up with its face, which is on its outline, and measuring from the centre
      // would add half a body to every reach.
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
          nx = moveTowardX(x, food.x, walkSpeed(input.label));
        }
      }
      anim = input.label === 'hungry' || input.label === 'starving' ? 'hungry' : 'idle';
    } else if (input.asleep || drives.nap) {
      // ---- asleep at night, or napping in daylight when worn out: the bedding pile
      stopErrand();
      startle = null;
      greetTo = null;
      const bedX = siteX(sites.bed ?? bounds.rect);
      nx = moveTowardX(x, bedX, 1.2);
      anim = 'sleep';
      lockFacing = true;
      // Making its bed: arriving at the bed, it digs the bedding over for a couple of seconds before it
      // settles (head down, the bedding flying -- the renderer reads the act). Once per sleep.
      if (!dugThisSleep && Math.abs(nx - bedX) <= ARRIVE_EPS) {
        dugThisSleep = true;
        digTicks = DIG_TICKS;
      }
      if (digTicks > 0) {
        digTicks -= 1;
        anim = 'eat';
        act = 'dig';
      }
    } else if (input.label === 'starving') {
      // ---- starving: lies flat, does not travel
      stopErrand();
      anim = 'hungry';
      lockFacing = true;
    } else if (input.label === 'hungry') {
      // ---- hungry: the wheel stops and it sits by the hopper facing out
      stopErrand();
      const hopper = siteX(sites.hopper ?? bounds.rect);
      nx = moveTowardX(x, hopper, walkSpeed(input.label));
      anim = 'hungry';
      // Facing the camera is not expressible in a left/right facing, so the sprite's `hungry` state
      // carries the front-on pose and the facing is simply held rather than flipped at the hopper.
      if (Math.abs(nx - hopper) <= ARRIVE_EPS) lockFacing = true;
    } else if (input.tap || startle !== null) {
      // ---- a tap on the glass: a startled run away from it, then a stop to collect itself
      stopErrand();
      greetTo = null;
      if (input.tap && startle === null) startle = { dir: x >= input.tap.x ? 1 : -1, tick: 0 };
      if (startle !== null) {
        const burst = dartSpeed(startle.tick, STARTLE_PEAK, STARTLE_TICKS);
        startle.tick += 1;
        speed = burst;
        nx = moveTowardX(x, x + startle.dir * 80, burst);
        if (startle.tick > STARTLE_TICKS * 1.5) {
          startle = null;
          pauseTicks = PAUSE_MAX_TICKS;
        }
      }
    } else if (greetTo !== null) {
      // ---- a greeting: a dash to the bars where the pointer is
      stopErrand();
      speed = ramp(speed, GREET_SPEED * pers.pace);
      nx = moveTowardX(x, greetTo, speed);
      if (Math.abs(nx - greetTo) <= ARRIVE_EPS) {
        greetTo = null;
        pauseTicks = PAUSE_MIN_TICKS;
      }
    } else if (errand !== null) {
      // ---- on an errand: walking to it, then doing it for a while
      const target = errand.site === null ? x : siteX(sites[errand.site] ?? bounds.rect);
      if (!errand.available(input)) {
        // Checked every tick, not only on arrival: the hopper can empty and a belly can empty while
        // the hamster is halfway there, and standing at an empty hopper miming a mouthful is worse
        // than never having set off.
        stopErrand();
      } else if (errandTicks > 0) {
        errandTicks -= 1;
        nx = target;
        anim = errand.anim;
        lockFacing = true;
        if (errand.site === 'wheel') ranThisTick = WHEEL_KM_PER_TICK * wheelRate(input.hunger) * (cheering ? CHEER_WHEEL_PACE : 1);
        if (errand.site === 'bottle') act = 'drink';
        if (errandTicks === 0) stopErrand();
      } else {
        speed = ramp(speed, pace(input.label));
        nx = moveTowardX(x, target, speed);
        if (Math.abs(nx - target) <= ARRIVE_EPS) {
          errandTicks = errand.minTicks + Math.floor(rng() * (errand.maxTicks - errand.minTicks));
        }
      }
    } else {
      // ---- content: potter about on the bedding, and now and then go and do something
      if (drives.greet && !greeted && attract) {
        greeted = true;
        greetTo = attract.x;
      }
      if (!drives.greet) greeted = false;
      // Errands come more often to a lively animal; the hopper calls louder the more it wants the
      // surface-equivalent (a peckish hamster checks its food), and a hiding one does nothing but hide.
      const urgeOf = (e: Errand): number =>
        e.urge *
        (0.5 + drives.activity) *
        (e.site === 'hopper' ? 1 + 2 * drives.surface : 1) *
        (e.site === 'wheel' && cheering ? CHEER_WHEEL_URGE : 1) *
        (hide > 0.3 ? 0 : 1);
      // A victory sprint: every so often a cheering hamster goes straight to the wheel, cooldown or not.
      const sprint = cheering && cheerTicks >= CHEER_SPRINT_TICKS && greetTo === null ? (ERRANDS.find((e) => e.site === 'wheel' && e.available(input)) ?? null) : null;
      if (sprint) cheerTicks = 0;
      const wanted =
        sprint ??
        (errandCooldown === 0 && greetTo === null
          ? (ERRANDS.find((e) => e.available(input) && rng() < urgeOf(e)) ?? null)
          : null);
      if (wanted) {
        errand = wanted;
        errandTicks = 0;
      } else {
        wanderTicks += 1;
        if (wanderTicks >= WANDER_EVERY || Math.abs(x - wanderTo) <= ARRIVE_EPS) {
          wanderTicks = 0;
          // A target anywhere on the walkable span. The clamp decides what is actually reachable, so
          // this may aim past the wall and simply arrive at it.
          wanderTo = bounds.rect.x + rng() * bounds.rect.w;
          // Re-rolled per trip, so successive crossings of the same bedding are not identical.
          tripScale = 0.75 + rng() * 0.45;
          // A hiding hamster keeps to the bedding pile; a curious one bends its wander toward the
          // pointer at the bars, never straight to it.
          if (hide > 0.3) {
            const bed = siteX(sites.bed ?? bounds.rect);
            wanderTo = bed + (wanderTo - bed) * (1 - 0.8 * Math.min(1, hide));
          } else if (attract) {
            const k = Math.min(1, attract.strength * drives.approach) * ATTRACT_MAX;
            wanderTo += (attract.x - wanderTo) * k;
          }
        }
        // Stopping to sniff. A hamster that walks without ever pausing reads as machinery however
        // good the walk cycle is -- and these are also the only moments the mood poses can surface,
        // now that moving has a state of its own.
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

    // Clamp LAST, always, exactly once. Every branch above proposes a position and this is the only
    // thing that decides whether it is legal -- which is what makes "the body box never leaves the
    // walkable span" a property of the file rather than of remembering it in nine places.
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

    // `walk` is derived from the movement that ACTUALLY happened, once, after the clamp -- not set in
    // each of the branches that move. Every branch proposes a position and the clamp decides it, so a
    // hamster walking into a wall proposes 2.2 px and travels none of it; asking the branches would
    // have it striding on the spot. This is also why `idle` now means genuinely stationary, which is
    // what lets the mood poses in scene.ts stop playing over a sliding pet.
    if (anim === 'idle' && Math.abs(x - prevX) >= WALK_THRESHOLD) anim = 'walk';

    if (eatTicks > 0) anim = 'eat';

    const out: PetOutput = { x, y, facing, turning, anim, biteFlakeIndex: bite };
    // The mood for the art: a sulking hamster droops like a sulking fish (scene.ts lowers its spirits).
    if (sulking && input.alive && anim !== 'sleep') out.act = 'sulk';
    if (act !== undefined) out.act = act;
    if (ranThisTick > 0) out.speciesDelta = { wheelKm: ranThisTick };
    return out;
  };

  return { step, reset };
}
