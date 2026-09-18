// Ambient FX inside the RenderTexture: bubbles at ticker rate (float positions become big pixels because
// the whole RT is upscaled), a glass sheen that follows the pointer, and the ±4 px parallax helper.
// No filters anywhere (contract: Phase 0 uses none).
//
// Positions, sizes and speeds are in habitat grid px and doubled with the grid in Stage 1. The small
// RGBA patterns below are authored on the 160x120 art grid (the same units `tools/gen_placeholders.py`
// draws in) and nearest-upscaled by ART_UNIT, so each texture is pixel-identical to the previous one at
// ART_UNIT times the size instead of being redrawn.

import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import { GRID_W } from '../sim/constants';
import type { Rng } from '../sim/types';
import type { WaterBounds, WaterShape } from './types';

/** The grid the FX pixel patterns were authored on (mirrors ART_W in tools/gen_placeholders.py). */
const ART_GRID_W = 160;
/** Art-unit multiplier: how many habitat px one authored art pixel covers. */
export const ART_UNIT = Math.max(1, Math.round(GRID_W / ART_GRID_W));

/** Nearest-upscale an RGBA pattern by ART_UNIT (identity at 1). */
export function upscalePattern(width: number, height: number, rgba: Uint8Array, factor = ART_UNIT): Uint8Array {
  if (factor === 1) return rgba;
  const out = new Uint8Array(width * factor * height * factor * 4);
  const w = width * factor;
  for (let y = 0; y < height * factor; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const src = (Math.floor(y / factor) * width + Math.floor(x / factor)) * 4;
      const dst = (y * w + x) * 4;
      out[dst] = rgba[src] ?? 0;
      out[dst + 1] = rgba[src + 1] ?? 0;
      out[dst + 2] = rgba[src + 2] ?? 0;
      out[dst + 3] = rgba[src + 3] ?? 0;
    }
  }
  return out;
}

/** Builds a small nearest-neighbor texture from an RGBA byte pattern. */
export function bufferTexture(width: number, height: number, rgba: Uint8Array, label: string): Texture {
  // Explicit format: Pixi defaults a Uint8Array to bgra8unorm, which would swap the channels.
  const source = new BufferImageSource({ resource: rgba, width, height, format: 'rgba8unorm', scaleMode: 'nearest', label });
  return new Texture({ source, label });
}

function bubbleTexture(): Texture {
  // 3x3 ring: rim bright, center clear.
  const px = new Uint8Array(3 * 3 * 4);
  const set = (i: number, a: number): void => {
    px[i * 4] = 255;
    px[i * 4 + 1] = 255;
    px[i * 4 + 2] = 255;
    px[i * 4 + 3] = a;
  };
  [1, 3, 5, 7].forEach((i) => set(i, 210));
  [0, 2, 6, 8].forEach((i) => set(i, 90));
  return bufferTexture(3 * ART_UNIT, 3 * ART_UNIT, upscalePattern(3, 3, px), 'bubble');
}

function sheenTexture(): Texture {
  // 4x10 soft vertical streak.
  const w = 4;
  const h = 10;
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const edge = y === 0 || y === h - 1 || x === 0 || x === w - 1;
      const i = (y * w + x) * 4;
      px[i] = 255;
      px[i + 1] = 255;
      px[i + 2] = 255;
      px[i + 3] = edge ? 40 : 90;
    }
  }
  return bufferTexture(w * ART_UNIT, h * ART_UNIT, upscalePattern(w, h, px), 'sheen');
}

interface Bubble {
  sprite: Sprite;
  x: number;
  y: number;
  vy: number; // px/s upward
  phase: number;
  wobble: number;
  active: boolean;
  delayMs: number;
}

export interface Bubbles {
  readonly container: Container;
  update(deltaMS: number, rng: Rng): void;
  /** false: hide everything and stop spawning (dead / memorial). */
  setEnabled(on: boolean): void;
  destroy(): void;
}

const BUBBLE_COUNT = 5;

export function createBubbles(shape: WaterShape, bounds: WaterBounds): Bubbles {
  const container = new Container({ label: 'bubbles' });
  const tex = bubbleTexture();
  const bubbles: Bubble[] = [];
  let enabled = true;

  const halfWidthAt = (y: number): number => {
    const dy = (y - shape.cy) / shape.ry;
    const t = 1 - dy * dy;
    return t <= 0 ? 0 : shape.rx * Math.sqrt(t);
  };

  for (let i = 0; i < BUBBLE_COUNT; i += 1) {
    const sprite = new Sprite({ texture: tex, alpha: 0.85, visible: false });
    container.addChild(sprite);
    bubbles.push({ sprite, x: 0, y: 0, vy: 20, phase: 0, wobble: 2, active: false, delayMs: 300 + i * 700 });
  }

  const spawn = (b: Bubble, rng: Rng): void => {
    const y = bounds.floorY - 6;
    const hw = Math.max(8, halfWidthAt(y) - 8);
    b.x = shape.cx + (rng() * 2 - 1) * hw;
    b.y = y;
    b.vy = 16 + rng() * 12;
    b.phase = rng() * Math.PI * 2;
    b.wobble = 2 + rng() * 2;
    b.active = true;
    b.sprite.visible = true;
  };

  return {
    container,
    update(deltaMS, rng) {
      if (!enabled) return;
      const dt = deltaMS / 1000;
      for (const b of bubbles) {
        if (!b.active) {
          b.delayMs -= deltaMS;
          if (b.delayMs <= 0) spawn(b, rng);
          continue;
        }
        b.y -= b.vy * dt;
        b.phase += dt * 3;
        const x = b.x + Math.sin(b.phase) * b.wobble;
        if (b.y <= bounds.surfaceY + 2 || !bounds.inside(x, b.y)) {
          b.active = false;
          b.sprite.visible = false;
          b.delayMs = 400 + rng() * 2200;
          continue;
        }
        b.sprite.position.set(x - ART_UNIT, b.y - ART_UNIT);
      }
    },
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      if (!on) {
        for (const b of bubbles) {
          b.active = false;
          b.sprite.visible = false;
          b.delayMs = 300;
        }
      }
    },
    destroy() {
      container.destroy({ children: true });
      tex.destroy(true);
    },
  };
}

export interface Sheen {
  readonly sprite: Sprite;
  /** Grid px of the pointer, or null when it left. Visible only over the water. */
  setPointer(gx: number | null, gy: number | null, bounds: WaterBounds): void;
  destroy(): void;
}

export function createSheen(): Sheen {
  const tex = sheenTexture();
  const sprite = new Sprite({ texture: tex, alpha: 0.5, visible: false, label: 'sheen' });
  return {
    sprite,
    setPointer(gx, gy, bounds) {
      if (gx === null || gy === null || !bounds.inside(gx, gy)) {
        sprite.visible = false;
        return;
      }
      sprite.visible = true;
      sprite.position.set(Math.round(gx) - 2 * ART_UNIT, Math.round(gy) - 5 * ART_UNIT);
    },
    destroy() {
      sprite.destroy();
      tex.destroy(true);
    },
  };
}

/**
 * ±4 px integer parallax toward the pointer, measured from the centre of `grid` (the manifest habitat's
 * `[w, h]`, the same way `createBubbles`/`createSheen` take their geometry from the manifest rather than
 * importing constants); (0, 0) when reduced motion or no pointer. The divisors stay resolution-relative:
 * on a 2x grid the offset from centre is 2x, so the clamped result is exactly twice the old one.
 */
export function parallaxOffset(
  grid: readonly [number, number],
  gx: number | null,
  gy: number | null,
  reducedMotion: boolean,
): { dx: number; dy: number } {
  if (reducedMotion || gx === null || gy === null) return { dx: 0, dy: 0 };
  const cx = grid[0] / 2;
  const cy = grid[1] / 2;
  const clampMax = 2 * Math.max(1, Math.round(grid[0] / ART_GRID_W));
  const clamped = (v: number): number => Math.max(-clampMax, Math.min(clampMax, Math.round(v)));
  return { dx: clamped((gx - cx) / 30), dy: clamped((gy - cy) / 25) };
}
