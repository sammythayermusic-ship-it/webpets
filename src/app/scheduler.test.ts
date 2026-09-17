import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startScheduler } from './scheduler';
import { createAppStore } from './store';
import { createFakePlatform } from './test-platform';
import { B, mulberry32 } from '../sim/test-helpers';

describe('scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(B);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks on start, on the interval and on wake; stop() detaches', async () => {
    const platform = createFakePlatform();
    const store = createAppStore(platform, { rng: mulberry32(1) });
    await store.getState().actions.boot();
    const tick = vi.spyOn(store.getState().actions, 'tick');
    const stop = startScheduler(store, platform, 30_000);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(tick).toHaveBeenCalledTimes(2);
    platform.emitWake();
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(60_000);
    platform.emitWake();
    expect(tick).toHaveBeenCalledTimes(3);
    expect(store.getState().pet.lastReconciledAt).toBe(B + 30_000);
  });
});
