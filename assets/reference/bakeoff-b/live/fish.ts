// The live fish: the glTF rest pose from wp_scene.blend, bent by the spine shader and posed by the
// behaviour. The behaviour still thinks in 2D grid px; everything three-dimensional about the fish --
// the real yaw turn, the depth wander, the pitch into a dive, the belly-up roll -- is decided here from
// what it reports, so its tests and constants are untouched.

import { Group, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, type Material } from 'three';
import { FISH_SCALE } from './camera';
import { createSpineDepthMaterial, withSpine, type SpineUniforms, type WorldUniforms } from './materials';
import { advancePhase, facingYaw, turnBank, turnEase, type SpineParams } from './spine';
import type { PetAnim } from '../types';

/** Where the rigid head ends and the bending body begins, in the fish's own metres (nose at +0.0595). */
const HEAD_X = 0.018;
/** From HEAD_X back to the tail tip (-0.058). */
const BODY_LEN = 0.076;
/** How long a facing flip takes to play. Longer than the behaviour's one tick: a real turn has weight. */
export const TURN_MS = 420;
const MAX_BANK = 0.28;
const EAT_MS = 520;

const FISH_NODES = {
  root: 'RIG_fish_root',
  body: 'HERO_fish_body',
  tailPivot: 'RIG_fish_tail',
  tail: 'HERO_fish_tail',
  mouth: 'HERO_fish_mouth',
  pecL: 'HERO_fish_fin_pec_l',
  pecR: 'HERO_fish_fin_pec_r',
} as const;

interface Part {
  mesh: Mesh;
  u: SpineUniforms;
}

export interface FishPose {
  /** World position of the fish's frame centre. */
  x: number;
  y: number;
  z: number;
  facing: 1 | -1;
  /** Extra pitch (nose up +) and roll on top of the facing. */
  pitch: number;
  roll: number;
}

export interface FishRig {
  readonly pivot: Group;
  /** Call once per rendered frame. */
  update(dtMs: number, pose: FishPose, params: SpineParams, anim: PetAnim): void;
  /** Snap to a facing with no turn in flight: first placement, or a new pet. */
  resetFacing(facing: 1 | -1): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

function requireNode(root: Object3D, name: string): Object3D {
  const n = root.getObjectByName(name);
  if (!n) throw new Error(`[live] fish node "${name}" missing from the GLB`);
  return n;
}

/**
 * Build the rig from the loaded glTF scene. Takes the fish root OUT of the glTF scene graph and
 * re-parents it under a pivot this module owns.
 */
export function createFishRig(gltfRoot: Object3D, world: WorldUniforms): FishRig {
  const root = requireNode(gltfRoot, FISH_NODES.root);
  root.removeFromParent();
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  const pivot = new Group();
  pivot.name = 'fish-pivot';
  pivot.scale.setScalar(FISH_SCALE);
  pivot.add(root);

  const body = requireNode(root, FISH_NODES.body);
  const tailPivot = requireNode(root, FISH_NODES.tailPivot);
  const mouth = requireNode(root, FISH_NODES.mouth);
  const pecL = requireNode(root, FISH_NODES.pecL);
  const pecR = requireNode(root, FISH_NODES.pecR);
  const mouthRest = mouth.position.clone();
  const mouthScale = mouth.scale.clone();
  const pecLRest = pecL.rotation.clone();
  const pecRRest = pecR.rotation.clone();
  const tailRest = tailPivot.rotation.clone();

  const parts: Part[] = [];
  const spineShared = { uPhase: { value: 0 }, uAmp: { value: 0.002 }, uWaveK: { value: 5.2 }, uHeadX: { value: HEAD_X }, uBodyLen: { value: BODY_LEN } };
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const u: SpineUniforms = {
      uToRoot: { value: new Matrix4() },
      uFromRoot: { value: new Matrix4() },
      ...spineShared,
    };
    // Materials are shared between the fins in the GLB; each part needs its own root transform.
    const src = o.material as Material;
    const mat = src.clone();
    tuneFishMaterial(o.name, mat);
    o.material = withSpine(mat, u, world);
    o.customDepthMaterial = createSpineDepthMaterial(u);
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false; // the shader moves vertices; the rest-pose bounds would cull a bent tail
    parts.push({ mesh: o, u });
  });
  void body;

  const rootInv = new Matrix4();
  let yaw = facingYaw(1);
  let yawFrom = yaw;
  let yawTo = yaw;
  let turnT = 1;
  let facing: 1 | -1 = 1;
  let phase = 0;
  let finPhase = 0;
  let eatT = EAT_MS;
  let lastAnim: PetAnim = 'idle';
  let deadT = 0;
  let visible = true;

  const refreshPartMatrices = (): void => {
    pivot.updateMatrixWorld(true);
    rootInv.copy(root.matrixWorld).invert();
    for (const p of parts) {
      p.u.uToRoot.value.multiplyMatrices(rootInv, p.mesh.matrixWorld);
      p.u.uFromRoot.value.copy(p.u.uToRoot.value).invert();
    }
  };

  return {
    pivot,
    update(dtMs, pose, params, anim) {
      const dt = Math.min(100, Math.max(0, dtMs));
      if (pose.facing !== facing) {
        facing = pose.facing;
        yawFrom = yaw;
        yawTo = facingYaw(facing);
        turnT = 0;
      }
      if (turnT < 1) turnT = Math.min(1, turnT + dt / TURN_MS);
      yaw = yawFrom + (yawTo - yawFrom) * turnEase(turnT);
      const bank = turnT < 1 ? turnBank(turnT, MAX_BANK) * (yawTo > yawFrom ? -1 : 1) : 0;

      phase = advancePhase(phase, params.hz, dt);
      finPhase = advancePhase(finPhase, params.finHz, dt);
      spineShared.uPhase.value = phase;
      spineShared.uAmp.value = params.amplitude;
      spineShared.uWaveK.value = params.waveK;

      if (anim === 'eat' && lastAnim !== 'eat') eatT = 0;
      lastAnim = anim;
      eatT = Math.min(EAT_MS, eatT + dt);
      const dead = anim === 'dead';
      deadT = dead ? deadT + dt : 0;

      pivot.position.set(pose.x, pose.y, pose.z);
      // Facing yaw about the vertical, then pitch about the fish's own lateral axis, then roll. A dead
      // fish rolls belly-up and rocks with the water; a live one banks into its turn.
      const roll = dead ? Math.PI + Math.sin(deadT / 1000 * 1.9) * 0.06 : bank + pose.roll;
      const pitch = dead ? Math.sin(deadT / 1000 * 1.3) * 0.04 : params.pitch + pose.pitch;
      pivot.rotation.set(0, 0, 0);
      pivot.rotateY(yaw);
      pivot.rotateZ(pitch);
      pivot.rotateX(roll);

      // Secondary motion: the tail fin lags the body wave; the pectorals paddle.
      const tailSwing = Math.sin(phase - params.waveK - params.tailLag) * params.tailGain * params.amplitude * 60;
      tailPivot.rotation.set(tailRest.x, tailRest.y + tailSwing, tailRest.z);
      const fin = Math.sin(finPhase) * params.finAmp;
      const finFlap = Math.sin(finPhase * 1.3 + 0.7) * params.finAmp * 0.5;
      pecL.rotation.set(pecLRest.x + finFlap, pecLRest.y, pecLRest.z + fin);
      pecR.rotation.set(pecRRest.x - finFlap, pecRRest.y, pecRRest.z - fin);

      // The mouth opens twice over a bite, and the lips push forward a little.
      const open = eatT < EAT_MS ? Math.pow(Math.sin((eatT / EAT_MS) * Math.PI * 2), 2) : 0;
      mouth.scale.set(mouthScale.x * (1 + 0.25 * open), mouthScale.y * (1 + 0.9 * open), mouthScale.z * (1 + 0.5 * open));
      mouth.position.set(mouthRest.x + 0.0025 * open, mouthRest.y, mouthRest.z);

      refreshPartMatrices();
    },
    resetFacing(f) {
      facing = f;
      yaw = facingYaw(f);
      yawFrom = yaw;
      yawTo = yaw;
      turnT = 1;
    },
    setVisible(v) {
      if (v === visible) return;
      visible = v;
      pivot.visible = v;
    },
    dispose() {
      for (const p of parts) {
        (p.mesh.material as Material).dispose();
        p.mesh.customDepthMaterial?.dispose();
      }
      pivot.removeFromParent();
    },
  };
}

/** Per-part looks that glTF could not carry: wet eyes, a soft sheen on the skin, lively fins. */
function tuneFishMaterial(name: string, mat: Material): void {
  if (mat instanceof MeshPhysicalMaterial) {
    if (name === 'HERO_fish_body') {
      mat.sheen = 0.3;
      mat.sheenRoughness = 0.5;
      mat.sheenColor.setRGB(1.0, 0.75, 0.5);
      mat.clearcoat = 0.18;
      mat.clearcoatRoughness = 0.25;
      mat.envMapIntensity = 0.75;
      mat.roughness = 0.42;
    } else if (name.includes('fin') || name.includes('tail')) {
      mat.sheen = 0.5;
      mat.sheenRoughness = 0.6;
      mat.sheenColor.setRGB(1.0, 0.72, 0.5);
      mat.roughness = 0.5;
      mat.envMapIntensity = 0.6;
    } else if (name.includes('mouth')) {
      mat.roughness = 0.45;
    }
  }
  if (mat instanceof MeshStandardMaterial || mat instanceof MeshPhysicalMaterial) {
    if (name.includes('eye') && !name.includes('glint')) {
      mat.roughness = 0.08;
      mat.envMapIntensity = 1.4;
      if (mat instanceof MeshPhysicalMaterial) {
        mat.clearcoat = 1;
        mat.clearcoatRoughness = 0.04;
      }
    }
    if (name.includes('glint')) {
      mat.emissiveIntensity = 1.6;
    }
  }
}
