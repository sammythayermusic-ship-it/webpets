// Pure layout helpers shared by both platform implementations (and unit-tested without a DOM).

import { GRID_H, GRID_W, WINDOW_PAD, type Scale } from '../sim/constants';
import type { Rect } from '../sim/types';

/** Contract window size for an integer scale: `(160s + 48) x (120s + 48)` CSS px. */
export function windowSizeForScale(scale: Scale): { width: number; height: number } {
  return { width: GRID_W * scale + 2 * WINDOW_PAD, height: GRID_H * scale + 2 * WINDOW_PAD };
}

/** Half-open containment test matching the Rust poller (`x < r.x + r.w`). */
export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

/**
 * Same rule as the Rust poller: with no regions registered nothing is click-through and every point over
 * the window counts as inside; otherwise a point is inside only when some region contains it.
 */
export function pointerInside(regions: readonly Rect[], x: number, y: number): boolean {
  return regions.length === 0 || regions.some((r) => rectContains(r, x, y));
}
