// The live goldfish: its mesh, its maps and its materials, ready for any Three scene to place.
//
// Built from code by assets/3d/scripts/gf_shape.py, gf_maps.py and gf_build.py: a lofted body whose UVs
// are the loft's own parameters, so the maps beside the model (scales with darker margins, a lateral
// line, the gill cover, the eye socket; fin rays; an iris) land exactly where they were computed.
// Every part bends in the vertex shader (shaders.ts) from uniforms the caller drives each frame;
// this module only builds the parts and hands back the per-part uniforms the caller updates.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { assetUrl } from '../assets';
import {
  FISH_BODY_EMISSIVE,
  FISH_FIN_EMISSIVE,
  FISH_FRAGMENT_PARS,
  FISH_MUTE,
  FISH_NORMAL_BEGIN,
  FISH_VERTEX_BEGIN,
  FISH_VERTEX_PARS,
} from './shaders';

/** Where the shipped goldfish lives (Vite publicDir = assets/). */
export const GOLDFISH_DIR = 'live/goldfish/';

/** Uniforms every fish part shares; the caller writes them once per frame. */
export interface FishSharedUniforms {
  uAmp: THREE.IUniform<number>;
  uK: THREE.IUniform<number>;
  uPhase: THREE.IUniform<number>;
  uTurn: THREE.IUniform<number>;
  uSway: THREE.IUniform<number>;
  uFlutter: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  /** The key light's colour times its strength: drives the thin-edge glow and the light through fins. */
  uGlow: THREE.IUniform<THREE.Color>;
  /** Direction TO the key light, in view space. */
  uKeyView: THREE.IUniform<THREE.Vector3>;
  /** Pectoral sculling, 0..1, and fin spread (below 1 folded, above 1 fanned): from the spine. */
  uScull: THREE.IUniform<number>;
  uSpread: THREE.IUniform<number>;
  /** How far the colours are muted toward grey, 0..1 (night). */
  uMute: THREE.IUniform<number>;
}

export function createFishUniforms(): FishSharedUniforms {
  return {
    uAmp: { value: 0 },
    uK: { value: 0 },
    uPhase: { value: 0 },
    uTurn: { value: 0 },
    uSway: { value: 0 },
    uFlutter: { value: 0 },
    uTime: { value: 0 },
    uGlow: { value: new THREE.Color(1, 1, 1) },
    uKeyView: { value: new THREE.Vector3(0, 1, 0) },
    uScull: { value: 0.5 },
    uSpread: { value: 1 },
    uMute: { value: 0 },
  };
}

export interface FishPart {
  mesh: THREE.Mesh;
  /** uToRoot / uFromRoot: the caller writes this part's root-space transform each frame. */
  uniforms: Record<string, THREE.IUniform>;
}

export interface FishModel {
  /** RIG_fish_root, at identity: the caller scales, places and turns it. */
  readonly root: THREE.Object3D;
  readonly parts: readonly FishPart[];
  /** The mouth, whose origin is its own centre, so a scale opens it in place; with its rest position. */
  readonly mouth: { object: THREE.Object3D; base: THREE.Vector3 } | null;
  dispose(): void;
}

type Kind = 'body' | 'fin' | 'eye' | 'mouth';

/** 0 rigid, 1 dorsal/anal (trailing edge), 2 paired fins (scull), 3 tail. */
type FlutterMode = 0 | 1 | 2 | 3;

function kindOf(name: string): Kind {
  if (name.includes('_fin_') || name.includes('tail')) return 'fin';
  if (name.includes('eye')) return 'eye';
  if (name.includes('mouth')) return 'mouth';
  return 'body';
}

function flutterOf(mesh: THREE.Object3D): FlutterMode {
  const m = mesh.userData['wp_flutter'];
  return m === 1 || m === 2 || m === 3 ? m : 0;
}

function vec3Of(v: unknown, fallback: THREE.Vector3): THREE.Vector3 {
  if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')) return new THREE.Vector3(v[0], v[1], v[2]);
  return fallback;
}

interface Maps {
  bodyColor: THREE.Texture;
  bodyNormal: THREE.Texture;
  bodyOrm: THREE.Texture;
  finColor: THREE.Texture;
  finNormal: THREE.Texture;
  eye: THREE.Texture;
}

async function loadMaps(renderer: THREE.WebGLRenderer): Promise<Maps> {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = async (file: string, srgb: boolean, repeatU: boolean): Promise<THREE.Texture> => {
    const t = await loader.loadAsync(assetUrl(GOLDFISH_DIR + file));
    // glTF UVs put v = 0 at the top of the image, as the maps were written.
    t.flipY = false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = repeatU ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = aniso;
    t.needsUpdate = true;
    return t;
  };
  const [bodyColor, bodyNormal, bodyOrm, finColor, finNormal, eye] = await Promise.all([
    load('body_color.jpg', true, false),
    load('body_normal.jpg', false, false),
    load('body_orm.png', false, false),
    load('fin_color.png', true, true),
    load('fin_normal.png', false, true),
    load('eye.png', true, false),
  ]);
  return { bodyColor, bodyNormal, bodyOrm, finColor, finNormal, eye };
}

function materialFor(kind: Kind, maps: Maps): THREE.MeshPhysicalMaterial {
  switch (kind) {
    case 'body':
      // Scales that glint as the fish turns (a little metalness from the map), a wet clear coat
      // over them, and the thin-edge glow injected below.
      return new THREE.MeshPhysicalMaterial({
        map: maps.bodyColor,
        normalMap: maps.bodyNormal,
        normalScale: new THREE.Vector2(1.15, 1.15),
        roughnessMap: maps.bodyOrm,
        metalnessMap: maps.bodyOrm,
        aoMap: maps.bodyOrm,
        aoMapIntensity: 0.8,
        roughness: 1,
        metalness: 1,
        clearcoat: 0.55,
        clearcoatRoughness: 0.14,
      });
    case 'fin':
      // The membrane's alpha comes from the map; light through it is the injected back-light term.
      return new THREE.MeshPhysicalMaterial({
        map: maps.finColor,
        normalMap: maps.finNormal,
        normalScale: new THREE.Vector2(0.8, 0.8),
        roughness: 0.42,
        clearcoat: 0.25,
        clearcoatRoughness: 0.3,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    case 'eye':
      // A cornea: the iris under a sharp clear coat, so the key light leaves a real highlight.
      return new THREE.MeshPhysicalMaterial({
        map: maps.eye,
        roughness: 0.3,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
      });
    case 'mouth':
      return new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  }
}

/** Wire the bend (every part) and the kind's fragment term into a material. */
function inject(mat: THREE.MeshPhysicalMaterial, kind: Kind, flutter: FlutterMode, shared: FishSharedUniforms, own: Record<string, THREE.IUniform>): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, own);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FISH_VERTEX_PARS}`)
      .replace('#include <beginnormal_vertex>', FISH_NORMAL_BEGIN)
      .replace('#include <begin_vertex>', FISH_VERTEX_BEGIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FISH_FRAGMENT_PARS}`)
      .replace('#include <dithering_fragment>', FISH_MUTE);
    if (kind === 'body') shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', FISH_BODY_EMISSIVE);
    if (kind === 'fin') shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', FISH_FIN_EMISSIVE);
  };
  // onBeforeCompile output is cached by the shader source, which does not change per part; the
  // uniforms differ, so each kind/mode needs its own program key.
  mat.customProgramCacheKey = () => `wp-goldfish-${kind}-${flutter}`;
}

/** Load the goldfish and build its parts. `shared` is written by the caller every frame. */
export async function loadFishModel(renderer: THREE.WebGLRenderer, shared: FishSharedUniforms): Promise<FishModel> {
  const [gltf, maps] = await Promise.all([new GLTFLoader().loadAsync(assetUrl(GOLDFISH_DIR + 'goldfish.glb')), loadMaps(renderer)]);
  const root = gltf.scene.getObjectByName('RIG_fish_root') ?? gltf.scene;
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  const parts: FishPart[] = [];
  let mouth: FishModel['mouth'] = null;
  gltf.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const kind = kindOf(o.name);
    const flutter = flutterOf(o);
    const mat = materialFor(kind, maps);
    const own: Record<string, THREE.IUniform> = {
      uToRoot: { value: new THREE.Matrix4() },
      uFromRoot: { value: new THREE.Matrix4() },
      uFlutterMode: { value: flutter },
      uFinRoot: { value: vec3Of(o.userData['wp_root'], new THREE.Vector3()) },
      uFinLen: { value: typeof o.userData['wp_len'] === 'number' ? o.userData['wp_len'] : 0.01 },
    };
    inject(mat, kind, flutter, shared, own);
    if (o.material instanceof THREE.Material) o.material.dispose();
    o.material = mat;
    o.frustumCulled = false;
    // Fins are see-through: drawn after the opaque body so the body shows through them.
    if (kind === 'fin') o.renderOrder = 1;
    parts.push({ mesh: o, uniforms: own });
    if (kind === 'mouth') mouth = { object: o, base: o.position.clone() };
  });
  return {
    root,
    parts,
    mouth,
    dispose() {
      for (const p of parts) {
        p.mesh.geometry.dispose();
        if (p.mesh.material instanceof THREE.Material) p.mesh.material.dispose();
      }
      for (const t of Object.values(maps)) t.dispose();
    },
  };
}
