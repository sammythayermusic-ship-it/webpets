// Candidate C: how the 2D behaviour's grid positions become 3D positions in the bowl, and how the
// bowl camera from `assets/3d/wp_scene.blend` (CAM_bowl) becomes a Three.js camera. Pure: no Three,
// no DOM, testable in node.
//
// Every number here is read off the scene, not tuned by eye. The camera is orthographic with
// `ortho_scale` 0.43 m across 1280 art px (= 320 grid px), pitched 9° down, and the plates were
// rendered through it, so a point placed by this mapping lands on the plate pixel the behaviour
// meant. `geometry.json` records the projections the mapping is checked against: the waterline's
// centre (267.2 art px) and the gravel top (556.5 art px) both come out of `projectToGrid` within a
// tenth of a grid px (see mapping.test.ts).
//
// Axes. Blender is Z-up; glTF (and therefore Three) is Y-up. The export converts (x, y, z)_blender
// to (x, z, -y)_gltf. "Depth" below is Blender y: 0 is the bowl's centre plane, negative is toward
// the viewer. The fish swims on a plane of constant depth plus a slow wander, which the behaviour
// never sees.

import { FISH_DRAWN_LENGTH } from '../../species/fish/layout';

/** Metres per grid px through CAM_bowl: ortho_scale / grid width. */
export const METRES_PER_GRID_PX = 0.43 / 320;

/** CAM_bowl's pitch below horizontal, radians (81° about X in Blender = 9° down). */
export const CAMERA_PITCH = (9 * Math.PI) / 180;

/** CAM_bowl's position in Blender coordinates, metres. */
const CAM_B = { x: 0, y: -1.185226, z: 0.273221 } as const;

/** Where the grid's centre pixel lands: the camera's optical axis. */
const GRID_CENTRE = { x: 160, y: 120 } as const;

/** A point in Blender's Z-up frame, metres. */
export interface BlenderPoint {
  x: number;
  y: number;
  z: number;
}

/** A point in glTF / Three's Y-up frame, metres. */
export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

export function blenderToWorld(p: BlenderPoint): WorldPoint {
  return { x: p.x, y: p.z, z: -p.y };
}

export function worldToBlender(p: WorldPoint): BlenderPoint {
  return { x: p.x, y: -p.z, z: p.y };
}

/**
 * The 3D point that CAM_bowl projects onto grid pixel (gx, gy), at Blender depth `depthY`.
 *
 * Solved on the camera ray: the ray through a pixel is `cam + right*u + up*v + look*t`, with
 * `u = (gx - 160) * k`, `v = -(gy - 120) * k`, and `t` chosen so the point's Blender y equals the
 * requested depth. Because it is solved per pixel the screen position is EXACT whatever the depth —
 * the depth wander moves the fish forward and back without moving it on screen, which is what lets a
 * 2D behaviour drive a 3D fish without re-tuning anything.
 */
export function gridToBlender(gx: number, gy: number, depthY: number): BlenderPoint {
  const k = METRES_PER_GRID_PX;
  const u = (gx - GRID_CENTRE.x) * k;
  const v = -(gy - GRID_CENTRE.y) * k;
  const cosP = Math.cos(CAMERA_PITCH);
  const sinP = Math.sin(CAMERA_PITCH);
  // look = (0, cos, -sin), up = (0, sin, cos), right = (1, 0, 0) in Blender's frame.
  const t = (depthY - CAM_B.y - sinP * v) / cosP;
  return {
    x: CAM_B.x + u,
    y: depthY,
    z: CAM_B.z + cosP * v - sinP * t,
  };
}

export function gridToWorld(gx: number, gy: number, depthY: number): WorldPoint {
  return blenderToWorld(gridToBlender(gx, gy, depthY));
}

/** The inverse: which grid pixel a Blender-frame point lands on. */
export function projectToGrid(p: BlenderPoint): { x: number; y: number } {
  const k = METRES_PER_GRID_PX;
  const cosP = Math.cos(CAMERA_PITCH);
  const sinP = Math.sin(CAMERA_PITCH);
  const dy = p.y - CAM_B.y;
  const dz = p.z - CAM_B.z;
  // Components along the camera's up vector (0, sin, cos) and right vector (1, 0, 0).
  const v = dy * sinP + dz * cosP;
  const u = p.x - CAM_B.x;
  return { x: GRID_CENTRE.x + u / k, y: GRID_CENTRE.y - v / k };
}

/**
 * Orthographic frustum, in metres, that covers a canvas of `wCss` x `hCss` CSS px drawn at
 * `cssPerGrid` CSS px per grid px (`scaleFactor(scale)`), centred on the grid's centre.
 *
 * The canvas is the whole window including WINDOW_PAD, so the frustum is wider than the grid by the
 * pad on each side; the pad is symmetric, so the centre stays on the optical axis.
 */
export function cameraFrustum(wCss: number, hCss: number, cssPerGrid: number): { left: number; right: number; top: number; bottom: number } {
  const halfW = (wCss / cssPerGrid / 2) * METRES_PER_GRID_PX;
  const halfH = (hCss / cssPerGrid / 2) * METRES_PER_GRID_PX;
  return { left: -halfW, right: halfW, top: halfH, bottom: -halfH };
}

/** CAM_bowl's pose for Three: position (Y-up) and the pitch to apply about X. */
export function cameraPose(): { position: WorldPoint; pitch: number } {
  return { position: blenderToWorld({ ...CAM_B }), pitch: -CAMERA_PITCH };
}

/**
 * Length of the exported goldfish, snout to tail-lobe tip, root space, metres (`length_m` in
 * assets/live/goldfish/rig.json, written by gf_build.py).
 */
export const FISH_MESH_LENGTH_M = 0.1228;

/** How long the fish is drawn, grid px: the fish layout's number, so the body box and the art agree. */
export const FISH_DRAWN_LENGTH_GRID = FISH_DRAWN_LENGTH;

/** Uniform scale applied to the fish root so the mesh spans FISH_DRAWN_LENGTH_GRID on screen. */
export function fishScale(): number {
  return (FISH_DRAWN_LENGTH_GRID * METRES_PER_GRID_PX) / FISH_MESH_LENGTH_M;
}

/**
 * The slow depth wander, Blender y in metres, as a function of time in seconds.
 *
 * Two incommensurate sines so it never visibly repeats, bounded well inside the water (inner radius
 * 0.111 m): at ±0.028 m the fish stays clear of the back glass with its fins. Pure so it is testable.
 */
export function depthWander(seconds: number): number {
  return 0.018 * Math.sin(seconds * 0.11) + 0.01 * Math.sin(seconds * 0.037 + 1.3);
}

/** Bounds the depth wander must respect, for the test and for anyone retuning it. */
export const DEPTH_WANDER_MAX_M = 0.03;
