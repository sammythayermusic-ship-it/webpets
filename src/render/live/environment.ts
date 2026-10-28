// The room the bowl reflects. three's RoomEnvironment is a studio full of hard-edged light panels,
// and on a glossy sphere those come back as three blown-out white discs. This is a quieter room: a
// sky-to-floor gradient dome, one large soft window up and to the left, and a dim warm panel behind
// and to the right for a rim. It is rendered once through PMREMGenerator at mount.

import { BackSide, BufferAttribute, Color, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, SphereGeometry } from 'three';

const SKY = new Color(0.86, 0.9, 0.96);
const HORIZON = new Color(0.52, 0.56, 0.64);
const FLOOR = new Color(0.16, 0.15, 0.17);

function mix(a: Color, b: Color, t: number): [number, number, number] {
  return [a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t];
}

/** Build the environment scene. Dispose of it (geometry + materials) after `fromScene`. */
export function createStudioEnvironment(): Scene {
  const scene = new Scene();
  const dome = new SphereGeometry(10, 32, 16);
  const pos = dome.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i) / 10; // -1..1
    const c = y >= 0 ? mix(HORIZON, SKY, Math.pow(y, 0.7)) : mix(HORIZON, FLOOR, Math.pow(-y, 0.6));
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }
  dome.setAttribute('color', new BufferAttribute(colors, 3));
  scene.add(new Mesh(dome, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));

  // The window: large and soft, radiance well above 1 so it reads as a light, not a wall.
  const window_ = new Mesh(new PlaneGeometry(5, 6), new MeshBasicMaterial({ color: new Color(3.2, 3.3, 3.5) }));
  window_.position.set(-6, 4.5, 5);
  window_.lookAt(0, 0, 0);
  scene.add(window_);

  // A warm, dimmer panel behind and to the right: the rim light's reflection.
  const panel = new Mesh(new PlaneGeometry(3, 2.5), new MeshBasicMaterial({ color: new Color(1.6, 1.3, 1.0) }));
  panel.position.set(5, 3, -6);
  panel.lookAt(0, 0, 0);
  scene.add(panel);

  // A faint cool fill from the front-right, where a monitor would be.
  const fill = new Mesh(new PlaneGeometry(2.5, 1.6), new MeshBasicMaterial({ color: new Color(0.9, 1.0, 1.2) }));
  fill.position.set(4, 0.5, 7);
  fill.lookAt(0, 0, 0);
  scene.add(fill);
  return scene;
}

export function disposeEnvironment(scene: Scene): void {
  scene.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      (o.material as MeshBasicMaterial).dispose();
    }
  });
}
