import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from './store';
import { GRAVEYARD_FILE, PET_FILE, PET_VERSION, SETTINGS_FILE, defaultSettings } from './persistence';
import { createFakePlatform, type FakePlatform } from './test-platform';
import { B, H, fresh, mulberry32 } from '../sim/test-helpers';
import { SCALE_L, SCALE_S } from '../sim/constants';
import { DAY_MS } from '../sim/constants';
import type { GraveyardDoc, PetDoc, SettingsDoc } from './types';
import type { AppStore } from './types';

const petDoc = (over: Partial<PetDoc> = {}): PetDoc => ({
  version: PET_VERSION,
  pet: fresh(),
  balance: 1000,
  latches: { pantryLowFiredForPantry: null, deathAcknowledgedFor: null },
  ...over,
});

async function bootStore(files: Record<string, unknown> = {}): Promise<{ store: AppStore; platform: FakePlatform }> {
  const platform = createFakePlatform(files);
  const store = createAppStore(platform, { rng: mulberry32(11) });
  await store.getState().actions.boot();
  return { store, platform };
}

describe('app store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(B);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('boot on first run mints a pet, starts with STARTING_BALANCE and persists', async () => {
    const { store, platform } = await bootStore();
    const s = store.getState();
    expect(s.hydrated).toBe(true);
    expect(s.pet.alive).toBe(true);
    expect(s.pet.bornAt).toBe(B);
    expect(s.balance).toBe(1000);
    expect(s.hunger).toBe(100);
    expect(s.settings).toEqual(defaultSettings());
    expect(s.recentEvents).toEqual([]);
    expect(s.lastFeedEvent).toBeNull();
    expect(s.actions.now()).toBe(B);
    await store.getState().actions.quit();
    const saved = platform.files.get(PET_FILE) as PetDoc;
    expect(saved.version).toBe(PET_VERSION);
    expect(saved.pet.id).toBe(s.pet.id);
    expect(saved.balance).toBe(1000);
  });

  it('boot with pendingSkipMs consumes the skip and produces recentEvents + notifications', async () => {
    // One day, not three: the bar empties in a day now and death is twelve hours after that, so three
    // days would land on a corpse and this test is about the catch-up montage, not the memorial.
    const settings: SettingsDoc = { ...defaultSettings(), pendingSkipMs: DAY_MS };
    const { store, platform } = await bootStore({ [PET_FILE]: petDoc(), [SETTINGS_FILE]: settings });
    const s = store.getState();
    expect(s.settings.devClockOffsetMs).toBe(DAY_MS);
    expect(s.settings.pendingSkipMs).toBe(0);
    expect(s.actions.now()).toBe(B + DAY_MS);
    expect(s.recentEvents.map((e) => e.type)).toEqual(['hungry', 'starving']);
    expect(s.hunger).toBe(0);
    expect(s.pet.alive).toBe(true);
    expect(platform.notifications.map((n) => n.body)).toEqual([
      `${s.pet.name} is hungry.`,
      `${s.pet.name} is starving. 12h to live.`,
    ]);
    await store.getState().actions.quit();
    expect((platform.files.get(SETTINGS_FILE) as SettingsDoc).pendingSkipMs).toBe(0);
    expect((platform.files.get(SETTINGS_FILE) as SettingsDoc).devClockOffsetMs).toBe(DAY_MS);
  });

  it('boot with a short gap does not set recentEvents', async () => {
    const pet = { ...fresh(B - 30_000), pantry: 0 };
    const { store } = await bootStore({ [PET_FILE]: petDoc({ pet }) });
    expect(store.getState().recentEvents).toEqual([]);
    expect(store.getState().pet.lastReconciledAt).toBe(B);
  });

  it('feed deducts 25, bumps meals and sets a manual lastFeedEvent', async () => {
    const { store } = await bootStore();
    const r = store.getState().actions.feed();
    expect(r.ok).toBe(true);
    const s = store.getState();
    expect(s.balance).toBe(975);
    expect(s.pet.meals).toBe(1);
    expect(s.pet.feedBurned).toBe(25);
    expect(s.lastFeedEvent).toEqual({ at: B, kind: 'manual', seq: 1 });
    store.getState().actions.feed();
    expect(store.getState().lastFeedEvent?.seq).toBe(2);
    expect(store.getState().balance).toBe(950);
  });

  it('feed fails cleanly when the balance is short', async () => {
    const { store } = await bootStore({ [PET_FILE]: petDoc({ balance: 10 }) });
    const r = store.getState().actions.feed();
    expect(r.ok).toBe(false);
    expect(store.getState().balance).toBe(10);
    expect(store.getState().lastFeedEvent).toBeNull();
  });

  it('deposit/withdraw conserve balance + pantry + feedBurned', async () => {
    const { store } = await bootStore();
    const a = store.getState().actions;
    const total = () => {
      const s = store.getState();
      return s.balance + s.pet.pantry + s.pet.feedBurned;
    };
    a.depositPantry(300);
    expect(store.getState().balance).toBe(700);
    expect(store.getState().pet.pantry).toBe(300);
    expect(total()).toBe(1000);
    a.depositPantry(5000);
    expect(store.getState().balance).toBe(0);
    expect(store.getState().pet.pantry).toBe(1000);
    expect(total()).toBe(1000);
    a.withdrawPantry();
    expect(store.getState().balance).toBe(1000);
    expect(store.getState().pet.pantry).toBe(0);
    expect(total()).toBe(1000);
    a.feed();
    expect(total()).toBe(1000);
  });

  it('a deposit that auto-feeds at now sets an auto lastFeedEvent', async () => {
    const { store } = await bootStore();
    const a = store.getState().actions;
    a.dev.skip(20 * H);
    expect(store.getState().hunger).toBeCloseTo(16.667, 2);
    a.depositPantry(100);
    const s = store.getState();
    expect(s.lastFeedEvent).toEqual({ at: B + 20 * H, kind: 'auto', seq: 1 });
    expect(s.pet.pantry).toBe(75);
    expect(s.balance).toBe(900);
    expect(s.hunger).toBeCloseTo(66.667, 2);
  });

  it('dev.skip ticks and routes notifications; muted notifications are dropped', async () => {
    const { store, platform } = await bootStore();
    const a = store.getState().actions;
    a.dev.skip(16.8 * H);
    expect(store.getState().hunger).toBeCloseTo(30, 6);
    expect(platform.notifications.map((n) => n.body)).toEqual([`${store.getState().pet.name} is hungry.`]);
    expect(store.getState().recentEvents.map((e) => e.type)).toEqual(['hungry']);
    a.setNotificationsMuted(true);
    a.dev.skip(10 * H);
    expect(store.getState().hunger).toBe(0);
    expect(platform.notifications).toHaveLength(1);
  });

  it('a 10-day skip with 1000 in the pantry leaves 525 and 19 auto-feeds', async () => {
    const { store } = await bootStore();
    const a = store.getState().actions;
    a.depositPantry(1000);
    a.dev.skip(10 * DAY_MS);
    const s = store.getState();
    expect(s.pet.alive).toBe(true);
    expect(s.pet.pantry).toBe(525);
    expect(s.recentEvents.filter((e) => e.type === 'auto-fed')).toHaveLength(19);
    // The last auto-feed (232.8 h) is older than 60 s, so it is not animated live.
    expect(s.lastFeedEvent).toBeNull();
    expect(s.hunger).toBeCloseTo(50, 6);
  });

  it('newPet buries the dead pet, returns the pantry and clears latches', async () => {
    const { store, platform } = await bootStore();
    const a = store.getState().actions;
    a.depositPantry(24);
    a.dev.skip(36 * H);
    const dead = store.getState().pet;
    expect(dead.alive).toBe(false);
    expect(dead.diedAt).toBe(B + 36 * H);
    a.acknowledgeDeath();
    expect(store.getState().latches.deathAcknowledgedFor).toBe(dead.id);
    a.newPet();
    const s = store.getState();
    expect(s.pet.id !== dead.id || s.pet.bornAt !== dead.bornAt).toBe(true);
    expect(s.pet.alive).toBe(true);
    expect(s.pet.bornAt).toBe(B + 36 * H);
    expect(s.balance).toBe(1000);
    expect(s.pet.pantry).toBe(0);
    expect(s.latches).toEqual({ pantryLowFiredForPantry: null, deathAcknowledgedFor: null });
    expect(s.hunger).toBe(100);
    await a.quit();
    const g = platform.files.get(GRAVEYARD_FILE) as GraveyardDoc;
    expect(g.records).toHaveLength(1);
    expect(g.records[0]?.pet.id).toBe(dead.id);
    expect(g.records[0]?.diedAt).toBe(B + 36 * H);
    expect(g.records[0]?.ageMs).toBe(36 * H);
  });

  it('dev.setHunger anchors at now with lastReconciledAt = now - 1', async () => {
    const { store } = await bootStore();
    const a = store.getState().actions;
    a.dev.setHunger(20);
    const s = store.getState();
    expect(s.hunger).toBe(20);
    expect(s.pet.hungerAtLastFed).toBe(20);
    expect(s.pet.lastFedAt).toBe(B);
    expect(s.pet.lastReconciledAt).toBe(B - 1);
    a.dev.setHunger(500);
    expect(store.getState().hunger).toBe(100);
  });

  it('dev.setPantry bypasses the ledger and may auto-feed at now', async () => {
    const { store } = await bootStore();
    const a = store.getState().actions;
    a.dev.setHunger(25);
    a.dev.setPantry(50);
    const s = store.getState();
    expect(s.pet.pantry).toBe(25);
    expect(s.hunger).toBe(75);
    expect(s.balance).toBe(1000);
    expect(s.lastFeedEvent?.kind).toBe('auto');
  });

  it('dev.forceState covers fed/hungry/starving/dead/asleep', async () => {
    const { store, platform } = await bootStore();
    const a = store.getState().actions;
    a.dev.forceState('hungry');
    expect(store.getState().hunger).toBe(20);
    expect(store.getState().pet.pantry).toBe(0);
    a.dev.forceState('fed');
    expect(store.getState().hunger).toBe(100);
    a.dev.forceState('starving');
    expect(store.getState().hunger).toBe(0);
    a.dev.forceState('asleep');
    expect(store.getState().night).toBe(true);
    expect(store.getState().nightOverride).toBe(true);
    a.dev.setNightOverride(null);
    a.setDayNight('day');
    expect(store.getState().night).toBe(false);

    a.dev.forceState('fed');
    a.depositPantry(100);
    a.dev.forceState('dead');
    const s = store.getState();
    expect(s.pet.alive).toBe(false);
    expect(s.pet.diedAt).toBe(B);
    expect(s.pet.pantry).toBe(0);
    expect(s.balance).toBe(1000);
    expect(platform.notifications.at(-1)?.body).toBe(`${s.pet.name} has died.`);
    expect(store.getState().actions.feed().ok).toBe(false);
  });

  it('dev.simulateAbsence is a dry run', async () => {
    const { store, platform } = await bootStore();
    const before = store.getState();
    const events = before.actions.dev.simulateAbsence(10, 1000);
    expect(events.filter((e) => e.type === 'auto-fed')).toHaveLength(19);
    const after = store.getState();
    expect(after.pet).toEqual(before.pet);
    expect(after.balance).toBe(before.balance);
    expect(after.recentEvents).toEqual([]);
    expect(platform.notifications).toEqual([]);
  });

  it('dev.skipOnNextLaunch arms pendingSkipMs and flushes', async () => {
    const { store, platform } = await bootStore();
    await store.getState().actions.dev.skipOnNextLaunch(3 * DAY_MS);
    expect((platform.files.get(SETTINGS_FILE) as SettingsDoc).pendingSkipMs).toBe(3 * DAY_MS);
    expect(store.getState().actions.now()).toBe(B);
  });

  it('resetClock zeroes the offset without moving the pet backwards', async () => {
    const { store } = await bootStore();
    const a = store.getState().actions;
    a.dev.skip(16.8 * H);
    const reconciledAt = store.getState().pet.lastReconciledAt;
    a.dev.resetClock();
    expect(store.getState().settings.devClockOffsetMs).toBe(0);
    expect(store.getState().pet.lastReconciledAt).toBe(reconciledAt);
    expect(store.getState().hunger).toBeCloseTo(30, 6);
  });

  it('feed after resetClock raises the shown hunger from where the pet already is', async () => {
    const { store } = await bootStore();
    const a = store.getState().actions;
    a.dev.skip(16.8 * H); // hunger 30
    a.dev.resetClock(); // now() is back at B, pet stays at B + 16.8 h
    expect(a.feed().ok).toBe(true);
    const s = store.getState();
    expect(s.balance).toBe(975);
    expect(s.pet.meals).toBe(1);
    expect(s.pet.lastFedAt).toBe(B + 16.8 * H);
    expect(s.pet.lastReconciledAt).toBe(B + 16.8 * H);
    expect(s.hunger).toBeCloseTo(80, 6);
    expect(s.lastFeedEvent?.kind).toBe('manual');
  });

  it('setScale calls the platform then persists; setHidden hides/shows; setLaunchAtLogin', async () => {
    const { store, platform } = await bootStore();
    const a = store.getState().actions;
    await a.setScale(SCALE_L);
    expect(platform.scaleCalls).toEqual([SCALE_L]);
    expect(store.getState().settings.scale).toBe(SCALE_L);
    await a.setHidden(true);
    expect(platform.visible).toBe(false);
    expect(store.getState().hidden).toBe(true);
    await a.setHidden(false);
    expect(platform.visible).toBe(true);
    expect(store.getState().hidden).toBe(false);
    await a.setLayering({ alwaysOnTop: false });
    // The platform is handed a COMPLETE set, not the patch: on macOS these are facets of two window
    // properties and applying them piecemeal would race.
    expect(platform.layeringCalls).toEqual([{ alwaysOnTop: false, allDesktops: true, overFullscreen: true }]);
    expect(store.getState().settings.alwaysOnTop).toBe(false);
    expect(store.getState().settings.allDesktops, 'untouched flags keep their values').toBe(true);

    await a.setLaunchAtLogin(true);
    expect(platform.autostartEnabled).toBe(true);
    expect(store.getState().settings.launchAtLogin).toBe(true);
    a.setMuted(true);
    expect(store.getState().settings.muted).toBe(true);
  });

  it('quit flushes pending saves before platform.quit', async () => {
    const { store, platform } = await bootStore();
    const a = store.getState().actions;
    a.feed();
    a.feed();
    a.setMuted(true);
    await a.setScale(SCALE_S);
    const savesBefore = platform.saveCount;
    await a.quit();
    expect(platform.quitCalled).toBe(true);
    expect(platform.saveCount).toBeGreaterThan(savesBefore);
    expect((platform.files.get(PET_FILE) as PetDoc).balance).toBe(950);
    const settings = platform.files.get(SETTINGS_FILE) as SettingsDoc;
    expect(settings.muted).toBe(true);
    // On disk the scale lives under `scaleSteps`; `scale` is the in-memory name.
    expect((settings as unknown as { scaleSteps: number }).scaleSteps).toBe(SCALE_S);
  });

  it('banks speciesData additively, ignores nothing-happened, and refuses to credit a corpse', async () => {
    const { store } = await bootStore();
    const a = store.getState().actions;
    expect(store.getState().pet.speciesData).toEqual({});

    a.addSpeciesData({ wheelKm: 0.25 });
    a.addSpeciesData({ wheelKm: 0.5 });
    expect(store.getState().pet.speciesData['wheelKm']).toBeCloseTo(0.75, 9);

    // Empty and zero deltas are no-ops rather than writes: the scene drains on a timer and most
    // drains are empty, so this is the common case and it must not touch the pet or the disk.
    const before = store.getState().pet;
    a.addSpeciesData({});
    a.addSpeciesData({ wheelKm: 0 });
    a.addSpeciesData({ wheelKm: Number.NaN });
    expect(store.getState().pet).toBe(before);

    // Counters from more than one species coexist; nothing here knows what a wheel is.
    a.addSpeciesData({ cricketsCaught: 3 });
    expect(store.getState().pet.speciesData).toEqual({ wheelKm: 0.75, cricketsCaught: 3 });

    // A dead pet earns nothing. A scene still mounted over a corpse would otherwise keep crediting
    // the wheel, and speciesData is the part of the pet that survives into the graveyard record.
    a.dev.forceState('dead');
    expect(store.getState().pet.alive).toBe(false);
    a.addSpeciesData({ wheelKm: 99 });
    expect(store.getState().pet.speciesData['wheelKm']).toBeCloseTo(0.75, 9);
  });

  it('carries a version-1 pet across the twice-a-day retune without harming it', async () => {
    // The whole point, end to end. This pet was last fed 30 hours ago with a full bar, which on the old
    // clock reads exactly 50%. Loaded naively under the new clock that same anchor reads zero, is nine
    // hours past death, and `reconcile` replays hungry -> starving -> dying-soon -> died as four real
    // desktop notifications. The user would open the app to a corpse and four toasts, having done
    // nothing wrong. What they get instead is the fish at 50%, silent.
    const stale: PetDoc = {
      version: 1,
      pet: { ...fresh(), lastFedAt: B - 30 * H, lastReconciledAt: B - 30 * H },
      balance: 675,
      latches: { pantryLowFiredForPantry: null, deathAcknowledgedFor: null },
    };
    const { store, platform } = await bootStore({ [PET_FILE]: stale });
    const s = store.getState();
    expect(s.pet.alive).toBe(true);
    expect(s.hunger).toBeCloseTo(50, 9);
    expect(platform.notifications).toEqual([]);
    expect(s.recentEvents).toEqual([]);
    expect(s.balance).toBe(675);

    // ...and the upgraded document is written back, so the next launch is an ordinary one.
    await store.getState().actions.quit();
    const saved = platform.files.get(PET_FILE) as PetDoc;
    expect(saved.version).toBe(PET_VERSION);
    expect(saved.pet.lastFedAt).toBe(B);

    // From here it is simply the new clock: half a bar is half a day.
    expect(store.getState().actions.now()).toBe(B);
  });

  it('tick after a wake covering hours emits catch-up events', async () => {
    const { store, platform } = await bootStore();
    vi.setSystemTime(B + 20 * H);
    store.getState().actions.tick();
    expect(store.getState().recentEvents.map((e) => e.type)).toEqual(['hungry']);
    expect(platform.notifications).toHaveLength(1);
    vi.setSystemTime(B + 20 * H + 30_000);
    store.getState().actions.tick();
    expect(store.getState().recentEvents.map((e) => e.type)).toEqual(['hungry']);
    expect(store.getState().pet.lastReconciledAt).toBe(B + 20 * H + 30_000);
  });
});
