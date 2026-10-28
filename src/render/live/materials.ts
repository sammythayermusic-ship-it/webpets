// Materials and shader injections for the live bowl. Everything here is a MeshPhysicalMaterial (or a
// depth material) with `onBeforeCompile` patches, so three.js keeps doing the lighting, shadows, tone
// mapping and transmission; the patches only add what glTF cannot carry: moving water normals, caustic
// light on the gravel, and a fish body that bends.

import {
  BackSide,
  Color,
  CustomBlending,
  DoubleSide,
  FrontSide,
  MeshDepthMaterial,
  MeshPhysicalMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RGBADepthPacking,
  type IUniform,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from 'three';

/** Shared time-and-light uniforms, one object so every material reads the same clock. */
export interface WorldUniforms {
  uTime: IUniform<number>;
  /** World-space height of the water's top face. */
  uWaterTop: IUniform<number>;
  /** Caustic brightness, 0..~1.2. */
  uCaustic: IUniform<number>;
  /** Water-surface ripple strength (normal slope multiplier). */
  uRipple: IUniform<number>;
}

export function createWorldUniforms(waterTop: number): WorldUniforms {
  return {
    uTime: { value: 0 },
    uWaterTop: { value: waterTop },
    uCaustic: { value: 1 },
    uRipple: { value: 1 },
  };
}

// ------------------------------------------------------------------------------------------ GLSL

const GLSL_WORLD_VARYING_PARS = /* glsl */ `
varying vec3 vWpWorld;
`;

const GLSL_WORLD_VARYING_SET = /* glsl */ `
vWpWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

/**
 * A moving web of bright lines, the look of sunlight focused by a rippling surface. The zero set of a
 * sum of three drifting sines is a network of curves; raising (1 - |sum|) to a power leaves only the
 * neighbourhood of those curves lit, and two layers at different scales break the regularity.
 */
const GLSL_CAUSTIC = /* glsl */ `
float wpCaustic(vec2 p, float t) {
  vec2 a = p * 62.0;
  float s1 = sin(a.x + t * 0.9) + sin(a.y * 1.13 - t * 0.7) + sin((a.x + a.y) * 0.71 + t * 0.5);
  vec2 b = p * 41.0 + vec2(1.7, 4.2);
  float s2 = sin(b.x * 0.93 - t * 0.6) + sin(b.y + t * 0.8) + sin((b.x - b.y) * 0.77 - t * 0.4);
  float v1 = 1.0 - abs(s1) / 3.0;
  float v2 = 1.0 - abs(s2) / 3.0;
  return pow(v1, 7.0) * 0.9 + pow(v2, 9.0) * 0.7 + pow(v1 * v2, 3.0) * 0.4;
}
`;

const GLSL_CAUSTIC_APPLY = /* glsl */ `
{
  float wpUnder = 1.0 - smoothstep(uWaterTop - 0.012, uWaterTop, vWpWorld.y);
  float wpc = wpCaustic(vWpWorld.xz, uTime) * uCaustic * wpUnder;
  reflectedLight.directDiffuse += diffuseColor.rgb * wpc * 0.55;
}
`;

/** Sum-of-sines slope field for the water's top face: returns d(height)/d(x,z) in metres per metre. */
const GLSL_WATER_SLOPE = /* glsl */ `
vec2 wpWave(vec2 p, vec2 dir, float k, float speed, float amp, float t) {
  dir = normalize(dir);
  float ph = dot(p, dir) * k - t * speed;
  return dir * (amp * k * cos(ph));
}
vec2 wpSurfaceSlope(vec2 p, float t) {
  vec2 g = vec2(0.0);
  g += wpWave(p, vec2(1.0, 0.35), 140.0, 2.1, 0.00055, t);
  g += wpWave(p, vec2(-0.6, 1.0), 210.0, 2.9, 0.00032, t);
  g += wpWave(p, vec2(0.2, -1.0), 330.0, 3.7, 0.00014, t);
  g += wpWave(p, vec2(1.0, -0.8), 95.0, 1.4, 0.0006, t);
  return g;
}
`;

const GLSL_WATER_NORMAL = /* glsl */ `
if (vWpWorld.y > uWaterTop - 0.004) {
  vec2 wpg = wpSurfaceSlope(vWpWorld.xz, uTime) * uRipple;
  vec3 wpN = normalize(vec3(-wpg.x, 1.0, -wpg.y));
  normal = normalize((viewMatrix * vec4(wpN, 0.0)).xyz);
}
`;

/**
 * Only the TOP face is an air/water interface. The sides sit against the glass, so their specular
 * belongs to the glass (drawn on top): the volume's own highlight there is cut to a quarter, or the
 * three lights burn white discs into the water a hand's width below the surface. The top face is
 * also a touch rougher, so its highlight is a soft streak rather than a mirror of the lamp.
 */
const GLSL_WATER_SPECULAR = /* glsl */ `
{
  float wpTop = step(uWaterTop - 0.004, vWpWorld.y);
  float wpS = mix(0.25, 1.0, wpTop);
  material.specularColor *= wpS;
  material.specularF90 *= wpS;
  material.roughness = max(material.roughness, wpTop * 0.14);
}
`;

/**
 * The spine. Root space is the fish's own: +x nose, +y dorsal, +z the fish's left side. Vertices
 * ahead of `uHeadX` are rigid with the head; behind it the body follows a travelling sine whose
 * amplitude grows toward the tail, and every vertex is rotated with the local tangent so a fin or
 * the tail turns with the bend rather than shearing sideways.
 */
const GLSL_SPINE_PARS = /* glsl */ `
uniform mat4 uToRoot;
uniform mat4 uFromRoot;
uniform float uPhase;
uniform float uAmp;
uniform float uWaveK;
uniform float uHeadX;
uniform float uBodyLen;
void wpSpineFrame(float x, out float xs, out float z, out float c, out float sn) {
  xs = min(x, uHeadX);
  float s = clamp((uHeadX - xs) / uBodyLen, 0.0, 1.0);
  float ph = uPhase - s * uWaveK;
  float A = uAmp * (0.15 + 0.85 * s * s);
  z = A * sin(ph);
  float dA = uAmp * 1.7 * s;
  float m = -(dA * sin(ph) - A * uWaveK * cos(ph)) / uBodyLen;
  float th = atan(m);
  c = cos(th);
  sn = sin(th);
}
vec3 wpSpinePoint(vec3 p) {
  float xs, z, c, sn;
  wpSpineFrame(p.x, xs, z, c, sn);
  float dx = p.x - xs;
  return vec3(xs + dx * c - p.z * sn, p.y, z + dx * sn + p.z * c);
}
vec3 wpSpineNormal(vec3 n, float x) {
  float xs, z, c, sn;
  wpSpineFrame(x, xs, z, c, sn);
  return vec3(c * n.x - sn * n.z, n.y, sn * n.x + c * n.z);
}
`;

const GLSL_SPINE_VERTEX = /* glsl */ `
{
  vec3 wpR = (uToRoot * vec4(transformed, 1.0)).xyz;
  transformed = (uFromRoot * vec4(wpSpinePoint(wpR), 1.0)).xyz;
}
`;

const GLSL_SPINE_NORMAL = /* glsl */ `
{
  vec3 wpR = (uToRoot * vec4(position, 1.0)).xyz;
  vec3 wpN = mat3(uToRoot) * objectNormal;
  objectNormal = mat3(uFromRoot) * wpSpineNormal(wpN, wpR.x);
}
`;

// -------------------------------------------------------------------------------- injection

function addWorldVarying(shader: WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${GLSL_WORLD_VARYING_PARS}`)
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${GLSL_WORLD_VARYING_SET}`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${GLSL_WORLD_VARYING_PARS}`);
}

function addWorldUniforms(shader: WebGLProgramParametersWithUniforms, world: WorldUniforms): void {
  shader.uniforms['uTime'] = world.uTime;
  shader.uniforms['uWaterTop'] = world.uWaterTop;
  shader.uniforms['uCaustic'] = world.uCaustic;
  shader.uniforms['uRipple'] = world.uRipple;
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    '#include <common>\nuniform float uTime;\nuniform float uWaterTop;\nuniform float uCaustic;\nuniform float uRipple;',
  );
}

/** Give a lit material the caustic light term. Returns the same material. */
export function withCaustics<M extends Material>(material: M, world: WorldUniforms): M {
  material.onBeforeCompile = (shader) => {
    addWorldVarying(shader);
    addWorldUniforms(shader, world);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_CAUSTIC}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${GLSL_CAUSTIC_APPLY}`);
  };
  material.customProgramCacheKey = () => 'wp-caustic';
  material.needsUpdate = true;
  return material;
}

export interface WaterLook {
  attenuationColor: Color;
  attenuationDistance: number;
  roughness: number;
  color: Color;
}

/** Transmission thickness of the water volume, metres. See createWaterMaterial. */
export const WATER_THICKNESS = 0.03;

/** The water as it looks alive by day; death, starvation and the memorial are blends away from this. */
export const WATER_ALIVE: WaterLook = {
  color: new Color(0.84, 0.95, 0.98),
  attenuationColor: new Color(0.22, 0.66, 0.82),
  attenuationDistance: 0.085,
  roughness: 0.07,
};
export const WATER_STARVING: WaterLook = {
  color: new Color(0.84, 0.94, 0.86),
  attenuationColor: new Color(0.3, 0.62, 0.42),
  attenuationDistance: 0.065,
  roughness: 0.06,
};
export const WATER_DEAD: WaterLook = {
  color: new Color(0.9, 0.92, 0.92),
  attenuationColor: new Color(0.62, 0.68, 0.7),
  attenuationDistance: 0.0225,
  roughness: 0.42,
};
export const WATER_MEMORIAL: WaterLook = {
  color: new Color(0.86, 0.9, 0.92),
  attenuationColor: new Color(0.4, 0.55, 0.58),
  attenuationDistance: 0.075,
  roughness: 0.04,
};

export function mixWaterLook(a: WaterLook, b: WaterLook, t: number, out: WaterLook): WaterLook {
  out.color.copy(a.color).lerp(b.color, t);
  out.attenuationColor.copy(a.attenuationColor).lerp(b.attenuationColor, t);
  out.attenuationDistance = a.attenuationDistance + (b.attenuationDistance - a.attenuationDistance) * t;
  out.roughness = a.roughness + (b.roughness - a.roughness) * t;
  return out;
}

export function applyWaterLook(m: MeshPhysicalMaterial, look: WaterLook): void {
  m.color.copy(look.color);
  m.attenuationColor.copy(look.attenuationColor);
  m.attenuationDistance = look.attenuationDistance;
  m.roughness = look.roughness;
}

/**
 * The water volume. `full` is real transmission (the fish and gravel refract through it); `lite` is a
 * tinted reflecting surface over them with no backbuffer read, which is what the quality tier drops to.
 */
export function createWaterMaterial(world: WorldUniforms, tier: 'full' | 'lite'): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    metalness: 0,
    ior: 1.333,
    // Below 1 so the three directionals do not burn white discs into the surface; the room
    // environment still gives the glossy sheet-of-water reflection.
    specularIntensity: 0.45,
    envMapIntensity: 0.6,
    side: FrontSide,
  });
  applyWaterLook(m, WATER_ALIVE);
  if (tier === 'full') {
    m.transmission = 1;
    // Thin on purpose. three.js offsets the refracted sample by the refraction vector times this
    // thickness, and at the bowl's curved sides 0.12 m smeared the fish into a double image; 0.03
    // keeps a visible bend without the ghost. The attenuation distances are scaled to match.
    m.thickness = WATER_THICKNESS;
  } else {
    m.transparent = true;
    m.opacity = 0.42;
    m.depthWrite = false;
  }
  m.onBeforeCompile = (shader) => {
    addWorldVarying(shader);
    addWorldUniforms(shader, world);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_WATER_SLOPE}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${GLSL_WATER_NORMAL}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${GLSL_WATER_SPECULAR}`);
  };
  m.customProgramCacheKey = () => `wp-water-${tier}`;
  return m;
}

/**
 * The far wall of the bowl BELOW the waterline: the opaque backdrop the water refracts when nothing
 * else is behind the fish. It is what makes the water read as a body of water rather than a tint on
 * the desktop, so it is a deep teal that darkens toward the gravel. ABOVE the waterline it is
 * discarded: the empty glass must show the desktop through it, with only the near glass's reflection
 * on top, or the bowl reads as a painted ball.
 */
export function createGlassBackMaterial(world: WorldUniforms): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: new Color(0.14, 0.52, 0.64),
    roughness: 0.55,
    metalness: 0,
    envMapIntensity: 0.25,
    side: BackSide,
  });
  m.onBeforeCompile = (shader) => {
    addWorldVarying(shader);
    addWorldUniforms(shader, world);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vWpWorld.y > uWaterTop + 0.002) discard;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.45, 1.1, smoothstep(0.03, 0.17, vWpWorld.y));');
  };
  m.customProgramCacheKey = () => 'wp-glass-back';
  return m;
}

/**
 * The near glass: reflection only. Black base so there is no diffuse term, a sliver of opacity for the
 * absorption, and ONE / ONE_MINUS_SRC_ALPHA blending so the Fresnel highlight ADDS over what is behind
 * instead of being scaled down by the opacity. Drawn last.
 */
export function createGlassFrontMaterial(): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    color: new Color(0, 0, 0),
    roughness: 0.035,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.0,
    emissive: new Color(0.55, 0.75, 0.86),
    emissiveIntensity: 0.025,
    side: FrontSide,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
  });
  m.blending = CustomBlending;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = OneFactor;
  m.blendDstAlpha = OneMinusSrcAlphaFactor;
  return m;
}

/** Uniforms a fish part's materials share: the spine state plus this part's root-space transform. */
export interface SpineUniforms {
  uToRoot: IUniform<import('three').Matrix4>;
  uFromRoot: IUniform<import('three').Matrix4>;
  uPhase: IUniform<number>;
  uAmp: IUniform<number>;
  uWaveK: IUniform<number>;
  uHeadX: IUniform<number>;
  uBodyLen: IUniform<number>;
}

function injectSpine(shader: WebGLProgramParametersWithUniforms, u: SpineUniforms): void {
  for (const [k, v] of Object.entries(u)) shader.uniforms[k] = v;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${GLSL_SPINE_PARS}`)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${GLSL_SPINE_NORMAL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${GLSL_SPINE_VERTEX}`);
}

/** Patch a fish part's lit material with the spine deformation (and the caustic light on its skin). */
export function withSpine<M extends Material>(material: M, u: SpineUniforms, world: WorldUniforms): M {
  material.onBeforeCompile = (shader) => {
    injectSpine(shader, u);
    addWorldVarying(shader);
    addWorldUniforms(shader, world);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_CAUSTIC}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${GLSL_CAUSTIC_APPLY}`);
  };
  material.customProgramCacheKey = () => 'wp-spine';
  material.needsUpdate = true;
  return material;
}

/** The matching depth material, so the fish's shadow bends with it. */
export function createSpineDepthMaterial(u: SpineUniforms): MeshDepthMaterial {
  const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  m.onBeforeCompile = (shader) => injectSpine(shader, u);
  m.customProgramCacheKey = () => 'wp-spine-depth';
  return m;
}

export { DoubleSide };
