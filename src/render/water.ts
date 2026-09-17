// Water bounds helper: an ellipse (cx, cy, rx, ry) clipped to surfaceY <= y <= floorY, in grid px.
// Pure (no Pixi) so the behavior tests can use it directly.

import type { WaterBounds, WaterShape } from './types';

function clampNum(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function makeWaterBounds(shape: WaterShape): WaterBounds {
  const { cx, cy, rx, ry, surfaceY, floorY } = shape;
  const top = Math.max(surfaceY, cy - ry);
  const bottom = Math.min(floorY, cy + ry);

  /** Half width of the ellipse on row y (0 outside the vertical extent). */
  const halfWidthAt = (y: number): number => {
    const dy = (y - cy) / ry;
    const t = 1 - dy * dy;
    return t <= 0 ? 0 : rx * Math.sqrt(t);
  };

  const inside = (x: number, y: number): boolean => {
    if (y < surfaceY || y > floorY) return false;
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };

  const clamp = (x: number, y: number, halfW: number, halfH: number): { x: number; y: number } => {
    const hw = Math.max(0, halfW);
    const hh = Math.max(0, halfH);
    let yy: number;
    if (top + hh > bottom - hh) {
      // The box is taller than the water: park it on the middle row.
      yy = Math.round((top + bottom) / 2);
    } else {
      yy = Math.round(clampNum(y, top + hh, bottom - hh));
    }
    // Available horizontal play once the body's top and bottom rows are inside the ellipse
    // (convex, so every row in between is wider than the narrower of the two).
    const availAt = (row: number): number => Math.floor(Math.min(halfWidthAt(row - hh), halfWidthAt(row + hh)) - hw);
    let avail = availAt(yy);
    let guard = 0;
    while (avail < 0 && guard < 256) {
      // Move toward the widest row until the box fits.
      if (yy === Math.round(cy)) break;
      yy += yy < cy ? 1 : -1;
      avail = availAt(yy);
      guard += 1;
    }
    if (avail < 0) avail = 0;
    const lo = Math.ceil(cx - avail);
    const hi = Math.floor(cx + avail);
    const xx = lo > hi ? Math.round(cx) : Math.round(clampNum(x, lo, hi));
    return { x: xx, y: yy };
  };

  return {
    rect: { x: cx - rx, y: surfaceY, w: 2 * rx, h: floorY - surfaceY },
    surfaceY,
    floorY,
    inside,
    clamp,
  };
}
