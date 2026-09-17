// Tray chip painter: a mini fish plus a hunger ring, as raw RGBA. No DOM, no Pixi, so it runs in tests
// and can be handed straight to Rust (`tray_set_chip`). Painted on an 18x18 grid; 36 is a 2x nearest upscale.

import type { HungerLabel } from '../sim/types';
import type { SceneView, TrayChipSize } from './types';

type Rgba = readonly [number, number, number, number];

export const CHIP_RING_COLORS: Readonly<Record<HungerLabel, Rgba>> = {
  full: [61, 220, 132, 255],
  peckish: [245, 197, 66, 255],
  hungry: [245, 138, 60, 255],
  starving: [224, 68, 62, 255],
};

const FISH_ORANGE: Rgba = [255, 140, 40, 255];
const FISH_DARK: Rgba = [200, 90, 20, 255];
const FISH_GRAY: Rgba = [150, 150, 160, 255];
const FISH_GRAY_DARK: Rgba = [100, 100, 110, 255];
const EYE: Rgba = [20, 20, 30, 255];
const DIM_ALPHA = 70;

const BASE = 18;

/** 8x5 fish facing right: `#` body, `t` tail, `e` eye, `.` empty. Row 0 is the top. */
const FISH_ROWS: readonly string[] = [
  '..####..',
  't#####e.',
  'tt######',
  't#####..',
  '..####..',
];

class PixelBuffer {
  readonly data: Uint8Array;
  constructor(readonly size: number) {
    this.data = new Uint8Array(size * size * 4);
  }
  set(x: number, y: number, c: Rgba): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
  }
}

function paintRing(buf: PixelBuffer, hungerFraction: number, color: Rgba): void {
  const c = BASE / 2;
  const dim: Rgba = [color[0], color[1], color[2], DIM_ALPHA];
  for (let y = 0; y < BASE; y += 1) {
    for (let x = 0; x < BASE; x += 1) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.hypot(dx, dy);
      if (d < 6.5 || d >= 8.5) continue;
      // Angle clockwise from 12 o'clock, normalized to [0, 1).
      let a = Math.atan2(dx, -dy) / (2 * Math.PI);
      if (a < 0) a += 1;
      const lit = hungerFraction >= 1 || a < hungerFraction;
      buf.set(x, y, lit ? color : dim);
    }
  }
}

function paintFish(buf: PixelBuffer, alive: boolean, asleep: boolean): void {
  const body = alive ? FISH_ORANGE : FISH_GRAY;
  const dark = alive ? FISH_DARK : FISH_GRAY_DARK;
  const ox = 5;
  const oy = 6;
  FISH_ROWS.forEach((row, ry) => {
    // Dead fish are drawn belly-up (rows flipped).
    const y = oy + (alive ? ry : FISH_ROWS.length - 1 - ry);
    for (let rx = 0; rx < row.length; rx += 1) {
      const ch = row[rx];
      const x = ox + rx;
      if (ch === '#') buf.set(x, y, body);
      else if (ch === 't') buf.set(x, y, dark);
      else if (ch === 'e') buf.set(x, y, asleep && alive ? dark : EYE);
    }
  });
}

function upscale2x(src: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(size * 2 * size * 2 * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      for (let sy = 0; sy < 2; sy += 1) {
        for (let sx = 0; sx < 2; sx += 1) {
          const o = ((y * 2 + sy) * size * 2 + (x * 2 + sx)) * 4;
          out[o] = src[i] ?? 0;
          out[o + 1] = src[i + 1] ?? 0;
          out[o + 2] = src[i + 2] ?? 0;
          out[o + 3] = src[i + 3] ?? 0;
        }
      }
    }
  }
  return out;
}

/** RGBA pixels (size*size*4), row-major, top-left first. */
export function paintTrayChip(view: SceneView, size: TrayChipSize): Uint8Array {
  const buf = new PixelBuffer(BASE);
  const alive = view.phase === 'alive' && view.alive;
  const fraction = alive ? Math.max(0, Math.min(1, view.hunger / 100)) : 0;
  const color = alive ? CHIP_RING_COLORS[view.label] : CHIP_RING_COLORS.starving;
  paintRing(buf, fraction, color);
  paintFish(buf, alive, view.asleep);
  return size === 18 ? buf.data : upscale2x(buf.data, BASE);
}
