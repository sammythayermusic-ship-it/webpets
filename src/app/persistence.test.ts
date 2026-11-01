import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPersistence,
  defaultSettings,
  GRAVEYARD_FILE,
  GRAVEYARD_VERSION,
  isLegacyPetDoc,
  isPetDoc,
  isStoredPetDoc,
  LEGACY_HYPER,
  migratePetDoc,
  normalizeGraveyard,
  normalizeSettings,
  PET_FILE,
  PET_VERSION,
  SETTINGS_FILE,
  type LegacyPetDoc,
  type LegacyPetState,
} from './persistence';
import { HOUR_MS, SCALE_L, SCALE_M, SCALE_S } from '../sim/constants';
import { defaultNeeds } from '../sim/needs';
import { hungerAt } from '../sim/hunger';
import { reconcile } from '../sim/reconcile';
import { toGraveRecord } from '../sim/pet';
import { createFakePlatform } from './test-platform';
import { B, fresh } from '../sim/test-helpers';
import type { PetDoc } from './types';
import type { PetState } from '../sim/types';

const doc = (meals: number): PetDoc => ({
  version: PET_VERSION,
  pet: { ...fresh(), meals },
  latches: { pantryLowFiredForPantry: null, deathAcknowledgedFor: null },
});

/** A pet in the shape versions 1 and 2 wrote it. */
const legacyPet = (pet: PetState = fresh()): LegacyPetState => {
  const { foodEaten, ...rest } = pet;
  return { ...rest, feedBurned: foodEaten };
};

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
    store.savePet(doc(0));
    await vi.advanceTimersByTimeAsync(0);
    expect(p.setCount).toBe(1);
    expect(p.saveCount).toBe(1);
    store.savePet(doc(1));
    store.savePet(doc(2));
    store.savePet(doc(3));
    await vi.advanceTimersByTimeAsync(0);
    // Every save reaches the store's in-memory document at once; only the disk write is throttled.
    expect(p.setCount).toBe(4);
    expect(p.saveCount).toBe(1);
    expect((p.cache.get(PET_FILE) as PetDoc).pet.meals).toBe(3);
    expect((p.files.get(PET_FILE) as PetDoc).pet.meals).toBe(0);
    await vi.advanceTimersByTimeAsync(499);
    expect(p.saveCount).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(p.setCount).toBe(4);
    expect(p.saveCount).toBe(2);
    expect((p.files.get(PET_FILE) as PetDoc).pet.meals).toBe(3);
  });

  it('a save inside the throttle window updates the in-memory document before the trailing disk write', async () => {
    const p = createFakePlatform();
    const store = createPersistence(p.store, 500);
    store.savePet(doc(0));
    await vi.advanceTimersByTimeAsync(100);
    store.savePet(doc(1));
    await vi.advanceTimersByTimeAsync(0);
    // What the store plugin would write in its exit safety-save is already the new document.
    expect((p.cache.get(PET_FILE) as PetDoc).pet.meals).toBe(1);
    expect(p.saveCount).toBe(1);
    await vi.advanceTimersByTimeAsync(400);
    expect(p.saveCount).toBe(2);
    expect((p.files.get(PET_FILE) as PetDoc).pet.meals).toBe(1);
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
    expect(isPetDoc({ ...doc(10), latches: null })).toBe(false);
    // A current document must carry foodEaten; the old field name alone is a legacy pet.
    expect(isPetDoc({ ...doc(10), pet: legacyPet() })).toBe(false);
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
    const v1 = (over: Partial<PetState> = {}): LegacyPetDoc => ({
      version: 1,
      pet: legacyPet({ ...fresh(), ...over }),
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

    it('stamps the new version and changes nothing else about the pet but the free-food rename', () => {
      const before = v1({ meals: 7 });
      const m = migratePetDoc(before, B + 30 * HOUR_MS);
      expect(m.version).toBe(PET_VERSION);
      expect(m.latches).toEqual(before.latches);
      const { hungerAtLastFed, lastFedAt, lastReconciledAt, foodEaten, ...restAfter } = m.pet;
      const { hungerAtLastFed: _h, lastFedAt: _l, lastReconciledAt: _r, feedBurned, ...restBefore } = before.pet;
      expect(restAfter).toEqual(restBefore);
      expect(foodEaten).toBe(feedBurned);
    });

    it('is identity on a document that is already current', () => {
      const current: PetDoc = { version: PET_VERSION, pet: fresh(), latches: v1().latches };
      // Same object, not merely an equal one: a no-op migration must not mark the file dirty, or every
      // launch would rewrite pet.json for nothing.
      expect(migratePetDoc(current, B + 500 * HOUR_MS)).toBe(current);
    });

    it('leaves a pet that is already dead exactly as it was, bar the rename', () => {
      const dead = reconcile(fresh(), B + 84 * HOUR_MS).state;
      const pet: PetState = { ...dead, alive: false, diedAt: B + 84 * HOUR_MS };
      const doc: LegacyPetDoc = { ...v1(), pet: legacyPet(pet) };
      const m = migratePetDoc(doc, B + 500 * HOUR_MS);
      expect(m.version).toBe(PET_VERSION);
      expect(m.pet).toEqual(pet);
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

    it('accepts versions 1, 2 and 3 on load, and rejects anything else', () => {
      expect(isLegacyPetDoc(v1())).toBe(true);
      expect(isLegacyPetDoc({ ...v1(), version: 2 })).toBe(true);
      expect(isStoredPetDoc(v1())).toBe(true);
      expect(isStoredPetDoc({ ...v1(), version: 2 })).toBe(true);
      expect(isStoredPetDoc({ version: PET_VERSION, pet: fresh(), latches: v1().latches })).toBe(true);
      // A legacy pet under the new version number, or a new pet under an old one, is neither.
      expect(isStoredPetDoc({ ...v1(), version: PET_VERSION })).toBe(false);
      expect(isStoredPetDoc({ version: 2, pet: fresh(), latches: v1().latches })).toBe(false);
      expect(isStoredPetDoc({ ...v1(), version: 4 })).toBe(false);
      expect(isStoredPetDoc({ ...v1(), version: 0 })).toBe(false);
    });
  });

  // Food became free: the food balance went, `feedBurned` became `foodEaten` and the LEGACY_HYPER
  // personality became `hyper`. A version-2 pet.json must still load as the same pet.
  describe('migratePetDoc from version 2 (free food)', () => {
    const v2 = (over: Partial<LegacyPetState> = {}): LegacyPetDoc => ({
      version: 2,
      pet: { ...legacyPet({ ...fresh(), pantry: 300, meals: 12 }), feedBurned: 300, personality: LEGACY_HYPER, ...over },
      balance: 400,
      latches: { pantryLowFiredForPantry: 75, deathAcknowledgedFor: null },
      needs: defaultNeeds(B),
    });

    it('drops the balance, renames feedBurned to foodEaten and the old personality name to hyper', () => {
      const before = v2();
      const m = migratePetDoc(before, B + 5 * HOUR_MS);
      expect(m.version).toBe(PET_VERSION);
      expect('balance' in m).toBe(false);
      expect('feedBurned' in m.pet).toBe(false);
      expect(m.pet.foodEaten).toBe(300);
      expect(m.pet.personality).toBe('hyper');
      expect(isPetDoc(m)).toBe(true);
    });

    it('keeps everything else: the hunger anchor, the feeder, the latches and the needs', () => {
      const before = v2();
      const m = migratePetDoc(before, B + 5 * HOUR_MS);
      // No re-anchoring: version 2 already ran on the current clock.
      expect(m.pet.hungerAtLastFed).toBe(before.pet.hungerAtLastFed);
      expect(m.pet.lastFedAt).toBe(before.pet.lastFedAt);
      expect(m.pet.lastReconciledAt).toBe(before.pet.lastReconciledAt);
      expect(m.pet.pantry).toBe(300);
      expect(m.pet.meals).toBe(12);
      expect(m.latches).toEqual(before.latches);
      expect(m.needs).toEqual(before.needs);
      const { foodEaten: _f, personality: _p, ...restAfter } = m.pet;
      const { feedBurned: _b, personality: _q, ...restBefore } = before.pet;
      expect(restAfter).toEqual(restBefore);
    });

    it('leaves the other personalities alone, and a document without needs without them', () => {
      for (const personality of ['sarcastic', 'anxious', 'zen'] as const) {
        expect(migratePetDoc(v2({ personality }), B).pet.personality).toBe(personality);
      }
      const { needs: _n, ...noNeeds } = v2();
      expect('needs' in migratePetDoc(noNeeds, B)).toBe(false);
    });

    it('loads from disk through createPersistence as a legacy document', async () => {
      const p = createFakePlatform({ [PET_FILE]: v2() });
      const loaded = await createPersistence(p.store, 500).loadPet();
      expect(loaded).not.toBeNull();
      expect(loaded?.version).toBe(2);
      expect(migratePetDoc(loaded as LegacyPetDoc, B).pet.personality).toBe('hyper');
    });
  });

  describe('graveyard migration', () => {
    it('upgrades version-1 records instead of dropping them, and passes version 2 through', () => {
      const dead: PetState = { ...reconcile({ ...fresh(), personality: 'zen' }, B + 36 * HOUR_MS).state };
      const record = toGraveRecord(dead, B + 40 * HOUR_MS);
      const legacyRecord = { ...record, pet: { ...legacyPet(dead), personality: LEGACY_HYPER } };
      const g1 = normalizeGraveyard({ version: 1, records: [legacyRecord, { pet: { id: 'junk' } }] });
      expect(g1.version).toBe(GRAVEYARD_VERSION);
      expect(g1.records).toHaveLength(1);
      expect(g1.records[0]?.pet).toEqual({ ...dead, personality: 'hyper' });
      expect(g1.records[0]?.diedAt).toBe(record.diedAt);
      const g2 = normalizeGraveyard({ version: GRAVEYARD_VERSION, records: [record] });
      expect(g2.records).toEqual([record]);
      expect(normalizeGraveyard({ version: 3, records: [record] }).records).toEqual([]);
    });

    it('loads a version-1 graveyard.json from disk', async () => {
      const dead = reconcile(fresh(), B + 36 * HOUR_MS).state;
      const legacyRecord = { ...toGraveRecord(dead, B + 40 * HOUR_MS), pet: legacyPet(dead) };
      const p = createFakePlatform({ [GRAVEYARD_FILE]: { version: 1, records: [legacyRecord] } });
      const g = await createPersistence(p.store, 500).loadGraveyard();
      expect(g.records.map((r) => r.pet.foodEaten)).toEqual([dead.foodEaten]);
    });
  });
});
