// Fish behavior state machine. Pure: no Pixi, no DOM. One step() = one 8 fps tick.
// Imports only shared types (render/types for the contract shapes, sim/types for HungerLabel).
//
// Every distance and speed below is in habitat grid px (320x240). Stage 1 doubled all of them with the
// grid so the fish covers the same fraction of the bowl per tick as it did at 160x120. Tick counts
// (EAT_TICKS, TURN_COOLDOWN, WOBBLE_EVERY, the drift timer) and WANDER_RATE (an angular rate) are not
// pixel quantities and did not change.

import type { FishBehavior, FishInput, FishOutput, PetAnim, WaterBounds } from '../../render/types';
import type { HungerLabel } from '../../sim/types';

/** Ticks the eat animation is reported after a bite (matches the 4-frame eat strip). */
const EAT_TICKS = 4;
/** Minimum ticks between two facing changes (stops dithering at the figure-eight extremes). */
const TURN_COOLDOWN = 6;
/** Horizontal velocity (px/tick) needed before the fish commits to a new facing. */
const TURN_THRESHOLD = 0.4;
/** A flake within this many px of the body center is eaten. */
const BITE_RANGE = 12;
/** Figure-eight phase advance per tick at full speed (period ~ 17.5 s). */
const WANDER_RATE = 0.045;
/** Ticks between wander wobble re-rolls. */
const WOBBLE_EVERY = 16;

function dartSpeed(label: HungerLabel): number {
  switch (label) {
    case 'starving':
      return 2;
    case 'hungry':
      return 4;
    default:
      return 6;
  }
}

function moveToward(x: number, y: number, tx: number, ty: number, maxStep: number): { x: number; y: number } {
  const dx = tx - x;
  const dy = ty - y;
  const d = Math.hypot(dx, dy);
  if (d <= maxStep || d === 0) return { x: tx, y: ty };
  const k = maxStep / d;
  return { x: x + dx * k, y: y + dy * k };
}

export function createFishBehavior(): FishBehavior {
  let inited = false;
  let x = 0;
  let y = 0;
  let facing: 1 | -1 = 1;
  let phase = 0;
  let eatTicks = 0;
  let turnCooldown = 0;
  let wobbleX = 0;
  let wobbleY = 0;
  let wobbleTicks = 0;
  let driftVx = 0.3;
  let driftTicks = 0;
  let tick = 0;

  const reset = (): void => {
    inited = false;
    x = 0;
    y = 0;
    facing = 1;
    phase = 0;
    eatTicks = 0;
    turnCooldown = 0;
    wobbleX = 0;
    wobbleY = 0;
    wobbleTicks = 0;
    driftVx = 0.3;
    driftTicks = 0;
    tick = 0;
  };

  const init = (bounds: WaterBounds, halfW: number, halfH: number): void => {
    const c = bounds.clamp(bounds.rect.x + bounds.rect.w / 2, (bounds.surfaceY + bounds.floorY) / 2, halfW, halfH);
    x = c.x;
    y = c.y;
    inited = true;
  };

  /** Figure-eight target inside a vertical band [yMin, yMax] of the water. */
  const wanderTarget = (
    bounds: WaterBounds,
    halfW: number,
    halfH: number,
    yMin: number,
    yMax: number,
    rng: () => number,
  ): { x: number; y: number } => {
    wobbleTicks += 1;
    if (wobbleTicks >= WOBBLE_EVERY) {
      wobbleTicks = 0;
      wobbleX = (rng() - 0.5) * 12;
      wobbleY = (rng() - 0.5) * 8;
    }
    const cx = bounds.rect.x + bounds.rect.w / 2;
    const cy = (yMin + yMax) / 2;
    const ampX = Math.max(8, (bounds.rect.w / 2 - halfW) * 0.7);
    const ampY = Math.max(4, ((yMax - yMin) / 2 - halfH) * 0.8);
    return {
      x: cx + ampX * Math.sin(phase) + wobbleX,
      y: cy + ampY * Math.sin(2 * phase) + wobbleY,
    };
  };

  const step = (input: FishInput): FishOutput => {
    const { bounds, body, rng } = input;
    const halfW = body.w / 2;
    const halfH = body.h / 2;
    if (!inited) init(bounds, halfW, halfH);
    tick += 1;
    if (turnCooldown > 0) turnCooldown -= 1;
    if (eatTicks > 0) eatTicks -= 1;

    // ---- dead: belly-up at the surface, nothing else moves
    if (!input.alive) {
      const c = bounds.clamp(x, bounds.surfaceY + 12, halfW, halfH);
      x = c.x;
      y = bounds.surfaceY + 12;
      eatTicks = 0;
      return { x: Math.round(x), y: Math.round(y), facing, turning: false, anim: 'dead', biteFlakeIndex: null };
    }

    const prevX = x;
    let anim: PetAnim = 'idle';
    let bite: number | null = null;
    let nx = x;
    let ny = y;
    let lockFacing = false;

    if (input.flakes.length > 0) {
      // ---- dart to the nearest flake (overrides hunger posture and sleep)
      let best = 0;
      let bestD = Infinity;
      input.flakes.forEach((f, i) => {
        const d = Math.hypot(f.x - x, f.y - y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      const flake = input.flakes[best];
      if (flake !== undefined) {
        if (bestD <= BITE_RANGE) {
          bite = best;
          eatTicks = EAT_TICKS;
        } else {
          const t = moveToward(x, y, flake.x, flake.y, dartSpeed(input.label));
          nx = t.x;
          ny = t.y;
        }
      }
      anim = input.label === 'hungry' || input.label === 'starving' ? 'hungry' : 'idle';
    } else if (input.asleep) {
      // ---- asleep: settle near the floor and hold still
      const ty = bounds.floorY - halfH - 2;
      const t = moveToward(x, y, x, ty, 2);
      ny = t.y;
      anim = 'sleep';
      lockFacing = true;
    } else if (input.label === 'starving') {
      // ---- starving: on the floor, barely drifting
      driftTicks += 1;
      if (driftTicks >= 40) {
        driftTicks = 0;
        driftVx = (rng() < 0.5 ? -1 : 1) * 0.3;
      }
      const ty = bounds.floorY - halfH - 4;
      const t = moveToward(x, y, x, ty, 1);
      ny = t.y;
      nx = x + driftVx;
      anim = 'hungry';
    } else if (input.label === 'hungry') {
      // ---- hungry: half speed, hangs in the top third
      phase += WANDER_RATE * 0.5;
      const yMin = bounds.surfaceY + halfH + 2;
      const yMax = bounds.surfaceY + (bounds.floorY - bounds.surfaceY) / 3;
      const target = wanderTarget(bounds, halfW, halfH, yMin, yMax, rng);
      const t = moveToward(x, y, target.x, target.y, 1.5);
      nx = t.x;
      ny = t.y;
      anim = 'hungry';
    } else {
      // ---- content: slow figure-eight through the whole bowl
      phase += WANDER_RATE;
      const yMin = bounds.surfaceY + halfH + 4;
      const yMax = bounds.floorY - halfH - 4;
      const target = wanderTarget(bounds, halfW, halfH, yMin, yMax, rng);
      const t = moveToward(x, y, target.x, target.y, 3);
      nx = t.x;
      ny = t.y;
      anim = 'idle';
    }

    // ---- facing / 2-tick turn: the turn tick holds position and is drawn at half width by the player
    let turning = false;
    const vx = nx - prevX;
    if (!lockFacing && turnCooldown === 0) {
      const want: 1 | -1 | 0 = vx > TURN_THRESHOLD ? 1 : vx < -TURN_THRESHOLD ? -1 : 0;
      if (want !== 0 && want !== facing) {
        facing = want;
        turning = true;
        turnCooldown = TURN_COOLDOWN;
        nx = x;
        ny = y;
      }
    }

    const c = bounds.clamp(nx, ny, halfW, halfH);
    // Keep sub-pixel state for smooth-but-stepped motion while clamping to the water.
    x = Math.abs(c.x - nx) > 2 ? c.x : nx;
    y = Math.abs(c.y - ny) > 2 ? c.y : ny;
    const out = bounds.clamp(Math.round(x), Math.round(y), halfW, halfH);

    if (eatTicks > 0) anim = 'eat';
    return { x: out.x, y: out.y, facing, turning, anim, biteFlakeIndex: bite };
  };

  return { step, reset };
}
