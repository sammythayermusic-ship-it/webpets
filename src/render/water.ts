// Water bounds helper: an ellipse (cx, cy, rx, ry) clipped to surfaceY <= y <= floorY, in grid px.
// Pure (no Pixi) so the behavior tests can use it directly.
//
// Positions here are CONTINUOUS. They used to be rounded to whole grid px, which was correct while the
// renderer drew on a pixel grid and is the reason the pet's motion did not flow: the behaviour's top
// vertical speed is under one px per tick, so rounding turned its path into a staircase of 1 px steps
// at 8 Hz. Smoothing that in the renderer is not possible without also lagging the fish badly when it
// darts, because a filter slow enough to hide a 125 ms step is slow enough to trail a fast move by
// 24 screen px. The quantisation had to go at the source instead.

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

  /**
   * The water is a CLOSED region, so its own boundary counts as inside — hence the epsilon.
   *
   * Without it `clamp` and `inside` disagree: `clamp` returns the exact extreme legal point, and
   * testing that same point with `dx*dx + dy*dy <= 1` fails about half the time purely on the last bit
   * of the arithmetic. That is not a theoretical concern — it is the pet pressed against the glass at
   * the edge of its swim, which is a position it reaches constantly.
   */
  const EDGE = 1e-9;
  const inside = (x: number, y: number): boolean => {
    if (y < surfaceY - EDGE || y > floorY + EDGE) return false;
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1 + EDGE;
  };

  const clamp = (x: number, y: number, halfW: number, halfH: number): { x: number; y: number } => {
    const hw = Math.max(0, halfW);
    const hh = Math.max(0, halfH);

    // Rows where the body box still fits horizontally, solved rather than searched.
    //
    // The box fits on row r when the ellipse is at least `hw` wide at BOTH r - hh and r + hh. Since
    // `halfWidthAt` falls off symmetrically from cy, `halfWidthAt(r) >= hw` is exactly
    // `|r - cy| <= ry·sqrt(1 - (hw/rx)^2)`, and requiring it of both the top and bottom rows shrinks
    // that band by hh at each end. The previous version stepped a loop one row at a time looking for
    // the same answer, which only terminated because rows were whole numbers.
    const shrink = hw >= rx ? 0 : ry * Math.sqrt(1 - (hw / rx) * (hw / rx));
    const fitLo = cy - shrink + hh;
    const fitHi = cy + shrink - hh;

    const bandLo = Math.max(top + hh, fitLo);
    const bandHi = Math.min(bottom - hh, fitHi);
    // Empty band: the body is taller than the water, or wider than the bowl. Park it on the widest row
    // and let the horizontal clamp collapse to the centre.
    const yy = bandLo > bandHi ? clampNum(cy, top, bottom) : clampNum(y, bandLo, bandHi);

    const avail = Math.max(0, Math.min(halfWidthAt(yy - hh), halfWidthAt(yy + hh)) - hw);
    const xx = clampNum(x, cx - avail, cx + avail);
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
