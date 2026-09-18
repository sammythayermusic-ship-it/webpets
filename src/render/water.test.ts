import { describe, expect, it } from 'vitest';
import { makeWaterBounds } from './water';
import { BOWL_WATER_SHAPE } from '../species/fish/layout';

const bounds = makeWaterBounds(BOWL_WATER_SHAPE);
// The manifest body box is 56x28 at the 320x240 grid.
const HW = 28;
const HH = 14;

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
    expect(bounds.rect).toEqual({ x: 82, y: 46, w: 160, h: 146 });
    expect(bounds.surfaceY).toBe(46);
    expect(bounds.floorY).toBe(192);
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
    expect(bounds.inside(162, 120)).toBe(true);
    expect(bounds.inside(162, 44)).toBe(false); // above the surface
    expect(bounds.inside(162, 194)).toBe(false); // below the floor
    expect(bounds.inside(162, 46)).toBe(true); // surface row inside the ellipse
    expect(bounds.inside(82, 116)).toBe(true); // left edge at the widest row
    expect(bounds.inside(80, 116)).toBe(false);
    expect(bounds.inside(90, 46)).toBe(false); // surface row is narrower than the widest row
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
    expect(bounds.clamp(162, 120, HW, HH)).toEqual({ x: 162, y: 120 });
    expect(bounds.clamp(140, 90, HW, HH)).toEqual({ x: 140, y: 90 });
  });

  it('clamp() pushes a surface point down so the body top row stays under the surface', () => {
    const c = bounds.clamp(162, 20, HW, HH);
    expect(c.y).toBe(46 + HH);
    expect(boxInside(c.x, c.y)).toBe(true);
  });

  it('clamp() narrows the horizontal range near the floor', () => {
    const floor = bounds.clamp(400, 192, HW, HH);
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
    const c = bounds.clamp(162, 120, 200, 200);
    expect(Number.isFinite(c.x)).toBe(true);
    expect(Number.isFinite(c.y)).toBe(true);
    expect(bounds.inside(c.x, c.y)).toBe(true);
  });
});
