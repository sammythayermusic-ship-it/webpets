import { describe, expect, it } from 'vitest';
import {
  DEPTH_WANDER_MAX_M,
  FISH_MESH_LENGTH_M,
  METRES_PER_GRID_PX,
  blenderToWorld,
  cameraFrustum,
  depthWander,
  fishScale,
  gridToBlender,
  gridToWorld,
  projectToGrid,
  worldToBlender,
} from './mapping';
import geometry from '../../../assets/habitats/fish/bowl/geometry.json';
import { BOWL_WATER_SHAPE, FISH_BODY, FISH_DRAWN_LENGTH } from '../../species/fish/layout';

const ART_SCALE = (geometry.resolution[0] ?? 1280) / 320;

describe('grid <-> world mapping through CAM_bowl', () => {
  it('reproduces the projected waterline centre from geometry.json', () => {
    // The waterline ring sits at Blender z = 0.15786 on the bowl's centre plane (y = 0) and the
    // renderer projected its centre to 267.2 art px. Same camera, same answer.
    const p = projectToGrid({ x: 0, y: 0, z: geometry._world.waterline_z });
    expect(p.x).toBeCloseTo(160, 5);
    expect(p.y).toBeCloseTo(geometry.waterlineY / ART_SCALE, 0);
    expect(Math.abs(p.y - geometry.waterlineY / ART_SCALE)).toBeLessThan(0.15);
  });

  it('reproduces the projected gravel top', () => {
    const p = projectToGrid({ x: 0, y: 0, z: geometry._world.gravel_top_centre_z });
    expect(Math.abs(p.y - geometry.floorY / ART_SCALE)).toBeLessThan(0.15);
    // and it is where the behaviour's floor is, to the pixel the layout rounds to
    expect(Math.round(p.y)).toBe(BOWL_WATER_SHAPE.floorY);
  });

  it('gridToBlender is the inverse of projectToGrid at any depth', () => {
    for (const depth of [-0.03, 0, 0.025]) {
      for (const [gx, gy] of [
        [160, 108],
        [90, 80],
        [230, 135],
        [0, 0],
      ] as const) {
        const b = gridToBlender(gx, gy, depth);
        expect(b.y).toBeCloseTo(depth, 9);
        const back = projectToGrid(b);
        expect(back.x).toBeCloseTo(gx, 6);
        expect(back.y).toBeCloseTo(gy, 6);
      }
    }
  });

  it('the depth wander never moves the fish on screen', () => {
    const a = projectToGrid(gridToBlender(140, 110, -0.028));
    const b = projectToGrid(gridToBlender(140, 110, 0.028));
    expect(a.x).toBeCloseTo(b.x, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  });

  it('the anchor lands inside the water body', () => {
    const b = gridToBlender(160, 108, 0);
    // inside the inner radius, under the waterline, above the gravel
    expect(Math.hypot(b.x, b.y)).toBeLessThan(geometry._world.inner_radius_m);
    expect(b.z).toBeLessThan(geometry._world.waterline_z);
    expect(b.z).toBeGreaterThan(geometry._world.gravel_top_centre_z);
  });

  it('axis conversion round-trips and keeps up up', () => {
    const w = blenderToWorld({ x: 1, y: 2, z: 3 });
    expect(w).toEqual({ x: 1, y: 3, z: -2 });
    expect(worldToBlender(w)).toEqual({ x: 1, y: 2, z: 3 });
    expect(gridToWorld(160, 120, 0).y).toBeCloseTo(gridToBlender(160, 120, 0).z, 12);
  });

  it('the frustum covers exactly the canvas, centred', () => {
    // Medium window: scale 16 -> 2 CSS px per grid px, 688x528 CSS px
    const f = cameraFrustum(688, 528, 2);
    expect(f.right - f.left).toBeCloseTo(344 * METRES_PER_GRID_PX, 12);
    expect(f.top - f.bottom).toBeCloseTo(264 * METRES_PER_GRID_PX, 12);
    expect(f.left).toBeCloseTo(-f.right, 12);
  });

  it('scales the fish so it is drawn at the layout length', () => {
    // the mesh, scaled, spans FISH_DRAWN_LENGTH grid px through the bowl camera
    expect((FISH_MESH_LENGTH_M * fishScale()) / METRES_PER_GRID_PX).toBeCloseTo(FISH_DRAWN_LENGTH, 6);
    // and the body box is smaller than the drawn fish: the fins and tail overhang it, the body does not
    expect(FISH_BODY.w).toBeLessThan(FISH_DRAWN_LENGTH);
  });

  it('bounds the depth wander', () => {
    let max = 0;
    for (let s = 0; s < 3600; s += 0.25) max = Math.max(max, Math.abs(depthWander(s)));
    expect(max).toBeLessThanOrEqual(DEPTH_WANDER_MAX_M);
    expect(max).toBeGreaterThan(0.02); // it does wander
  });
});
