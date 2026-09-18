import { describe, expect, it } from 'vitest';
import { makeWaterBounds } from './water';
import { BOWL_WATER_SHAPE } from '../species/fish/layout';

const bounds = makeWaterBounds(BOWL_WATER_SHAPE);
// The manifest body box is 56x46 at the 320x240 grid. The drawn fish is 64x48, so the collision box is
// smaller in both axes and fins and tail may brush the glass without the clamp fighting them -- but only
// just, vertically: surfaceY is the bowl's topmost opaque row, so every px the box is shorter than the art
// is a px of dorsal fin hanging outside the bowl at the top of the swim range.
const HW = 28;
const HH = 23;

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
    expect(bounds.rect).toEqual({ x: 82, y: 80, w: 156, h: 110 });
    expect(bounds.surfaceY).toBe(80);
    expect(bounds.floorY).toBe(190);
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
    expect(bounds.inside(160, 120)).toBe(true);
    expect(bounds.inside(160, 78)).toBe(false); // above the waterline, in the air pocket
    expect(bounds.inside(160, 192)).toBe(false); // below the floor
    expect(bounds.inside(160, 80)).toBe(true); // the waterline row itself
    expect(bounds.inside(82, 116)).toBe(true); // left edge at the widest row
    expect(bounds.inside(80, 116)).toBe(false);
    // The waterline row is narrower than the widest row, so a point that is inside at the bowl's waist
    // is outside up here.
    expect(bounds.inside(88, 80)).toBe(false);
    expect(bounds.inside(95, 80)).toBe(true);
  });

  it('clamp() keeps the body box inside for a grid of inputs, returning integers', () => {
    for (let y = -40; y <= 280; y += 14) {
      for (let x = -40; x <= 360; x += 18) {
        const c = bounds.clamp(x, y, HW, HH);
        expect(Number.isInteger(c.x)).toBe(true);
        expect(Number.isInteger(c.y)).toBe(true);
        expect(boxInside(c.x, c.y)).toBe(true);
      }
    }
  });

  it('clamp() is the identity for a point whose box already fits', () => {
    expect(bounds.clamp(160, 120, HW, HH)).toEqual({ x: 160, y: 120 });
    expect(bounds.clamp(140, 130, HW, HH)).toEqual({ x: 140, y: 130 });
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
    const floor = bounds.clamp(400, 190, HW, HH);
    const mid = bounds.clamp(400, 116, HW, HH);
    expect(floor.x).toBeLessThan(mid.x);
    expect(boxInside(floor.x, floor.y)).toBe(true);
    expect(boxInside(mid.x, mid.y)).toBe(true);
  });

  it('clamp() with a zero-size body keeps points on the ellipse boundary', () => {
    const c = bounds.clamp(0, 116, 0, 0);
    expect(bounds.inside(c.x, c.y)).toBe(true);
    expect(c.x).toBe(82);
  });

  it('clamp() copes with a body larger than the water without throwing', () => {
    const c = bounds.clamp(160, 120, 200, 200);
    expect(Number.isFinite(c.x)).toBe(true);
    expect(Number.isFinite(c.y)).toBe(true);
    expect(bounds.inside(c.x, c.y)).toBe(true);
  });
});
