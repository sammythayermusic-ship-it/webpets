// Flakes: entities the fish eats. Spawned at the surface on feed(), sinking with drift at 8 fps steps
// (integer draw positions), removed on bite; leftovers settle on the gravel and dissolve after a while.
//
// Sizes, offsets and speeds are in habitat grid px (320x240) and doubled with the grid in Stage 1; the
// 2x2 flake pattern is authored on the old 160x120 art grid and nearest-upscaled by ART_UNIT, so the
// texture is pixel-identical to the previous one at twice the size. Step counts are not pixel
// quantities and did not change.

import { Container, Sprite, type Texture } from 'pixi.js';
import { ART_UNIT, bufferTexture, upscalePattern } from './fx';
import type { Rng } from '../sim/types';
import type { WaterBounds, WaterShape } from './types';

export const FLAKES_PER_FEED = 6;
/** Settled flakes dissolve after this many 8 fps steps (30 s). */
const DISSOLVE_STEPS = 240;

interface Flake {
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
  /** Integer grid px of every live flake, index-aligned with remove(). */
  positions(): Array<{ x: number; y: number }>;
  remove(index: number): void;
  count(): number;
  clear(): void;
  destroy(): void;
}

function flakeTexture(): Texture {
  const px = new Uint8Array([
    222, 160, 72, 255, 240, 190, 100, 255,
    186, 118, 48, 255, 222, 160, 72, 255,
  ]);
  return bufferTexture(2 * ART_UNIT, 2 * ART_UNIT, upscalePattern(2, 2, px), 'flake');
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

  const draw = (f: Flake): void => {
    f.sprite.position.set(Math.round(f.x) - ART_UNIT, Math.round(f.y) - ART_UNIT);
  };

  const kill = (f: Flake): void => {
    f.sprite.destroy();
  };

  return {
    container,
    feed(rng) {
      const y = bounds.surfaceY + 2;
      const hw = Math.max(12, halfWidthAt(y + 4) - 12);
      for (let i = 0; i < FLAKES_PER_FEED; i += 1) {
        const sprite = new Sprite({ texture: tex });
        container.addChild(sprite);
        const f: Flake = {
          sprite,
          x: shape.cx + (rng() * 2 - 1) * hw,
          y,
          vy: 1 + rng(),
          vx: (rng() - 0.5) * 0.8,
          settled: false,
          age: 0,
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
        if (!f.settled) {
          if (rng() < 0.12) f.vx = (rng() - 0.5) * 0.8;
          const nx = f.x + f.vx;
          const ny = f.y + f.vy;
          const floor = bounds.floorY - 4;
          f.y = Math.min(ny, floor);
          f.x = bounds.inside(nx, f.y) ? nx : f.x;
          if (f.y >= floor) f.settled = true;
          draw(f);
        } else {
          f.age += 1;
          if (f.age >= DISSOLVE_STEPS) {
            kill(f);
            flakes.splice(i, 1);
            dissolved += 1;
          } else if (f.age >= DISSOLVE_STEPS - 16) {
            f.sprite.visible = f.age % 2 === 0; // stepped fade-out
          }
        }
      }
      return dissolved;
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
