// Bubbles for the live bowl: a handful of instanced spheres rising from the gravel, each with a bright
// Fresnel rim and a highlight, drawn OPAQUE so they sit inside the water's refraction instead of being
// pasted over it (anything transparent is invisible through a transmissive material in three.js).

import { Color, InstancedMesh, Matrix4, Object3D, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { gridToWorld, METRES_PER_GRID_PX } from './camera';
import type { Rng } from '../../sim/types';
import type { MoveBounds, WaterShape } from '../types';

const BUBBLE_COUNT = 7;
const BUBBLE_FADE_S = 0.35;
/** Radius in grid px at full size. */
const RADIUS_PX = 2.6;

interface Bubble {
  x: number;
  y: number;
  depth: number;
  vy: number;
  phase: number;
  wobble: number;
  active: boolean;
  delayMs: number;
  fade: number;
  size: number;
}

export interface Bubbles3D {
  readonly mesh: InstancedMesh;
  update(dtMs: number, rng: Rng): void;
  setEnabled(on: boolean): void;
  setWaterColor(c: Color): void;
  setLightDir(d: Vector3): void;
  dispose(): void;
}

const VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  mat4 im = modelMatrix * instanceMatrix;
  vec4 wp = im * vec4(position, 1.0);
  vN = normalize(mat3(im) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uWater;
uniform vec3 uLight;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  float fr = pow(1.0 - max(0.0, dot(n, v)), 2.2);
  vec3 h = normalize(uLight + v);
  float hl = pow(max(0.0, dot(n, h)), 70.0);
  // The middle shows the water behind (fake, but a bubble IS mostly its rim); the rim and the
  // highlight are the only places light really gathers.
  vec3 col = mix(uWater * 1.05, vec3(1.0), fr * 0.85) + hl * 0.9;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createBubbles3D(shape: WaterShape, bounds: MoveBounds): Bubbles3D {
  const geometry = new SphereGeometry(RADIUS_PX * METRES_PER_GRID_PX, 14, 10);
  const material = new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uWater: { value: new Color(0.55, 0.8, 0.9) }, uLight: { value: new Vector3(0, 1, 0.3) } },
  });
  const mesh = new InstancedMesh(geometry, material, BUBBLE_COUNT);
  mesh.name = 'bubbles';
  mesh.frustumCulled = false;
  const bubbles: Bubble[] = [];
  const dummy = new Object3D();
  const zero = new Matrix4().makeScale(0, 0, 0);
  let enabled = true;

  const halfWidthAt = (y: number): number => {
    const dy = (y - shape.cy) / shape.ry;
    const t = 1 - dy * dy;
    return t <= 0 ? 0 : shape.rx * Math.sqrt(t);
  };

  for (let i = 0; i < BUBBLE_COUNT; i += 1) {
    bubbles.push({ x: 0, y: 0, depth: 0, vy: 20, phase: 0, wobble: 2, active: false, delayMs: 300 + i * 900, fade: 0, size: 1 });
    mesh.setMatrixAt(i, zero);
  }

  const spawn = (b: Bubble, rng: Rng): void => {
    const y = bounds.floorY - 6;
    const hw = Math.max(8, halfWidthAt(y) - 8);
    b.x = shape.cx + (rng() * 2 - 1) * hw;
    b.y = y;
    b.depth = (rng() * 2 - 1) * 0.03;
    b.vy = 16 + rng() * 12;
    b.phase = rng() * Math.PI * 2;
    b.wobble = 2 + rng() * 2;
    b.size = 0.6 + rng() * 0.6;
    b.active = true;
    b.fade = 0;
  };

  return {
    mesh,
    update(dtMs, rng) {
      if (!enabled) return;
      const dt = dtMs / 1000;
      for (let i = 0; i < bubbles.length; i += 1) {
        const b = bubbles[i];
        if (!b) continue;
        if (!b.active) {
          b.delayMs -= dtMs;
          if (b.delayMs <= 0) spawn(b, rng);
          else {
            mesh.setMatrixAt(i, zero);
            continue;
          }
        }
        b.y -= b.vy * dt;
        b.phase += dt * 3;
        const x = b.x + Math.sin(b.phase) * b.wobble;
        if (b.y <= bounds.surfaceY + 2 || !bounds.inside(x, b.y)) {
          b.fade -= dt / BUBBLE_FADE_S;
          if (b.fade <= 0) {
            b.active = false;
            b.delayMs = 600 + rng() * 2600;
            mesh.setMatrixAt(i, zero);
            continue;
          }
        } else if (b.fade < 1) {
          b.fade = Math.min(1, b.fade + dt / BUBBLE_FADE_S);
        }
        const p = gridToWorld(x, b.y, b.depth);
        dummy.position.set(p.x, p.y, p.z);
        // Rising bubbles are slightly flattened, and a fading one shrinks to nothing rather than blinking.
        const s = b.size * b.fade;
        dummy.scale.set(s * 1.08, s * 0.92, s * 1.08);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      if (!on) {
        for (let i = 0; i < bubbles.length; i += 1) {
          const b = bubbles[i];
          if (!b) continue;
          b.active = false;
          b.delayMs = 300 + i * 900;
          mesh.setMatrixAt(i, zero);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    setWaterColor(c) {
      (material.uniforms['uWater'] as { value: Color }).value.copy(c);
    },
    setLightDir(d) {
      (material.uniforms['uLight'] as { value: Vector3 }).value.copy(d).normalize();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
}
