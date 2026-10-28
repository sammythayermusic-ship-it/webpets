// The bowl camera and the grid -> world mapping for the live renderer. Pure: no three.js, so it is
// unit-tested in node and the numbers can be checked against `assets/habitats/fish/bowl/geometry.json`,
// which was projected out of the same Blender camera.
//
// Coordinates are glTF / three.js world space: metres, +Y up, the camera on +Z looking toward -Z.
// Blender's (x, y, z) becomes (x, z, -y). `CAM_bowl` in Blender sits at (0, -1.18523, 0.27322), tilted
// 81 degrees from vertical (so it looks 9 degrees DOWN), orthographic, 0.43 m across the 1280 px frame.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** The bowl camera's basis. `forward` is the view direction; `right` and `up` span the image plane. */
export interface OrthoCamera {
  position: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
  /** Half the frame width / height in metres at the logical grid's full extent. */
  halfW: number;
  halfH: number;
}

/** Logical grid the behaviour speaks. Equals GRID_W x GRID_H in src/sim/constants.ts. */
export const GRID_W = 320;
export const GRID_H = 240;

/** Metres per LOGICAL grid px under the bowl camera: 0.43 m across 320 grid px (1280 art px). */
export const METRES_PER_GRID_PX = 0.43 / GRID_W;

const TILT_DOWN_DEG = 9;
const TILT = (TILT_DOWN_DEG * Math.PI) / 180;

export const BOWL_CAMERA: Readonly<OrthoCamera> = Object.freeze({
  position: Object.freeze({ x: 0, y: 0.27322137, z: 1.18522608 }),
  right: Object.freeze({ x: 1, y: 0, z: 0 }),
  up: Object.freeze({ x: 0, y: Math.cos(TILT), z: -Math.sin(TILT) }),
  forward: Object.freeze({ x: 0, y: -Math.sin(TILT), z: -Math.cos(TILT) }),
  halfW: 0.215,
  halfH: 0.16125,
});

/**
 * The inside of the glass as a sphere, for the depth budget. Centre and radius come from the glass
 * lathe (z 0..0.207 in Blender, outer radius 0.1153, wall 0.0045): the inner radius 0.111 at the waist
 * matches `geometry.json`'s `inner_radius_m`.
 */
export const BOWL_INNER_SPHERE = Object.freeze({ center: Object.freeze({ x: 0, y: 0.1035, z: 0 }), radius: 0.111 });

/**
 * How much smaller the fish is drawn than its Blender metres. The fish frames were rendered through
 * `CAM_fish` (0.16125 m across 320 px) and composited into the bowl's 1280 px frame (0.43 m), so a
 * Blender millimetre of fish covers 2/3 of a bowl millimetre on screen. Keeping that ratio keeps the
 * body box in `src/species/fish/layout.ts` true.
 */
export const FISH_SCALE = 0.43 / 1280 / (0.16125 / 320);

/** Grid px -> metres on the image plane, centred: +x right, +y up. */
export function gridToImagePlane(gx: number, gy: number): { cx: number; cy: number } {
  return { cx: (gx - GRID_W / 2) * METRES_PER_GRID_PX, cy: (GRID_H / 2 - gy) * METRES_PER_GRID_PX };
}

/**
 * The world point that projects to grid (gx, gy) and lies on the plane `z = depth`.
 *
 * `depth` 0 is the bowl's mid plane, where the fish frames were rendered; positive is toward the
 * camera. Every behaviour position maps here with a depth the renderer chooses.
 */
export function gridToWorld(gx: number, gy: number, depth: number, cam: OrthoCamera = BOWL_CAMERA): Vec3 {
  const { cx, cy } = gridToImagePlane(gx, gy);
  // P = C + cx*R + cy*U + t*F, solve P.z = depth.
  const baseZ = cam.position.z + cx * cam.right.z + cy * cam.up.z;
  const t = (depth - baseZ) / cam.forward.z;
  return {
    x: cam.position.x + cx * cam.right.x + cy * cam.up.x + t * cam.forward.x,
    y: cam.position.y + cx * cam.right.y + cy * cam.up.y + t * cam.forward.y,
    z: depth,
  };
}

/** Inverse of {@link gridToWorld} for any depth: where a world point lands on the grid. */
export function worldToGrid(p: Vec3, cam: OrthoCamera = BOWL_CAMERA): { gx: number; gy: number } {
  const dx = p.x - cam.position.x;
  const dy = p.y - cam.position.y;
  const dz = p.z - cam.position.z;
  const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  return { gx: cx / METRES_PER_GRID_PX + GRID_W / 2, gy: GRID_H / 2 - cy / METRES_PER_GRID_PX };
}

/**
 * How far toward or away from the camera a point on the mid plane may move and keep `margin`
 * metres of clearance from the inner glass. Zero when the point is already outside the sphere,
 * which the behaviour's own clamp makes impossible for a body centre; the margin is the body's
 * half depth plus a fin's reach.
 */
export function depthBudget(p: Vec3, margin: number, sphere = BOWL_INNER_SPHERE): number {
  const dx = p.x - sphere.center.x;
  const dy = p.y - sphere.center.y;
  const r = sphere.radius - margin;
  const room = r * r - dx * dx - dy * dy;
  return room <= 0 ? 0 : Math.sqrt(room);
}

/**
 * A slow, bounded depth wander. Pure step function so the renderer owns no hidden state beyond the
 * value and the target. Returns the next depth after `dtMs`, easing toward `target` and clamped to
 * the budget so a fish near the glass flattens onto the mid plane instead of poking through.
 */
export function stepDepth(depth: number, target: number, budget: number, dtMs: number): number {
  const ease = 1 - Math.exp(-dtMs / 1800);
  const next = depth + (target - depth) * ease;
  const clamped = Math.max(-budget, Math.min(budget, next));
  return clamped === 0 ? 0 : clamped; // never -0, which a strict test would read as a sign bug
}
