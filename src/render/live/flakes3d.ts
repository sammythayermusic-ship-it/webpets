// Food flakes for the live bowl. The physics are the same grid-px rules as src/render/food.ts (spawn
// at the surface, sink with a drift, settle on the gravel, dissolve), because the behaviour's bite
// range and the harness's expectations are tuned to them; only the drawing is new. Each flake is one
// instance of a small crumb mesh at a depth of its own, tumbling as it sinks.

import { Color, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, Quaternion, ShapeGeometry, Shape, Vector3, type Camera } from 'three';
import { gridToWorld, METRES_PER_GRID_PX } from './camera';
import type { Rng } from '../../sim/types';
import type { MoveBounds, WaterShape } from '../types';

export const FLAKES_PER_FEED = 6;
const SPAWN_SPREAD = 0.45;
const DISSOLVE_STEPS = 240;
const FADE_STEPS = 16;
const MAX_FLAKES = 48;
/** Depth jitter either side of the mid plane, metres. */
const DEPTH_SPREAD = 0.028;

interface Flake {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  depth: number;
  settled: boolean;
  age: number;
  tumble: Quaternion;
  spin: Quaternion;
  size: number;
}

export interface Flakes3D {
  readonly mesh: InstancedMesh;
  feed(rng: Rng): void;
  /** One 8 fps step; returns how many flakes dissolved. */
  step(rng: Rng): number;
  /** Place every instance `t` of the way through the step, facing the camera. */
  interpolate(t: number, dtMs: number, camera: Camera): void;
  positions(): Array<{ x: number; y: number }>;
  remove(index: number): void;
  count(): number;
  clear(): void;
  dispose(): void;
}

function crumbGeometry(): ShapeGeometry {
  // An irregular seven-sided crumb, 4 grid px across, so six flakes do not read as six dots.
  const r = 2 * METRES_PER_GRID_PX;
  const shape = new Shape();
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2;
    const rr = r * (0.75 + 0.3 * Math.sin(i * 2.7 + 1.1));
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new ShapeGeometry(shape);
}

export function createFlakes3D(water: WaterShape, bounds: MoveBounds): Flakes3D {
  const geometry = crumbGeometry();
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0, side: 2 });
  const mesh = new InstancedMesh(geometry, material, MAX_FLAKES);
  mesh.name = 'flakes';
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const flakes: Flake[] = [];
  const dummy = new Object3D();
  const zero = new Matrix4().makeScale(0, 0, 0);
  const tint = new Color();
  const camQ = new Quaternion();
  const up = new Vector3(0, 1, 0);

  const halfWidthAt = (y: number): number => {
    const dy = (y - water.cy) / water.ry;
    const t = 1 - dy * dy;
    return t <= 0 ? 0 : water.rx * Math.sqrt(t);
  };
  const restRow = bounds.floorY - 4;

  const place = (i: number, f: Flake, t: number, camera: Camera): void => {
    const gx = f.px + (f.x - f.px) * t;
    const gy = f.py + (f.y - f.py) * t;
    const p = gridToWorld(gx, gy, f.depth);
    const remaining = DISSOLVE_STEPS - f.age;
    const fade = remaining >= FADE_STEPS ? 1 : Math.max(0, remaining / FADE_STEPS);
    dummy.position.set(p.x, p.y, p.z);
    camera.getWorldQuaternion(camQ);
    dummy.quaternion.copy(camQ).multiply(f.tumble);
    dummy.scale.setScalar(f.size * (0.3 + 0.7 * fade));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };

  const rebuildColors = (): void => {
    for (let i = 0; i < flakes.length; i += 1) {
      const f = flakes[i];
      if (!f) continue;
      // Warm oranges, each a little different, like the Pixi crumb's palette.
      tint.setRGB(0.86 + 0.1 * (f.size - 0.9), 0.56 + 0.08 * Math.sin(f.depth * 90), 0.22);
      mesh.setColorAt(i, tint);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  return {
    mesh,
    feed(rng) {
      for (let i = 0; i < FLAKES_PER_FEED && flakes.length < MAX_FLAKES; i += 1) {
        const y = bounds.surfaceY + 2;
        const hw = Math.max(12, halfWidthAt(y + 4) * SPAWN_SPREAD);
        const x = water.cx + (rng() * 2 - 1) * hw;
        const axis = new Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
        flakes.push({
          x,
          y,
          px: x,
          py: y,
          vy: 1 + rng(),
          vx: (rng() - 0.5) * 0.8,
          depth: (rng() * 2 - 1) * DEPTH_SPREAD,
          settled: false,
          age: 0,
          tumble: new Quaternion().setFromAxisAngle(axis, rng() * Math.PI),
          spin: new Quaternion().setFromAxisAngle(axis.clone().cross(up).normalize(), 0.02 + rng() * 0.05),
          size: 0.8 + rng() * 0.5,
        });
      }
      mesh.count = flakes.length;
      rebuildColors();
    },
    step(rng) {
      let dissolved = 0;
      for (let i = flakes.length - 1; i >= 0; i -= 1) {
        const f = flakes[i];
        if (!f) continue;
        f.px = f.x;
        f.py = f.y;
        if (!f.settled) {
          if (rng() < 0.12) f.vx = (rng() - 0.5) * 0.8;
          const nx = f.x + f.vx;
          const ny = f.y + f.vy;
          f.y = Math.min(ny, restRow);
          f.x = bounds.inside(nx, f.y) ? nx : f.x;
          if (f.y >= restRow) f.settled = true;
        } else {
          f.age += 1;
          if (f.age >= DISSOLVE_STEPS) {
            flakes.splice(i, 1);
            dissolved += 1;
          }
        }
      }
      if (dissolved > 0) {
        mesh.count = flakes.length;
        rebuildColors();
      }
      return dissolved;
    },
    interpolate(t, dtMs, camera) {
      const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
      for (let i = 0; i < flakes.length; i += 1) {
        const f = flakes[i];
        if (!f) continue;
        if (!f.settled) {
          // A sinking flake tumbles; a settled one lies still.
          const k = Math.min(1, dtMs / 16);
          f.tumble.slerp(f.tumble.clone().multiply(f.spin), k);
        }
        place(i, f, clamped, camera);
      }
      for (let i = flakes.length; i < MAX_FLAKES; i += 1) mesh.setMatrixAt(i, zero);
      mesh.instanceMatrix.needsUpdate = true;
    },
    positions() {
      return flakes.map((f) => ({ x: Math.round(f.x), y: Math.round(f.y) }));
    },
    remove(index) {
      if (!flakes[index]) return;
      flakes.splice(index, 1);
      mesh.count = flakes.length;
      rebuildColors();
    },
    count() {
      return flakes.length;
    },
    clear() {
      flakes.length = 0;
      mesh.count = 0;
    },
    dispose() {
      flakes.length = 0;
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}
