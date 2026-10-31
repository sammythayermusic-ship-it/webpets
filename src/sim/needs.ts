// Needs beyond hunger, and the attention model. Pure: timestamps in, numbers out, no clock, no RNG.
//
// Hunger is the need the whole app was built around, and it set the rule every other need follows
// here: nothing is a running counter. Each need is an ANCHOR -- a value at a moment -- and its value
// now is a function of the anchor, the time since, and the regime the pet has been in (awake or
// asleep, fed or starving, watched or alone). The clock never pauses, so closing the app for a week
// has to leave the pet exactly as tired, as bored and as settled as a week in that regime would make
// it; a counter advanced per frame cannot do that, an anchor can.
//
// Four needs, each one thing the user can read off the animal without a HUD:
//   energy    -- drains awake, restores asleep. A rested pet darts and explores; a tired one hovers and
//                eventually naps in daylight. This is what gives the pet a DAY rather than a loop.
//   curiosity -- rises with quiet, falls with stimulus. After a long absence the pet comes to the
//                glass; after an hour of your cursor it stops caring. Personality sets the rate.
//   comfort   -- eases toward whatever the circumstances deserve: fed, rested, unbothered and (for the
//                sociable ones) accompanied is comfortable; starving, tapped at and alone is not. A
//                comfortable pet takes the middle of its home; an uncomfortable one keeps to the edges.
//   stress    -- the sharp one. A tap on the glass adds a jolt that decays in minutes. Enough of them
//                and the pet hides, which is the one reaction a child learns from immediately.
//
// The regime is passed IN, piecewise-constant. The app knows the day/night schedule and whether the
// pointer is around; this module does not, and must not, so that it can be tested against a fixed
// story and so a long absence can be replayed as a list of segments. `advanceNeeds` is idempotent
// for a time at or before the anchor, like `reconcile`.

import { HOUR_MS, MINUTE_MS } from './constants';
import type { HungerLabel, Personality } from './types';

/** A value at a moment. Every need is one of these. */
export interface NeedAnchor {
  value: number;
  at: number;
}

export interface NeedsState {
  version: 1;
  /** 0 exhausted .. 1 rested. */
  energy: NeedAnchor;
  /** 0 sated .. 1 dying to know what that is. */
  curiosity: NeedAnchor;
  /** 0 miserable in its skin .. 1 settled. */
  comfort: NeedAnchor;
  /** 0 calm .. 1 rattled. Taps on the glass. */
  stress: NeedAnchor;
  /** Last pointer arrival, tap, feed or bite. */
  lastStimulusAt: number;
  /** Last moment the user was known to be present (pointer over the habitat). */
  lastSeenAt: number;
  /** A greeting is due until this moment (set on arrival after a long absence), else 0. */
  greetUntil: number;
}

/** What the pet has been doing since its anchors; constant over the span being advanced. */
export interface NeedsRegime {
  asleep: boolean;
  hungerLabel: HungerLabel;
  /** The pointer is over the habitat. */
  present: boolean;
  personality: Personality;
}

export type Stimulus = 'pointer' | 'tap' | 'feed' | 'bite';

/** What the behaviour reads. Every number is 0..1 and already weighed by personality and state. */
export interface Drives {
  /** How much the pet wants to move at all: speed, range and the odds of a dart. */
  activity: number;
  /** How much it wants to come to the glass while someone is there. */
  approach: number;
  /** How much it wants to be out of sight: behind the plant, hugging the floor. */
  hide: number;
  /** It would rather be asleep, in daylight. Hysteresis is the caller's: pass what it is doing now. */
  nap: boolean;
  /** Come say hello: the first seconds after someone returns from a long absence. */
  greet: boolean;
  /** Interest in the surface (a fish gulps there; a hamster checks the hopper). */
  surface: number;
}

// ---- rates -----------------------------------------------------------------------------------------
// Tuned as durations rather than per-tick deltas, so each one says a sentence. All are exported for
// the dev panel and for the tests, which check the sentence rather than the arithmetic.

/** A rested pet is empty after this long awake. */
export const ENERGY_AWAKE_TO_EMPTY_MS = 16 * HOUR_MS;
/** An exhausted pet is rested after this long asleep. */
export const ENERGY_ASLEEP_TO_FULL_MS = 8 * HOUR_MS;
/** With nothing happening, curiosity is full after this long (at personality factor 1). */
export const CURIOSITY_TO_FULL_MS = 2 * HOUR_MS;
/** Comfort covers 63% of the distance to its target in this long. */
export const COMFORT_TAU_MS = 45 * MINUTE_MS;
/** A tap's jolt halves in this long. */
export const STRESS_HALF_LIFE_MS = 10 * MINUTE_MS;
/** Away this long, you are greeted when you come back. */
export const LONG_ABSENCE_MS = 2 * HOUR_MS;
/** How long the greeting impulse lasts after arrival. */
export const GREET_MS = 20_000;
/** A nap is wanted below this energy, and ends above `NAP_WAKE_ENERGY`. */
export const NAP_ENERGY = 0.15;
export const NAP_WAKE_ENERGY = 0.5;
/** No napping within this long of a stimulus: something is happening. */
export const NAP_QUIET_MS = 5 * MINUTE_MS;
/** Hide when stress is above this (scaled by personality). */
export const HIDE_STRESS = 0.5;

/**
 * Per-personality dials. The same four personalities as the mood engine and the speech pools, read
 * through a different lens: not how the pet FEELS, but how its needs move and what it does about them.
 *
 *   curiosity  -- how fast boredom builds. A degen is bored in an hour; a zen pet takes most of a day.
 *   jolt       -- how much one tap costs. An anxious pet is rattled by one; a zen pet barely notices.
 *   sociable   -- how much company is worth, in comfort. The anxious pet is the odd one: company
 *                 soothes it MORE than most, because being alone is what frightens it.
 *   aloof      -- the sarcastic pet's trick: it ignores you until it cannot, then stares.
 *   calm       -- resting comfort. Zen pets are comfortable by default; anxious ones never quite are.
 *   pace       -- baseline activity multiplier.
 */
const DIALS: Readonly<Record<Personality, { curiosity: number; jolt: number; sociable: number; aloof: number; calm: number; pace: number }>> = {
  zen: { curiosity: 0.6, jolt: 0.15, sociable: 0.8, aloof: 0, calm: 0.75, pace: 0.8 },
  sarcastic: { curiosity: 0.8, jolt: 0.25, sociable: 0.7, aloof: 0.6, calm: 0.55, pace: 1.0 },
  anxious: { curiosity: 1.2, jolt: 0.4, sociable: 1.15, aloof: 0, calm: 0.4, pace: 1.05 },
  degen: { curiosity: 1.6, jolt: 0.25, sociable: 1.3, aloof: 0, calm: 0.6, pace: 1.25 },
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0;
}

function anchor(value: number, at: number): NeedAnchor {
  return { value: clamp01(value), at };
}

export function defaultNeeds(now: number): NeedsState {
  return {
    version: 1,
    energy: anchor(1, now),
    curiosity: anchor(0.5, now),
    comfort: anchor(0.6, now),
    stress: anchor(0, now),
    lastStimulusAt: now,
    lastSeenAt: now,
    greetUntil: 0,
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readAnchor(v: unknown, fallback: NeedAnchor): NeedAnchor {
  if (typeof v !== 'object' || v === null) return fallback;
  const r = v as Record<string, unknown>;
  return isNum(r['value']) && isNum(r['at']) ? anchor(r['value'], r['at']) : fallback;
}

/**
 * Reads a stored needs block, field by field over the defaults, so a pet saved before needs existed
 * -- every pet saved before today -- wakes up rested, mildly curious and settled rather than failing
 * to load. The same rule `normalizeSettings` follows, for the same reason: a missing field is a
 * default, never a discarded document.
 */
export function normalizeNeeds(v: unknown, now: number): NeedsState {
  const d = defaultNeeds(now);
  if (typeof v !== 'object' || v === null) return d;
  const r = v as Record<string, unknown>;
  return {
    version: 1,
    energy: readAnchor(r['energy'], d.energy),
    curiosity: readAnchor(r['curiosity'], d.curiosity),
    comfort: readAnchor(r['comfort'], d.comfort),
    stress: readAnchor(r['stress'], d.stress),
    lastStimulusAt: isNum(r['lastStimulusAt']) ? r['lastStimulusAt'] : d.lastStimulusAt,
    lastSeenAt: isNum(r['lastSeenAt']) ? r['lastSeenAt'] : d.lastSeenAt,
    greetUntil: isNum(r['greetUntil']) ? r['greetUntil'] : 0,
  };
}

/** Hunger's drag on everything: a starving animal has no energy to spend and no comfort to find. */
function hungerFactor(label: HungerLabel): { drain: number; comfort: number; vitality: number } {
  switch (label) {
    case 'starving':
      return { drain: 2, comfort: -0.6, vitality: 0.3 };
    case 'hungry':
      return { drain: 1.3, comfort: -0.3, vitality: 0.7 };
    case 'peckish':
      return { drain: 1, comfort: 0.1, vitality: 1 };
    default:
      return { drain: 1, comfort: 0.25, vitality: 1 };
  }
}

/**
 * Where comfort is heading under this regime. Not where it IS: comfort lags its target by
 * `COMFORT_TAU_MS`, which is what stops a tap or a meal flipping the pet's whole demeanour at once.
 */
export function comfortTarget(stress: number, regime: NeedsRegime): number {
  const d = DIALS[regime.personality];
  const h = hungerFactor(regime.hungerLabel);
  let t = d.calm + h.comfort - 0.5 * clamp01(stress);
  if (regime.present) t += 0.1 * d.sociable;
  if (regime.asleep) t += 0.1;
  return clamp01(t);
}

export function energyAt(n: NeedsState, t: number, regime: NeedsRegime): number {
  const dt = Math.max(0, t - n.energy.at);
  if (regime.asleep) return clamp01(n.energy.value + dt / ENERGY_ASLEEP_TO_FULL_MS);
  return clamp01(n.energy.value - (dt / ENERGY_AWAKE_TO_EMPTY_MS) * hungerFactor(regime.hungerLabel).drain);
}

export function curiosityAt(n: NeedsState, t: number, regime: NeedsRegime): number {
  const dt = Math.max(0, t - n.curiosity.at);
  // Nothing new happens in your sleep. And curiosity needs something to be curious WITH: a starving
  // pet is not bored, it is starving.
  if (regime.asleep) return n.curiosity.value;
  const rate = DIALS[regime.personality].curiosity * hungerFactor(regime.hungerLabel).vitality;
  return clamp01(n.curiosity.value + (dt / CURIOSITY_TO_FULL_MS) * rate);
}

export function stressAt(n: NeedsState, t: number): number {
  const dt = Math.max(0, t - n.stress.at);
  return clamp01(n.stress.value * Math.pow(0.5, dt / STRESS_HALF_LIFE_MS));
}

export function comfortAt(n: NeedsState, t: number, regime: NeedsRegime): number {
  const dt = Math.max(0, t - n.comfort.at);
  // The target moves with stress, which itself decays over the span. Evaluating it at the anchor's
  // stress is wrong by the decay; at the end's stress, wrong the other way. Use the stress at the
  // midpoint, which is exact for a linear target and close for this one at the spans the app uses
  // (seconds to minutes), and errs toward "less rattled" over a long absence, which is right.
  const stressMid = stressAt(n, n.comfort.at + dt / 2);
  const target = comfortTarget(stressMid, regime);
  return clamp01(target + (n.comfort.value - target) * Math.exp(-dt / COMFORT_TAU_MS));
}

/**
 * Re-anchor every need at `to`, having been in `regime` since each anchor. A `to` at or before an
 * anchor leaves that anchor alone (a clock that moved backwards is a no-op, as in `reconcile`).
 *
 * Call this at every regime change -- falling asleep, waking, the pointer arriving or leaving, a
 * hunger label crossing -- and on the regular tick. For an absence that crossed several regimes,
 * call it once per segment in order; the linear and exponential pieces compose exactly, so splitting
 * a span changes nothing but what regime each piece is charged to.
 */
export function advanceNeeds(n: NeedsState, to: number, regime: NeedsRegime): NeedsState {
  const re = (a: NeedAnchor, value: number): NeedAnchor => (to > a.at ? anchor(value, to) : a);
  return {
    ...n,
    energy: re(n.energy, energyAt(n, to, regime)),
    curiosity: re(n.curiosity, curiosityAt(n, to, regime)),
    comfort: re(n.comfort, comfortAt(n, to, regime)),
    stress: re(n.stress, stressAt(n, to)),
    lastSeenAt: regime.present && to > n.lastSeenAt ? to : n.lastSeenAt,
  };
}

/**
 * Something happened. Anchors are moved to `at` first (under `regime`), then nudged.
 *
 * - pointer: you arrived. Curiosity is part-spent -- the question "what is that" has an answer -- and
 *   if you had been gone long enough, a greeting is due.
 * - tap: a knock on the glass. A jolt of stress sized by personality, a little curiosity spent.
 * - feed / bite: food is the best news a pet gets; it spends curiosity (something happened) and the
 *   comfort target takes care of the rest through the hunger label.
 */
export function stimulate(n: NeedsState, kind: Stimulus, at: number, regime: NeedsRegime): NeedsState {
  const d = DIALS[regime.personality];
  const base = advanceNeeds(n, at, regime);
  const away = at - n.lastSeenAt;
  let curiosity = base.curiosity.value;
  let stress = base.stress.value;
  let greetUntil = base.greetUntil;
  switch (kind) {
    case 'pointer':
      curiosity -= 0.5;
      if (away >= LONG_ABSENCE_MS) greetUntil = at + GREET_MS;
      break;
    case 'tap':
      curiosity -= 0.3;
      stress += d.jolt;
      break;
    case 'feed':
      curiosity -= 0.2;
      break;
    case 'bite':
      curiosity -= 0.05;
      break;
  }
  return {
    ...base,
    curiosity: anchor(curiosity, at),
    stress: anchor(stress, at),
    lastStimulusAt: at,
    lastSeenAt: kind === 'pointer' || kind === 'tap' ? at : base.lastSeenAt,
    greetUntil,
  };
}

export interface DrivesContext extends NeedsRegime {
  alive: boolean;
  /** Whether the pet is napping right now, for the nap hysteresis. */
  napping: boolean;
}

/** What the pet wants to do about its needs, at `t`. */
export function drivesOf(n: NeedsState, t: number, ctx: DrivesContext): Drives {
  const none: Drives = { activity: 0, approach: 0, hide: 0, nap: false, greet: false, surface: 0 };
  if (!ctx.alive) return none;
  const d = DIALS[ctx.personality];
  const h = hungerFactor(ctx.hungerLabel);
  const energy = energyAt(n, t, ctx);
  const curiosity = curiosityAt(n, t, ctx);
  const comfort = comfortAt(n, t, ctx);
  const stress = stressAt(n, t);
  const quietFor = t - n.lastStimulusAt;

  if (ctx.asleep) return { ...none, hide: clamp01(stress * 1.2) };

  // A nap is wanted when exhausted and nothing is going on; once napping, it lasts until half rested.
  // The hysteresis is what stops a pet flickering in and out of sleep at the threshold.
  const nap = ctx.napping ? energy < NAP_WAKE_ENERGY : energy < NAP_ENERGY && quietFor >= NAP_QUIET_MS;

  const activity = clamp01((0.2 + 0.8 * energy) * h.vitality * d.pace * (0.6 + 0.4 * comfort));

  // Approach: curiosity decides whether you are interesting; stress and starvation decide whether
  // the pet can afford to care. The aloof one holds back until curiosity wins, then comes all at once.
  let approach = ctx.present ? clamp01(0.3 + 0.7 * curiosity) * (1 - stress) * h.vitality : 0;
  if (d.aloof > 0 && ctx.present) approach = curiosity >= d.aloof ? Math.max(approach, 0.9) : approach * 0.25;

  // Three reasons to hide, each floored at zero before they add: being rattled, being starving (a
  // starving animal keeps low and still), and deep discomfort. Floored, because a settled pet must
  // not be able to "owe" hiding to the others -- a starving fish hugs the gravel however calm it is.
  const rattled = Math.max(0, stress - HIDE_STRESS * (1 - d.jolt)) * 2;
  const starving = ctx.hungerLabel === 'starving' ? 0.3 : 0;
  const uneasy = Math.max(0, 0.3 - comfort) * 0.5;
  const hide = clamp01(rattled + starving + uneasy);

  const greet = ctx.present && t < n.greetUntil && stress < HIDE_STRESS;

  const surface = clamp01(
    // A well-fed goldfish still mouths at the surface now and then (step C): 0.3, not the 0.15 that
    // never cleared the behaviour's bar.
    (ctx.hungerLabel === 'hungry' ? 0.8 : ctx.hungerLabel === 'peckish' ? 0.5 : ctx.hungerLabel === 'starving' ? 0.2 : 0.3) *
      (0.4 + 0.6 * energy),
  );

  return { activity, approach, hide, nap, greet, surface };
}

/** For the dev panel and the boot report: every need read at `t`, no decisions. */
export function needsAt(n: NeedsState, t: number, regime: NeedsRegime): { energy: number; curiosity: number; comfort: number; stress: number } {
  return { energy: energyAt(n, t, regime), curiosity: curiosityAt(n, t, regime), comfort: comfortAt(n, t, regime), stress: stressAt(n, t) };
}
