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
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ManifestHabitat, ScenePhase } from '../types';
import { assetUrl } from '../assets';
import { cameraFrustum, cameraPose, depthWander, fishScale, gridToWorld } from './mapping';
import { createSpine, type FacingSign, type Spine, type SpineState } from './spine';
import {
  FISH_BODY_COLOR,
  FISH_BODY_ROUGHNESS,
  FISH_FIN_COLOR,
  FISH_NORMAL_BEGIN,
  FISH_VERTEX_BEGIN,
  FISH_VERTEX_PARS,
  WATER_FRAGMENT,
  WATER_VERTEX,
} from './shaders';

/** Where the shipped fish lives (Vite publicDir = assets/). */
export const FISH_GLB = 'live/fish.glb';

/** Quality tiers: `lean` halves the fish render target and dims the shafts/caustics. */
export type LiveTier = 'full' | 'lean';

export interface LiveLayerOptions {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  habitat: ManifestHabitat;
  /** The day and night bg plates, straight alpha, for the water to refract. */
  plates: { day: ImageBitmap; night: ImageBitmap | null };
  rng: () => number;
}

export interface LiveLayer {
  /** Resolves once the fish is loaded; the water draws from the first frame regardless. */
  readonly ready: Promise<void>;
  resize(wCss: number, hCss: number, dpr: number, cssPerGrid: number): void;
  /** Called every rendered frame with the interpolated pose. */
  setPose(x: number, y: number, facing: FacingSign, anim: string): void;
  /** Snap: first placement or a new pet. */
  resetPose(x: number, y: number, facing: FacingSign): void;
  setPhase(phase: ScenePhase): void;
  setNight(t: number): void;
  setPointer(gx: number | null, gy: number | null): void;
  setParallax(dx: number): void;
  setTier(tier: LiveTier): void;
  tier(): LiveTier;
  /** Advance the clocks by `dtMs` and draw. The caller has already drawn the back plates. */
  render(dtMs: number): void;
  spineState(): SpineState;
  destroy(): void;
}

type FlutterMode = 0 | 1 | 2 | 3;

interface Part {
  mesh: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
}

/** The three lights of wp_scene.blend's rig, as directions in Three's Y-up frame (from Blender x, z, -y). */
const KEY_DIR = new THREE.Vector3(-0.34, 1.3, 0.4).normalize();
const FILL_DIR = new THREE.Vector3(0.78, 0.16, 0.62).normalize();
const RIM_DIR = new THREE.Vector3(0.3, 0.8, -0.95).normalize();

interface RigColours {
  key: [THREE.Color, number];
  fill: [THREE.Color, number];
  rim: [THREE.Color, number];
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemi: number;
  env: number;
}

const DAY: RigColours = {
  key: [new THREE.Color(1.0, 0.9, 0.78), 2.6],
  fill: [new THREE.Color(0.64, 0.78, 1.0), 0.9],
  rim: [new THREE.Color(1.0, 0.76, 0.55), 1.6],
  hemiSky: new THREE.Color(0.55, 0.8, 0.95),
  hemiGround: new THREE.Color(0.5, 0.42, 0.3),
  hemi: 0.75,
  env: 0.55,
};

const NIGHT: RigColours = {
  key: [new THREE.Color(0.62, 0.72, 1.0), 0.55],
  fill: [new THREE.Color(0.4, 0.42, 0.95), 0.25],
  rim: [new THREE.Color(0.45, 0.78, 1.0), 1.0],
  hemiSky: new THREE.Color(0.18, 0.26, 0.5),
  hemiGround: new THREE.Color(0.06, 0.07, 0.12),
  hemi: 0.3,
  env: 0.12,
};

function lerpColor(out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return out.copy(a).lerp(b, t);
}

function linear(r: number, g: number, b: number): THREE.Color {
  return new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
}

export function createLiveLayer(opts: LiveLayerOptions): LiveLayer {
  const { gl, canvas, habitat } = opts;
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
  const parts: Part[] = [];
  let mouth: THREE.Object3D | null = null;
  let mouthBase = new THREE.Vector3();
  const spine: Spine = createSpine();
  const rootInv = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();

  const sharedUniforms = {
    uAmp: { value: 0 },
    uK: { value: 0 },
    uPhase: { value: 0 },
    uTurn: { value: 0 },
    uSway: { value: 0 },
    uFlutter: { value: 0 },
    uTime: { value: 0 },
  };

  const bendMaterial = (mat: THREE.MeshPhysicalMaterial, flutter: FlutterMode, kind: 'body' | 'fin' | 'other'): Record<string, THREE.IUniform> => {
    const own: Record<string, THREE.IUniform> = {
      uToRoot: { value: new THREE.Matrix4() },
      uFromRoot: { value: new THREE.Matrix4() },
      uFlutterMode: { value: flutter },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, sharedUniforms, own);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${FISH_VERTEX_PARS}`)
        .replace('#include <beginnormal_vertex>', FISH_NORMAL_BEGIN)
        .replace('#include <begin_vertex>', FISH_VERTEX_BEGIN);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRootPos;');
      if (kind === 'body') {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <color_fragment>', FISH_BODY_COLOR)
          .replace('#include <roughnessmap_fragment>', FISH_BODY_ROUGHNESS);
      } else if (kind === 'fin') {
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', FISH_FIN_COLOR);
      }
    };
    // onBeforeCompile output is cached by the shader source, which does not change per part; the
    // uniforms differ, so each part needs its own program key.
    mat.customProgramCacheKey = () => `wp-fish-${kind}-${flutter}`;
    return own;
  };

  const materialFor = (name: string): { mat: THREE.MeshPhysicalMaterial; flutter: FlutterMode; kind: 'body' | 'fin' | 'other' } => {
    if (name.includes('fin_dorsal') || name.includes('fin_anal') || name.includes('tail') || name.includes('fin_pec')) {
      const mat = new THREE.MeshPhysicalMaterial({
        color: linear(0.96, 0.36, 0.1),
        roughness: 0.42,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
        sheen: 0.6,
        sheenColor: linear(1.0, 0.6, 0.3),
        sheenRoughness: 0.5,
        clearcoat: 0.3,
        clearcoatRoughness: 0.4,
      });
      const flutter: FlutterMode = name.includes('tail') ? 3 : name.includes('fin_pec') ? 2 : 1;
      return { mat, flutter, kind: 'fin' };
    }
    if (name.includes('eyeglint')) {
      const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.3 });
      return { mat, flutter: 0, kind: 'other' };
    }
    if (name.includes('eye')) {
      const mat = new THREE.MeshPhysicalMaterial({
        color: linear(0.03, 0.02, 0.04),
        roughness: 0.08,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
      });
      return { mat, flutter: 0, kind: 'other' };
    }
    if (name.includes('mouth')) {
      const mat = new THREE.MeshPhysicalMaterial({ color: linear(0.5, 0.07, 0.025), roughness: 0.45 });
      return { mat, flutter: 0, kind: 'other' };
    }
    const mat = new THREE.MeshPhysicalMaterial({
      color: linear(0.913, 0.25, 0.045),
      roughness: 0.38,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
      sheen: 0.35,
      sheenColor: linear(1.0, 0.75, 0.4),
      sheenRoughness: 0.6,
    });
    return { mat, flutter: 0, kind: 'body' };
  };

  const ready = new GLTFLoader()
    .loadAsync(assetUrl(FISH_GLB))
    .then((gltf) => {
      const rigRoot = gltf.scene.getObjectByName('RIG_fish_root') ?? gltf.scene;
      // The export carries the rig's rest rotation (1.94° about Y). The spine owns every rotation
      // now, so the root is reset to identity and its children keep their offsets.
      rigRoot.rotation.set(0, 0, 0);
      rigRoot.position.set(0, 0, 0);
      rigRoot.scale.setScalar(fishScale());
      const tailHinge = gltf.scene.getObjectByName('RIG_fish_tail');
      if (tailHinge) tailHinge.rotation.set(0, 0, 0);
      gltf.scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const { mat, flutter, kind } = materialFor(o.name);
        if (o.material instanceof THREE.Material) o.material.dispose();
        o.material = mat;
        o.frustumCulled = false;
        if (kind === 'fin') o.renderOrder = 1;
        parts.push({ mesh: o, uniforms: bendMaterial(mat, flutter, kind) });
        if (o.name.includes('mouth')) {
          mouth = o;
          mouthBase = o.position.clone();
        }
      });
      root.add(rigRoot);
      root.visible = phase !== 'memorial';
    });

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
    uParallax: { value: 0 },
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
  const colA = new THREE.Color();

  const applyNight = (): void => {
    key.color = lerpColor(colA.clone(), DAY.key[0], NIGHT.key[0], nightT);
    key.intensity = DAY.key[1] + (NIGHT.key[1] - DAY.key[1]) * nightT;
    fill.color = lerpColor(colA.clone(), DAY.fill[0], NIGHT.fill[0], nightT);
    fill.intensity = DAY.fill[1] + (NIGHT.fill[1] - DAY.fill[1]) * nightT;
    rim.color = lerpColor(colA.clone(), DAY.rim[0], NIGHT.rim[0], nightT);
    rim.intensity = DAY.rim[1] + (NIGHT.rim[1] - DAY.rim[1]) * nightT;
    hemi.color = lerpColor(colA.clone(), DAY.hemiSky, NIGHT.hemiSky, nightT);
    hemi.groundColor = lerpColor(colA.clone(), DAY.hemiGround, NIGHT.hemiGround, nightT);
    hemi.intensity = DAY.hemi + (NIGHT.hemi - DAY.hemi) * nightT;
    fishScene.environmentIntensity = DAY.env + (NIGHT.env - DAY.env) * nightT;
    waterUniforms.uNight.value = nightT;
  };

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
    setPose(x, y, f, a) {
      px = x;
      py = y;
      facing = f;
      anim = a;
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
    setNight(t) {
      if (t === nightT) return;
      nightT = t;
      applyNight();
    },
    setPointer(gx, gy) {
      if (gx === null || gy === null) waterUniforms.uPointer.value.set(-1e4, -1e4);
      else waterUniforms.uPointer.value.set(gx, gy);
    },
    setParallax(dx) {
      waterUniforms.uParallax.value = dx;
    },
    setTier(t) {
      if (t === tier) return;
      tier = t;
      resizeTarget();
    },
    tier: () => tier,
    render(dtMs) {
      clock += dtMs / 1000;
      sharedUniforms.uTime.value = clock;
      waterUniforms.uTime.value = clock;
      // WINDOW_PAD lives in the scene; it is handed over through resize's cssPerGrid and the pad
      // uniform set below from the canvas size, so the water needs no import from sim constants.
      waterUniforms.uPad.value = (wCss - habitat.grid[0] * cssPerGrid) / 2;

      if (parts.length > 0 && root.visible) {
        const s = spine.update({ dtMs, x: px, y: py, facing, anim, rng: opts.rng });
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
        if (mouth) {
          mouth.position.set(mouthBase.x + 0.003 * s.mouth, mouthBase.y - 0.001 * s.mouth, mouthBase.z);
          mouth.scale.setScalar(1 + 0.22 * s.mouth);
          mouth.updateMatrixWorld(true);
        }
        for (const p of parts) {
          // part -> root, in the root's UNSCALED frame: the bend amplitudes are mesh metres.
          const toRoot = p.uniforms['uToRoot'];
          const fromRoot = p.uniforms['uFromRoot'];
          if (!toRoot || !fromRoot) continue;
          tmp.multiplyMatrices(rootInv, p.mesh.matrixWorld);
          // rootInv includes the root scale; undo it so root-space is mesh metres
          tmp.premultiply(new THREE.Matrix4().makeScale(1 / fishScale(), 1 / fishScale(), 1 / fishScale()));
          (toRoot.value as THREE.Matrix4).copy(tmp);
          (fromRoot.value as THREE.Matrix4).copy(tmp).invert();
        }
      }

      renderer.resetState();
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      if (root.visible) renderer.render(fishScene, camera);
      renderer.setRenderTarget(null);
      renderer.setViewport(0, 0, wCss, hCss);
      if (waterQuad.visible) renderer.render(waterScene, waterCam);
    },
    spineState: () => spine.state(),
    destroy() {
      rt.dispose();
      bgDay.dispose();
      if (bgNight !== bgDay) bgNight.dispose();
      envTex.dispose();
      waterMat.dispose();
      waterQuad.geometry.dispose();
      for (const p of parts) {
        p.mesh.geometry.dispose();
        if (p.mesh.material instanceof THREE.Material) p.mesh.material.dispose();
      }
      renderer.dispose();
    },
  };
  applyNight();
  return layer;
}
