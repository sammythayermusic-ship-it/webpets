import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPersistence, defaultSettings, isPetDoc, normalizeSettings, PET_FILE, SETTINGS_FILE } from './persistence';
import { SCALE_L, SCALE_M, SCALE_S } from '../sim/constants';
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
    await vi.advanceTimersByTimeAsync(0);
    expect(p.setCount).toBe(1);
    expect(p.saveCount).toBe(1);
    store.savePet(doc(975));
    store.savePet(doc(950));
    store.savePet(doc(925));
    await vi.advanceTimersByTimeAsync(0);
    // Every save reaches the store's in-memory document at once; only the disk write is throttled.
    expect(p.setCount).toBe(4);
    expect(p.saveCount).toBe(1);
    expect((p.cache.get(PET_FILE) as PetDoc).balance).toBe(925);
    expect((p.files.get(PET_FILE) as PetDoc).balance).toBe(1000);
    await vi.advanceTimersByTimeAsync(499);
    expect(p.saveCount).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(p.setCount).toBe(4);
    expect(p.saveCount).toBe(2);
    expect((p.files.get(PET_FILE) as PetDoc).balance).toBe(925);
  });

  it('a save inside the throttle window updates the in-memory document before the trailing disk write', async () => {
    const p = createFakePlatform();
    const store = createPersistence(p.store, 500);
    store.savePet(doc(1000));
    await vi.advanceTimersByTimeAsync(100);
    store.savePet(doc(975));
    await vi.advanceTimersByTimeAsync(0);
    // What the store plugin would write in its exit safety-save is already the new document.
    expect((p.cache.get(PET_FILE) as PetDoc).balance).toBe(975);
    expect(p.saveCount).toBe(1);
    await vi.advanceTimersByTimeAsync(400);
    expect(p.saveCount).toBe(2);
    expect((p.files.get(PET_FILE) as PetDoc).balance).toBe(975);
  });

  it('flush writes what is pending without waiting', async () => {
    const p = createFakePlatform();
    const store = createPersistence(p.store, 500);
    store.saveSettings(defaultSettings());
    store.saveSettings({ ...defaultSettings(), scale: SCALE_L });
    await store.flush();
    expect(p.saveCount).toBe(2);
    expect(normalizeSettings(p.files.get(SETTINGS_FILE)).scale).toBe(SCALE_L);
    await vi.advanceTimersByTimeAsync(1000);
    expect(p.saveCount).toBe(2);
  });

  it('loads defaults for missing or wrong-version documents and validates the pet doc', async () => {
    const p = createFakePlatform({
      [SETTINGS_FILE]: { version: 99, scale: 3 },
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
    const s = normalizeSettings({ version: 2, scale: SCALE_S, dayNight: 'bogus', devClockOffsetMs: 5 });
    expect(s).toEqual({ ...defaultSettings(), scale: SCALE_S, devClockOffsetMs: 5 });
  });

  // The v1 -> v2 migration. v1 ran 160x120 at scale 2/3/4; v2 runs 320x240 at 1/2/3, so the stored
  // number changed meaning and has to be remapped by on-screen size. Returning defaults instead (the
  // old behaviour for a version mismatch) would wipe every other preference in the document.
  describe('settings migration from v1', () => {
    const v1 = (scale: number) => ({
      version: 1,
      scale,
      muted: true,
      notificationsMuted: true,
      dayNight: 'night',
      launchAtLogin: true,
      devClockOffsetMs: 1234,
      pendingSkipMs: 5678,
    });

    it.each([
      [2, SCALE_S],
      [3, SCALE_M],
      [4, SCALE_M],
    ])('maps v1 scale %i to v2 scale %i, preserving on-screen size', (from, to) => {
      expect(normalizeSettings(v1(from)).scale).toBe(to);
    });

    it('carries every other field forward unchanged', () => {
      // Spread over the defaults rather than written out in full, so a field ADDED to SettingsDoc
      // shows up here as "takes its default" instead of as a failure. A v1 document cannot carry a
      // field that did not exist when it was written, which is the whole point of the merge.
      expect(normalizeSettings(v1(4))).toEqual({
        ...defaultSettings(),
        version: 2,
        scale: SCALE_M,
        muted: true,
        notificationsMuted: true,
        dayNight: 'night',
        launchAtLogin: true,
        devClockOffsetMs: 1234,
        pendingSkipMs: 5678,
      });
    });

    it('falls back to the default scale for a v1 scale that was never on the old ladder', () => {
      expect(normalizeSettings({ ...v1(7), scale: 7 }).scale).toBe(defaultSettings().scale);
      expect(normalizeSettings({ ...v1(2), scale: 'big' }).scale).toBe(defaultSettings().scale);
      // ...but the rest of the document still survives.
      expect(normalizeSettings({ ...v1(2), scale: 'big' }).muted).toBe(true);
    });

    it('passes a v2 document through as-is', () => {
      const v2 = { ...v1(0), version: 2, scale: SCALE_L };
      expect(normalizeSettings(v2)).toEqual({ ...defaultSettings(), ...v2, dayNight: 'night' });
    });

    it('still yields defaults for a corrupt or unknown-version document', () => {
      expect(normalizeSettings(null)).toEqual(defaultSettings());
      expect(normalizeSettings('nope')).toEqual(defaultSettings());
      expect(normalizeSettings({ version: 3, scale: SCALE_L, muted: true })).toEqual(defaultSettings());
      expect(normalizeSettings({ scale: SCALE_L, muted: true })).toEqual(defaultSettings());
    });
  });
});
