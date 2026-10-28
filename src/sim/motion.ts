// Motion primitives for behaviours. Pure arithmetic over grid px and ticks; no clock, no state of its
// own beyond what the caller carries in the small records it hands back.
//
// These exist because "the motion is position sliding between canned loops" is on the weak-points
// list, and the fix is not in the renderer. A fish that moves in straight lines between random targets
// at constant speed reads as a cursor; one that swims ARCS, with momentum in its heading, speed that
// builds and bleeds, and a wander that never repeats, reads as an animal. Every species' behaviour will
// use the same five pieces, which is why they live in the sim rather than in src/species/fish.
//
//   noise1   -- deterministic smooth noise over time, so a wander is never a loop and never a jitter
//   arc      -- a curved path between two points, sampled by distance so speed is what the caller says
//   dart     -- a burst of speed: fast attack, exponential decay
//   heading  -- a direction with angular momentum: turns build, overshoot a touch and settle
//   speed    -- a scalar with inertia: acceleration and a (slower) deceleration, so stopping has weight

export interface Vec {
  x: number;
  y: number;
}

const TAU = Math.PI * 2;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Smoothstep, for the noise and for the arc's ease. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** A 32-bit integer hash, so the same (seed, lattice point) always gives the same value in [0, 1). */
function hash(seed: number, i: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (i >>> 0), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Smooth value noise in [-1, 1] along one axis, at `t` in whatever unit the caller likes (ticks,
 * seconds). Lattice points one unit apart, cubic-smoothed between, so it is continuous and its
 * derivative is continuous: no kinks, no steps. Two octaves, the second at twice the frequency and
 * half the weight, which is enough texture to stop it reading as a sine and not enough to read as
 * jitter. Deterministic in `seed`, so a test can pin it and two pets never share a wander.
 */
export function noise1(seed: number, t: number): number {
  const one = (freq: number, s: number): number => {
    const x = t * freq;
    const i = Math.floor(x);
    const f = smooth(x - i);
    const a = hash(s, i) * 2 - 1;
    const b = hash(s, i + 1) * 2 - 1;
    return a + (b - a) * f;
  };
  return clamp((one(1, seed) * 2 + one(2, seed + 7919)) / 3, -1, 1);
}

/**
 * A quadratic arc from `a` to `b` that bows out sideways by `bulge` (grid px, signed: positive bows to
 * the left of travel). Sampled at `tFrac` in [0, 1] of ARC LENGTH, not of the parameter, so a caller
 * stepping `tFrac` evenly moves at a constant speed along the curve. The length is computed once per
 * arc and reused, which is what `Arc` carries.
 */
export interface Arc {
  readonly a: Vec;
  readonly b: Vec;
  readonly c: Vec;
  readonly length: number;
  /** Cumulative length at each of SAMPLES+1 parameter steps, for the arc-length lookup. */
  readonly table: readonly number[];
}

const ARC_SAMPLES = 24;

export function arc(a: Vec, b: Vec, bulge: number): Arc {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  // Perpendicular to travel; for a zero-length arc there is no travel, so no bow.
  const nx = d > 0 ? -dy / d : 0;
  const ny = d > 0 ? dx / d : 0;
  const c = { x: (a.x + b.x) / 2 + nx * bulge, y: (a.y + b.y) / 2 + ny * bulge };
  // No travel, no curve, no rounding residue: the sampled sum below would otherwise be a few 1e-14.
  if (d === 0) return { a, b, c, length: 0, table: new Array<number>(ARC_SAMPLES + 1).fill(0) };
  const table: number[] = [0];
  let prev = a;
  let len = 0;
  for (let i = 1; i <= ARC_SAMPLES; i++) {
    const p = bezier(a, c, b, i / ARC_SAMPLES);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    table.push(len);
    prev = p;
  }
  return { a, b, c, length: len, table };
}

function bezier(a: Vec, c: Vec, b: Vec, u: number): Vec {
  const v = 1 - u;
  return { x: v * v * a.x + 2 * v * u * c.x + u * u * b.x, y: v * v * a.y + 2 * v * u * c.y + u * u * b.y };
}

/** The point `dist` grid px along the arc from its start (clamped to the ends). */
export function alongArc(arcDef: Arc, dist: number): Vec {
  if (arcDef.length <= 0) return { ...arcDef.a };
  const s = clamp(dist, 0, arcDef.length);
  // Find the sample interval containing s and interpolate the parameter inside it.
  const t = arcDef.table;
  let i = 1;
  while (i < t.length - 1 && (t[i] ?? 0) < s) i++;
  const lo = t[i - 1] ?? 0;
  const hi = t[i] ?? arcDef.length;
  const frac = hi > lo ? (s - lo) / (hi - lo) : 0;
  const u = (i - 1 + frac) / ARC_SAMPLES;
  return bezier(arcDef.a, arcDef.c, arcDef.b, u);
}

/** The travel direction at `dist` along the arc, as a unit vector (the chord direction for a degenerate arc). */
export function arcHeading(arcDef: Arc, dist: number): Vec {
  const eps = Math.max(0.5, arcDef.length / ARC_SAMPLES);
  const p = alongArc(arcDef, dist - eps / 2);
  const q = alongArc(arcDef, dist + eps / 2);
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d > 0) return { x: dx / d, y: dy / d };
  const cx = arcDef.b.x - arcDef.a.x;
  const cy = arcDef.b.y - arcDef.a.y;
  const cd = Math.hypot(cx, cy);
  return cd > 0 ? { x: cx / cd, y: cy / cd } : { x: 1, y: 0 };
}

/**
 * Speed `ticks` after a dart began, for a dart that peaks at `peak` px/tick and has bled to a tenth
 * of that after `duration` ticks. The attack is instant: that is what a startle or a lunge is, and it
 * is also why the renderer's spine bend needs the speed, not the position, to read the burst.
 */
export function dartSpeed(ticks: number, peak: number, duration: number): number {
  if (ticks < 0 || duration <= 0) return 0;
  return peak * Math.pow(0.1, ticks / duration);
}

/**
 * A direction with angular momentum. `angle` in radians (0 = +x, counter-clockwise positive on a
 * y-down grid reads clockwise on screen, which is fine: everything here agrees with itself).
 *
 * `turn` steers toward a target angle with a spring-damper: the rate builds, the heading overshoots
 * slightly and settles. The overshoot is deliberate and small — it is the weight of the animal's
 * head coming round. `maxRate` caps the rate so a 180° turn is a sweep, never a snap.
 */
export interface Heading {
  angle: number;
  /** Radians per tick. */
  rate: number;
}

export interface TurnTuning {
  /** Spring stiffness per tick²: how eagerly the heading seeks the target. */
  stiffness: number;
  /** Damping per tick in (0, 1): 1 is critically dead, lower overshoots. */
  damping: number;
  /** Radians per tick cap. */
  maxRate: number;
}

/** A 90° turn overshoots by ~0.08 rad and settles in ~17 ticks (two seconds); a reversal takes ≥6 ticks at the cap. */
export const DEFAULT_TURN: TurnTuning = { stiffness: 0.18, damping: 0.6, maxRate: 0.6 };

/** Shortest signed difference `to - from`, in (-π, π]. */
export function angleDiff(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

export function turn(h: Heading, target: number, tuning: TurnTuning = DEFAULT_TURN): Heading {
  const err = angleDiff(h.angle, target);
  let rate = (h.rate + err * tuning.stiffness) * tuning.damping;
  rate = clamp(rate, -tuning.maxRate, tuning.maxRate);
  let angle = h.angle + rate;
  angle %= TAU;
  if (angle < 0) angle += TAU;
  return { angle, rate };
}

/** Heading as a unit vector. */
export function headingVec(h: Heading): Vec {
  return { x: Math.cos(h.angle), y: Math.sin(h.angle) };
}

/** Which way the sprite should face: +1 right, -1 left, with a dead zone around straight up/down so a vertical climb does not flip. */
export function facingOf(h: Heading, current: 1 | -1, deadZone = 0.25): 1 | -1 {
  const cx = Math.cos(h.angle);
  if (Math.abs(cx) < deadZone) return current;
  return cx >= 0 ? 1 : -1;
}

/**
 * A speed with inertia. Builds toward `target` at `accel` px/tick² and bleeds at `decel`; the two are
 * separate because stopping should take longer than starting — the drag of water or the slide of a
 * paw on bedding — and that asymmetry is most of what "weight when a pet stops" means.
 */
export interface SpeedTuning {
  accel: number;
  decel: number;
}

export const DEFAULT_SPEED: SpeedTuning = { accel: 0.35, decel: 0.12 };

export function approachSpeed(speed: number, target: number, tuning: SpeedTuning = DEFAULT_SPEED): number {
  const t = Math.max(0, target);
  if (speed < t) return Math.min(t, speed + tuning.accel);
  return Math.max(t, speed - tuning.decel);
}

/** Ticks a speed needs to bleed from `from` to `to` under `tuning`; for stopping distance and arrival planning. */
export function ticksToSlow(from: number, to: number, tuning: SpeedTuning = DEFAULT_SPEED): number {
  if (from <= to) return 0;
  return Math.ceil((from - to) / tuning.decel);
}

/** Distance covered while bleeding from `from` to a stop. */
export function stoppingDistance(from: number, tuning: SpeedTuning = DEFAULT_SPEED): number {
  let d = 0;
  let v = from;
  while (v > 0) {
    v = approachSpeed(v, 0, tuning);
    d += v;
  }
  return d;
}
