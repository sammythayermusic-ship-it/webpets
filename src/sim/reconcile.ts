import type { PetState, ReconcileResult, SimConstants, SimEvent } from './types';
import { DEFAULT_CONSTANTS, DYING_SOON_HOURS, HOUR_MS } from './constants';
import { crossingFrom, deathFromZero, hungerFrom, zeroFrom } from './math';

/**
 * Walk the pet forward from `state.lastReconciledAt` to `now`.
 *
 * - Auto-feeds are applied on the closed window [from, now]: t* = max(from, crossing) when pantry >= MEAL_SIZE and
 *   the pet is still alive at t*. A feed at `from` cannot repeat because it moves the next crossing forward.
 * - hungry / starving / dying-soon / died are emitted on the half-open window (from, now].
 * - A clock that moved backwards (now < lastReconciledAt) and a dead pet are no-ops returning the same state object.
 *   now === lastReconciledAt runs the walk (filling the feeder may feed at now) but can emit no crossing events.
 */
export function reconcile(state: PetState, now: number, c: SimConstants = DEFAULT_CONSTANTS): ReconcileResult {
  if (!state.alive || !Number.isFinite(now) || now < state.lastReconciledAt) {
    return { state, events: [] };
  }
  const from = state.lastReconciledAt;
  let lastFedAt = state.lastFedAt;
  let hungerAtLastFed = state.hungerAtLastFed;
  let pantry = state.pantry;
  let meals = state.meals;
  let foodEaten = state.foodEaten;
  const events: SimEvent[] = [];
  let diedAt: number | undefined;

  // Guard against a zero/negative MEAL_SIZE override looping forever: an auto-feed has to take some food.
  const canAutoFeed = c.MEAL_SIZE > 0;

  for (;;) {
    const zero = zeroFrom(hungerAtLastFed, lastFedAt, c);
    const death = deathFromZero(zero, c);
    const crossing = crossingFrom(hungerAtLastFed, lastFedAt, c);
    const tStar = Math.max(from, crossing);

    if (canAutoFeed && pantry >= c.MEAL_SIZE && tStar <= now && tStar < death) {
      const h = hungerFrom(hungerAtLastFed, lastFedAt, tStar, c);
      hungerAtLastFed = Math.min(c.MAX_HUNGER, h + c.FEED_GAIN);
      lastFedAt = tStar;
      pantry -= c.MEAL_SIZE;
      meals += 1;
      foodEaten += c.MEAL_SIZE;
      events.push({ type: 'auto-fed', at: tStar, pantryAfter: pantry, hungerAfter: hungerAtLastFed });
      continue;
    }

    // No further feed fits: emit the crossings of the final segment, half-open (from, now].
    if (from < crossing && crossing <= now) events.push({ type: 'hungry', at: crossing });
    if (from < zero && zero <= now) events.push({ type: 'starving', at: zero });
    const dyingSoon = Math.round(death - DYING_SOON_HOURS * HOUR_MS);
    if (from < dyingSoon && dyingSoon <= now) events.push({ type: 'dying-soon', at: dyingSoon, diesAt: death });
    if (death <= now) {
      if (from < death) events.push({ type: 'died', at: death });
      diedAt = death;
    }
    break;
  }

  if (events.length === 0 && diedAt === undefined && now === from) {
    return { state, events };
  }

  const next: PetState = {
    ...state,
    lastFedAt,
    hungerAtLastFed,
    pantry,
    meals,
    foodEaten,
    lastReconciledAt: now,
  };
  if (diedAt !== undefined) {
    next.alive = false;
    next.diedAt = diedAt;
  }
  return { state: next, events };
}
