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
import { cameraFrustum, cameraPose, depthWander, fishScale, gridToWorld } from './mapping';
import { createSpine, type FacingSign, type Spine, type SpineState } from './spine';
import { WATER_FRAGMENT, WATER_VERTEX } from './shaders';

/** Quality tiers: `lean` halves the fish render target and dims the shafts/caustics. */
export type LiveTier = 'full' | 'lean';

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
  plates: { day: ImageBitmap; night: ImageBitmap | null; decorDay: ImageBitmap | null; decorNight: ImageBitmap | null; contents: ImageBitmap | null };
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
  setParallax(dx: number, dy: number): void;
  setTier(tier: LiveTier): void;
  tier(): LiveTier;
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

function lerpColor(out: THREE.Color, a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return out.copy(a).lerp(b, t);
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
    setParallax(dx, dy) {
      waterUniforms.uParallax.value.set(dx, dy);
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
        const mouth = model?.mouth;
        if (mouth) {
          // a goldfish pushes its lips forward as it opens them
          mouth.object.position.set(mouth.base.x + 0.0011 * s.mouth, mouth.base.y, mouth.base.z);
          mouth.object.scale.setScalar(1 + 0.32 * s.mouth);
          mouth.object.updateMatrixWorld(true);
        }
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
      decorDay.dispose();
      if (decorNight !== decorDay) decorNight.dispose();
      contents.dispose();
      clear.dispose();
      solid.dispose();
      envTex.dispose();
      waterMat.dispose();
      waterQuad.geometry.dispose();
      model?.dispose();
      renderer.dispose();
    },
  };
  applyNight();
  return layer;
}
