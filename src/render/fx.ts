// Ambient FX: bubbles at ticker rate, a glass sheen that follows the pointer, and the parallax helper.
// No filters anywhere (contract: Phase 0 uses none).
//
// Positions, sizes and speeds are in habitat grid px. The textures are generated procedurally at a
// supersampled resolution and drawn back down, rather than being hand-authored pixel patterns
// nearest-upscaled to fit. Next to smooth 3D art a 3x3 nearest-upscaled ring is not a small stylistic
// mismatch: at the largest window a flake was a 24px hard-edged brown square. These were the last
// pixel-art assets in the renderer.

import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import type { Rng } from '../sim/types';
import type { WaterBounds, WaterShape } from './types';

/**
 * Texture px per grid px for the generated FX. High enough that a shape stays smooth when the largest
 * window scales it up, low enough that these stay a rounding error next to the habitat art.
 */
export const FX_SS = 8;

/** Builds a linear-filtered texture from an RGBA byte buffer. */
export function bufferTexture(width: number, height: number, rgba: Uint8Array, label: string): Texture {
  // Explicit format: Pixi defaults a Uint8Array to bgra8unorm, which would swap the channels.
  const source = new BufferImageSource({ resource: rgba, width, height, format: 'rgba8unorm', scaleMode: 'linear', label });
  return new Texture({ source, label });
}

/** Smooth 0..1 ramp; the edges of every shape below are built from this rather than from a hard cutoff. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Paints a texture `wGrid` x `hGrid` grid px at FX_SS times that resolution. `paint` is called per
 * texel with coordinates normalised to -1..1, and returns straight (non-premultiplied) RGBA 0..1.
 */
export function paintTexture(
  wGrid: number,
  hGrid: number,
  label: string,
  paint: (nx: number, ny: number) => readonly [number, number, number, number],
): Texture {
  const w = Math.max(1, Math.round(wGrid * FX_SS));
  const h = Math.max(1, Math.round(hGrid * FX_SS));
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      // Texel CENTRES, so the shape is symmetric about the texture rather than half a texel off.
      const nx = ((x + 0.5) / w) * 2 - 1;
      const ny = ((y + 0.5) / h) * 2 - 1;
      const [r, g, b, a] = paint(nx, ny);
      const i = (y * w + x) * 4;
      px[i] = Math.round(r * 255);
      px[i + 1] = Math.round(g * 255);
      px[i + 2] = Math.round(b * 255);
      px[i + 3] = Math.round(a * 255);
    }
  }
  return bufferTexture(w, h, px, label);
}

/** Diameter of a bubble in grid px. */
export const BUBBLE_SIZE = 6;
/** Width and height of the pointer sheen in grid px. */
export const SHEEN_W = 8;
export const SHEEN_H = 20;

function bubbleTexture(): Texture {
  // A bright rim with a nearly clear middle and one small highlight, which is what reads as a bubble
  // rather than as a dot. The rim is a smooth band so it survives being scaled to any window size.
  return paintTexture(BUBBLE_SIZE, BUBBLE_SIZE, 'bubble', (nx, ny) => {
    const d = Math.hypot(nx, ny);
    const rim = smoothstep(0.62, 0.86, d) * (1 - smoothstep(0.9, 1, d));
    const fill = (1 - smoothstep(0.5, 0.92, d)) * 0.1;
    const hi = (1 - smoothstep(0, 0.3, Math.hypot(nx + 0.36, ny + 0.36))) * 0.85;
    return [1, 1, 1, Math.min(1, rim * 0.85 + fill + hi)];
  });
}

function sheenTexture(): Texture {
  // A soft vertical streak: falls off on both axes so it has no edge of its own to notice.
  return paintTexture(SHEEN_W, SHEEN_H, 'sheen', (nx, ny) => {
    const a = (1 - smoothstep(0.1, 1, Math.abs(nx))) * (1 - smoothstep(0.2, 1, Math.abs(ny)));
    return [1, 1, 1, a * 0.55];
  });
}

interface Bubble {
  sprite: Sprite;
  /** 0..1 fade, so a bubble grows into existence and thins out instead of blinking on and off. */
  fade: number;
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
/** Seconds a bubble takes to fade in at the gravel and out at the surface. */
const BUBBLE_FADE_S = 0.35;
const BUBBLE_ALPHA = 0.85;

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
    // anchor 0.5 + the 1/FX_SS scale means everything below positions a bubble by its CENTRE in grid
    // px, which is what the physics already computes. The old code offset by half the texture instead.
    const sprite = new Sprite({ texture: tex, alpha: 0, visible: false, anchor: 0.5 });
    sprite.scale.set(1 / FX_SS);
    container.addChild(sprite);
    bubbles.push({ sprite, x: 0, y: 0, vy: 20, phase: 0, wobble: 2, active: false, delayMs: 300 + i * 700, fade: 0 });
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
    b.fade = 0;
    b.sprite.alpha = 0;
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
          // Fade out where it leaves rather than vanishing. A bubble that wobbles past the ellipse
          // edge used to blink out mid-water, which reads as a dropped sprite, not as a bubble.
          b.fade -= dt / BUBBLE_FADE_S;
          if (b.fade <= 0) {
            b.active = false;
            b.sprite.visible = false;
            b.delayMs = 400 + rng() * 2200;
            continue;
          }
        } else if (b.fade < 1) {
          b.fade = Math.min(1, b.fade + dt / BUBBLE_FADE_S);
        }
        b.sprite.alpha = BUBBLE_ALPHA * b.fade;
        b.sprite.position.set(x, b.y);
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
  const sprite = new Sprite({ texture: tex, alpha: 0.5, visible: false, label: 'sheen', anchor: 0.5 });
  sprite.scale.set(1 / FX_SS);
  return {
    sprite,
    setPointer(gx, gy, bounds) {
      if (gx === null || gy === null || !bounds.inside(gx, gy)) {
        sprite.visible = false;
        return;
      }
      sprite.visible = true;
      // Not rounded: the sheen tracks a pointer that moves in fractions of a grid px, and snapping it
      // to whole grid px made it jump in visible steps as the cursor crossed a boundary.
      sprite.position.set(gx, gy);
    },
    destroy() {
      sprite.destroy();
      tex.destroy(true);
    },
  };
}

/**
 * Parallax toward the pointer, measured from the centre of `grid` (the manifest habitat's `[w, h]`, the
 * same way `createBubbles`/`createSheen` take their geometry from the manifest rather than importing
 * constants); (0, 0) when reduced motion or no pointer. The divisors and the clamp are all expressed
 * relative to the grid, so they describe the same fraction of the habitat at any grid size.
 *
 * The result is deliberately fractional. It used to be rounded to whole grid px, which was correct when
 * a grid px was the smallest thing that could move and is now just a 4-step stagger on a slide that
 * should be continuous.
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
  const clampMax = grid[0] / 80; // 4 grid px on the 320-wide habitat
  const clamped = (v: number): number => Math.max(-clampMax, Math.min(clampMax, v));
  return { dx: clamped((gx - cx) / 30), dy: clamped((gy - cy) / 25) };
}
