// Ambient FX inside the RenderTexture: bubbles at ticker rate (float positions become big pixels because
// the whole RT is upscaled), a glass sheen that follows the pointer, and the ±2 px parallax helper.
// No filters anywhere (contract: Phase 0 uses none).

import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import type { Rng } from '../sim/types';
import type { WaterBounds, WaterShape } from './types';

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
  return bufferTexture(3, 3, px, 'bubble');
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
  return bufferTexture(w, h, px, 'sheen');
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
    bubbles.push({ sprite, x: 0, y: 0, vy: 10, phase: 0, wobble: 1, active: false, delayMs: 300 + i * 700 });
  }

  const spawn = (b: Bubble, rng: Rng): void => {
    const y = bounds.floorY - 3;
    const hw = Math.max(4, halfWidthAt(y) - 4);
    b.x = shape.cx + (rng() * 2 - 1) * hw;
    b.y = y;
    b.vy = 8 + rng() * 6;
    b.phase = rng() * Math.PI * 2;
    b.wobble = 1 + rng();
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
        if (b.y <= bounds.surfaceY + 1 || !bounds.inside(x, b.y)) {
          b.active = false;
          b.sprite.visible = false;
          b.delayMs = 400 + rng() * 2200;
          continue;
        }
        b.sprite.position.set(x - 1, b.y - 1);
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
      sprite.position.set(Math.round(gx) - 2, Math.round(gy) - 5);
    },
    destroy() {
      sprite.destroy();
      tex.destroy(true);
    },
  };
}

/** ±2 px integer parallax toward the pointer; (0, 0) when reduced motion or no pointer. */
export function parallaxOffset(gx: number | null, gy: number | null, reducedMotion: boolean): { dx: number; dy: number } {
  if (reducedMotion || gx === null || gy === null) return { dx: 0, dy: 0 };
  const clamp2 = (v: number): number => Math.max(-2, Math.min(2, Math.round(v)));
  return { dx: clamp2((gx - 80) / 30), dy: clamp2((gy - 60) / 25) };
}
