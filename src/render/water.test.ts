import { describe, expect, it } from 'vitest';
import { makeWaterBounds } from './water';
import { BOWL_WATER_SHAPE } from '../species/fish/layout';

const bounds = makeWaterBounds(BOWL_WATER_SHAPE);
const HW = 14;
const HH = 7;

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
    expect(bounds.rect).toEqual({ x: 41, y: 23, w: 80, h: 73 });
    expect(bounds.surfaceY).toBe(23);
    expect(bounds.floorY).toBe(96);
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
    expect(bounds.inside(81, 60)).toBe(true);
    expect(bounds.inside(81, 22)).toBe(false); // above the surface
    expect(bounds.inside(81, 97)).toBe(false); // below the floor
    expect(bounds.inside(81, 23)).toBe(true); // surface row inside the ellipse
    expect(bounds.inside(41, 58)).toBe(true); // left edge at the widest row
    expect(bounds.inside(40, 58)).toBe(false);
    expect(bounds.inside(45, 23)).toBe(false); // surface row is narrower than the widest row
  });

  it('clamp() keeps the body box inside for a grid of inputs, returning integers', () => {
    for (let y = -20; y <= 140; y += 7) {
      for (let x = -20; x <= 180; x += 9) {
        const c = bounds.clamp(x, y, HW, HH);
        expect(Number.isInteger(c.x)).toBe(true);
        expect(Number.isInteger(c.y)).toBe(true);
        expect(boxInside(c.x, c.y)).toBe(true);
      }
    }
  });

  it('clamp() is the identity for a point whose box already fits', () => {
    expect(bounds.clamp(81, 60, HW, HH)).toEqual({ x: 81, y: 60 });
    expect(bounds.clamp(70, 45, HW, HH)).toEqual({ x: 70, y: 45 });
  });

  it('clamp() pushes a surface point down so the body top row stays under the surface', () => {
    const c = bounds.clamp(81, 10, HW, HH);
    expect(c.y).toBe(23 + HH);
    expect(boxInside(c.x, c.y)).toBe(true);
  });

  it('clamp() narrows the horizontal range near the floor', () => {
    const floor = bounds.clamp(200, 96, HW, HH);
    const mid = bounds.clamp(200, 58, HW, HH);
    expect(floor.x).toBeLessThan(mid.x);
    expect(boxInside(floor.x, floor.y)).toBe(true);
    expect(boxInside(mid.x, mid.y)).toBe(true);
  });

  it('clamp() with a zero-size body keeps points on the ellipse boundary', () => {
    const c = bounds.clamp(0, 58, 0, 0);
    expect(bounds.inside(c.x, c.y)).toBe(true);
    expect(c.x).toBe(41);
  });

  it('clamp() copes with a body larger than the water without throwing', () => {
    const c = bounds.clamp(81, 60, 100, 100);
    expect(Number.isFinite(c.x)).toBe(true);
    expect(Number.isFinite(c.y)).toBe(true);
    expect(bounds.inside(c.x, c.y)).toBe(true);
  });
});
