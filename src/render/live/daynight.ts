// The light rig as a function of the hour and the night amount. Pure so it can be tested, and so the
// whole look of a time of day lives in one table instead of being spread across light objects.
//
// Directions are the three Blender area lights of wp_scene.blend converted to glTF space (x, z, -y),
// so the live key, fill and rim strike the bowl from where the rendered art's did. Intensities are
// three.js directional-light units under ACES; they were set by eye against the shipped bg.png.

export interface RigLight {
  color: [number, number, number];
  intensity: number;
  /** Unit direction the light TRAVELS, world space. The light sits at -direction * distance. */
  direction: [number, number, number];
}

export interface LightRig {
  key: RigLight;
  fill: RigLight;
  rim: RigLight;
  /** Hemisphere sky / ground colours and intensity. */
  skyColor: [number, number, number];
  groundColor: [number, number, number];
  hemiIntensity: number;
  /** Environment-map reflection strength (the studio room on the glass and the eyes). */
  envIntensity: number;
  /** Caustic brightness on the gravel. */
  caustic: number;
  /** Tone-mapping exposure. */
  exposure: number;
}

const KEY_DIR: [number, number, number] = norm([0.258, -0.917, -0.303]);
const FILL_DIR: [number, number, number] = norm([-0.78, -0.075, -0.62]);
const RIM_DIR: [number, number, number] = norm([-0.244, -0.584, 0.775]);

function norm(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

function mix3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 0 at midday, 1 at dawn/dusk (07:00 and 19:00), on a smooth bump; the sun's warmth. */
export function warmth(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  // Distance from noon in hours, 0..12; warming from 3.5 h out (08:30 / 15:30), full by 5.5 h out.
  const d = Math.abs(h - 12);
  const t = Math.max(0, Math.min(1, (d - 3.5) / 2));
  return t * t * (3 - 2 * t);
}

const DAY_KEY: [number, number, number] = [1.0, 0.93, 0.84];
const WARM_KEY: [number, number, number] = [1.0, 0.78, 0.58];
const NIGHT_KEY: [number, number, number] = [0.62, 0.72, 1.0];
const DAY_FILL: [number, number, number] = [0.68, 0.8, 1.0];
const NIGHT_FILL: [number, number, number] = [0.45, 0.55, 0.9];
const DAY_RIM: [number, number, number] = [1.0, 0.8, 0.6];
const NIGHT_RIM: [number, number, number] = [0.7, 0.8, 1.0];

/**
 * @param hour local hour, fractional, 0..24. Shapes the DAY look only (warmer and lower in the
 *   morning and evening). The day/night decision itself is the app's: `night` is what it decided.
 * @param night 0..1, the eased night amount.
 */
export function lightRig(hour: number, night: number): LightRig {
  const n = Math.max(0, Math.min(1, night));
  const w = warmth(hour);
  const dayKey = mix3(DAY_KEY, WARM_KEY, w);
  // A low sun is dimmer and comes in flatter: nudge the key toward the horizon in the warm hours.
  const keyDir = norm([KEY_DIR[0] * (1 + 0.5 * w), KEY_DIR[1] * (1 - 0.35 * w), KEY_DIR[2]]);
  return {
    key: { color: mix3(dayKey, NIGHT_KEY, n), intensity: mix(mix(3.2, 2.6, w), 0.55, n), direction: norm(mix3(keyDir, KEY_DIR, n)) },
    fill: { color: mix3(DAY_FILL, NIGHT_FILL, n), intensity: mix(0.9, 0.22, n), direction: FILL_DIR },
    rim: { color: mix3(DAY_RIM, NIGHT_RIM, n), intensity: mix(1.4, 0.7, n), direction: RIM_DIR },
    skyColor: mix3([0.75, 0.82, 0.95], [0.18, 0.22, 0.42], n),
    groundColor: mix3([0.35, 0.3, 0.26], [0.06, 0.06, 0.1], n),
    hemiIntensity: mix(0.9, 0.35, n),
    envIntensity: mix(1.0, 0.3, n),
    caustic: mix(1.0, 0.45, n),
    exposure: mix(1.0, 0.8, n),
  };
}
