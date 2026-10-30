// The procedural spine's parameters, derived from what the behaviour reports. Pure, so the mapping
// from "how fast, which way, what state" to "how much bend, how fast a beat" is testable without a
// GPU and tunable in one place.
//
// Units: amplitude in metres of the fish's own (unscaled Blender) space, where the body runs from
// x = -0.041 (tail root) to +0.041 (nose) and the tail fin reaches -0.058; beats in Hz; angles in rad.

import type { PetAnim } from '../types';
import type { Expression } from '../expression';

export interface SpineInput {
  /** Ground covered this tick, grid px per tick (0 when holding position). */
  speed: number;
  /** Vertical component of that travel, grid px per tick, +down (grid y). */
  vy: number;
  /** True while a facing flip is being played. */
  turning: boolean;
  anim: PetAnim;
  expression: Expression | null;
}

export interface SpineParams {
  /** Lateral bend at the tail root. */
  amplitude: number;
  /** Beats per second of the travelling wave. */
  hz: number;
  /** Radians of wave along the body (head to tail tip). About one wavelength at 2π. */
  waveK: number;
  /** Pectoral fin flutter rate and sweep. */
  finHz: number;
  finAmp: number;
  /** Nose up (+) or down (-), rad, from vertical travel and state. */
  pitch: number;
  /** How far behind the body wave the tail fin swings, rad of phase. */
  tailLag: number;
  /** Extra tail swing on top of the body bend, as a fraction of amplitude. */
  tailGain: number;
}

/** Speed the content figure-eight runs at; above this the fish is darting at food. */
const CRUISE_PX_PER_TICK = 3;

export function spineParams(input: SpineInput): SpineParams {
  const speed = Math.max(0, input.speed);
  const cruise = Math.min(1, speed / CRUISE_PX_PER_TICK);
  // The travel pitch: a diving fish noses down. Clamped to a believable tilt and softened so the
  // 8 Hz staircase of the behaviour does not bob the nose.
  const travelPitch = speed > 0.05 ? Math.max(-0.35, Math.min(0.35, -Math.atan2(input.vy, Math.max(0.5, speed)) * 0.6)) : 0;
  let p: SpineParams = {
    amplitude: 0.0022 + 0.0026 * cruise,
    hz: 1.5 + 1.6 * cruise + Math.max(0, speed - CRUISE_PX_PER_TICK) * 0.35,
    waveK: 5.2,
    finHz: 1.8 + 1.4 * cruise,
    finAmp: 0.32,
    pitch: travelPitch,
    tailLag: 0.9,
    tailGain: 0.55,
  };
  switch (input.anim) {
    case 'eat':
      p = { ...p, hz: p.hz + 1.2, amplitude: p.amplitude * 0.8, finHz: 4, finAmp: 0.4 };
      break;
    case 'hungry':
      // Slow sway, low energy, nose a little down: a fish with nothing to do and no strength to do it.
      p = { ...p, amplitude: 0.0017, hz: 0.85 + 0.6 * cruise, finHz: 1.1, finAmp: 0.2, pitch: travelPitch - 0.08 };
      break;
    case 'sleep':
      p = { ...p, amplitude: 0.0011, hz: 0.45, finHz: 0.6, finAmp: 0.12, pitch: -0.06 };
      break;
    case 'dead':
      // Only the water moves it.
      p = { ...p, amplitude: 0.0005, hz: 0.3, finHz: 0.25, finAmp: 0.05, pitch: 0 };
      break;
    default:
      break;
  }
  if (input.turning && input.anim !== 'dead') p = { ...p, amplitude: p.amplitude * 1.5, hz: p.hz + 0.8 };
  if (input.anim === 'idle' || input.anim === 'eat') {
    switch (input.expression) {
      case 'excited':
        p = { ...p, hz: p.hz + 1.2, finHz: p.finHz + 1.5, finAmp: p.finAmp + 0.1 };
        break;
      case 'happy':
        p = { ...p, hz: p.hz + 0.4, pitch: p.pitch + 0.05 };
        break;
      case 'curious':
        p = { ...p, hz: p.hz - 0.3, pitch: p.pitch + 0.1, finHz: p.finHz + 0.5 };
        break;
      default:
        break;
    }
  }
  return p;
}

/** Advance a phase by `hz` over `dtMs`, wrapped so a long session never loses float precision. */
export function advancePhase(phase: number, hz: number, dtMs: number): number {
  const next = phase + 2 * Math.PI * hz * (dtMs / 1000);
  return next > 1e4 ? next - 1e4 : next;
}

/**
 * Yaw for a facing, and the eased yaw while a flip is in flight. Facing +1 (head right) is yaw 0;
 * facing -1 is yaw -π, and the turn always passes through -π/2 -- the nose swinging toward the
 * camera -- because a desktop pet turning away from you is a pet you cannot see.
 */
export function facingYaw(facing: 1 | -1): number {
  return facing === 1 ? 0 : -Math.PI;
}

/** Smooth ease for a turn, 0..1 -> 0..1 with zero slope at both ends. */
export function turnEase(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/** Bank into the turn: a half-sine over the flip, largest mid-turn. */
export function turnBank(t: number, maxRad: number): number {
  const c = Math.max(0, Math.min(1, t));
  return Math.sin(c * Math.PI) * maxRad;
}
