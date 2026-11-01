// Feelings, computed locally. No model, no API, no network, no cost — the pet's inner life is a few
// lines of arithmetic over things the simulation already knows.
//
// The representation is the circumplex model from affect psychology: every mood is a point in a plane
// of VALENCE (how good things feel, -1..1) and AROUSAL (how activated the animal is, 0..1). That is
// worth the two numbers rather than a bare enum, because the interesting states are the ones an enum
// cannot express: low valence with high arousal is agitation, low valence with LOW arousal is misery,
// and they should not look the same. Labels are read off the plane at the end, not tracked directly.
//
// Everything here is a pure function of values passed in. There is no clock, no RNG and no hidden
// state, so the same inputs always give the same mood — which is what makes it testable, and what lets
// the mood be recomputed from scratch after the app has been closed for a week rather than having to
// be saved and restored.

import type { HungerLabel, Personality } from './types';
import { MINUTE_MS, HOUR_MS } from './constants';

/** Where the pet is in the valence/arousal plane, plus the label that reads off it. */
export interface Mood {
  /** -1 miserable .. +1 delighted. */
  valence: number;
  /** 0 torpid .. 1 wired. */
  arousal: number;
  label: MoodLabel;
  /**
   * 0..1: how much the pet wants to come and look at the pointer. High when it is alert and feels fine,
   * suppressed when it is starving or asleep — a miserable animal does not investigate things.
   */
  interest: number;
}

export type MoodLabel =
  | 'excited'
  | 'happy'
  | 'curious'
  | 'content'
  | 'lonely'
  | 'grumpy'
  | 'sleepy'
  | 'miserable';

export interface MoodInput {
  /** 0..100, as `hungerAt` reports it. */
  hunger: number;
  label: HungerLabel;
  alive: boolean;
  asleep: boolean;
  personality: Personality;
  /** Since the last meal. Drives the afterglow, which is the strongest short-term source of good mood. */
  sinceFedMs: number;
  /** 0..1 from {@link decayAttention}: how present the user has been lately. */
  attention: number;
  /** Since the user last did anything at all. Drives loneliness, which is slow and shallow. */
  sinceInteractionMs: number;
}

/**
 * Per-personality baseline and sensitivity. These are the same four personalities the speech lines use,
 * so a zen fish reads as zen whether it is talking or just swimming.
 *
 * `valenceBias`/`arousalBias` move the resting point. `swing` scales how far everything else moves it:
 * a zen pet is not merely happier, it is less MOVED, which is a different thing and the one that makes
 * the personalities feel distinct over time rather than just offset.
 */
const TEMPERAMENT: Readonly<Record<Personality, { valenceBias: number; arousalBias: number; swing: number; sociability: number }>> = {
  zen: { valenceBias: 0.22, arousalBias: -0.12, swing: 0.7, sociability: 0.8 },
  sarcastic: { valenceBias: -0.05, arousalBias: 0.02, swing: 0.95, sociability: 0.7 },
  anxious: { valenceBias: -0.12, arousalBias: 0.16, swing: 1.25, sociability: 1.15 },
  hyper: { valenceBias: 0.08, arousalBias: 0.2, swing: 1.3, sociability: 1.3 },
};

/** Attention reaches full presence after this long with the pointer around. */
const ATTENTION_RISE_MS = 20_000;
/** And falls back to nothing over this long without it. Deliberately much slower than the rise. */
const ATTENTION_FALL_MS = 3 * MINUTE_MS;
/** The post-meal glow half-life for valence. */
const FED_GLOW_MS = 20 * MINUTE_MS;
/** The post-meal excitement half-life for arousal. Much shorter: the thrill fades before the contentment. */
const FED_BUZZ_MS = 3 * MINUTE_MS;
/** Ignored this long, the pet is as lonely as it gets. */
const LONELY_FULL_MS = 8 * HOUR_MS;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Exponential decay to a half-life, so "twice as long ago" always means "half as strong". */
function decay(elapsedMs: number, halfLifeMs: number): number {
  if (!(elapsedMs > 0)) return 1;
  return Math.pow(0.5, elapsedMs / halfLifeMs);
}

/**
 * Advance the attention accumulator by `dtMs`.
 *
 * Asymmetric on purpose: presence registers in seconds and absence fades over minutes. A pet that
 * forgot you the moment your cursor left would feel like a state machine, and one that took as long to
 * notice you as to miss you would never react to a passing visit at all.
 */
export function decayAttention(attention: number, dtMs: number, pointerPresent: boolean): number {
  if (!(dtMs > 0)) return clamp(attention, 0, 1);
  const rate = pointerPresent ? dtMs / ATTENTION_RISE_MS : -(dtMs / ATTENTION_FALL_MS);
  return clamp(attention + rate, 0, 1);
}

/**
 * How good being this fed feels, -1..0.6.
 *
 * Concave, not linear: the step from starving to merely hungry matters far more than the step from
 * peckish to full. A linear version made a pet at half hunger read as half-miserable, which is wrong —
 * a fed-enough animal is simply fine.
 */
function hungerValence(hunger: number): number {
  const h = clamp(hunger, 0, 100) / 100;
  return Math.pow(h, 0.7) * 1.6 - 1;
}

/**
 * How activated being this hungry makes the pet, -0.35..0.35.
 *
 * Not monotonic, which is the whole point: hunger is agitating until it is exhausting. Arousal peaks
 * around a fifth of the bar, where the animal is actively looking for food, and collapses at zero,
 * where it has stopped trying. Without the collapse a starving pet would read as its most energetic,
 * which is both wrong and cruel-looking.
 */
function hungerArousal(hunger: number, label: HungerLabel): number {
  if (label === 'starving') return -0.35;
  const h = clamp(hunger, 0, 100);
  return 0.35 * Math.exp(-(((h - 20) / 28) ** 2));
}

/** Reads a label off the valence/arousal plane. Order matters: the earlier cases are the stronger claims. */
function labelFor(v: number, a: number, input: MoodInput): MoodLabel {
  if (input.asleep) return 'sleepy';
  if (v <= -0.55) return a >= 0.45 ? 'grumpy' : 'miserable';
  if (v >= 0.3 && a >= 0.62) return 'excited';
  // Curiosity is an ATTENTION state, not a general-energy one: an alert pet with someone watching is
  // curious about THEM. Gated mostly on attention, and checked before 'happy' so a visit reads as
  // interest rather than as generic good cheer.
  if (a >= 0.42 && input.attention >= 0.45 && v > -0.2) return 'curious';
  // Loneliness is about absence, not about being sad. A cheerful pet can still miss you, so this is
  // checked before 'happy' and only wants the pet to be less than actively delighted.
  if (v < 0.3 && input.attention <= 0.1 && input.sinceInteractionMs >= LONELY_FULL_MS / 2) return 'lonely';
  if (v >= 0.3) return 'happy';
  if (v <= -0.2) return a >= 0.5 ? 'grumpy' : 'miserable';
  return 'content';
}

/**
 * The pet's current feelings. Pure: same inputs, same mood, always.
 *
 * A dead pet has no mood. It reports flat and miserable rather than throwing, because every caller
 * would otherwise need the same branch, and the memorial has nothing to ask it anyway.
 */
export function moodOf(input: MoodInput): Mood {
  if (!input.alive) return { valence: -1, arousal: 0, label: 'miserable', interest: 0 };

  const t = TEMPERAMENT[input.personality];
  /**
   * How much capacity the pet has for feelings ABOUT anything other than food. Comfort helps an animal
   * that is basically all right; it does not help one that is starving to death. Without this, a
   * friendly cursor cancelled most of the misery of an empty hunger bar, and a zen pet dying of
   * neglect read as mildly put out.
   */
  const vitality = clamp(input.hunger / 40, 0, 1);
  const fedGlow = decay(input.sinceFedMs, FED_GLOW_MS);
  const fedBuzz = decay(input.sinceFedMs, FED_BUZZ_MS);
  const lonely = clamp(input.sinceInteractionMs / LONELY_FULL_MS, 0, 1);
  const attention = clamp(input.attention, 0, 1);

  // Valence: how you are fed, whether you ate recently, and whether anyone is about.
  const v =
    // Temperament is mostly suppressed too when things are dire: starvation outranks disposition, and
    // a serene pet starving to death should not look serene. Not fully, or the personalities would
    // become identical at the bottom.
    t.valenceBias * (0.35 + 0.65 * vitality) +
    t.swing *
      (hungerValence(input.hunger) * 0.75 +
        fedGlow * 0.5 * vitality +
        attention * 0.35 * t.sociability * vitality -
        lonely * 0.3 * t.sociability);

  // Arousal: a resting level, plus hunger's non-monotonic kick, the post-meal buzz, and company.
  let a =
    0.45 +
    t.arousalBias +
    t.swing * (hungerArousal(input.hunger, input.label) + fedBuzz * 0.45 + attention * 0.3 * t.sociability);
  // Sleep dominates everything else it competes with. A pet that was wired when it fell asleep should
  // still read as asleep, so this is a floor-and-cap rather than another additive term.
  if (input.asleep) a = Math.min(a, 0.18);

  const valence = clamp(v, -1, 1);
  const arousal = clamp(a, 0, 1);
  // Investigating something costs energy and optimism. Gated on both, then on actually being awake.
  const interest = input.asleep ? 0 : clamp(arousal * 0.7 + (valence + 1) * 0.25 - 0.3, 0, 1) * (0.4 + 0.6 * attention);

  return { valence, arousal, label: labelFor(valence, arousal, input), interest };
}

/**
 * The animation state a mood asks for, or null to leave the choice to the behaviour.
 *
 * Only ever returns the three states that exist purely to express feeling. Everything else — eating,
 * hunger posture, sleep, death — is the simulation's business and outranks the mood, so this returns
 * null rather than competing with it.
 */
export function moodAnim(mood: Mood): 'happy' | 'excited' | 'curious' | null {
  switch (mood.label) {
    case 'excited':
      return 'excited';
    case 'curious':
      return 'curious';
    case 'happy':
      return 'happy';
    default:
      return null;
  }
}
