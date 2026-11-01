import type { FeedResult, PetState, ReconcileResult, SimConstants } from './types';
import { DEFAULT_CONSTANTS, PANTRY_CAPACITY } from './constants';
import { hungerFrom } from './math';
import { reconcile } from './reconcile';

/**
 * Manual feed. Food is free, so the only check is that the pet is alive. Reconcile to `now`, then
 * hungerAtLastFed = min(MAX, hunger + gain), lastFedAt = lastReconciledAt = t, meals++, foodEaten += MEAL_SIZE,
 * where t = max(now, lastReconciledAt). When the clock went backwards (dev.resetClock after a skip, or a system
 * clock correction) reconcile is a no-op and the pet has already reached the hunger at lastReconciledAt, so the
 * gain is applied on top of that hunger rather than on the anchor re-evaluated at `now` (which would spend the
 * meal on a gain that decays away before it is ever shown).
 */
export function feed(state: PetState, now: number, c: SimConstants = DEFAULT_CONSTANTS): FeedResult {
  const r = reconcile(state, now, c);
  if (!r.state.alive) return { ok: false, state: r.state, events: r.events, reason: 'dead' };
  const s = r.state;
  const t = effectiveNow(s, now);
  const hunger = hungerFrom(s.hungerAtLastFed, s.lastFedAt, t, c);
  const next: PetState = {
    ...s,
    hungerAtLastFed: Math.min(c.MAX_HUNGER, hunger + c.FEED_GAIN),
    lastFedAt: t,
    lastReconciledAt: t,
    meals: s.meals + 1,
    foodEaten: s.foodEaten + c.MEAL_SIZE,
  };
  return { ok: true, state: next, events: r.events };
}

/** The time a mutator acts at: never earlier than the pet's own clock (reconcile is a no-op before it). */
function effectiveNow(state: PetState, now: number): number {
  return Math.max(now, state.lastReconciledAt);
}

/**
 * Fill the holiday feeder, for free: pantry = max(pantry, PANTRY_CAPACITY), so it never takes food out of a feeder
 * the dev panel overfilled. Reconciles first; a dead pet (including one that dies during that catch-up) is
 * returned as reconciled, unfilled. Reconciles again at max(now, lastReconciledAt) so a hungry pet is fed at once,
 * even when the clock went backwards.
 */
export function fillPantry(state: PetState, now: number, c: SimConstants = DEFAULT_CONSTANTS): ReconcileResult {
  const r1 = reconcile(state, now, c);
  if (!r1.state.alive) return r1;
  const filled: PetState = { ...r1.state, pantry: Math.max(r1.state.pantry, PANTRY_CAPACITY) };
  const r2 = reconcile(filled, effectiveNow(filled, now), c);
  return { state: r2.state, events: [...r1.events, ...r2.events] };
}
