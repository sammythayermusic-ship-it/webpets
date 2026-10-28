// The live-3D habitat scene for the fish bowl (bake-off candidate B). Same `HabitatScene` contract,
// same three clocks and the same behaviour step as the Pixi scene in ../scene.ts; what differs is that
// the bowl, the water and the fish are geometry lit and refracted in real time by three.js, and the
// behaviour's 2D grid position is mapped onto the bowl's mid plane plus a slow depth wander.
//
// Everything the Pixi scene did at a fixed point in the window still happens at that point: the grid
// px -> world mapping goes through the same orthographic camera the art was rendered with, so the
// water ellipse, the body box and `opaqueRect` keep their numbers.

import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  PCFSoftShadowMap,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Quaternion,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DEFAULT_SCALE, GRID_H, GRID_W, PET_FPS, WINDOW_PAD, scaleFactor, windowSizeForScale, type Scale } from '../../sim/constants';
import type { Rect, Rng } from '../../sim/types';
import { requireSpecies } from '../../species';
import { decayAttention, moodAnim, moodOf, type Mood } from '../../sim/mood';
import { createExpressionGate } from '../expression';
import { createPacer, type Pacer } from '../pacer';
import { makeWaterBounds } from '../water';
import type { HabitatScene, Manifest, ManifestHabitat, ManifestSprite, MoveBounds, PetAnim, PetBehavior, SceneEvent, SceneView, WaterShape } from '../types';
import { BOWL_CAMERA, BOWL_INNER_SPHERE, METRES_PER_GRID_PX, depthBudget, gridToWorld, stepDepth, type Vec3 } from './camera';
import { lightRig } from './daynight';
import { createBubbles3D, type Bubbles3D } from './bubbles3d';
import { createFishRig, type FishRig } from './fish';
import { createFlakes3D, type Flakes3D } from './flakes3d';
import {
  WATER_ALIVE,
  WATER_DEAD,
  WATER_MEMORIAL,
  WATER_STARVING,
  applyWaterLook,
  createGlassBackMaterial,
  createGlassFrontMaterial,
  createWaterMaterial,
  createWorldUniforms,
  mixWaterLook,
  withCaustics,
  type WaterLook,
  type WorldUniforms,
} from './materials';
import { spineParams } from './spine';
import type { SceneSubject } from '../scene';

const STEP_MS = 1000 / PET_FPS;
const MAX_ACC_MS = 1000;
const WATCHDOG_STALL_MS = 250;
const WATCHDOG_INTERVAL_MS = 16;
const MOOD_HOLD_TICKS = 8;
const PULL_EASE = 0.25;
const NIGHT_FADE_MS = 2000;
const STARVING_FADE_MS = 600;
const DEAD_FADE_MS = 1800;
/** Where the model lives in the served assets (Vite publicDir = assets/). */
export const BOWL_MODEL_URL = '/live/bowl_fish.glb';
/** Max camera lean toward the cursor, radians: enough parallax to feel solid, not enough to move the silhouette off its hit rect. */
const LEAN_YAW = 0.045;
const LEAN_PITCH = 0.03;
/** Seconds between new depth targets for the wander. */
const DEPTH_RETARGET_S = 4.5;
const DEPTH_MAX = 0.05;
/** Clearance from the inner glass the fish's centre keeps in depth: half its body depth plus a fin. */
const DEPTH_MARGIN = 0.032;
/** Height of the desk the stand rests on (the shadow catcher in the .blend). */
const DESK_Y = -0.0489;
/** Evaluate the auto tier after this many visible advances. */
const TIER_PROBE_FRAMES = 240;
/** Below this many advances per second while visible, drop to the lite tier. */
const TIER_MIN_RATE = 50;

export type QualityTier = 'full' | 'lite';

interface Lights {
  key: DirectionalLight;
  fill: DirectionalLight;
  rim: DirectionalLight;
  hemi: HemisphereLight;
  pointer: PointLight;
}

interface Mounted {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: OrthographicCamera;
  baseQuat: Quaternion;
  basePos: Vector3;
  lights: Lights;
  world: WorldUniforms;
  water: Mesh;
  glassBack: Mesh;
  glassFront: Mesh;
  memorial: Object3D | null;
  fish: FishRig;
  flakes: Flakes3D;
  bubbles: Bubbles3D;
  behavior: PetBehavior;
  bounds: MoveBounds;
  waterShape: WaterShape;
  advance: (dtMs: number) => void;
  watchdog: Pacer;
  rafId: number;
  caustic: Material[];
}

function tierFromEnv(): QualityTier | 'auto' {
  const v = String(import.meta.env['VITE_WEBPETS_LIVE_TIER'] ?? '');
  return v === 'full' || v === 'lite' ? v : 'auto';
}

function windowSize(scale: Scale): { w: number; h: number } {
  const { width, height } = windowSizeForScale(scale);
  return { w: width, h: height };
}

function requireMesh(root: Object3D, name: string): Mesh {
  const o = root.getObjectByName(name);
  if (!(o instanceof Mesh)) throw new Error(`[live] "${name}" missing from the GLB`);
  return o;
}

export function createLiveScene(manifest: Manifest, subject: SceneSubject, rng: Rng = Math.random): HabitatScene {
  const species = requireSpecies(subject.species);
  const habitatKey = `${subject.species}/${subject.habitat}`;
  const habitat: ManifestHabitat | undefined = manifest.habitats[habitatKey];
  const spriteDef: ManifestSprite | undefined = manifest.sprites[subject.species];
  if (!habitat) throw new Error(`manifest has no habitat "${habitatKey}"`);
  if (!spriteDef) throw new Error(`manifest has no sprite "${subject.species}"`);
  const [gridW, gridH] = habitat.grid;
  if (gridW !== GRID_W || gridH !== GRID_H) throw new Error(`habitat grid ${gridW}x${gridH} must equal ${GRID_W}x${GRID_H}`);
  const layout = species.layouts[subject.habitat];
  if (!layout || layout.domain.kind !== 'water') throw new Error(`[live] the live renderer draws water habitats only ("${habitatKey}")`);
  const waterShape = layout.domain.shape;

  let m: Mounted | null = null;
  let scale: Scale = DEFAULT_SCALE;
  let view: SceneView | null = null;
  let pointer: { x: number; y: number } | null = null;
  let acc = 0;
  let lastAdvanceAt = 0;
  let lastRafAt = 0;
  let lastDrawn: { x: number; y: number } | null = null;
  let poseFrom = { x: habitat.petAnchor[0], y: habitat.petAnchor[1] };
  let poseTo = { x: habitat.petAnchor[0], y: habitat.petAnchor[1] };
  let attention = 0;
  let lastInteractionAt = 0;
  let pull = 0;
  let pullX = 0;
  let pullY = 0;
  let mood: Mood | null = null;
  const expression = createExpressionGate(MOOD_HOLD_TICKS);
  let placed = false;
  const listeners: Record<SceneEvent, Set<() => void>> = { bite: new Set(), 'flakes-gone': new Set() };
  let speciesAccum: Record<string, number> = {};
  /** The last behaviour output, which the rig poses from. */
  let anim: PetAnim = 'idle';
  let facing: 1 | -1 = 1;
  let turning = false;
  let depth = 0;
  let depthTarget = 0;
  let depthClock = 0;
  let nightT = 0;
  let nightTargetT = 0;
  let starvingT = 0;
  let starving = false;
  let deadT = 0;
  let memorialT = 0;
  let leanX = 0;
  let leanY = 0;
  let pointerGlow = 0;
  let steps = 0;
  let stepSkips = 0;
  let advances = 0;
  let lastDtMs = 0;
  let costMs = 0;
  let fpsEstimate = 0;
  let tier: QualityTier = tierFromEnv() === 'lite' ? 'lite' : 'full';
  let tierLocked = tierFromEnv() !== 'auto';
  let probeFrames = 0;
  let probeMs = 0;
  const lookScratch: WaterLook = {
    color: new Color(),
    attenuationColor: new Color(),
    attenuationDistance: 0,
    roughness: 0,
  };
  const lookScratch2: WaterLook = {
    color: new Color(),
    attenuationColor: new Color(),
    attenuationDistance: 0,
    roughness: 0,
  };
  const tmpV = new Vector3();
  const tmpQ = new Quaternion();
  const tmpE = new Euler();

  const emit = (event: SceneEvent): void => {
    for (const cb of Array.from(listeners[event])) cb();
  };

  const layoutHabitat = (): void => {
    if (!m) return;
    const { w, h } = windowSize(scale);
    m.renderer.setSize(w, h, false);
    const canvas = m.renderer.domElement;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    // The window is the grid plus WINDOW_PAD on each side, so its centre is the grid's centre, which
    // is the camera's centre; the frustum just has to cover the window in grid units.
    const f = scaleFactor(scale);
    const halfW = (w / f / 2) * METRES_PER_GRID_PX;
    const halfH = (h / f / 2) * METRES_PER_GRID_PX;
    m.camera.left = -halfW;
    m.camera.right = halfW;
    m.camera.top = halfH;
    m.camera.bottom = -halfH;
    m.camera.updateProjectionMatrix();
  };

  const pointerGrid = (): { gx: number; gy: number } | null => {
    if (!pointer) return null;
    const f = scaleFactor(scale);
    return { gx: (pointer.x - WINDOW_PAD) / f, gy: (pointer.y - WINDOW_PAD) / f };
  };

  const applyView = (next: SceneView, prev: SceneView | null): void => {
    if (!m) return;
    const alive = next.phase === 'alive';
    if (!prev || prev.phase !== next.phase) {
      m.bubbles.setEnabled(alive);
      m.fish.setVisible(next.phase !== 'memorial');
      if (m.memorial) m.memorial.visible = next.phase === 'memorial';
      if (!alive) m.flakes.clear();
      if (alive && prev && prev.phase !== 'alive') {
        m.behavior.reset();
        const [ax, ay] = habitat.petAnchor;
        poseFrom = { x: ax, y: ay };
        poseTo = { x: ax, y: ay };
        acc = 0;
        expression.reset();
        m.fish.resetFacing(1);
        facing = 1;
        anim = 'idle';
        depth = 0;
        lastDrawn = null;
      }
    }
    if (!prev || prev.label !== next.label || prev.phase !== next.phase) starving = alive && next.label === 'starving';
    if (!prev || prev.night !== next.night) nightTargetT = next.night ? 1 : 0;
  };

  const stepOnce = (): void => {
    if (!m || !view) {
      stepSkips += 1;
      return;
    }
    steps += 1;
    const before = m.flakes.count();
    const dissolved = m.flakes.step(rng);
    const alive = view.phase === 'alive' && view.alive;
    const now = Date.now();
    mood = moodOf({
      hunger: view.hunger,
      label: view.label,
      alive,
      asleep: view.asleep,
      personality: view.personality,
      sinceFedMs: Math.max(0, now - view.lastFedAt),
      attention,
      sinceInteractionMs: lastInteractionAt === 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, now - lastInteractionAt),
    });
    const pg = pointerGrid();
    if (pg) {
      pullX = pg.gx;
      pullY = pg.gy;
    }
    pull += ((pg ? mood.interest : 0) - pull) * PULL_EASE;
    const attract = pull > 0.02 ? { x: pullX, y: pullY, strength: pull } : null;
    const out = m.behavior.step({
      hunger: view.hunger,
      label: view.label,
      alive,
      asleep: view.asleep,
      flakes: m.flakes.positions(),
      bounds: m.bounds,
      body: spriteDef.body,
      pantryFraction: view.pantryFraction,
      attract,
      rng,
    });
    let ate = false;
    if (out.biteFlakeIndex !== null) {
      m.flakes.remove(out.biteFlakeIndex);
      ate = true;
    }
    const simDriving = out.anim !== 'idle';
    if (simDriving) expression.hold();
    else expression.update(moodAnim(mood));
    anim = out.anim;
    facing = out.facing;
    turning = out.turning;
    poseFrom = poseTo;
    poseTo = { x: out.x, y: out.y };
    placed = true;
    if (ate) emit('bite');
    if (before > 0 && m.flakes.count() === 0 && (ate || dissolved > 0)) emit('flakes-gone');
    if (out.speciesDelta) {
      for (const [k, v] of Object.entries(out.speciesDelta)) speciesAccum[k] = (speciesAccum[k] ?? 0) + v;
    }
  };

  const applyTier = (next: QualityTier): void => {
    if (!m || next === tier) return;
    tier = next;
    const old = m.water.material as MeshPhysicalMaterial;
    const mat = createWaterMaterial(m.world, tier);
    m.water.material = mat;
    old.dispose();
    const size = tier === 'full' ? 1024 : 512;
    m.lights.key.shadow.mapSize.set(size, size);
    m.lights.key.shadow.map?.dispose();
    m.lights.key.shadow.map = null;
    m.renderer.shadowMap.type = PCFSoftShadowMap;
    m.renderer.shadowMap.needsUpdate = true;
  };

  const scene: HabitatScene = {
    drainSpeciesDelta() {
      const out = speciesAccum;
      speciesAccum = {};
      return out;
    },

    async mount(el, s) {
      if (m) throw new Error('scene already mounted');
      scale = s;
      const renderer = new WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFSoftShadowMap;
      const canvas = renderer.domElement;
      canvas.id = 'habitat-canvas';
      canvas.style.display = 'block';
      el.appendChild(canvas);

      const gltf = await new GLTFLoader().loadAsync(BOWL_MODEL_URL);
      const root = gltf.scene;

      const scene3 = new Scene();
      const pmrem = new PMREMGenerator(renderer);
      scene3.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();

      // Camera: the bowl camera from the .blend, as an OrthographicCamera; the frustum is set per scale.
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.05, 6);
      const basePos = new Vector3(BOWL_CAMERA.position.x, BOWL_CAMERA.position.y, BOWL_CAMERA.position.z);
      camera.position.copy(basePos);
      camera.up.set(0, 1, 0);
      camera.lookAt(basePos.x + BOWL_CAMERA.forward.x, basePos.y + BOWL_CAMERA.forward.y, basePos.z + BOWL_CAMERA.forward.z);
      const baseQuat = camera.quaternion.clone();

      // Bowl parts and their live materials.
      const water = requireMesh(root, 'ENV_bowl_water');
      water.geometry.computeBoundingBox();
      const waterTop = water.geometry.boundingBox?.max.y ?? 0.158;
      const world = createWorldUniforms(waterTop);
      (water.material as Material).dispose();
      water.material = createWaterMaterial(world, tier);
      water.renderOrder = 5;
      water.castShadow = false;
      water.receiveShadow = false;

      const glassBack = requireMesh(root, 'ENV_bowl_glass');
      (glassBack.material as Material).dispose();
      glassBack.material = createGlassBackMaterial();
      glassBack.castShadow = false;
      glassBack.receiveShadow = false;
      const glassFront = new Mesh(glassBack.geometry, createGlassFrontMaterial());
      glassFront.name = 'ENV_bowl_glass_front';
      glassFront.renderOrder = 20;
      glassFront.castShadow = false;
      glassBack.add(glassFront);

      const caustic: Material[] = [];
      for (const name of ['PRP_gravel', 'PRP_pebbles', 'PRP_plants', 'PRP_memorial']) {
        const mesh = root.getObjectByName(name);
        if (!(mesh instanceof Mesh)) continue;
        const mat = mesh.material as MeshStandardMaterial;
        withCaustics(mat, world);
        caustic.push(mat);
        mesh.castShadow = name !== 'PRP_gravel';
        mesh.receiveShadow = true;
      }
      const stand = root.getObjectByName('PRP_stand');
      if (stand instanceof Mesh) {
        stand.castShadow = true;
        stand.receiveShadow = true;
      }
      const gravel = root.getObjectByName('PRP_gravel');
      if (gravel instanceof Mesh) {
        gravel.castShadow = true;
        const gm = gravel.material as MeshStandardMaterial;
        gm.normalScale.set(0.9, 0.9);
      }
      const waterline = root.getObjectByName('ENV_waterline');
      if (waterline instanceof Mesh) {
        const wm = waterline.material as MeshStandardMaterial;
        wm.transparent = false;
        wm.roughness = 0.3;
        wm.emissive.setRGB(0.3, 0.4, 0.45);
        wm.emissiveIntensity = 0.15;
      }
      const memorial = root.getObjectByName('PRP_memorial') ?? null;
      if (memorial) memorial.visible = false;
      const glbCamera = root.getObjectByName('CAM_bowl');
      glbCamera?.removeFromParent();

      // The desk: receives the stand's and bowl's shadow and nothing else, so the desktop shows through it.
      const desk = new Mesh(new PlaneGeometry(1.4, 1.4), new ShadowMaterial({ opacity: 0.3, color: new Color(0x1c1a2a) }));
      desk.rotation.x = -Math.PI / 2;
      desk.position.y = DESK_Y;
      desk.receiveShadow = true;
      desk.name = 'desk';

      // Lights: the three area lights of the .blend as directionals, a hemisphere for the world, and a
      // small warm light that follows the cursor onto the glass.
      const key = new DirectionalLight(0xffffff, 3);
      key.castShadow = true;
      key.shadow.mapSize.set(tier === 'full' ? 1024 : 512, tier === 'full' ? 1024 : 512);
      key.shadow.camera.left = -0.24;
      key.shadow.camera.right = 0.24;
      key.shadow.camera.top = 0.24;
      key.shadow.camera.bottom = -0.24;
      key.shadow.camera.near = 0.2;
      key.shadow.camera.far = 3;
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.0025;
      key.shadow.radius = 3;
      const fill = new DirectionalLight(0xffffff, 1);
      const rim = new DirectionalLight(0xffffff, 1);
      const hemi = new HemisphereLight(0xffffff, 0x444444, 1);
      const pointerLight = new PointLight(0xffe0b8, 0, 0.4, 2);
      const pivot = new Vector3(BOWL_INNER_SPHERE.center.x, BOWL_INNER_SPHERE.center.y, BOWL_INNER_SPHERE.center.z);
      for (const l of [key, fill, rim]) {
        l.target.position.copy(pivot);
        scene3.add(l.target);
      }
      const lights: Lights = { key, fill, rim, hemi, pointer: pointerLight };

      const bowl = new Group();
      bowl.name = 'bowl';
      bowl.add(root);
      scene3.add(bowl, desk, key, fill, rim, hemi, pointerLight);

      const fish = createFishRig(root, world);
      scene3.add(fish.pivot);

      const bounds = makeWaterBounds(waterShape);
      const flakes = createFlakes3D(waterShape, bounds);
      scene3.add(flakes.mesh);
      const bubbles = createBubbles3D(waterShape, bounds);
      scene3.add(bubbles.mesh);

      const advance = (dtMs: number): void => {
        if (!m) return;
        lastAdvanceAt = Date.now();
        advances += 1;
        lastDtMs = dtMs;
        fpsEstimate = fpsEstimate === 0 ? 1000 / Math.max(1, dtMs) : fpsEstimate * 0.95 + (1000 / Math.max(1, dtMs)) * 0.05;
        acc = Math.min(MAX_ACC_MS, acc + dtMs);
        while (acc >= STEP_MS) {
          acc -= STEP_MS;
          stepOnce();
        }
        attention = decayAttention(attention, dtMs, pointer !== null);
        const t = acc / STEP_MS;
        const drawnX = poseFrom.x + (poseTo.x - poseFrom.x) * t;
        const drawnY = poseFrom.y + (poseTo.y - poseFrom.y) * t;
        const travelled = lastDrawn === null ? 0 : Math.hypot(drawnX - lastDrawn.x, drawnY - lastDrawn.y);
        lastDrawn = { x: drawnX, y: drawnY };
        void travelled;

        // Depth wander: a new target now and then, eased, inside the glass at this x/y.
        const dead = anim === 'dead';
        depthClock += dtMs / 1000;
        if (depthClock >= DEPTH_RETARGET_S) {
          depthClock = 0;
          depthTarget = (rng() * 2 - 1) * DEPTH_MAX;
        }
        const mid = gridToWorld(drawnX, drawnY, 0);
        const budget = dead ? 0 : depthBudget(mid, DEPTH_MARGIN);
        depth = stepDepth(depth, dead ? 0 : depthTarget, budget, dtMs);
        const p: Vec3 = gridToWorld(drawnX, drawnY, depth);

        // Fish: spine parameters from the tick's travel; a flip is a real turn.
        const speed = Math.hypot(poseTo.x - poseFrom.x, poseTo.y - poseFrom.y);
        const params = spineParams({ speed, vy: poseTo.y - poseFrom.y, turning, anim, expression: expression.current() });
        m.fish.update(dtMs, { x: p.x, y: p.y, z: p.z, facing, pitch: 0, roll: 0 }, params, anim);

        // Water, night, starvation, death: all eased at frame rate.
        const toward = (v: number, target: number, ms: number): number => {
          if (v === target) return v;
          const step = dtMs / ms;
          return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
        };
        nightT = toward(nightT, nightTargetT, NIGHT_FADE_MS);
        starvingT = toward(starvingT, starving ? 1 : 0, STARVING_FADE_MS);
        deadT = toward(deadT, view?.phase === 'dead' ? 1 : 0, DEAD_FADE_MS);
        memorialT = toward(memorialT, view?.phase === 'memorial' ? 1 : 0, NIGHT_FADE_MS);
        const look = mixWaterLook(mixWaterLook(mixWaterLook(WATER_ALIVE, WATER_STARVING, starvingT, lookScratch), WATER_DEAD, deadT, lookScratch2), WATER_MEMORIAL, memorialT, lookScratch);
        applyWaterLook(m.water.material as MeshPhysicalMaterial, look);
        m.bubbles.setWaterColor(look.attenuationColor);
        m.world.uTime.value += dtMs / 1000;
        m.world.uRipple.value = dead ? 0.4 : 1;

        const d = new Date();
        const rig = lightRig(d.getHours() + d.getMinutes() / 60, nightT);
        const setLight = (l: DirectionalLight, r: { color: [number, number, number]; intensity: number; direction: [number, number, number] }): void => {
          l.color.setRGB(r.color[0], r.color[1], r.color[2]);
          l.intensity = r.intensity;
          l.position.set(pivot.x - r.direction[0] * 1.4, pivot.y - r.direction[1] * 1.4, pivot.z - r.direction[2] * 1.4);
        };
        setLight(m.lights.key, rig.key);
        setLight(m.lights.fill, rig.fill);
        setLight(m.lights.rim, rig.rim);
        m.lights.hemi.color.setRGB(rig.skyColor[0], rig.skyColor[1], rig.skyColor[2]);
        m.lights.hemi.groundColor.setRGB(rig.groundColor[0], rig.groundColor[1], rig.groundColor[2]);
        m.lights.hemi.intensity = rig.hemiIntensity;
        m.scene.environmentIntensity = rig.envIntensity;
        m.world.uCaustic.value = rig.caustic * (1 - 0.8 * deadT);
        m.renderer.toneMappingExposure = rig.exposure;
        tmpV.set(-rig.key.direction[0], -rig.key.direction[1], -rig.key.direction[2]);
        m.bubbles.setLightDir(tmpV);

        // The cursor: a lean of the camera toward it and a little warm light on the glass.
        const pg = pointerGrid();
        const reduced = view?.reducedMotion ?? false;
        const wantX = pg && !reduced ? Math.max(-1, Math.min(1, (pg.gx - GRID_W / 2) / (GRID_W / 2))) : 0;
        const wantY = pg && !reduced ? Math.max(-1, Math.min(1, (pg.gy - GRID_H / 2) / (GRID_H / 2))) : 0;
        const ease = 1 - Math.exp(-dtMs / 260);
        leanX += (wantX - leanX) * ease;
        leanY += (wantY - leanY) * ease;
        tmpE.set(-leanY * LEAN_PITCH, leanX * LEAN_YAW, 0, 'YXZ');
        tmpQ.setFromEuler(tmpE);
        m.camera.position.copy(m.basePos).sub(pivot).applyQuaternion(tmpQ).add(pivot);
        m.camera.quaternion.copy(tmpQ).multiply(m.baseQuat);
        pointerGlow += ((pg ? 1 : 0) - pointerGlow) * ease;
        if (pg) {
          const lp = gridToWorld(pg.gx, pg.gy, 0.16);
          m.lights.pointer.position.set(lp.x, lp.y, lp.z);
        }
        m.lights.pointer.intensity = 0.02 * pointerGlow * (1 - 0.5 * nightT);

        m.flakes.interpolate(t, dtMs, m.camera);
        m.bubbles.update(dtMs, rng);

        const t0 = performance.now();
        m.renderer.render(m.scene, m.camera);
        const cost = performance.now() - t0;
        costMs = costMs === 0 ? cost : costMs * 0.9 + cost * 0.1;

        // Auto quality tier: after a few seconds of real frames, if the window cannot hold its rate, drop
        // the transmission and the big shadow map. Measured on advances the ticker drove (rAF alive),
        // never on the watchdog's hidden-window pace.
        if (!tierLocked && Date.now() - lastRafAt < WATCHDOG_STALL_MS && document.visibilityState === 'visible') {
          probeFrames += 1;
          probeMs += dtMs;
          if (probeFrames >= TIER_PROBE_FRAMES) {
            const rate = (probeFrames / Math.max(1, probeMs)) * 1000;
            if (rate < TIER_MIN_RATE) applyTier('lite');
            tierLocked = true;
          }
        }
      };

      let prevRaf = 0;
      const loop = (now: number): void => {
        if (!m) return;
        m.rafId = requestAnimationFrame(loop);
        lastRafAt = Date.now();
        const dt = prevRaf === 0 ? 16.7 : Math.min(MAX_ACC_MS, Math.max(0, now - prevRaf));
        prevRaf = now;
        advance(dt);
      };

      const watchdog = createPacer(WATCHDOG_INTERVAL_MS, () => {
        if (!m) return;
        const now = Date.now();
        if (now - lastRafAt < WATCHDOG_STALL_MS) return;
        advance(Math.min(MAX_ACC_MS, now - lastAdvanceAt));
      });

      m = {
        renderer,
        scene: scene3,
        camera,
        baseQuat,
        basePos,
        lights,
        world,
        water,
        glassBack,
        glassFront,
        memorial,
        fish,
        flakes,
        bubbles,
        behavior: species.createBehavior(),
        bounds,
        waterShape,
        advance,
        watchdog,
        rafId: 0,
        caustic,
      };
      layoutHabitat();
      if (view) applyView(view, null);
      lastAdvanceAt = Date.now();
      lastRafAt = lastAdvanceAt;
      // Place the fish at its anchor and draw once so the window never shows an empty frame.
      advance(0);
      m.rafId = requestAnimationFrame(loop);
    },

    setScale(s) {
      scale = s;
      layoutHabitat();
    },

    setResolution(dpr) {
      if (!m) return;
      m.renderer.setPixelRatio(dpr > 0 ? dpr : 1);
      layoutHabitat();
    },

    setView(next) {
      const prev = view;
      view = next;
      applyView(next, prev);
    },

    feed() {
      if (!m || !view || view.phase !== 'alive') return;
      lastInteractionAt = Date.now();
      attention = Math.max(attention, 0.6);
      m.flakes.feed(rng);
    },

    setPointer(x, y) {
      const was = pointer !== null;
      pointer = x === null || y === null ? null : { x, y };
      if (pointer && !was) lastInteractionAt = Date.now();
    },

    on(event, cb) {
      listeners[event].add(cb);
      return () => {
        listeners[event].delete(cb);
      };
    },

    habitatOpaqueRect(): Rect {
      return { ...habitat.opaqueRect };
    },

    habitatHitRect(): Rect {
      const o = habitat.opaqueRect;
      const f = scaleFactor(scale);
      return { x: WINDOW_PAD + o.x * f, y: WINDOW_PAD + o.y * f, w: o.w * f, h: o.h * f };
    },

    fps() {
      return m ? fpsEstimate : 0;
    },

    debugState() {
      const base = {
        advances,
        lastDtMs: Math.round(lastDtMs * 10) / 10,
        renderMs: Math.round(costMs * 10) / 10,
        steps,
        stepSkips,
        hasView: view !== null,
        petFrame: { w: spriteDef.frame[0], h: spriteDef.frame[1] },
        layerAlpha: { live: 1, night: Number(nightT.toFixed(3)), starving: Number(starvingT.toFixed(3)), dead: Number(deadT.toFixed(3)) },
        renderer: 'three' as const,
        tier,
        depth: Number(depth.toFixed(4)),
      };
      if (!m) {
        return { ...base, petVisible: false, petAnim: '(unmounted)', petPos: { x: 0, y: 0 }, drawnPos: { x: 0, y: 0 }, pacer: 'timer' as const };
      }
      return {
        ...base,
        petVisible: m.fish.pivot.visible && placed,
        petAnim: anim,
        petPos: { x: Math.round(poseTo.x * 100) / 100, y: Math.round(poseTo.y * 100) / 100 },
        drawnPos: lastDrawn ? { x: Math.round(lastDrawn.x * 100) / 100, y: Math.round(lastDrawn.y * 100) / 100 } : { x: 0, y: 0 },
        pacer: m.watchdog.kind(),
        mood: mood
          ? { label: mood.label, valence: Number(mood.valence.toFixed(3)), arousal: Number(mood.arousal.toFixed(3)), interest: Number(mood.interest.toFixed(3)) }
          : null,
        attention: Number(attention.toFixed(3)),
        expression: expression.current(),
      };
    },

    async snapshot() {
      if (!m) throw new Error('scene not mounted');
      if (!placed) m.advance(STEP_MS);
      m.renderer.render(m.scene, m.camera);
      // Straight after the render, in the same task, so no preserveDrawingBuffer is needed.
      return m.renderer.domElement.toDataURL('image/png');
    },

    destroy() {
      if (!m) return;
      const cur = m;
      m = null;
      cancelAnimationFrame(cur.rafId);
      cur.watchdog.stop();
      cur.fish.dispose();
      cur.flakes.dispose();
      cur.bubbles.dispose();
      cur.scene.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          const mat = o.material;
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat.dispose();
        }
      });
      cur.scene.environment?.dispose();
      cur.renderer.dispose();
      cur.renderer.domElement.remove();
      listeners.bite.clear();
      listeners['flakes-gone'].clear();
    },
  };

  return scene;
}
