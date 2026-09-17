import type { FeedResult, Ledger, PantryResult, PetState, SimConstants } from './types';
import { DEFAULT_CONSTANTS } from './constants';
import { hungerFrom } from './math';
import { reconcile } from './reconcile';

/**
 * Manual feed: reconcile to `now`, validate on the reconciled state, burn FEED_COST (the only ledger call), then
 * hungerAtLastFed = min(MAX, hunger + gain), lastFedAt = lastReconciledAt = now, meals++, feedBurned += cost.
 */
export function feed(state: PetState, now: number, ledger: Ledger, c: SimConstants = DEFAULT_CONSTANTS): FeedResult {
  const r = reconcile(state, now, c);
  if (!r.state.alive) return { ok: false, state: r.state, events: r.events, reason: 'dead' };
  if (ledger.balance() < c.FEED_COST) {
    return { ok: false, state: r.state, events: r.events, reason: 'insufficient-balance' };
  }
  ledger.burn(c.FEED_COST);
  const s = r.state;
  const hunger = hungerFrom(s.hungerAtLastFed, s.lastFedAt, now, c);
  const next: PetState = {
    ...s,
    hungerAtLastFed: Math.min(c.MAX_HUNGER, hunger + c.FEED_GAIN),
    lastFedAt: now,
    // Keep lastReconciledAt >= lastFedAt even if the clock went backwards (reconcile was then a no-op).
    lastReconciledAt: Math.max(now, s.lastReconciledAt),
    meals: s.meals + 1,
    feedBurned: s.feedBurned + c.FEED_COST,
  };
  return { ok: true, state: next, events: r.events };
}

/**
 * Move up to n whole $FEED from the wallet into the pantry. Reconciles first; a dead pet moves 0 and leaves the
 * ledger untouched. moved = min(floor(n), balance) (0 for n <= 0 / NaN). Reconciles again at `now` so an
 * immediate auto-feed applies.
 */
export function depositPantry(
  state: PetState,
  n: number,
  now: number,
  ledger: Ledger,
  c: SimConstants = DEFAULT_CONSTANTS,
): PantryResult {
  const r1 = reconcile(state, now, c);
  if (!r1.state.alive) return { state: r1.state, moved: 0, events: r1.events };
  const wanted = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  const available = Math.max(0, Math.floor(ledger.balance()));
  const moved = Math.min(wanted, available);
  ledger.debit(moved);
  const funded: PetState = { ...r1.state, pantry: r1.state.pantry + moved };
  const r2 = reconcile(funded, now, c);
  return { state: r2.state, moved, events: [...r1.events, ...r2.events] };
}

/** Move the whole pantry back into the wallet. Allowed on dead pets (otherwise $FEED would be stranded). */
export function withdrawPantry(
  state: PetState,
  now: number,
  ledger: Ledger,
  c: SimConstants = DEFAULT_CONSTANTS,
): PantryResult {
  const r = reconcile(state, now, c);
  const moved = r.state.pantry;
  ledger.credit(moved);
  const next: PetState = { ...r.state, pantry: 0 };
  return { state: next, moved, events: r.events };
}
