import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPersistence,
  defaultSettings,
  isPetDoc,
  migratePetDoc,
  normalizeSettings,
  PET_FILE,
  PET_VERSION,
  SETTINGS_FILE,
} from './persistence';
import { HOUR_MS, SCALE_L, SCALE_M, SCALE_S } from '../sim/constants';
import { hungerAt } from '../sim/hunger';
import { reconcile } from '../sim/reconcile';
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
    // `scaleSteps`, not `scale`: the number changed meaning when the ladder became continuous, so
    // the current value is written under a new key and the old one is read as a legacy rung.
    const s = normalizeSettings({ version: 2, scaleSteps: SCALE_S, dayNight: 'bogus', devClockOffsetMs: 5 });
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
      const v2 = { ...v1(0), version: 2, scaleSteps: SCALE_L };
      const { scaleSteps, ...rest } = v2;
      expect(normalizeSettings(v2)).toEqual({ ...defaultSettings(), ...rest, scale: scaleSteps, dayNight: 'night' });
    });

    it('still yields defaults for a corrupt or unknown-version document', () => {
      expect(normalizeSettings(null)).toEqual(defaultSettings());
      expect(normalizeSettings('nope')).toEqual(defaultSettings());
      expect(normalizeSettings({ version: 3, scale: SCALE_L, muted: true })).toEqual(defaultSettings());
      expect(normalizeSettings({ scale: SCALE_L, muted: true })).toEqual(defaultSettings());
    });
  });

  // The hunger clock went from a 45-point meal on a 60-hour bar to a 50-point meal on a 24-hour one.
  // Hunger is derived, never stored, so without this migration every saved pet would be re-simulated at
  // the new speed on first launch -- a fish showing 65% would reappear starving or dead, having done
  // nothing but survive an upgrade. What the migration owes the user is the NUMBER ON SCREEN.
  describe('migratePetDoc', () => {
    const v1 = (over: Partial<PetDoc['pet']> = {}): PetDoc => ({
      version: 1,
      pet: { ...fresh(), ...over },
      balance: 675,
      latches: { pantryLowFiredForPantry: null, deathAcknowledgedFor: null },
    });
    /** What a v1 anchor read on the old clock: 100 minus 45/27 h of decay. */
    const legacyHunger = (anchor: number, hours: number): number =>
      Math.max(0, Math.min(100, anchor - (100 / 60) * hours));

    it('preserves the hunger the pet was showing, to the last decimal', () => {
      // 30 h into a v1 life the fish reads 50. Under the new clock that same anchor would read zero and
      // the pet would be hours from death; after migrating it still reads 50 and simply gets hungry
      // faster from here.
      const now = B + 30 * HOUR_MS;
      const m = migratePetDoc(v1(), now);
      expect(hungerAt(m.pet, now)).toBeCloseTo(legacyHunger(100, 30), 9);
      expect(hungerAt(m.pet, now)).toBeCloseTo(50, 9);
    });

    it('re-anchors at now so no history is replayed', () => {
      // The anchor moving to `now` is what stops `reconcile` walking the old interval under the new
      // rate and firing hungry/starving/dying-soon/died as four real desktop notifications at once.
      const now = B + 30 * HOUR_MS;
      const m = migratePetDoc(v1(), now);
      expect(m.pet.lastFedAt).toBe(now);
      expect(m.pet.lastReconciledAt).toBe(now);
      expect(reconcile(m.pet, now).events).toEqual([]);
    });

    it('stamps the new version and changes nothing else about the document', () => {
      const before = v1();
      const m = migratePetDoc(before, B + 30 * HOUR_MS);
      expect(m.version).toBe(PET_VERSION);
      expect(m.balance).toBe(before.balance);
      expect(m.latches).toEqual(before.latches);
      const { hungerAtLastFed, lastFedAt, lastReconciledAt, ...restAfter } = m.pet;
      const { hungerAtLastFed: _h, lastFedAt: _l, lastReconciledAt: _r, ...restBefore } = before.pet;
      expect(restAfter).toEqual(restBefore);
    });

    it('is identity on a document that is already current', () => {
      const current: PetDoc = { ...v1(), version: PET_VERSION };
      // Same object, not merely an equal one: a no-op migration must not mark the file dirty, or every
      // launch would rewrite pet.json for nothing.
      expect(migratePetDoc(current, B + 500 * HOUR_MS)).toBe(current);
    });

    it('leaves a pet that is already dead exactly as it was', () => {
      const dead = reconcile(fresh(), B + 84 * HOUR_MS).state;
      const doc: PetDoc = { ...v1(), pet: { ...dead, alive: false, diedAt: B + 84 * HOUR_MS } };
      const m = migratePetDoc(doc, B + 500 * HOUR_MS);
      expect(m.version).toBe(PET_VERSION);
      expect(m.pet).toEqual(doc.pet);
    });

    it('does not retroactively kill a pet that the OLD rules would already have starved', () => {
      // Left closed for a week. Under v1 this pet died days ago, and the strictly correct thing would be
      // to bury it on load. It is not what we do: an upgrade must never be the thing that ends a pet, so
      // it comes back at zero with the full new death window ahead of it.
      const now = B + 7 * 24 * HOUR_MS;
      const m = migratePetDoc(v1(), now);
      expect(m.pet.alive).toBe(true);
      expect(hungerAt(m.pet, now)).toBe(0);
      expect(reconcile(m.pet, now).state.alive).toBe(true);
      expect(reconcile(m.pet, now + 11 * HOUR_MS).state.alive).toBe(true);
      expect(reconcile(m.pet, now + 12 * HOUR_MS).state.alive).toBe(false);
    });

    it('cannot invent hunger for a pet fed moments ago, or for a clock that ran backwards', () => {
      const m = migratePetDoc(v1(), B);
      expect(hungerAt(m.pet, B)).toBe(100);
      const back = migratePetDoc(v1(), B - 10 * HOUR_MS);
      expect(hungerAt(back.pet, back.pet.lastFedAt)).toBe(100);
    });

    it('accepts both versions on load, and rejects anything else', () => {
      expect(isPetDoc(v1())).toBe(true);
      expect(isPetDoc({ ...v1(), version: PET_VERSION })).toBe(true);
      expect(isPetDoc({ ...v1(), version: 3 })).toBe(false);
      expect(isPetDoc({ ...v1(), version: 0 })).toBe(false);
    });
  });
});
