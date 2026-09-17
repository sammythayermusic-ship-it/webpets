import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPersistence, defaultSettings, isPetDoc, normalizeSettings, PET_FILE, SETTINGS_FILE } from './persistence';
import { createFakePlatform } from './test-platform';
import { B, fresh } from '../sim/test-helpers';
import type { PetDoc } from './types';

const doc = (balance: number): PetDoc => ({
  version: 1,
  pet: fresh(),
  balance,
  latches: { pantryLowFiredForPantry: null, deathAcknowledgedFor: null },
});

describe('persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(B);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the first save immediately and coalesces a burst into one trailing write', async () => {
    const p = createFakePlatform();
    const store = createPersistence(p.store, 500);
    store.savePet(doc(1000));
    await Promise.resolve();
    expect(p.saveCount).toBe(1);
    store.savePet(doc(975));
    store.savePet(doc(950));
    store.savePet(doc(925));
    await Promise.resolve();
    expect(p.saveCount).toBe(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(p.saveCount).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(p.saveCount).toBe(2);
    expect((p.files.get(PET_FILE) as PetDoc).balance).toBe(925);
  });

  it('flush writes what is pending without waiting', async () => {
    const p = createFakePlatform();
    const store = createPersistence(p.store, 500);
    store.saveSettings(defaultSettings());
    store.saveSettings({ ...defaultSettings(), scale: 4 });
    await store.flush();
    expect(p.saveCount).toBe(2);
    expect(normalizeSettings(p.files.get(SETTINGS_FILE)).scale).toBe(4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(p.saveCount).toBe(2);
  });

  it('loads defaults for missing or wrong-version documents and validates the pet doc', async () => {
    const p = createFakePlatform({
      [SETTINGS_FILE]: { version: 2, scale: 4 },
      [PET_FILE]: { version: 1, pet: { id: 'nope' }, balance: 1000 },
    });
    const store = createPersistence(p.store, 500);
    expect(await store.loadSettings()).toEqual(defaultSettings());
    expect(await store.loadPet()).toBeNull();
    expect((await store.loadGraveyard()).records).toEqual([]);
    expect(isPetDoc(doc(10))).toBe(true);
    expect(isPetDoc({ ...doc(10), balance: -1 })).toBe(false);
  });

  it('merges partial settings over defaults', () => {
    const s = normalizeSettings({ version: 1, scale: 2, dayNight: 'bogus', devClockOffsetMs: 5 });
    expect(s).toEqual({ ...defaultSettings(), scale: 2, devClockOffsetMs: 5 });
  });
});
