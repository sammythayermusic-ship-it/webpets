import { describe, expect, it } from 'vitest';
import {
  BOWL_CAMERA,
  BOWL_INNER_SPHERE,
  FISH_SCALE,
  METRES_PER_GRID_PX,
  depthBudget,
  gridToWorld,
  stepDepth,
  worldToGrid,
} from './camera';

// Projected out of the same camera by assets/3d/scripts/geom.py (art px at 4x the grid).
const GEOMETRY = { waterlineY: 267.2, floorY: 556.5, waterline_z: 0.15786, gravel_top_centre_z: 0.05947, mmPerPx: 0.33594 };

describe('bowl camera mapping', () => {
  it('matches geometry.json scale', () => {
    expect(METRES_PER_GRID_PX * 1000).toBeCloseTo(GEOMETRY.mmPerPx * 4, 4);
  });

  it('puts the waterline row on the waterline height at the mid plane', () => {
    const p = gridToWorld(160, GEOMETRY.waterlineY / 4, 0);
    expect(p.y).toBeCloseTo(GEOMETRY.waterline_z, 3);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.z).toBe(0);
  });

  it('puts the gravel row on the gravel height at the mid plane', () => {
    const p = gridToWorld(160, GEOMETRY.floorY / 4, 0);
    expect(p.y).toBeCloseTo(GEOMETRY.gravel_top_centre_z, 3);
  });

  it('round-trips through worldToGrid at any depth', () => {
    for (const [gx, gy, d] of [
      [0, 0, 0],
      [160, 120, 0.05],
      [300, 20, -0.08],
      [78, 139, 0.02],
    ] as const) {
      const g = worldToGrid(gridToWorld(gx, gy, d));
      expect(g.gx).toBeCloseTo(gx, 6);
      expect(g.gy).toBeCloseTo(gy, 6);
    }
  });

  it('moves right on screen for +x and up for -y', () => {
    const a = gridToWorld(100, 100, 0);
    const b = gridToWorld(110, 100, 0);
    const c = gridToWorld(100, 90, 0);
    expect(b.x).toBeGreaterThan(a.x);
    expect(c.y).toBeGreaterThan(a.y);
  });

  it('has an orthonormal basis looking 9 degrees down', () => {
    const { right, up, forward } = BOWL_CAMERA;
    const dot = (a: typeof right, b: typeof right): number => a.x * b.x + a.y * b.y + a.z * b.z;
    expect(dot(right, up)).toBeCloseTo(0, 9);
    expect(dot(up, forward)).toBeCloseTo(0, 9);
    expect(dot(forward, forward)).toBeCloseTo(1, 9);
    expect(forward.y).toBeCloseTo(-Math.sin((9 * Math.PI) / 180), 9);
  });

  it('draws the fish at two thirds of its Blender size', () => {
    expect(FISH_SCALE).toBeCloseTo(2 / 3, 6);
  });
});

describe('depth budget', () => {
  it('is largest at the bowl centre and zero at the glass', () => {
    const c = BOWL_INNER_SPHERE.center;
    expect(depthBudget(c, 0)).toBeCloseTo(BOWL_INNER_SPHERE.radius, 9);
    expect(depthBudget({ x: c.x + BOWL_INNER_SPHERE.radius, y: c.y, z: 0 }, 0)).toBe(0);
    expect(depthBudget({ x: c.x + 0.2, y: c.y, z: 0 }, 0)).toBe(0);
  });

  it('shrinks with the margin', () => {
    const c = BOWL_INNER_SPHERE.center;
    expect(depthBudget(c, 0.03)).toBeCloseTo(BOWL_INNER_SPHERE.radius - 0.03, 9);
  });

  it('is symmetric left and right of centre', () => {
    const c = BOWL_INNER_SPHERE.center;
    expect(depthBudget({ x: c.x + 0.05, y: c.y, z: 0 }, 0.01)).toBeCloseTo(depthBudget({ x: c.x - 0.05, y: c.y, z: 0 }, 0.01), 9);
  });
});

describe('stepDepth', () => {
  it('eases toward the target and never leaves the budget', () => {
    let d = 0;
    for (let i = 0; i < 200; i += 1) d = stepDepth(d, 0.08, 0.03, 16);
    expect(d).toBeCloseTo(0.03, 6);
    d = 0;
    const one = stepDepth(d, 0.08, 0.1, 16);
    expect(one).toBeGreaterThan(0);
    expect(one).toBeLessThan(0.08);
  });

  it('clamps a depth that is already outside a shrinking budget', () => {
    expect(stepDepth(0.05, 0.05, 0.01, 16)).toBe(0.01);
    expect(stepDepth(-0.05, -0.05, 0, 16)).toBe(0);
  });
});
