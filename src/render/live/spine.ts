// Candidate C: the fish's procedural spine, as numbers. Pure: no Three, no DOM.
//
// The behaviour decides WHERE the fish is, eight times a second, in grid px; the scene interpolates
// that to every frame. This module turns that stream of positions — plus the facing and the state —
// into the parameters a vertex shader needs to bend the body: how hard the tail beats, how fast, the
// curl of a turn, the nose's pitch, the belly-up roll, the mouth. Everything is EASED here, at frame
// rate, so a facing flip is a real yaw turn and a speed change is a change of gait, not a cut.
//
// Units: root space of the exported fish mesh, metres, where +x is the nose, +y is up and +z is the
// fish's left; the mesh is 0.12 m long.

export type FacingSign = 1 | -1;

export interface SpineInput {
  /** Frame time, ms. */
  dtMs: number;
  /** Drawn body centre, grid px. */
  x: number;
  y: number;
  facing: FacingSign;
  /** The player's state name: idle, eat, hungry, sleep, dead, happy, excited, curious. */
  anim: string;
  /** Uniform random in [0, 1), for the idle gulps. */
  rng: () => number;
}

export interface SpineState {
  /** Lateral amplitude of the travelling wave at the tail tip, metres. */
  amp: number;
  /** Wave number along the body, rad/m. */
  k: number;
  /** Wave phase, rad, advanced at the beat frequency. */
  phase: number;
  /** Static curl of the body into a turn, metres at the tail tip (signed, +z = left). */
  turn: number;
  /** Yaw of the whole fish about its up axis, rad: 0 faces +x (screen right), pi faces left. */
  yaw: number;
  /** Nose pitch, rad, positive nose-up. */
  pitch: number;
  /** Roll about the body axis, rad; pi is belly-up. */
  roll: number;
  /** 0 closed .. 1 open. */
  mouth: number;
  /** Slow whole-body sway amplitude, metres, for resting states. */
  sway: number;
  /** Secondary fin flutter amplitude, metres. */
  flutter: number;
  /** Smoothed speed, grid px per second. */
  speed: number;
  /** Beat frequency, Hz. */
  beatHz: number;
}

/** Amplitude at rest and the gain per grid px/s of speed; capped so a dart does not flap flat. */
const AMP_REST = 0.0035;
const AMP_PER_SPEED = 0.00022;
const AMP_MAX = 0.014;
/** One wavelength is about 1.3 body lengths: a goldfish is a carangiform swimmer, not an eel. */
const WAVE_NUMBER = (2 * Math.PI) / 0.16;
const BEAT_REST_HZ = 1.1;
const BEAT_PER_SPEED = 0.075;
const BEAT_MAX_HZ = 4.2;
/** Time constants, ms. */
const SPEED_TAU = 160;
const YAW_TAU = 110;
const PITCH_TAU = 220;
const ROLL_TAU = 600;
const MOUTH_TAU = 45;
/** How much of the yaw rate becomes body curl, and the cap on it. */
const TURN_GAIN = 0.0032;
const TURN_MAX = 0.022;
/** Pitch follows the direction of travel, at this fraction of the true angle. */
const PITCH_FOLLOW = 0.55;
const PITCH_MAX = 0.5;
/** An idle gulp every 4..9 s. */
const GULP_MIN_MS = 4000;
const GULP_SPREAD_MS = 5000;

function ease(v: number, target: number, dtMs: number, tauMs: number): number {
  const a = 1 - Math.exp(-dtMs / tauMs);
  return v + (target - v) * a;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export interface Spine {
  update(input: SpineInput): SpineState;
  /** Snap to a pose with no easing: first placement, or a new pet. */
  reset(x: number, y: number, facing: FacingSign): void;
  state(): SpineState;
}

export function createSpine(): Spine {
  let last: { x: number; y: number } | null = null;
  let vx = 0;
  let vy = 0;
  let speed = 0;
  let phase = 0;
  let yaw = 0;
  let yawVel = 0;
  let pitch = 0;
  let roll = 0;
  let mouth = 0;
  let mouthTarget = 0;
  let eatClock = -1;
  let lastAnim = '';
  let gulpIn = GULP_MIN_MS + GULP_SPREAD_MS * 0.5;
  let gulpClock = -1;
  let s: SpineState = {
    amp: AMP_REST,
    k: WAVE_NUMBER,
    phase: 0,
    turn: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    mouth: 0,
    sway: 0,
    flutter: 0,
    speed: 0,
    beatHz: BEAT_REST_HZ,
  };

  const yawFor = (facing: FacingSign): number => (facing === 1 ? 0 : Math.PI);

  return {
    reset(x, y, facing) {
      last = { x, y };
      vx = 0;
      vy = 0;
      speed = 0;
      yaw = yawFor(facing);
      yawVel = 0;
      pitch = 0;
      roll = 0;
      mouth = 0;
      mouthTarget = 0;
      eatClock = -1;
      gulpClock = -1;
      s = { ...s, yaw, pitch, roll, mouth, speed, turn: 0 };
    },
    update(input) {
      const dt = Math.max(0, Math.min(100, input.dtMs));
      const dtS = dt / 1000;
      const dead = input.anim === 'dead';
      const asleep = input.anim === 'sleep';
      const hungry = input.anim === 'hungry';
      const eating = input.anim === 'eat';
      const lively = input.anim === 'excited' || input.anim === 'happy';

      // ---- velocity and speed, from the drawn positions
      if (last === null || dt === 0) {
        last = { x: input.x, y: input.y };
      } else {
        const ivx = (input.x - last.x) / dtS;
        const ivy = (input.y - last.y) / dtS;
        last = { x: input.x, y: input.y };
        vx = ease(vx, ivx, dt, SPEED_TAU);
        vy = ease(vy, ivy, dt, SPEED_TAU);
      }
      speed = ease(speed, Math.hypot(vx, vy), dt, SPEED_TAU);

      // ---- gait: amplitude and beat from speed, muted by state
      let amp = clamp(AMP_REST + speed * AMP_PER_SPEED, AMP_REST, AMP_MAX);
      let beat = clamp(BEAT_REST_HZ + speed * BEAT_PER_SPEED, BEAT_REST_HZ, BEAT_MAX_HZ);
      if (asleep) {
        amp = AMP_REST * 0.45;
        beat = 0.45;
      } else if (dead) {
        amp = 0;
        beat = 0;
      } else if (hungry) {
        amp *= 0.8;
        beat *= 0.85;
      } else if (lively) {
        amp = Math.max(amp, AMP_REST * 1.6);
        beat = Math.max(beat, BEAT_REST_HZ * 1.5);
      }
      phase = (phase + 2 * Math.PI * beat * dtS) % (2 * Math.PI * 1000);

      // ---- yaw: a real turn, and the body curls into it while it lasts
      const yawTarget = yawFor(input.facing);
      // shortest way round: targets are 0 and pi, so this only matters for the direction of spin,
      // which is chosen to turn through the viewer (nose swings toward the camera) every time.
      const before = yaw;
      yaw = dead ? ease(yaw, yawTarget, dt, YAW_TAU * 3) : ease(yaw, yawTarget, dt, YAW_TAU);
      yawVel = dtS > 0 ? (yaw - before) / dtS : 0;
      const turn = clamp(-yawVel * TURN_GAIN, -TURN_MAX, TURN_MAX);

      // ---- pitch: nose follows the direction of travel (screen y is down, so negate)
      let pitchTarget = 0;
      if (dead) pitchTarget = 0;
      else if (asleep) pitchTarget = -0.12;
      else if (hungry) pitchTarget = -0.08;
      else if (speed > 4) {
        const along = Math.max(Math.abs(vx), 8);
        pitchTarget = clamp(-Math.atan2(vy, along) * PITCH_FOLLOW, -PITCH_MAX, PITCH_MAX);
      }
      pitch = ease(pitch, pitchTarget, dt, PITCH_TAU);

      // ---- roll: belly-up when dead, a slight bank through a turn otherwise
      const rollTarget = dead ? Math.PI : clamp(-yawVel * 0.03, -0.12, 0.12);
      roll = ease(roll, rollTarget, dt, dead ? ROLL_TAU : PITCH_TAU);

      // ---- mouth: a bite plays two gapes; idle fish gulp now and then
      if (eating && lastAnim !== 'eat') eatClock = 0;
      lastAnim = input.anim;
      if (eatClock >= 0) {
        eatClock += dt;
        const t = eatClock / 560;
        mouthTarget = t >= 1 ? 0 : 0.5 - 0.5 * Math.cos(t * Math.PI * 4);
        if (t >= 1) eatClock = -1;
      } else if (!dead) {
        gulpIn -= dt;
        if (gulpIn <= 0 && gulpClock < 0) {
          gulpClock = 0;
          gulpIn = GULP_MIN_MS + input.rng() * GULP_SPREAD_MS;
        }
        if (gulpClock >= 0) {
          gulpClock += dt;
          const t = gulpClock / 420;
          mouthTarget = t >= 1 ? 0 : (0.5 - 0.5 * Math.cos(t * Math.PI * 2)) * 0.4;
          if (t >= 1) gulpClock = -1;
        } else {
          mouthTarget = 0;
        }
      } else {
        mouthTarget = 0.15;
      }
      mouth = ease(mouth, mouthTarget, dt, MOUTH_TAU);

      const sway = asleep ? 0.0025 : hungry ? 0.0015 : dead ? 0.002 : 0;
      const flutter = dead ? 0.0004 : asleep ? 0.0008 : 0.0016 + speed * 0.00004;

      s = { amp, k: WAVE_NUMBER, phase, turn, yaw, pitch, roll, mouth, sway, flutter, speed, beatHz: beat };
      return s;
    },
    state() {
      return s;
    },
  };
}
