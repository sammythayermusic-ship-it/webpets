// Flakes: entities the fish eats. Spawned at the surface on feed(), sinking with drift at 8 fps steps,
// removed on bite; leftovers settle on the gravel and dissolve after a while.
//
// Sizes, offsets and speeds are in habitat grid px (320x240). The flake used to be a hand-authored 2x2
// pattern nearest-upscaled to 4x4, which against smooth art read as a hard brown square; it is now a
// soft crumb generated at FX_SS times the grid, like the bubbles and the sheen. Step counts are not
// pixel quantities and did not change.

import { Container, Sprite, type Texture } from 'pixi.js';
import { FX_SS, paintTexture, smoothstep } from './fx';
import type { Rng } from '../sim/types';
import type { WaterBounds, WaterShape } from './types';

export const FLAKES_PER_FEED = 6;
/** Flake spawn spread, as a fraction of the water's half-width at the spawn row. */
const SPAWN_SPREAD = 0.45;
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
}

export interface Flakes {
  readonly container: Container;
  /** Drop FLAKES_PER_FEED flakes at the surface. */
  feed(rng: Rng): void;
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

function flakeTexture(): Texture {
  // An irregular soft crumb rather than a disc: the lobes come from a cheap angular wobble of the
  // radius, which is enough to stop six identical flakes reading as six identical dots.
  return paintTexture(FLAKE_SIZE, FLAKE_SIZE, 'flake', (nx, ny) => {
    const d = Math.hypot(nx, ny);
    const wobble = 1 + 0.16 * Math.sin(Math.atan2(ny, nx) * 3);
    const a = 1 - smoothstep(0.52 * wobble, 0.95 * wobble, d);
    // Lit from the top-left, matching the habitat's key light, so a flake is not a flat blob.
    const lift = (1 - smoothstep(-0.6, 0.5, ny + nx * 0.4)) * 0.25;
    return [0.87 + lift * 0.5, 0.63 + lift * 0.6, 0.28 + lift * 0.7, a];
  });
}

export function createFlakes(shape: WaterShape, bounds: WaterBounds): Flakes {
  const container = new Container({ label: 'flakes' });
  const tex = flakeTexture();
  const flakes: Flake[] = [];

  const halfWidthAt = (y: number): number => {
    const dy = (y - shape.cy) / shape.ry;
    const t = 1 - dy * dy;
    return t <= 0 ? 0 : shape.rx * Math.sqrt(t);
  };

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
    feed(rng) {
      const y = bounds.surfaceY + 2;
      // A fraction of the surface half-width, not a fixed inset. The old `- 12` was tuned when the
      // spawn row was the narrow top of the glass; now that it is the real waterline, where the bowl is
      // near its widest, subtracting a constant scattered the flakes almost wall to wall. This keeps
      // them a handful dropped into the middle at any bowl size.
      const hw = Math.max(12, halfWidthAt(y + 4) * SPAWN_SPREAD);
      for (let i = 0; i < FLAKES_PER_FEED; i += 1) {
        const sprite = new Sprite({ texture: tex, anchor: 0.5 });
        sprite.scale.set(1 / FX_SS);
        container.addChild(sprite);
        const x = shape.cx + (rng() * 2 - 1) * hw;
        const f: Flake = {
          sprite,
          x,
          y,
          vy: 1 + rng(),
          vx: (rng() - 0.5) * 0.8,
          settled: false,
          age: 0,
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
        if (!f.settled) {
          if (rng() < 0.12) f.vx = (rng() - 0.5) * 0.8;
          const nx = f.x + f.vx;
          const ny = f.y + f.vy;
          const floor = bounds.floorY - 4;
          f.y = Math.min(ny, floor);
          f.x = bounds.inside(nx, f.y) ? nx : f.x;
          if (f.y >= floor) f.settled = true;
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
        // An alpha ramp, not a visibility strobe. This was `visible = age % 2 === 0`, a 4 Hz on/off
        // flicker for the last two seconds of a flake's life — a pixel-art device left behind when
        // everything around it went continuous, and against smooth art it reads as a rendering fault.
        const remaining = DISSOLVE_STEPS - f.age;
        f.sprite.alpha = remaining >= FADE_STEPS ? 1 : Math.max(0, remaining / FADE_STEPS);
      }
      void dtMs;
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
