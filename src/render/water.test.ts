import { describe, expect, it } from 'vitest';
import { makeWaterBounds } from './water';
import { BOWL_WATER_SHAPE, FISH_BODY } from '../species/fish/layout';

const bounds = makeWaterBounds(BOWL_WATER_SHAPE);
const { cx, cy, rx, surfaceY, floorY } = BOWL_WATER_SHAPE;
// Derived from the shipped body box rather than written out. These were literals matching a particular
// bowl, and every one of them went stale the day the habitat was re-rendered -- which is a test telling
// you the art changed, not that the water maths broke.
const HW = FISH_BODY.w / 2;
const HH = FISH_BODY.h / 2;
/** A row where the ellipse is at its widest, i.e. the bowl's waist, clipped into the water band. */
const WAIST = Math.min(floorY - Math.ceil(HH), Math.max(surfaceY + Math.ceil(HH), cy));

function boxInside(x: number, y: number, hw = HW, hh = HH): boolean {
  return (
    bounds.inside(x - hw, y - hh) &&
    bounds.inside(x + hw, y - hh) &&
    bounds.inside(x - hw, y + hh) &&
    bounds.inside(x + hw, y + hh)
  );
}

describe('makeWaterBounds', () => {
  it('exposes the rect and the surface/floor rows', () => {
    expect(bounds.rect).toEqual({ x: cx - rx, y: surfaceY, w: 2 * rx, h: floorY - surfaceY });
    expect(bounds.surfaceY).toBe(surfaceY);
    expect(bounds.floorY).toBe(floorY);
  });

  it('rect is the surface..floor band the dead-phase fog is masked to, not the full ellipse extent', () => {
    // The bowl ellipse overshoots the water (cy - ry < surfaceY and cy + ry > floorY); the fog mask must not.
    const { cy, ry, surfaceY, floorY } = BOWL_WATER_SHAPE;
    expect(cy - ry).toBeLessThan(surfaceY);
    expect(cy + ry).toBeGreaterThan(floorY);
    expect(bounds.rect.y).toBe(surfaceY);
    expect(bounds.rect.y + bounds.rect.h).toBe(floorY);
  });

  it('inside() respects the ellipse and the surface/floor clip', () => {
    expect(bounds.inside(cx, WAIST)).toBe(true);
    expect(bounds.inside(cx, surfaceY - 2)).toBe(false); // above the waterline, in the air pocket
    expect(bounds.inside(cx, floorY + 2)).toBe(false); // below the gravel
    expect(bounds.inside(cx, surfaceY)).toBe(true); // the waterline row itself
    expect(bounds.inside(cx - rx, cy)).toBe(true); // left edge at the widest row
    expect(bounds.inside(cx - rx - 2, cy)).toBe(false);
    // The surface row is narrower than the widest row, so a point inside at the bowl's waist is outside
    // up there. This is the property that keeps the fish away from the glass near the waterline.
    const halfAtSurface = rx * Math.sqrt(Math.max(0, 1 - ((surfaceY - cy) / BOWL_WATER_SHAPE.ry) ** 2));
    expect(halfAtSurface).toBeLessThan(rx);
    expect(bounds.inside(cx - rx + 2, surfaceY)).toBe(false);
    expect(bounds.inside(cx - Math.floor(halfAtSurface) + 1, surfaceY)).toBe(true);
  });

  it('clamp() keeps the body box inside for a grid of inputs, returning integers', () => {
    for (let y = surfaceY - 120; y <= floorY + 120; y += 7) {
      for (let x = cx - 200; x <= cx + 200; x += 11) {
        const c = bounds.clamp(x, y, HW, HH);
        expect(Number.isInteger(c.x)).toBe(true);
        expect(Number.isInteger(c.y)).toBe(true);
        expect(boxInside(c.x, c.y)).toBe(true);
      }
    }
  });

  it('clamp() is the identity for a point whose box already fits', () => {
    expect(bounds.clamp(cx, WAIST, HW, HH)).toEqual({ x: cx, y: WAIST });
    expect(boxInside(cx - 8, WAIST)).toBe(true);
    expect(bounds.clamp(cx - 8, WAIST, HW, HH)).toEqual({ x: cx - 8, y: WAIST });
  });

  it('clamp() pushes a surface point down so the body top row stays under the waterline', () => {
    // This is what stops the fish reading as floating outside the tank: aim anywhere above the water
    // and the whole body box is pushed down until its top row is the waterline, never the glass rim.
    const c = bounds.clamp(160, 20, HW, HH);
    expect(c.y).toBe(BOWL_WATER_SHAPE.surfaceY + HH);
    expect(c.y - HH).toBe(BOWL_WATER_SHAPE.surfaceY);
    expect(boxInside(c.x, c.y)).toBe(true);
  });

  it('clamp() narrows the horizontal range near the floor', () => {
    const floor = bounds.clamp(10_000, floorY, HW, HH);
    const mid = bounds.clamp(10_000, cy, HW, HH);
    expect(floor.x).toBeLessThan(mid.x);
    expect(boxInside(floor.x, floor.y)).toBe(true);
    expect(boxInside(mid.x, mid.y)).toBe(true);
  });

  it('clamp() with a zero-size body keeps points on the ellipse boundary', () => {
    const c = bounds.clamp(-10_000, cy, 0, 0);
    expect(bounds.inside(c.x, c.y)).toBe(true);
    expect(c.x).toBe(cx - rx);
  });

  it('clamp() copes with a body larger than the water without throwing', () => {
    const c = bounds.clamp(cx, cy, 4 * rx, 4 * rx);
    expect(Number.isFinite(c.x)).toBe(true);
    expect(Number.isFinite(c.y)).toBe(true);
    expect(bounds.inside(c.x, c.y)).toBe(true);
  });
});
