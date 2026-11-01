// Flakes: entities the fish eats. Spawned at the surface on feed(), sinking with drift at 8 fps steps,
// removed on bite; leftovers settle on the gravel and dissolve after a while.
//
// In water a feed is a PINCH (2026-10-31, Sammy: "more interactive and exciting"): dropped where you
// click, or above the fish, the flakes float for a moment and spread, then tumble slowly down, each
// its own colour. That gives the fish a few seconds of chasing near the surface instead of a shower
// that is on the gravel before it has turned round.
//
// Sizes, offsets and speeds are in habitat grid px (320x240). The flake used to be a hand-authored 2x2
// pattern nearest-upscaled to 4x4, which against smooth art read as a hard brown square; it is now a
// soft crumb generated at FX_SS times the grid, like the bubbles and the sheen. Step counts are not
// pixel quantities and did not change.

import { Container, Sprite, type Texture } from 'pixi.js';
import { FX_SS, paintTexture, smoothstep } from './fx';
import type { Rng } from '../sim/types';
import type { Domain, MoveBounds } from './types';

export const FLAKES_PER_FEED = 6;
/** Flake spawn spread, as a fraction of the water's half-width at the spawn row. */
const SPAWN_SPREAD = 0.45;
/** How far above the standing line food is released in a floor habitat, so it visibly drops. */
const FLOOR_DROP_HEIGHT = 28;
/**
 * How far BELOW the standing line food comes to rest on a floor.
 *
 * The standing line is the pet's CENTRE, not its feet, so resting food exactly on it would leave a
 * seed floating at the animal's waist. This puts it under the drawn body — which also keeps it clear
 * of the pet sprite, since the `food` layer draws above `pet` (right for a flake in front of a fish,
 * wrong for a seed underfoot).
 *
 * 31 is measured: the hamster's feet project that far below `RIG_ham_root` through `CAM_cage`. It is a
 * fact about the only floor species there is, so it lives here for now — a second floor species with a
 * different build would have to move it onto `SpeciesLayout` beside the body box.
 */
export const FLOOR_REST_BELOW = 31;
/** Inset from each end of the walkable span, so food never lands somewhere the pet cannot stand. */
const FLOOR_SPAWN_INSET = 20;
/** A pinch's spread around where it was dropped, grid px. */
const PINCH_SPREAD = 7;
/** Steps a flake floats before it starts to sink: one to three seconds. */
const FLOAT_STEPS_MIN = 8;
const FLOAT_STEPS_MAX = 24;
/** Sinking speed, px per 8 fps step: slow enough to chase, not a shower. */
const SINK_MIN = 0.45;
const SINK_MAX = 0.8;
/** Flake food comes in colours; a pinch is a mix. Hex, as Pixi tints. */
export const FLAKE_COLOURS: readonly number[] = [0xff8a3d, 0xe8483a, 0x86c75a, 0xf4c24f, 0xd27a3c];
/** Settled flakes dissolve after this many 8 fps steps (30 s). */
const DISSOLVE_STEPS = 240;
/** Steps over which a settled flake fades out at the end of its life (2 s). */
const FADE_STEPS = 16;

interface Flake {
  /** Where this flake was at the start of the current step, so the draw can be interpolated. */
  px: number;
  py: number;
  sprite: Sprite;
  x: number;
  y: number;
  vy: number;
  vx: number;
  settled: boolean;
  age: number;
  /** Steps left floating at the surface before it sinks (water only). */
  float: number;
  /** Tumble: a phase for the sideways wobble, and a spin, radians per second. */
  phase: number;
  spin: number;
}

export interface Flakes {
  readonly container: Container;
  /** Drop FLAKES_PER_FEED flakes at the surface: as a pinch around `atX` (grid px) when given. */
  feed(rng: Rng, atX?: number): void;
  /** One 8 fps step. Returns the number of flakes that dissolved this step. */
  step(rng: Rng): number;
  /**
   * Draw the flakes `t` of the way through the current step, 0..1, and advance their fade by `dtMs`.
   * Called every rendered frame, like the pet — a flake hopping 8 times a second beside a smoothly
   * drawn fish is a side-by-side mismatch, during the one interaction anybody watches closely.
   */
  interpolate(t: number, dtMs: number): void;
  /** Integer grid px of every live flake, index-aligned with remove(). */
  positions(): Array<{ x: number; y: number }>;
  remove(index: number): void;
  count(): number;
  clear(): void;
  destroy(): void;
}

/** Flake size in grid px. */
const FLAKE_SIZE = 4;

function flakeTexture(water: boolean): Texture {
  // An irregular soft crumb rather than a disc: the lobes come from a cheap angular wobble of the
  // radius, which is enough to stop six identical flakes reading as six identical dots.
  return paintTexture(FLAKE_SIZE, FLAKE_SIZE, 'flake', (nx, ny) => {
    const d = Math.hypot(nx, ny);
    const wobble = 1 + 0.16 * Math.sin(Math.atan2(ny, nx) * 3);
    const a = 1 - smoothstep(0.52 * wobble, 0.95 * wobble, d);
    // Lit from the top-left, matching the habitat's key light, so a flake is not a flat blob.
    const lift = (1 - smoothstep(-0.6, 0.5, ny + nx * 0.4)) * 0.25;
    // Light and neutral in water, where each flake is tinted its own colour; seed-brown on a floor.
    return water ? [0.92 + lift * 0.3, 0.9 + lift * 0.3, 0.86 + lift * 0.4, a] : [0.87 + lift * 0.5, 0.63 + lift * 0.6, 0.28 + lift * 0.7, a];
  });
}

/**
 * Food entities for one habitat.
 *
 * Takes the DOMAIN rather than a water shape, because dropping food into a bowl and scattering it on
 * bedding are different physics and not different numbers. This took the `WaterShape` directly and so
 * only ever worked in water: given a cage it spawned seed 2 px BELOW the bedding line, clamped it 6 px
 * upward on the first step, settled it hovering 4 px above the animal's feet, froze its x forever
 * (the lateral-drift guard asks `bounds.inside`, which on a floor demands an exact row), and scattered
 * all six within 12 px of grid centre because the cage's flattened ellipse made the spread collapse.
 * It looked like it worked only because the hamster measures bite range horizontally.
 */
export function createFlakes(domain: Domain, bounds: MoveBounds): Flakes {
  const container = new Container({ label: 'flakes' });
  const water = domain.kind === 'water' ? domain.shape : null;
  const tex = flakeTexture(water !== null);
  const flakes: Flake[] = [];

  const halfWidthAt = (y: number): number => {
    if (!water) return 0;
    const dy = (y - water.cy) / water.ry;
    const t = 1 - dy * dy;
    return t <= 0 ? 0 : water.rx * Math.sqrt(t);
  };

  /** Where a new piece of food appears, and how fast it falls. */
  const spawnAt = (rng: Rng, atX?: number): { x: number; y: number; vy: number; vx: number } => {
    if (domain.kind === 'water') {
      const y = bounds.surfaceY + 2;
      if (atX !== undefined) {
        // A pinch: close together where it was dropped, drifting apart as it floats.
        const hw = Math.max(4, halfWidthAt(y + 4) - 4);
        const cx = Math.max(domain.shape.cx - hw, Math.min(domain.shape.cx + hw, atX));
        const off = (rng() * 2 - 1) * PINCH_SPREAD;
        const x = Math.max(domain.shape.cx - hw, Math.min(domain.shape.cx + hw, cx + off));
        return { x, y, vy: SINK_MIN + rng() * (SINK_MAX - SINK_MIN), vx: (off >= 0 ? 1 : -1) * (0.5 + rng() * 0.35) };
      }
      // A fraction of the surface half-width, not a fixed inset. The old `- 12` was tuned when the
      // spawn row was the narrow top of the glass; now that it is the real waterline, where the bowl
      // is near its widest, subtracting a constant scattered the flakes almost wall to wall.
      const hw = Math.max(12, halfWidthAt(y + 4) * SPAWN_SPREAD);
      return { x: domain.shape.cx + (rng() * 2 - 1) * hw, y, vy: SINK_MIN + rng() * (SINK_MAX - SINK_MIN), vx: (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.35) };
    }
    // On a floor: released above the standing line and scattered across the walkable span, so the pet
    // has somewhere to walk to. No lateral velocity -- seed does not blow about on bedding.
    const lo = domain.rect.x + FLOOR_SPAWN_INSET;
    const hi = domain.rect.x + domain.rect.w - FLOOR_SPAWN_INSET;
    return { x: lo + rng() * Math.max(0, hi - lo), y: domain.standY - FLOOR_DROP_HEIGHT, vy: 1 + rng(), vx: 0 };
  };

  /** The row food comes to rest on. */
  const restRow = domain.kind === 'water' ? bounds.floorY - 4 : domain.standY + FLOOR_REST_BELOW;

  const draw = (f: Flake, t = 1): void => {
    // Centre, not top-left corner: the sprites are anchored 0.5 so the physics position is the flake's
    // middle. Unrounded, because whole grid px stopped being the smallest visible step.
    f.sprite.position.set(f.px + (f.x - f.px) * t, f.py + (f.y - f.py) * t);
  };

  const kill = (f: Flake): void => {
    f.sprite.destroy();
  };

  return {
    container,
    feed(rng, atX) {
      for (let i = 0; i < FLAKES_PER_FEED; i += 1) {
        const sprite = new Sprite({ texture: tex, anchor: 0.5 });
        sprite.scale.set(1 / FX_SS);
        if (water) sprite.tint = FLAKE_COLOURS[Math.floor(rng() * FLAKE_COLOURS.length)] ?? 0xffffff;
        sprite.rotation = rng() * Math.PI * 2;
        container.addChild(sprite);
        const { x, y, vy, vx } = spawnAt(rng, atX);
        const f: Flake = {
          sprite,
          x,
          y,
          vy,
          vx,
          settled: false,
          age: 0,
          float: water ? FLOAT_STEPS_MIN + Math.floor(rng() * (FLOAT_STEPS_MAX - FLOAT_STEPS_MIN + 1)) : 0,
          phase: rng() * Math.PI * 2,
          spin: (rng() * 2 - 1) * 1.6,
          // Seeded to the spawn point so a new flake is drawn where it starts rather than sliding in
          // from wherever the previous step left the interpolation.
          px: x,
          py: y,
        };
        flakes.push(f);
        draw(f);
      }
    },
    step(rng) {
      let dissolved = 0;
      for (let i = flakes.length - 1; i >= 0; i -= 1) {
        const f = flakes[i];
        if (!f) continue;
        f.px = f.x;
        f.py = f.y;
        if (!f.settled && f.float > 0) {
          // Floating: spreading slowly across the surface, slowing as it goes.
          f.float -= 1;
          const nx = f.x + f.vx;
          if (bounds.inside(nx, f.y)) f.x = nx;
          f.vx *= 0.9;
        } else if (!f.settled) {
          // Lateral drift is water. On a floor the guard below (`bounds.inside`) would reject every
          // row but the standing one anyway, so a floor seed simply falls straight down.
          if (water && rng() < 0.12) f.vx = (rng() - 0.5) * 0.8;
          // and a tumble: a flake sinking through still water rocks from side to side
          if (water) f.phase += 0.55;
          const wobble = water ? Math.sin(f.phase) * 0.35 : 0;
          const nx = f.x + f.vx + wobble;
          const ny = f.y + f.vy;
          f.y = Math.min(ny, restRow);
          if (water) f.x = bounds.inside(nx, f.y) ? nx : f.x;
          if (f.y >= restRow) f.settled = true;
        } else {
          f.age += 1;
          if (f.age >= DISSOLVE_STEPS) {
            kill(f);
            flakes.splice(i, 1);
            dissolved += 1;
          }
        }
      }
      return dissolved;
    },
    interpolate(t, dtMs) {
      const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
      for (const f of flakes) {
        draw(f, clamped);
        // the spin slows to a stop as it settles, and is lazy while it floats
        if (!f.settled) f.sprite.rotation += f.spin * (f.float > 0 ? 0.3 : 1) * (dtMs / 1000);
        // An alpha ramp, not a visibility strobe. This was `visible = age % 2 === 0`, a 4 Hz on/off
        // flicker for the last two seconds of a flake's life — a pixel-art device left behind when
        // everything around it went continuous, and against smooth art it reads as a rendering fault.
        const remaining = DISSOLVE_STEPS - f.age;
        f.sprite.alpha = remaining >= FADE_STEPS ? 1 : Math.max(0, remaining / FADE_STEPS);
      }
    },

    positions() {
      return flakes.map((f) => ({ x: Math.round(f.x), y: Math.round(f.y) }));
    },
    remove(index) {
      const f = flakes[index];
      if (!f) return;
      kill(f);
      flakes.splice(index, 1);
    },
    count() {
      return flakes.length;
    },
    clear() {
      for (const f of flakes) kill(f);
      flakes.length = 0;
    },
    destroy() {
      for (const f of flakes) kill(f);
      flakes.length = 0;
      container.destroy({ children: true });
      tex.destroy(true);
    },
  };
}
