import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toHudModel, toSceneView } from './view';
import { isNightAt, resolveNight } from './daynight';
import { createAppStore } from './store';
import { createFakePlatform } from './test-platform';
import { B, H, mulberry32 } from '../sim/test-helpers';

describe('view + daynight', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(B);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('derives the scene view and HUD model across alive/dead/memorial', async () => {
    const platform = createFakePlatform();
    const store = createAppStore(platform, { rng: mulberry32(3) });
    const a = store.getState().actions;
    await a.boot();
    a.setDayNight('day');
    a.depositPantry(40);
    let v = toSceneView(store.getState(), false);
    expect(v.phase).toBe('alive');
    expect(v.label).toBe('full');
    expect(v.pantryFraction).toBeCloseTo(0.08, 9);
    expect(v.pantryLow).toBe(true);
    expect(v.asleep).toBe(false);
    a.dev.setNightOverride(true);
    v = toSceneView(store.getState(), true);
    expect(v.night).toBe(true);
    expect(v.asleep).toBe(true);
    expect(v.reducedMotion).toBe(true);
    a.dev.setNightOverride(null);

    let h = toHudModel(store.getState());
    expect(h.hungerPct).toBe(100);
    expect(h.canFeed).toBe(true);
    expect(h.pantry).toBe(40);
    expect(h.pantryDays).toBeCloseTo(0.8, 9);
    expect(h.age).toBe('0d 0h');
    // 40 in the pantry buys one auto-feed at 16.8 h (hunger 80), so zero is at 36 h and death at 48 h.
    a.dev.skip(48 * H);
    h = toHudModel(store.getState());
    expect(h.alive).toBe(false);
    expect(h.canFeed).toBe(false);
    expect(h.age).toBe('2d 0h');
    expect(h.pantry).toBe(15);
    v = toSceneView(store.getState(), false);
    expect(v.phase).toBe('dead');
    expect(v.asleep).toBe(false);
    expect(v.pantryLow).toBe(true);
    a.acknowledgeDeath();
    expect(toSceneView(store.getState(), false).phase).toBe('memorial');
    a.dev.setBalance(5);
    a.newPet(); // returns the 15 left in the pantry -> balance 20 < FEED_COST
    expect(store.getState().balance).toBe(20);
    expect(toHudModel(store.getState()).canFeed).toBe(false);
    expect(toSceneView(store.getState(), false).phase).toBe('alive');
  });

  it('isNightAt uses the local hour', () => {
    const d = new Date(2026, 0, 1, 12, 0, 0);
    expect(isNightAt(d.getTime())).toBe(false);
    // Night is the light curve past its midpoint: it lifts at 06:00 and falls at 18:45.
    expect(isNightAt(new Date(2026, 0, 1, 5, 50, 0).getTime())).toBe(true);
    expect(isNightAt(new Date(2026, 0, 1, 19, 0, 0).getTime())).toBe(true);
    expect(isNightAt(new Date(2026, 0, 1, 6, 10, 0).getTime())).toBe(false);
    expect(isNightAt(new Date(2026, 0, 1, 18, 40, 0).getTime())).toBe(false);
    expect(resolveNight('night', null, d.getTime())).toBe(true);
    expect(resolveNight('day', null, d.getTime())).toBe(false);
    expect(resolveNight('day', true, d.getTime())).toBe(true);
    expect(resolveNight('night', false, d.getTime())).toBe(false);
  });
});
