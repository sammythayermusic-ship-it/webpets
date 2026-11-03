// When the pet talks. Charm, not nag (AFTER-BAKEOFF Step D.3): chatty while you are with it, now and
// then while you are not, quiet while you type, silent when muted. Pure: timestamps in, a decision out.
//
// Two doors. `decide` is asked every second or so and may volunteer something (a thought, a fact, a
// hello when you arrive, goodnight, good morning, "it's quiet in here"). `react` is asked when something
// happens to the pet (a bite, a knock, hunger) and says whether this moment deserves a bubble.

import type { Rng } from '../sim/types';
import type { Moment } from './types';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

export const TALK = Object.freeze({
  /** No two bubbles closer than this, for anything the pet volunteers. */
  MIN_GAP_MS: 20 * SECOND,
  /** A reply to what you just did (a meal, a knock), or hunger, needs only this since the last bubble. */
  REPLY_GAP_MS: 6 * SECOND,
  /** At most this many bubbles in any hour, counting everything except replies to what you just did. */
  HOURLY_CAP: 8,
  /** While you are at the bowl: a thought every 45-120 s, at most this many per visit. */
  PRESENT_GAP_MS: [45 * SECOND, 120 * SECOND] as const,
  THOUGHTS_PER_VISIT: 4,
  /** The first thought of a visit comes this soon after the hello. */
  FIRST_THOUGHT_MS: [25 * SECOND, 50 * SECOND] as const,
  /** While you are not: now and then. */
  ABSENT_GAP_MS: [15 * MINUTE, 35 * MINUTE] as const,
  /** Away at least this long, and coming back is a visit worth a hello. */
  VISIT_AWAY_MS: 3 * MINUTE,
  /** Away at least this long, and it is a welcome back. */
  WELCOME_AWAY_MS: 2 * HOUR,
  /** Nobody for this long (pet awake, you not typing): it says it is quiet. Then not again for as long. */
  LONELY_AFTER_MS: 3 * HOUR,
  /** Share of volunteered thoughts that are facts. */
  FACT_SHARE: 0.35,
  /** Chance a knock on the glass gets a reply. */
  TAP_REPLY: 0.6,
  /** Morning greetings only before this local hour. */
  MORNING_UNTIL_HOUR: 12,
});

export interface TalkState {
  lastSpokeAt: number;
  /** Bubbles in the last hour that count toward the cap. */
  spoken: readonly number[];
  nextThoughtAt: number;
  /** When the pointer arrived; null while it is away. */
  presentSince: number | null;
  /** When the pointer last left (or the app started). */
  awaySince: number;
  thoughtsThisVisit: number;
  lastLonelyAt: number;
  /** Local day keys ("2026-10-31") of the last goodnight and good morning. */
  nightSaidOn: string | null;
  morningSaidOn: string | null;
}

export interface TalkInput {
  now: number;
  /** The pointer is over the habitat. */
  present: boolean;
  /** Not resting for the night. */
  awake: boolean;
  /** You are typing (keys in the last few seconds) or otherwise busy: nothing volunteered. */
  busy: boolean;
  muted: boolean;
  alive: boolean;
  night: boolean;
  /** Local calendar day and hour, from the caller's clock. */
  dayKey: string;
  hour: number;
  rng: Rng;
}

/** What `decide` volunteers. */
export type Volunteer = Moment | 'fact';

export function initialTalk(now: number, rng: Rng): TalkState {
  return {
    lastSpokeAt: Number.NEGATIVE_INFINITY,
    spoken: [],
    nextThoughtAt: now + between(TALK.ABSENT_GAP_MS, rng) / 3,
    presentSince: null,
    awaySince: now,
    thoughtsThisVisit: 0,
    lastLonelyAt: now,
    nightSaidOn: null,
    morningSaidOn: null,
  };
}

function between(range: readonly [number, number], rng: Rng): number {
  return range[0] + rng() * (range[1] - range[0]);
}

function lastHour(spoken: readonly number[], now: number): number[] {
  return spoken.filter((t) => t > now - HOUR);
}

function roomToTalk(s: TalkState, now: number): boolean {
  return now - s.lastSpokeAt >= TALK.MIN_GAP_MS && lastHour(s.spoken, now).length < TALK.HOURLY_CAP;
}

function spoke(s: TalkState, now: number, counts: boolean): TalkState {
  return { ...s, lastSpokeAt: now, spoken: counts ? [...lastHour(s.spoken, now), now] : lastHour(s.spoken, now) };
}

/** Track the pointer coming and going. Returns the new state and, on arrival, how long it had been away. */
function trackPresence(s: TalkState, i: TalkInput): { s: TalkState; arrivedAfter: number | null } {
  if (i.present && s.presentSince === null) {
    const away = i.now - s.awaySince;
    const soon = i.now + between(TALK.FIRST_THOUGHT_MS, i.rng);
    return {
      s: { ...s, presentSince: i.now, thoughtsThisVisit: 0, nextThoughtAt: Math.min(s.nextThoughtAt, soon) },
      arrivedAfter: away,
    };
  }
  if (!i.present && s.presentSince !== null) {
    return {
      s: { ...s, presentSince: null, awaySince: i.now, nextThoughtAt: i.now + between(TALK.ABSENT_GAP_MS, i.rng) },
      arrivedAfter: null,
    };
  }
  return { s, arrivedAfter: null };
}

/** Called every second or so. At most one thing volunteered per call. */
export function decide(state: TalkState, i: TalkInput): { say: Volunteer | null; state: TalkState } {
  const { s: tracked, arrivedAfter } = trackPresence(state, i);
  let s = tracked;
  if (i.muted || !i.alive) return { say: null, state: s };
  const room = roomToTalk(s, i.now);

  // Hello, when you come back after a while. Not rate limited by the hourly cap: it answers you.
  if (arrivedAfter !== null && arrivedAfter >= TALK.VISIT_AWAY_MS && i.now - s.lastSpokeAt >= TALK.MIN_GAP_MS) {
    const morning = !i.night && i.hour < TALK.MORNING_UNTIL_HOUR && s.morningSaidOn !== i.dayKey;
    if (morning) return { say: 'morning', state: { ...spoke(s, i.now, false), morningSaidOn: i.dayKey } };
    const say: Moment = arrivedAfter >= TALK.WELCOME_AWAY_MS ? 'welcome-back' : 'visit';
    return { say, state: spoke(s, i.now, false) };
  }
  if (!room) return { say: null, state: s };

  // Goodnight, once a night, when it settles down to rest.
  if (i.night && !i.awake && s.nightSaidOn !== i.dayKey && !i.busy) {
    return { say: 'night', state: { ...spoke(s, i.now, true), nightSaidOn: i.dayKey } };
  }
  if (!i.awake || i.busy) return { say: null, state: s };

  // Nobody around for hours.
  if (s.presentSince === null && i.now - s.awaySince >= TALK.LONELY_AFTER_MS && i.now - s.lastLonelyAt >= TALK.LONELY_AFTER_MS) {
    return { say: 'lonely', state: { ...spoke(s, i.now, true), lastLonelyAt: i.now } };
  }

  // A thought, or a fact.
  if (i.now >= s.nextThoughtAt) {
    const present = s.presentSince !== null;
    if (present && s.thoughtsThisVisit >= TALK.THOUGHTS_PER_VISIT) {
      return { say: null, state: { ...s, nextThoughtAt: i.now + between(TALK.ABSENT_GAP_MS, i.rng) } };
    }
    const say: Volunteer = i.rng() < TALK.FACT_SHARE ? 'fact' : 'thought';
    const next = i.now + between(present ? TALK.PRESENT_GAP_MS : TALK.ABSENT_GAP_MS, i.rng);
    s = { ...spoke(s, i.now, true), nextThoughtAt: next, thoughtsThisVisit: s.thoughtsThisVisit + (present ? 1 : 0) };
    return { say, state: s };
  }
  return { say: null, state: s };
}

/** Moments that happen to the pet. Replies to what you just did (a meal, a knock) skip the hourly cap. */
export type Reaction = Extract<Moment, 'fed' | 'meal' | 'tap' | 'hungry' | 'starving' | 'feeder' | 'welcome-back'>;

const ANSWERS_YOU: ReadonlySet<Reaction> = new Set<Reaction>(['fed', 'meal', 'tap', 'welcome-back']);

export function react(state: TalkState, moment: Reaction, i: Pick<TalkInput, 'now' | 'muted' | 'alive' | 'rng'>): { say: boolean; state: TalkState } {
  if (i.muted || !i.alive) return { say: false, state: state };
  // Coming home is said once, when you get back, and outranks whatever the pet was just saying.
  const homecoming = moment === 'welcome-back' || moment === 'feeder';
  // Replies and hunger wait only for the last bubble to be read; nothing else may cut the usual gap.
  const urgent = ANSWERS_YOU.has(moment) || moment === 'hungry' || moment === 'starving';
  const gap = urgent ? TALK.REPLY_GAP_MS : TALK.MIN_GAP_MS;
  if (!homecoming && i.now - state.lastSpokeAt < gap) return { say: false, state };
  if (moment === 'tap' && i.rng() >= TALK.TAP_REPLY) return { say: false, state };
  const answers = ANSWERS_YOU.has(moment);
  if (!answers && lastHour(state.spoken, i.now).length >= TALK.HOURLY_CAP && moment !== 'starving') {
    return { say: false, state };
  }
  return { say: true, state: spoke(state, i.now, !answers) };
}

/** Parse saved talk state; anything malformed starts fresh. */
export function normalizeTalk(v: unknown, now: number, rng: Rng): TalkState {
  const fresh = initialTalk(now, rng);
  if (typeof v !== 'object' || v === null) return fresh;
  const o = v as Record<string, unknown>;
  const num = (k: string, d: number): number => (typeof o[k] === 'number' && Number.isFinite(o[k]) ? (o[k] as number) : d);
  const day = (k: string): string | null => (typeof o[k] === 'string' ? (o[k] as string) : null);
  return {
    ...fresh,
    lastSpokeAt: num('lastSpokeAt', fresh.lastSpokeAt),
    spoken: Array.isArray(o['spoken']) ? lastHour(o['spoken'].filter((t): t is number => typeof t === 'number'), now) : [],
    lastLonelyAt: num('lastLonelyAt', fresh.lastLonelyAt),
    nightSaidOn: day('nightSaidOn'),
    morningSaidOn: day('morningSaidOn'),
  };
}
