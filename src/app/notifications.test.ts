import { describe, expect, it } from 'vitest';
import { decide } from './notifications';
import { reconcile } from '../sim/reconcile';
import { B, H, fresh } from '../sim/test-helpers';
import type { NotificationLatches } from './types';
import type { PetState } from '../sim/types';

const latches0 = (): NotificationLatches => ({ pantryLowFiredForPantry: null, deathAcknowledgedFor: null });

describe('notifications.decide', () => {
  it('maps hunger events to the contract copy in order', () => {
    const s = fresh();
    const r = reconcile(s, B + 84 * H);
    const d = decide(s, r.state, r.events, B + 84 * H, latches0());
    expect(d.toasts.map((t) => t.body)).toEqual([
      `${s.name} is hungry.`,
      `${s.name} is starving. 24h to live.`,
      `${s.name} has 6 hours.`,
      `${s.name} has died.`,
    ]);
    expect(d.toasts.every((t) => t.title === s.name)).toBe(true);
    expect(d.latches).toEqual(latches0());
  });

  it('auto-fed events produce no toast', () => {
    const s: PetState = { ...fresh(), pantry: 500 };
    const r = reconcile(s, B + 240 * H);
    const d = decide(s, r.state, r.events, B + 240 * H, latches0());
    expect(d.toasts).toEqual([]);
  });

  it('pantry-low fires once per pantry value while hunger < 60 and resets when runway >= 2 days', () => {
    const base = fresh();
    const now = B + 30 * H; // hunger 50
    const low: PetState = { ...base, pantry: 40 };
    const d1 = decide(base, low, [], now, latches0());
    expect(d1.toasts).toEqual([{ title: base.name, body: 'Pantry is almost empty.' }]);
    expect(d1.latches.pantryLowFiredForPantry).toBe(40);

    const d2 = decide(low, low, [], now + 1000, d1.latches);
    expect(d2.toasts).toEqual([]);
    expect(d2.latches.pantryLowFiredForPantry).toBe(40);

    const refilled: PetState = { ...low, pantry: 100 };
    const d3 = decide(low, refilled, [], now + 2000, d2.latches);
    expect(d3.toasts).toEqual([]);
    expect(d3.latches.pantryLowFiredForPantry).toBeNull();

    const d4 = decide(refilled, low, [], now + 3000, d3.latches);
    expect(d4.toasts).toHaveLength(1);
    expect(d4.latches.pantryLowFiredForPantry).toBe(40);

    // A different low pantry value (after an auto-feed) fires again.
    const lower: PetState = { ...low, pantry: 15 };
    const d5 = decide(low, lower, [], now + 4000, d4.latches);
    expect(d5.toasts).toHaveLength(1);
    expect(d5.latches.pantryLowFiredForPantry).toBe(15);
  });

  it('pantry-low needs pantry > 0, hunger < 60 and a living pet', () => {
    const base = fresh();
    const empty: PetState = { ...base, pantry: 0 };
    expect(decide(base, empty, [], B + 30 * H, latches0()).toasts).toEqual([]);
    const full: PetState = { ...base, pantry: 40 };
    expect(decide(base, full, [], B + 10 * H, latches0()).toasts).toEqual([]); // hunger ~83
    const dead: PetState = { ...reconcile(base, B + 84 * H).state, pantry: 20 };
    expect(decide(base, dead, [], B + 90 * H, latches0()).toasts).toEqual([]);
  });

  it('preserves deathAcknowledgedFor', () => {
    const base = fresh();
    const l: NotificationLatches = { pantryLowFiredForPantry: null, deathAcknowledgedFor: '#0001' };
    expect(decide(base, base, [], B, l).latches.deathAcknowledgedFor).toBe('#0001');
  });
});
