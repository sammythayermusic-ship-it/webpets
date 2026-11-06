// Candidate C's live layer: the fish and the water, drawn with Three.js in the SAME WebGL2 context
// as the Pixi plates, between the back plates and the front glass.
//
// Per frame the scene does: Pixi draws the back half of the stack (clear) -> this layer draws
// (Three's state reset, fish to a render target, then one full-canvas water pass into the default
// framebuffer) -> Pixi resets its state and draws the front half (no clear). One canvas, so the
// harness's `record` and `snapshot` see the whole picture and the window stays one transparent
// surface for click-through.
//
// The water is not a mesh. It is a screen-space pass that knows the water's ellipses in grid px and
// re-samples the back plate AND the fish render target through the same lens-plus-ripple
// distortion, which is what makes the fish read as inside the bowl: the baked front glass was
// rendered empty, so the refraction the water would have given the gravel is applied here, to both.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ManifestHabitat, ScenePhase } from '../types';
import { createFishUniforms, loadFishModel, type FishModel, type FishPart } from './fishModel';
import { METRES_PER_GRID_PX, cameraFrustum, cameraPose, depthWander, fishScale, gridToWorld } from './mapping';
import { FISH_MOUTH_AHEAD } from '../../species/fish/layout';
import { createSpine, type FacingSign, type Spine, type SpineState } from './spine';
import { WATER_FRAGMENT, WATER_VERTEX } from './shaders';
import { PURE_DAY, type Daylight } from '../../sim/daylight';

/** Quality tiers: `lean` halves the fish render target and dims the shafts/caustics. */
export type LiveTier = 'full' | 'lean';

/**
 * How much of the desk the water hides where there is nothing behind it but the back of the bowl, by
 * day (more at depth, at the glass's edge and at night; see the water pass). Below 1 the bowl is
 * glass you can see through, as real glass and water are; high enough that the water stays blue.
 */
export const WALL_ALPHA = 0.5;

export interface LiveLayerOptions {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  habitat: ManifestHabitat;
  /**
   * The plates the water pass samples, straight alpha: the bg plate (day, night), the near decor
   * (day, night) drawn over the fish, and the contents mask (see LiveSpec.contents). A missing night
   * falls back to day; a missing decor means Pixi keeps drawing it; a missing mask means the whole
   * plate is treated as a thing.
   */
  plates: {
    day: ImageBitmap;
    night: ImageBitmap | null;
    decorDay: ImageBitmap | null;
    decorNight: ImageBitmap | null;
    contents: ImageBitmap | null;
    /** Step 3: the dawn and dusk sets (a missing one falls back to day) and the plant mask. */
    dawn?: ImageBitmap | null;
    dusk?: ImageBitmap | null;
    decorDawn?: ImageBitmap | null;
    decorDusk?: ImageBitmap | null;
    plants?: ImageBitmap | null;
  };
  rng: () => number;
}

/** A flake or a bubble, where Pixi's physics put it this frame: grid px, and its fade. */
export interface LiveParticle {
  x: number;
  y: number;
  alpha: number;
  /** A flake's colour (0xRRGGBB, sRGB) and spin, radians; bubbles leave them unset. */
  tint?: number;
  rot?: number;
}

export interface LiveLayer {
  /** Resolves once the fish is loaded; the water draws from the first frame regardless. */
  readonly ready: Promise<void>;
  resize(wCss: number, hCss: number, dpr: number, cssPerGrid: number): void;
  /**
   * Called every rendered frame with the interpolated pose, the behaviour's act (PetAct: hover, peck,
   * mouthful, spit, gulp, look, rest) and the fish's spirits (0.5 unwell .. 1.2 excited).
   */
  setPose(x: number, y: number, facing: FacingSign, anim: string, act?: string, spirits?: number): void;
  /** Snap: first placement or a new pet. */
  resetPose(x: number, y: number, facing: FacingSign): void;
  setPhase(phase: ScenePhase): void;
  setNight(t: number): void;
  /** Time of day as the four weights, already eased by the caller (the layer stack). */
  setDaylight(w: Daylight): void;
  /** 0 clear .. 1 dirty: where the water is heading; it clouds over ~20 s and clears over ~40 s. */
  setMurk(target: number): void;
  /** The water's current cloudiness, for the debug state. */
  murk(): number;
  setPointer(gx: number | null, gy: number | null): void;
  setParallax(dx: number, dy: number): void;
  setTier(tier: LiveTier): void;
  tier(): LiveTier;
  /** A knock on the glass at grid (gx, gy): a ring runs out across the water from there. */
  tap(gx: number, gy: number): void;
  /**
   * The flakes and bubbles to draw this frame. They are drawn INSIDE the water (into the fish's
   * render target), so the water bends and tints them exactly as it does the fish; Pixi keeps their
   * physics and hides its own sprites.
   */
  setParticles(flakes: readonly LiveParticle[], bubbles: readonly LiveParticle[]): void;
  /** Food landing on the surface at grid x: a flat ring across the water and a fizz of tiny bubbles. */
  splash(gx: number, strength?: number): void;
  /** A gulp at grid (gx, gy): a few small bubbles out of the gills, rising and fading. */
  puff(gx: number, gy: number): void;
  /** Advance the clocks by `dtMs` and draw. The caller has already drawn the back plates. */
  render(dtMs: number): void;
  spineState(): SpineState;
  destroy(): void;
}

/** The three lights of wp_scene.blend's rig, as directions in Three's Y-up frame (from Blender x, z, -y). */
export const KEY_DIR = new THREE.Vector3(-0.34, 1.3, 0.4).normalize();
export const FILL_DIR = new THREE.Vector3(0.78, 0.16, 0.62).normalize();
export const RIM_DIR = new THREE.Vector3(0.3, 0.8, -0.95).normalize();

export interface RigColours {
  key: [THREE.Color, number];
  fill: [THREE.Color, number];
  rim: [THREE.Color, number];
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemi: number;
  env: number;
}

export const DAY: RigColours = {
  key: [new THREE.Color(1.0, 0.9, 0.78), 2.6],
  fill: [new THREE.Color(0.64, 0.78, 1.0), 0.9],
  rim: [new THREE.Color(1.0, 0.76, 0.55), 1.6],
  hemiSky: new THREE.Color(0.55, 0.8, 0.95),
  hemiGround: new THREE.Color(0.5, 0.42, 0.3),
  hemi: 0.75,
  env: 0.55,
};

// Moonlight, but the fish must still read as a goldfish: the key keeps a little warmth and enough
// strength that the orange survives, the rim does the cold blue work.
export const NIGHT: RigColours = {
  key: [new THREE.Color(0.8, 0.84, 1.0), 1.1],
  fill: [new THREE.Color(0.45, 0.5, 1.0), 0.35],
  rim: [new THREE.Color(0.5, 0.8, 1.0), 1.4],
  hemiSky: new THREE.Color(0.25, 0.34, 0.6),
  hemiGround: new THREE.Color(0.1, 0.09, 0.14),
  hemi: 0.45,
  env: 0.22,
};

// Dawn and dusk, as c_plates.py lights the plates: a low warm key that has moved -- to the right and
// front in the morning, to the left and behind in the evening -- a cool or violet fill, a dim sky.
export const DAWN: RigColours = {
  key: [new THREE.Color(1.0, 0.74, 0.56), 1.9],
  fill: [new THREE.Color(0.55, 0.7, 1.0), 0.5],
  rim: [new THREE.Color(0.6, 0.78, 1.0), 0.9],
  hemiSky: new THREE.Color(0.62, 0.66, 0.82),
  hemiGround: new THREE.Color(0.45, 0.36, 0.3),
  hemi: 0.5,
  env: 0.34,
};
export const DUSK: RigColours = {
  key: [new THREE.Color(1.0, 0.58, 0.32), 2.1],
  fill: [new THREE.Color(0.62, 0.52, 0.95), 0.45],
  rim: [new THREE.Color(1.0, 0.62, 0.4), 1.8],
  hemiSky: new THREE.Color(0.72, 0.58, 0.55),
  hemiGround: new THREE.Color(0.42, 0.3, 0.22),
  hemi: 0.45,
  env: 0.3,
};
/** Where the key comes from at dawn and dusk, from c_plates.py's light positions (Blender x, z, -y). */
export const KEY_DIR_DAWN = new THREE.Vector3(1.05, 0.05, 0.55).normalize();
export const KEY_DIR_DUSK = new THREE.Vector3(-1.0, 0.03, -0.35).normalize();


/**
 * The plant mask at grid resolution, as one channel: coverage times height up the blade, box-blurred
 * twice by two grid px so the displacement field fades out around a blade instead of stopping at its
 * edge (a field that stops at the edge tears the blade off the water behind it).
 */
export function plantWeights(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  let a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) a[i] = (rgba[i * 4] ?? 0) / 255;
  const r = 2;
  for (let pass = 0; pass < 2; pass += 1) {
    const b = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let sum = 0;
        let n = 0;
        for (let dx = -r; dx <= r; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += a[y * w + xx] ?? 0;
          n += 1;
        }
        b[y * w + x] = sum / n;
      }
    }
    const c = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let sum = 0;
        let n = 0;
        for (let dy = -r; dy <= r; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          sum += b[yy * w + x] ?? 0;
          n += 1;
        }
        c[y * w + x] = sum / n;
      }
    }
    a = c;
  }
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    const v = Math.round(Math.min(1, (a[i] ?? 0) * 1.6) * 255);
    out[i * 4] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

function plantMaskTexture(bmp: ImageBitmap, grid: readonly [number, number]): THREE.DataTexture {
  const [w, h] = grid;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  const data = new Uint8Array(w * h * 4);
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    data.set(plantWeights(ctx.getImageData(0, 0, w, h).data, w, h));
  }
  const t = new THREE.DataTexture(data, w, h);
  t.flipY = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export function createLiveLayer(opts: LiveLayerOptions): LiveLayer {
  const { gl, canvas, habitat } = opts;
  // Pixi leaves the unpack flags set for its own uploads; Three assumes the defaults when it creates
  // its empty 3D placeholder textures, which WebGL refuses with those flags on.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, premultipliedAlpha: true, antialias: false });
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;

  // ---- fish scene --------------------------------------------------------------------------------
  const fishScene = new THREE.Scene();
  const pose = cameraPose();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 6);
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.rotation.set(pose.pitch, 0, 0);
  camera.updateMatrixWorld(true);
  const key = new THREE.DirectionalLight(DAY.key[0], DAY.key[1]);
  key.position.copy(KEY_DIR);
  const fill = new THREE.DirectionalLight(DAY.fill[0], DAY.fill[1]);
  fill.position.copy(FILL_DIR);
  const rim = new THREE.DirectionalLight(DAY.rim[0], DAY.rim[1]);
  rim.position.copy(RIM_DIR);
  const hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemi);
  fishScene.add(key, fill, rim, hemi);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  fishScene.environment = envTex;
  fishScene.environmentIntensity = DAY.env;

  const root = new THREE.Group();
  root.visible = false;
  fishScene.add(root);
  const parts: FishPart[] = [];
  let model: FishModel | null = null;
  const spine: Spine = createSpine();
  const rootInv = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const unscale = new THREE.Matrix4();
  const keyView = new THREE.Vector3();
  const sharedUniforms = createFishUniforms();

  const ready = loadFishModel(renderer, sharedUniforms).then((m) => {
    model = m;
    // The spine owns every rotation; the rig's empties stay at rest and only carry offsets.
    m.root.scale.setScalar(fishScale());
    const tailHinge = m.root.getObjectByName('RIG_fish_tail');
    if (tailHinge) tailHinge.rotation.set(0, 0, 0);
    parts.push(...m.parts);
    root.add(m.root);
    root.visible = phase !== 'memorial';
  });

  // ---- flakes and bubbles, inside the water ------------------------------------------------------
  const spriteTexture = (size: number, paint: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    if (ctx) paint(ctx, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  // A food flake: an irregular, lit crumb, darker at its rim.
  const flakeTex = spriteTexture(48, (ctx, n) => {
    ctx.translate(n / 2, n / 2);
    ctx.beginPath();
    for (let i = 0; i <= 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      const r = n * 0.36 * (1 + 0.18 * Math.sin(a * 3 + 0.7) + 0.08 * Math.sin(a * 7));
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = ctx.createRadialGradient(-n * 0.1, -n * 0.12, n * 0.02, 0, 0, n * 0.42);
    // neutral and lit, so each flake's tint gives it its colour
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, '#e2ddd6');
    g.addColorStop(1, '#9f958a');
    ctx.fillStyle = g;
    ctx.fill();
  });
  // A bubble: a bright rim, a nearly clear middle, one highlight.
  const bubbleTex = spriteTexture(48, (ctx, n) => {
    const c = n / 2;
    const rim = ctx.createRadialGradient(c, c, n * 0.30, c, c, n * 0.47);
    rim.addColorStop(0, 'rgba(255,255,255,0.06)');
    rim.addColorStop(0.7, 'rgba(235,250,255,0.55)');
    rim.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(c, c, n * 0.47, 0, Math.PI * 2);
    ctx.fill();
    const hi = ctx.createRadialGradient(c - n * 0.14, c - n * 0.15, 0, c - n * 0.14, c - n * 0.15, n * 0.12);
    hi.addColorStop(0, 'rgba(255,255,255,0.95)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hi;
    ctx.fillRect(0, 0, n, n);
  });
  const makePool = (tex: THREE.Texture, count: number, gridSize: number): THREE.Sprite[] =>
    Array.from({ length: count }, (_, i) => {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, rotation: i * 2.399 });
      const sp = new THREE.Sprite(mat);
      sp.scale.setScalar(gridSize * METRES_PER_GRID_PX);
      sp.visible = false;
      sp.renderOrder = 2;
      fishScene.add(sp);
      return sp;
    });
  const flakePool = makePool(flakeTex, 12, 5.2);
  const bubblePool = makePool(bubbleTex, 8, 6);
  // Puffs: the small bubbles of a gulp or a splash, owned here (Pixi's bubbles are the ambient ones).
  const PUFF_LIFE_S = 1.4;
  const puffPool = makePool(bubbleTex, 14, 2.6);
  const puffs = puffPool.map(() => ({ x: 0, y: 0, age: PUFF_LIFE_S, vx: 0, phase: 0, size: 1 }));
  let puffNext = 0;
  const spawnPuffs = (gx: number, gy: number, n: number, spread: number): void => {
    for (let i = 0; i < n; i += 1) {
      const p = puffs[puffNext % puffs.length];
      puffNext += 1;
      if (!p) continue;
      p.x = gx + (opts.rng() * 2 - 1) * spread;
      p.y = gy + (opts.rng() * 2 - 1) * 1.5;
      p.age = -i * 0.07;
      p.vx = (opts.rng() * 2 - 1) * 3;
      p.phase = opts.rng() * 6.28;
      p.size = 0.7 + opts.rng() * 0.6;
    }
  };
  const updatePuffs = (dt: number, fishDepth: number): void => {
    for (let i = 0; i < puffs.length; i += 1) {
      const p = puffs[i]!;
      const sp = puffPool[i]!;
      p.age += dt;
      const live = p.age >= 0 && p.age < PUFF_LIFE_S;
      sp.visible = live;
      if (!live) continue;
      // rise, quickening, with a wobble; fade in fast and out slowly
      p.y -= (8 + 16 * p.age) * dt;
      p.x += (p.vx + Math.sin(p.phase + p.age * 9) * 4) * dt;
      p.vx *= 0.96;
      if (p.y < habitat.waterShape.surfaceY + 1) p.age = PUFF_LIFE_S;
      const w = gridToWorld(p.x, p.y, fishDepth - 0.004);
      sp.position.set(w.x, w.y, w.z);
      sp.scale.setScalar(2.6 * p.size * METRES_PER_GRID_PX);
      sp.material.opacity = Math.min(1, p.age / 0.12) * (1 - p.age / PUFF_LIFE_S) * 0.9;
      sp.material.color.copy(bubbleTint);
    }
  };
  // Bubbles rise at different depths, some in front of the fish and some behind it.
  const BUBBLE_DEPTHS = [-0.022, 0.016, -0.006, 0.026, -0.014, 0.008, -0.026, 0.02];
  let flakeList: readonly LiveParticle[] = [];
  let bubbleList: readonly LiveParticle[] = [];
  const bubbleTint = new THREE.Color();
  const placeParticles = (fishDepth: number): void => {
    for (let i = 0; i < flakePool.length; i += 1) {
      const sp = flakePool[i]!;
      const f = flakeList[i];
      sp.visible = f !== undefined && f.alpha > 0.01;
      if (!f || !sp.visible) continue;
      // just in front of the fish's plane: it swims up to a flake and takes it
      const w = gridToWorld(f.x, f.y, fishDepth - 0.006);
      sp.position.set(w.x, w.y, w.z);
      sp.material.opacity = f.alpha;
      if (f.tint !== undefined) sp.material.color.setHex(f.tint);
      if (f.rot !== undefined) sp.material.rotation = f.rot;
    }
    // moonlight: bubbles catch less of it
    bubbleTint.setRGB(1 - 0.45 * nightT, 1 - 0.38 * nightT, 1 - 0.2 * nightT);
    for (let i = 0; i < bubblePool.length; i += 1) {
      const sp = bubblePool[i]!;
      const b = bubbleList[i];
      sp.visible = b !== undefined && b.alpha > 0.01;
      if (!b || !sp.visible) continue;
      const w = gridToWorld(b.x, b.y, BUBBLE_DEPTHS[i % BUBBLE_DEPTHS.length]!);
      sp.position.set(w.x, w.y, w.z);
      sp.material.opacity = b.alpha;
      sp.material.color.copy(bubbleTint);
    }
  };

  // ---- the pebble it picks up and spits out, and the ring of a gulp --------------------------------
  // Sizes in grid px through the bowl camera; the gravel's own pebbles are about this big.
  const PEBBLE_R = 1.7 * METRES_PER_GRID_PX;
  const PEBBLE_COLOURS = [0x7aa6e0, 0xe59a8a, 0xb38ad8, 0x6fc9b8, 0xf0d9a8, 0xe8a36a];
  const pebble = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0 }));
  pebble.scale.set(PEBBLE_R, PEBBLE_R * 0.78, PEBBLE_R * 0.9);
  pebble.visible = false;
  pebble.renderOrder = 2;
  fishScene.add(pebble);
  let pebbleState: 'none' | 'held' | 'falling' | 'resting' = 'none';
  let pebbleClock = 0;
  const pebbleVel = new THREE.Vector3();
  const mouthAt = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const rootQuat = new THREE.Quaternion();
  let poseAct = '';
  let poseSpirits = 1;
  let propAct = '';
  /** World height of the gravel under a world point, at that point's depth. */
  const bedY = (p: THREE.Vector3): number => {
    const gx = habitat.grid[0] / 2 + p.x / METRES_PER_GRID_PX;
    return gridToWorld(gx, habitat.waterShape.floorY + 2, -p.z).y + PEBBLE_R * 0.5;
  };
  const updateProps = (dt: number, mouthOpen: number): void => {
    const m = model?.mouth;
    if (m) {
      m.object.getWorldPosition(mouthAt);
      (model?.root ?? root).getWorldQuaternion(rootQuat);
      forward.set(1, 0, 0).applyQuaternion(rootQuat);
    }
    if (poseAct !== propAct) {
      if (poseAct === 'mouthful' && pebbleState !== 'held') {
        pebbleState = 'held';
        pebble.material.color.setHex(PEBBLE_COLOURS[Math.floor(opts.rng() * PEBBLE_COLOURS.length)] ?? 0xf0d9a8);
        pebble.visible = true;
      } else if (pebbleState === 'held' && poseAct !== 'mouthful') {
        // spat out: forward and a little up, then it sinks; dropped (anything else) it just sinks
        pebbleState = 'falling';
        pebbleVel.copy(forward).multiplyScalar(poseAct === 'spit' ? 0.05 : 0.008);
        pebbleVel.y += poseAct === 'spit' ? 0.012 : 0;
      }
      if (poseAct === 'gulp') {
        // the lips break the surface: a small ring, and a bubble let go
        splashAt(px + facing * FISH_MOUTH_AHEAD, 0.4);
        spawnPuffs(px + facing * (FISH_MOUTH_AHEAD - 3), py - 2, 1, 1);
      }
      propAct = poseAct;
    }
    if (pebbleState === 'held') {
      pebble.position.copy(mouthAt).addScaledVector(forward, PEBBLE_R * (0.6 + 0.4 * mouthOpen));
    } else if (pebbleState === 'falling') {
      pebbleVel.y -= 0.09 * dt;
      pebbleVel.multiplyScalar(Math.exp(-2.4 * dt));
      pebble.position.addScaledVector(pebbleVel, dt);
      const floor = bedY(pebble.position);
      if (pebble.position.y <= floor) {
        pebble.position.y = floor;
        pebbleState = 'resting';
        pebbleClock = 0;
      }
    } else if (pebbleState === 'resting') {
      // back among the others: it settles in over a second and a half
      pebbleClock += dt;
      const k = Math.max(0, 1 - pebbleClock / 1.5);
      pebble.scale.set(PEBBLE_R * k, PEBBLE_R * 0.78 * k, PEBBLE_R * 0.9 * k);
      if (k <= 0) {
        pebbleState = 'none';
        pebble.visible = false;
        pebble.scale.set(PEBBLE_R, PEBBLE_R * 0.78, PEBBLE_R * 0.9);
      }
    }
  };
  // set below, once the water uniforms exist
  let splashAt: (gx: number, strength: number) => void = () => undefined;

  // ---- water pass --------------------------------------------------------------------------------
  const plateTexture = (bmp: ImageBitmap): THREE.Texture => {
    const t = new THREE.Texture(bmp);
    t.flipY = false;
    t.premultiplyAlpha = false;
    t.colorSpace = THREE.NoColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  };
  const bgDay = plateTexture(opts.plates.day);
  const bgNight = opts.plates.night ? plateTexture(opts.plates.night) : bgDay;
  // No decor plate: a 1x1 clear texture, so the shader's composite is a no-op and Pixi draws it.
  const clear = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  clear.needsUpdate = true;
  const decorDay = opts.plates.decorDay ? plateTexture(opts.plates.decorDay) : clear;
  const decorNight = opts.plates.decorNight ? plateTexture(opts.plates.decorNight) : decorDay;
  const bgDawn = opts.plates.dawn ? plateTexture(opts.plates.dawn) : bgDay;
  const bgDusk = opts.plates.dusk ? plateTexture(opts.plates.dusk) : bgDay;
  const decorDawn = opts.plates.decorDawn ? plateTexture(opts.plates.decorDawn) : decorDay;
  const decorDusk = opts.plates.decorDusk ? plateTexture(opts.plates.decorDusk) : decorDay;
  const plantsTex = opts.plates.plants ? plantMaskTexture(opts.plates.plants, habitat.grid) : null;
  // No mask: a 1x1 white texture, every plate pixel is a thing.
  const solid = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  solid.needsUpdate = true;
  const contents = opts.plates.contents ? plateTexture(opts.plates.contents) : solid;

  const ws = habitat.waterShape;
  // The waterline ellipse: its near edge is `surfaceY` (the row the behaviour clamps to) and its
  // far edge sits 22 grid px higher on screen (see src/species/fish/layout.ts); its half-width is
  // the inner radius at the waterline, a hair inside the glass ellipse.
  const surfaceRy = 11.1;
  const surface = new THREE.Vector4(ws.cx, ws.surfaceY - surfaceRy, ws.rx * 0.94, surfaceRy);
  const inner = new THREE.Vector4(ws.cx, ws.cy, ws.rx + 0.5, ws.ry + 0.5);

  let rt = new THREE.WebGLRenderTarget(2, 2, {
    depthBuffer: true,
    stencilBuffer: false,
    samples: 4,
    colorSpace: THREE.SRGBColorSpace,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const waterUniforms = {
    uBg: { value: bgDay },
    uBgNight: { value: bgNight },
    uDecor: { value: decorDay },
    uDecorNight: { value: decorNight },
    uBgDawn: { value: bgDawn },
    uBgDusk: { value: bgDusk },
    uDecorDawn: { value: decorDawn },
    uDecorDusk: { value: decorDusk },
    uLight: { value: new THREE.Vector4(0, 1, 0, 0) },
    uPlants: { value: plantsTex ?? clear },
    uPlantK: { value: plantsTex ? 1 : 0 },
    uFishPos: { value: new THREE.Vector2(habitat.petAnchor[0], habitat.petAnchor[1]) },
    uFishBend: { value: 0 },
    uMurk: { value: 0 },
    uContents: { value: contents },
    uFish: { value: rt.texture },
    uCanvasCss: { value: new THREE.Vector2(1, 1) },
    uDpr: { value: 1 },
    uPad: { value: 0 },
    uCssPerGrid: { value: 1 },
    uGrid: { value: new THREE.Vector2(habitat.grid[0], habitat.grid[1]) },
    uInner: { value: inner },
    uSurface: { value: surface },
    uFloorY: { value: ws.floorY },
    uNight: { value: 0 },
    uTime: { value: 0 },
    uTier: { value: 1 },
    uRipple: { value: 1.1 },
    uPhase: { value: 1 },
    uPointer: { value: new THREE.Vector2(-1e4, -1e4) },
    uParallax: { value: new THREE.Vector2(0, 0) },
    uTaps: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -1e4, 0)) },
    uWallAlpha: { value: WALL_ALPHA },
  };
  let tapSlot = 0;
  splashAt = (gx, strength) => {
    const slot = waterUniforms.uTaps.value[tapSlot % 4];
    if (slot) slot.set(gx, surface.y, clock, strength);
    tapSlot += 1;
  };
  const waterMat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    uniforms: waterUniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const waterScene = new THREE.Scene();
  const waterQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), waterMat);
  waterQuad.frustumCulled = false;
  waterScene.add(waterQuad);
  const waterCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // ---- state -------------------------------------------------------------------------------------
  let phase: ScenePhase = 'alive';
  let nightT = 0;
  let light: Daylight = PURE_DAY;
  let murkT = 0;
  let murkTarget = 0;
  let lastPx: number | null = null;
  let lastPy = 0;
  let bend = 0;
  let tier: LiveTier = 'full';
  let wCss = 1;
  let hCss = 1;
  let dpr = 1;
  let cssPerGrid = 1;
  let clock = 0;
  let px = habitat.petAnchor[0];
  let py = habitat.petAnchor[1];
  let facing: FacingSign = 1;
  let anim = 'idle';
  let depth = 0;
  let depthEase = 0;

  const uPhaseAlive = (): number => (phase === 'alive' ? 1 : 0);
  const keyDir = new THREE.Vector3();
  /** The rig as the weighted blend of the four, and the key's direction swung with it. */
  const applyLight = (): void => {
    const rigs: Array<[RigColours, number]> = [
      [DAWN, light.dawn],
      [DAY, light.day],
      [DUSK, light.dusk],
      [NIGHT, light.night],
    ];
    const blend = (pick: (r: RigColours) => [THREE.Color, number], out: THREE.Color): number => {
      out.setRGB(0, 0, 0);
      let sum = 0;
      for (const [r, w] of rigs) {
        const [c, i] = pick(r);
        out.r += c.r * i * w;
        out.g += c.g * i * w;
        out.b += c.b * i * w;
        sum += i * w;
      }
      if (sum > 1e-6) out.multiplyScalar(1 / sum);
      return sum;
    };
    key.intensity = blend((r) => r.key, key.color);
    fill.intensity = blend((r) => r.fill, fill.color);
    rim.intensity = blend((r) => r.rim, rim.color);
    hemi.intensity = blend((r) => [r.hemiSky, r.hemi], hemi.color);
    blend((r) => [r.hemiGround, r.hemi], hemi.groundColor);
    fishScene.environmentIntensity = rigs.reduce((a, [r, w]) => a + r.env * w, 0);
    keyDir
      .set(0, 0, 0)
      .addScaledVector(KEY_DIR_DAWN, light.dawn)
      .addScaledVector(KEY_DIR, light.day + light.night)
      .addScaledVector(KEY_DIR_DUSK, light.dusk);
    if (keyDir.lengthSq() < 1e-6) keyDir.copy(KEY_DIR);
    key.position.copy(keyDir.normalize());
    nightT = light.night;
    waterUniforms.uNight.value = nightT;
    waterUniforms.uLight.value.set(light.dawn, light.day, light.dusk, light.night);
  };
  const applyNight = applyLight;

  const resizeTarget = (): void => {
    const k = tier === 'full' ? 1 : 0.5;
    const w = Math.max(2, Math.round(wCss * dpr * k));
    const h = Math.max(2, Math.round(hCss * dpr * k));
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    waterUniforms.uFish.value = rt.texture;
    waterUniforms.uTier.value = tier === 'full' ? 1 : 0;
  };

  const layer: LiveLayer = {
    ready,
    resize(w, h, d, cpg) {
      wCss = w;
      hCss = h;
      dpr = d;
      cssPerGrid = cpg;
      renderer.setPixelRatio(dpr);
      renderer.setSize(wCss, hCss, false);
      const f = cameraFrustum(wCss, hCss, cssPerGrid);
      camera.left = f.left;
      camera.right = f.right;
      camera.top = f.top;
      camera.bottom = f.bottom;
      camera.updateProjectionMatrix();
      waterUniforms.uCanvasCss.value.set(wCss, hCss);
      waterUniforms.uDpr.value = dpr;
      waterUniforms.uCssPerGrid.value = cssPerGrid;
      resizeTarget();
    },
    setPose(x, y, f, a, act, spirits) {
      px = x;
      py = y;
      facing = f;
      anim = a;
      poseAct = act ?? '';
      poseSpirits = spirits ?? 1;
    },
    resetPose(x, y, f) {
      px = x;
      py = y;
      facing = f;
      spine.reset(x, y, f);
    },
    setPhase(p) {
      phase = p;
      root.visible = p !== 'memorial' && parts.length > 0;
      waterUniforms.uPhase.value = p === 'alive' ? 1 : 0.3;
      waterQuad.visible = p !== 'memorial';
    },
    setDaylight(w) {
      if (w.dawn === light.dawn && w.day === light.day && w.dusk === light.dusk && w.night === light.night) return;
      light = w;
      applyLight();
    },
    setMurk(target) {
      murkTarget = Math.max(0, Math.min(1, target));
    },
    murk: () => murkT,
    setNight(t) {
      if (t === nightT && light.dawn === 0 && light.dusk === 0) return;
      light = { dawn: 0, day: 1 - t, dusk: 0, night: t };
      applyNight();
    },
    setPointer(gx, gy) {
      if (gx === null || gy === null) waterUniforms.uPointer.value.set(-1e4, -1e4);
      else waterUniforms.uPointer.value.set(gx, gy);
    },
    setParallax(dx, dy) {
      waterUniforms.uParallax.value.set(dx, dy);
    },
    setTier(t) {
      if (t === tier) return;
      tier = t;
      resizeTarget();
    },
    tier: () => tier,
    tap(gx, gy) {
      const slot = waterUniforms.uTaps.value[tapSlot % 4];
      if (slot) slot.set(gx, gy, clock, 0);
      tapSlot += 1;
    },
    splash(gx, strength = 1) {
      // the ring is centred on the surface ellipse's middle row, where the pinch lands in depth
      const slot = waterUniforms.uTaps.value[tapSlot % 4];
      if (slot) slot.set(gx, surface.y, clock, strength);
      tapSlot += 1;
      if (strength >= 0.8) spawnPuffs(gx, habitat.waterShape.surfaceY + 10, 5, 6);
    },
    puff(gx, gy) {
      spawnPuffs(gx, gy, 3, 1.5);
    },
    setParticles(f, b) {
      flakeList = f;
      bubbleList = b;
    },
    render(dtMs) {
      clock += dtMs / 1000;
      // Dirty water clouds over ~20 s and clears over ~40 s after a feed.
      const tau = murkTarget > murkT ? 7000 : 14000;
      murkT += (murkTarget - murkT) * (1 - Math.exp(-dtMs / tau));
      waterUniforms.uMurk.value = murkT;
      // The fish's push on the plants follows its speed, eased so a turn does not flick them.
      if (lastPx !== null && dtMs > 0) {
        const v = Math.hypot(px - lastPx, py - lastPy) / (dtMs / 1000);
        bend += (Math.min(1, v / 26) - bend) * (1 - Math.exp(-dtMs / 350));
      }
      lastPx = px;
      lastPy = py;
      waterUniforms.uFishPos.value.set(px, py);
      waterUniforms.uFishBend.value = bend * uPhaseAlive();
      sharedUniforms.uTime.value = clock;
      waterUniforms.uTime.value = clock;
      // WINDOW_PAD lives in the scene; it is handed over through resize's cssPerGrid and the pad
      // uniform set below from the canvas size, so the water needs no import from sim constants.
      waterUniforms.uPad.value = (wCss - habitat.grid[0] * cssPerGrid) / 2;

      sharedUniforms.uMute.value = 0.2 * nightT;
      if (parts.length > 0 && root.visible) {
        const s = spine.update({ dtMs, x: px, y: py, facing, anim, rng: opts.rng, act: poseAct, spirits: poseSpirits });
        sharedUniforms.uScull.value = s.scull;
        sharedUniforms.uSpread.value = s.spread;
        // depth: the slow wander, eased so a reset does not pop
        depth = depthWander(clock);
        depthEase += (depth - depthEase) * Math.min(1, dtMs / 400);
        const w = gridToWorld(px, py, depthEase);
        root.position.set(w.x, w.y, w.z);
        root.rotation.set(s.roll, s.yaw, s.pitch, 'YZX');
        if (s.sway > 0) root.position.y += s.sway * 0.6 * Math.sin(clock * 0.8);
        root.updateMatrixWorld(true);
        rootInv.copy(root.matrixWorld).invert();
        sharedUniforms.uAmp.value = s.amp;
        sharedUniforms.uK.value = s.k;
        sharedUniforms.uPhase.value = s.phase;
        sharedUniforms.uTurn.value = s.turn;
        sharedUniforms.uSway.value = s.sway;
        sharedUniforms.uFlutter.value = s.flutter;
        const mouth = model?.mouth;
        if (mouth) {
          // a goldfish pushes its lips forward as it opens them
          mouth.object.position.set(mouth.base.x + 0.0005 * s.mouth, mouth.base.y, mouth.base.z);
          mouth.object.scale.set(1 + 0.12 * s.mouth, 1 + 0.2 * s.mouth, 1 + 0.2 * s.mouth);
          mouth.object.updateMatrixWorld(true);
        }
        updateProps(dtMs / 1000, s.mouth);
        // the thin-edge glow and the light through the fins follow the key light, day or night
        sharedUniforms.uGlow.value.copy(key.color).multiplyScalar(key.intensity / DAY.key[1]);
        keyView.copy(KEY_DIR).transformDirection(camera.matrixWorldInverse);
        sharedUniforms.uKeyView.value.copy(keyView);
        for (const p of parts) {
          // part -> root, in the root's UNSCALED frame: the bend amplitudes are mesh metres.
          const toRoot = p.uniforms['uToRoot'];
          const fromRoot = p.uniforms['uFromRoot'];
          if (!toRoot || !fromRoot) continue;
          tmp.multiplyMatrices(rootInv, p.mesh.matrixWorld);
          // rootInv includes the root scale; undo it so root-space is mesh metres
          tmp.premultiply(unscale.makeScale(1 / fishScale(), 1 / fishScale(), 1 / fishScale()));
          (toRoot.value as THREE.Matrix4).copy(tmp);
          (fromRoot.value as THREE.Matrix4).copy(tmp).invert();
        }
      }

      placeParticles(depthEase);
      updatePuffs(dtMs / 1000, depthEase);
      renderer.resetState();
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderer.render(fishScene, camera);
      renderer.setRenderTarget(null);
      renderer.setViewport(0, 0, wCss, hCss);
      if (waterQuad.visible) renderer.render(waterScene, waterCam);
    },
    spineState: () => spine.state(),
    destroy() {
      rt.dispose();
      bgDay.dispose();
      if (bgNight !== bgDay) bgNight.dispose();
      decorDay.dispose();
      if (decorNight !== decorDay) decorNight.dispose();
      for (const t of [bgDawn, bgDusk]) if (t !== bgDay) t.dispose();
      for (const t of [decorDawn, decorDusk]) if (t !== decorDay) t.dispose();
      plantsTex?.dispose();
      contents.dispose();
      clear.dispose();
      solid.dispose();
      envTex.dispose();
      waterMat.dispose();
      waterQuad.geometry.dispose();
      model?.dispose();
      for (const sp of [...flakePool, ...bubblePool, ...puffPool]) sp.material.dispose();
      pebble.geometry.dispose();
      pebble.material.dispose();
      flakeTex.dispose();
      bubbleTex.dispose();
      renderer.dispose();
    },
  };
  applyNight();
  return layer;
}
