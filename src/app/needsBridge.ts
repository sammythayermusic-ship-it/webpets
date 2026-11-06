// How the app feeds the needs model: which regime the pet is in now, and how to replay a long gap.
//
// The sim's needs are advanced under a regime that is constant over the span; the app is where the
// regime comes from. For the ordinary 30-second tick that is just the current state. For a catch-up
// after the app was closed (a night, a weekend) the regime CHANGED along the way -- night fell and
// lifted, the pantry fed the pet -- and replaying the gap as one segment would charge a whole weekend
// to whatever the regime happened to be when the app quit. So the gap is walked in hourly steps, each
// with the night it actually was and the hunger the pet actually had, read off the auto-feed events
// `reconcile` reported for the same span.

import type { NeedsRegime, NeedsState } from '../sim/needs';
import { advanceNeeds } from '../sim/needs';
import type { PetState, SimEvent } from '../sim/types';
import { DEFAULT_CONSTANTS, HOUR_MS } from '../sim/constants';
import { hungerLabel } from '../sim/hunger';
import { hungerFrom } from '../sim/math';
import type { DayNightMode } from './types';
import { resolveNight, type LightOverride } from './daynight';

/** The hunger the pet had at `t` inside a reconciled span, honouring the auto-feeds that happened before `t`. */
export function hungerDuring(prev: PetState, events: readonly SimEvent[], t: number): number {
  if (!prev.alive) return 0;
  let anchorHunger = prev.hungerAtLastFed;
  let anchorAt = prev.lastFedAt;
  for (const e of events) {
    if (e.type === 'auto-fed' && e.at <= t && e.at >= anchorAt) {
      anchorHunger = e.hungerAfter;
      anchorAt = e.at;
    }
    if (e.type === 'died' && e.at <= t) return 0;
  }
  return hungerFrom(anchorHunger, anchorAt, t, DEFAULT_CONSTANTS);
}

export interface RegimeSource {
  pet: PetState;
  dayNight: DayNightMode;
  nightOverride: LightOverride;
  present: boolean;
  /** Hunger as the store last derived it; used for a short span where the gap is not worth walking. */
  hunger: number;
}

/** The regime the pet is in right now. */
export function regimeNow(s: RegimeSource, at: number): NeedsRegime {
  return {
    asleep: s.pet.alive && resolveNight(s.dayNight, s.nightOverride, at),
    hungerLabel: hungerLabel(s.pet.alive ? s.hunger : 0),
    present: s.present,
    personality: s.pet.personality,
  };
}

/** Gaps longer than this are walked hour by hour; shorter ones are one segment under the current regime. */
export const WALK_GAP_MS = HOUR_MS;

/**
 * Advance `needs` to `at`. A short span uses the current regime as one segment. A long span -- the app
 * was closed -- is replayed from the needs' own earliest anchor in hourly steps: nobody was present,
 * night is what the schedule says it was at each step, and hunger is what the pet actually had then
 * (`prev` and `events` are the reconcile's input and output for the same span).
 */
export function advanceNeedsTo(
  needs: NeedsState,
  at: number,
  s: RegimeSource,
  prev: PetState,
  events: readonly SimEvent[],
): NeedsState {
  const from = Math.min(needs.energy.at, needs.curiosity.at, needs.comfort.at, needs.stress.at);
  if (at - from <= WALK_GAP_MS) return advanceNeeds(needs, at, regimeNow(s, at));
  let n = needs;
  for (let t = from; t < at; t += HOUR_MS) {
    const end = Math.min(at, t + HOUR_MS);
    n = advanceNeeds(n, end, {
      asleep: prev.alive && resolveNight(s.dayNight, s.nightOverride, t),
      hungerLabel: hungerLabel(hungerDuring(prev, events, t)),
      present: false,
      personality: prev.personality,
    });
  }
  return n;
}
