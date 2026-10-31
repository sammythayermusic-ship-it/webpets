// Dev-only close-up of the live goldfish (fish-preview.html), under the bowl's own light rig.
//
// Query: ?view=side|three|front|top (camera), ?night=0..1, ?swim=0|1 (a slow swim loop, else idle),
// ?bg=#rrggbb, ?t=<seconds> (freeze the clock there, for a repeatable still), ?zoom=<k> and ?cx=<m>
// (magnify about a point on the fish's length, e.g. cx=0.045 for the head), ?act=hover|peck|gulp|look|rest
// (the behaviour's act) and ?spirits=0.5..1.25 (folded .. fanned fins).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DAY, FILL_DIR, KEY_DIR, NIGHT, RIM_DIR } from '../render/live/bowlLayer';
import { createFishUniforms, loadFishModel } from '../render/live/fishModel';
import { createSpine } from '../render/live/spine';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'side';
const night = Math.max(0, Math.min(1, Number(q.get('night') ?? 0)));
const swim = q.get('swim') === '1';
const frozen = q.has('t') ? Number(q.get('t')) : null;
const bg = q.get('bg');
const zoom = Number(q.get('zoom') ?? 1) || 1;
const cx = Number(q.get('cx') ?? 0) || 0;
const act = q.get('act') ?? undefined;
const spirits = q.has('spirits') ? Number(q.get('spirits')) : undefined;
if (bg) document.body.style.background = bg;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setPixelRatio(window.devicePixelRatio);

const scene = new THREE.Scene();
const mix = (a: THREE.Color, b: THREE.Color): THREE.Color => a.clone().lerp(b, night);
const key = new THREE.DirectionalLight(mix(DAY.key[0], NIGHT.key[0]), DAY.key[1] + (NIGHT.key[1] - DAY.key[1]) * night);
key.position.copy(KEY_DIR);
const fill = new THREE.DirectionalLight(mix(DAY.fill[0], NIGHT.fill[0]), DAY.fill[1] + (NIGHT.fill[1] - DAY.fill[1]) * night);
fill.position.copy(FILL_DIR);
const rim = new THREE.DirectionalLight(mix(DAY.rim[0], NIGHT.rim[0]), DAY.rim[1] + (NIGHT.rim[1] - DAY.rim[1]) * night);
rim.position.copy(RIM_DIR);
const hemi = new THREE.HemisphereLight(mix(DAY.hemiSky, NIGHT.hemiSky), mix(DAY.hemiGround, NIGHT.hemiGround), DAY.hemi + (NIGHT.hemi - DAY.hemi) * night);
scene.add(key, fill, rim, hemi);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = DAY.env + (NIGHT.env - DAY.env) * night;

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 5);
const poses: Record<string, [number, number, number]> = {
  side: [0, 0.03, 1],
  three: [0.55, 0.22, 0.8],
  front: [1, 0.08, 0.05],
  top: [0, 1, 0.02],
};
const p = poses[view] ?? poses['side'];
camera.position.set(p![0], p![1], p![2]).normalize().multiplyScalar(1);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld(true);

const shared = createFishUniforms();
const spine = createSpine();
const rootInv = new THREE.Matrix4();
const tmp = new THREE.Matrix4();

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  const half = 0.075 / zoom;
  camera.left = -half * (w / h) + cx;
  camera.right = half * (w / h) + cx;
  camera.top = half;
  camera.bottom = -half;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

void loadFishModel(renderer, shared).then((model) => {
  scene.add(model.root);
  (window as unknown as { __fish: unknown }).__fish = model;
  model.root.position.set(0.0, 0, 0);
  let clock = 0;
  let last = performance.now();
  let x = 160;
  spine.reset(x, 120, 1);
  const frame = (now: number): void => {
    const dt = Math.min(50, now - last);
    last = now;
    clock = frozen ?? clock + dt / 1000;
    if (swim) x = 160 + Math.sin(clock * 0.6) * 40;
    const s = spine.update({ dtMs: frozen === null ? dt : 16, x, y: 120, facing: 1, anim: 'idle', rng: Math.random, ...(act ? { act } : {}), ...(spirits !== undefined ? { spirits } : {}) });
    shared.uTime.value = clock;
    shared.uAmp.value = s.amp;
    shared.uK.value = s.k;
    shared.uPhase.value = s.phase;
    shared.uTurn.value = s.turn;
    shared.uSway.value = s.sway;
    shared.uFlutter.value = s.flutter;
    shared.uScull.value = s.scull;
    shared.uSpread.value = s.spread;
    shared.uGlow.value.copy(key.color).multiplyScalar(key.intensity / DAY.key[1]);
    shared.uKeyView.value.copy(KEY_DIR).transformDirection(camera.matrixWorldInverse);
    model.root.rotation.set(s.roll, s.yaw, s.pitch, 'YZX');
    model.root.updateMatrixWorld(true);
    rootInv.copy(model.root.matrixWorld).invert();
    for (const part of model.parts) {
      tmp.multiplyMatrices(rootInv, part.mesh.matrixWorld);
      (part.uniforms['uToRoot']!.value as THREE.Matrix4).copy(tmp);
      (part.uniforms['uFromRoot']!.value as THREE.Matrix4).copy(tmp).invert();
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
});
