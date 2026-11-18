// The chicken's two rules (PHASE-NEXT Step 5, Blueprint §8). Pure, and applied inside reconcile(), so
// they hold however the time is cut up and wherever reconcile is called from.
//
//   - A new chicken is a chick in the brooder. At seven days old, alive, it moves to the coop as a hen.
//   - A hen lays one egg at the end of each day of its age in which it was alive and its hunger never
//     reached zero. Days are counted from its birth, so no time zone or calendar is involved.
//
// What it needs to remember between calls lives in speciesData with the egg count: `eggDay`, the last
// day of age already decided, and `starvedDay`, a day still in progress that has already gone hungry.

import type { PetState, SimConstants, SimEvent } from './types';
import { DAY_MS } from './constants';
import { zeroFrom } from './math';

/** The age at which a chick becomes a hen and moves to the coop. */
export const HEN_AGE_DAYS = 7;

/**
 * Apply the chicken's rules to one reconciled span. `prev` is the state reconcile started from,
 * `next` what it produced, `events` what it reported; `now` is the end of the span.
 */
export function chickenRules(
  prev: PetState,
  next: PetState,
  events: readonly SimEvent[],
  now: number,
  c: SimConstants,
): { state: PetState; events: SimEvent[] } {
  if (next.species !== 'chicken') return { state: next, events: events as SimEvent[] };
  const from = prev.lastReconciledAt;
  /** The end of its life inside this span, or the end of the span. */
  const end = next.diedAt ?? now;
  const born = prev.bornAt;
  const added: SimEvent[] = [];
  let state = next;

  const henAt = born + HEN_AGE_DAYS * DAY_MS;
  if (prev.habitat === 'brooder' && henAt <= end) {
    state = { ...state, habitat: 'coop' };
    added.push({ type: 'migrated', at: Math.max(henAt, from), to: 'coop' });
  }

  // The stretches of this span spent at zero hunger: from the moment each fed segment ran out to the
  // feed that ended it (or to the end of the span).
  const zeros: Array<[number, number]> = [];
  let anchorH = prev.hungerAtLastFed;
  let anchorAt = prev.lastFedAt;
  for (const e of events) {
    if (e.type !== 'auto-fed') continue;
    const z = zeroFrom(anchorH, anchorAt, c);
    if (z < e.at) zeros.push([Math.max(z, from), e.at]);
    anchorH = e.hungerAfter;
    anchorAt = e.at;
  }
  const z = zeroFrom(anchorH, anchorAt, c);
  if (z <= end) zeros.push([Math.max(z, from), end]);

  const dayOf = (t: number): number => Math.floor((t - born) / DAY_MS);
  const prevEggDay = prev.speciesData['eggDay'] ?? HEN_AGE_DAYS - 1;
  const starved = new Set<number>();
  const carried = prev.speciesData['starvedDay'];
  if (carried !== undefined) starved.add(carried);
  for (const [a, b] of zeros) {
    // A stretch that ends exactly on a day boundary did not touch the day that starts there.
    for (let d = dayOf(a); d <= dayOf(Math.max(a, b - 1)); d += 1) starved.add(d);
  }

  let eggs = prev.speciesData['eggs'] ?? 0;
  let eggDay = prevEggDay;
  for (let d = Math.max(prevEggDay + 1, HEN_AGE_DAYS); born + (d + 1) * DAY_MS <= end; d += 1) {
    if (!starved.has(d)) {
      eggs += 1;
      added.push({ type: 'egg', at: born + (d + 1) * DAY_MS, eggs });
    }
    eggDay = d;
  }
  // Only a day still in progress needs carrying forward.
  let starvedDay: number | undefined;
  for (const d of starved) if (d > eggDay && (starvedDay === undefined || d > starvedDay)) starvedDay = d;

  const data: Record<string, number> = { ...next.speciesData };
  const before = JSON.stringify(data);
  if (eggs > 0) data['eggs'] = eggs;
  if (eggDay !== HEN_AGE_DAYS - 1) data['eggDay'] = eggDay;
  if (starvedDay === undefined) delete data['starvedDay'];
  else data['starvedDay'] = starvedDay;
  if (JSON.stringify(data) !== before) state = { ...state, speciesData: data };

  if (added.length === 0) return { state, events: events as SimEvent[] };
  const merged = [...events, ...added].sort((a, b) => a.at - b.at);
  return { state, events: merged };
}
