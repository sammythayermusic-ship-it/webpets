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

import type { MoveBounds, PetAnim, PetBehavior, PetInput, PetOutput } from '../../render/types';
import type { HungerLabel } from '../../sim/types';
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

/** Ticks a wheel session lasts, before and after which the hamster potters about. */
const WHEEL_MIN_TICKS = 48;
const WHEEL_MAX_TICKS = 160;
/** Chance per tick of deciding to go and use the wheel while content and idle. */
const WHEEL_URGE = 0.012;
/** Ticks the hamster must potter after a wheel session before it may want another. */
const WHEEL_COOLDOWN = 40;

/**
 * Distance covered per tick at a full belly, in kilometres.
 *
 * Sized against a real animal rather than picked to look busy: 0.0002 km/tick at 8 ticks/s is about
 * 5.8 km/h, which is a plausible hamster sprint, and a night of intermittent running lands in the low
 * single-digit kilometres — the range a real hamster actually covers. `speciesData.wheelKm` is meant
 * to be a number someone could one day put on a leaderboard, so a fantasy rate would be worse than none.
 */
const WHEEL_KM_PER_TICK = 0.0002;

/** Ticks between re-rolls of the wander target while pottering on the bedding. */
const WANDER_EVERY = 24;

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

export function createHamsterBehavior(): PetBehavior {
  let inited = false;
  let x = 0;
  let y = 0;
  let facing: 1 | -1 = 1;
  let eatTicks = 0;
  let turnCooldown = 0;
  let wheelTicks = 0;
  let wheelCooldown = 0;
  let headingToWheel = false;
  let wanderTo = 0;
  let wanderTicks = 0;

  const reset = (): void => {
    inited = false;
    x = 0;
    y = 0;
    facing = 1;
    eatTicks = 0;
    turnCooldown = 0;
    wheelTicks = 0;
    wheelCooldown = 0;
    headingToWheel = false;
    wanderTo = 0;
    wanderTicks = 0;
  };

  const init = (bounds: MoveBounds, halfW: number, halfH: number): void => {
    const c = bounds.clamp(bounds.rect.x + bounds.rect.w / 2, bounds.floorY, halfW, halfH);
    x = c.x;
    y = c.y;
    wanderTo = x;
    inited = true;
  };

  /** Leave the wheel and serve the cooldown. Called from every branch that outranks running. */
  const stopWheel = (): void => {
    wheelTicks = 0;
    headingToWheel = false;
    wheelCooldown = WHEEL_COOLDOWN;
  };

  const step = (input: PetInput): PetOutput => {
    const { bounds, body, rng } = input;
    const halfW = body.w / 2;
    const halfH = body.h / 2;
    if (!inited) init(bounds, halfW, halfH);
    if (turnCooldown > 0) turnCooldown -= 1;
    if (eatTicks > 0) eatTicks -= 1;
    if (wheelCooldown > 0) wheelCooldown -= 1;

    // ---- dead: on its side where it fell, nothing else moves
    if (!input.alive) {
      const c = bounds.clamp(x, bounds.floorY, halfW, halfH);
      x = c.x;
      y = c.y;
      eatTicks = 0;
      stopWheel();
      return { x, y, facing, turning: false, anim: 'dead', biteFlakeIndex: null };
    }

    const prevX = x;
    let anim: PetAnim = 'idle';
    let bite: number | null = null;
    let nx = x;
    let lockFacing = false;
    let ranThisTick = 0;

    if (input.flakes.length > 0) {
      // ---- food on the bedding outranks everything, including the wheel
      // Measured from the body BOX rather than its centre, for the same reason the fish does it: a
      // hamster picks food up with its face, which is on its outline, and measuring from the centre
      // would add half a body to every reach.
      stopWheel();
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
    } else if (input.asleep) {
      // ---- asleep: nap in the bedding pile
      stopWheel();
      nx = moveTowardX(x, siteX(CAGE_SITES.bed ?? bounds.rect), 1.2);
      anim = 'sleep';
      lockFacing = true;
    } else if (input.label === 'starving') {
      // ---- starving: lies flat, does not travel
      stopWheel();
      anim = 'hungry';
      lockFacing = true;
    } else if (input.label === 'hungry') {
      // ---- hungry: the wheel stops and it sits by the hopper facing out
      stopWheel();
      const hopper = siteX(CAGE_SITES.hopper ?? bounds.rect);
      nx = moveTowardX(x, hopper, walkSpeed(input.label));
      anim = 'hungry';
      // Facing the camera is not expressible in a left/right facing, so the sprite's `hungry` state
      // carries the front-on pose and the facing is simply held rather than flipped at the hopper.
      if (Math.abs(nx - hopper) <= ARRIVE_EPS) lockFacing = true;
    } else if (wheelTicks > 0) {
      // ---- running: pinned at the wheel, earning distance
      const rate = wheelRate(input.hunger);
      if (rate <= 0) {
        stopWheel();
      } else {
        wheelTicks -= 1;
        nx = siteX(CAGE_SITES.wheel ?? bounds.rect);
        ranThisTick = WHEEL_KM_PER_TICK * rate;
        anim = 'idle';
        lockFacing = true;
        if (wheelTicks === 0) wheelCooldown = WHEEL_COOLDOWN;
      }
    } else if (headingToWheel) {
      // ---- walking over to the wheel
      const wx = siteX(CAGE_SITES.wheel ?? bounds.rect);
      nx = moveTowardX(x, wx, walkSpeed(input.label));
      if (Math.abs(nx - wx) <= ARRIVE_EPS) {
        headingToWheel = false;
        wheelTicks = WHEEL_MIN_TICKS + Math.floor(rng() * (WHEEL_MAX_TICKS - WHEEL_MIN_TICKS));
      }
    } else {
      // ---- content: potter about on the bedding, and now and then go and run
      if (wheelCooldown === 0 && wheelRate(input.hunger) > 0 && rng() < WHEEL_URGE) {
        headingToWheel = true;
      } else {
        wanderTicks += 1;
        if (wanderTicks >= WANDER_EVERY || Math.abs(x - wanderTo) <= ARRIVE_EPS) {
          wanderTicks = 0;
          // A target anywhere on the walkable span. The clamp decides what is actually reachable, so
          // this may aim past the wall and simply arrive at it.
          wanderTo = bounds.rect.x + rng() * bounds.rect.w;
        }
        nx = moveTowardX(x, wanderTo, walkSpeed(input.label));
      }
    }

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

    if (eatTicks > 0) anim = 'eat';

    const out: PetOutput = { x, y, facing, turning, anim, biteFlakeIndex: bite };
    if (ranThisTick > 0) out.speciesDelta = { wheelKm: ranThisTick };
    return out;
  };

  return { step, reset };
}
