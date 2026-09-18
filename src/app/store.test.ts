import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppStore } from './store';
import { GRAVEYARD_FILE, PET_FILE, SETTINGS_FILE, defaultSettings } from './persistence';
import { createFakePlatform, type FakePlatform } from './test-platform';
import { B, H, fresh, mulberry32 } from '../sim/test-helpers';
import { DAY_MS } from '../sim/constants';
import type { GraveyardDoc, PetDoc, SettingsDoc } from './types';
import type { AppStore } from './types';

const petDoc = (over: Partial<PetDoc> = {}): PetDoc => ({
  version: 1,
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
    expect(saved.version).toBe(1);
    expect(saved.pet.id).toBe(s.pet.id);
    expect(saved.balance).toBe(1000);
  });

  it('boot with pendingSkipMs consumes the skip and produces recentEvents + notifications', async () => {
    const settings: SettingsDoc = { ...defaultSettings(), pendingSkipMs: 3 * DAY_MS };
    const { store, platform } = await bootStore({ [PET_FILE]: petDoc(), [SETTINGS_FILE]: settings });
    const s = store.getState();
    expect(s.settings.devClockOffsetMs).toBe(3 * DAY_MS);
    expect(s.settings.pendingSkipMs).toBe(0);
    expect(s.actions.now()).toBe(B + 3 * DAY_MS);
    expect(s.recentEvents.map((e) => e.type)).toEqual(['hungry', 'starving']);
    expect(s.hunger).toBe(0);
    expect(s.pet.alive).toBe(true);
    expect(platform.notifications.map((n) => n.body)).toEqual([
      `${s.pet.name} is hungry.`,
      `${s.pet.name} is starving. 24h to live.`,
    ]);
    await store.getState().actions.quit();
    expect((platform.files.get(SETTINGS_FILE) as SettingsDoc).pendingSkipMs).toBe(0);
    expect((platform.files.get(SETTINGS_FILE) as SettingsDoc).devClockOffsetMs).toBe(3 * DAY_MS);
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
    a.dev.skip(50 * H);
    expect(store.getState().hunger).toBeCloseTo(16.667, 2);
    a.depositPantry(100);
    const s = store.getState();
    expect(s.lastFeedEvent).toEqual({ at: B + 50 * H, kind: 'auto', seq: 1 });
    expect(s.pet.pantry).toBe(75);
    expect(s.balance).toBe(900);
    expect(s.hunger).toBeCloseTo(61.667, 2);
  });

  it('dev.skip ticks and routes notifications; muted notifications are dropped', async () => {
    const { store, platform } = await bootStore();
    const a = store.getState().actions;
    a.dev.skip(42 * H);
    expect(store.getState().hunger).toBeCloseTo(30, 6);
    expect(platform.notifications.map((n) => n.body)).toEqual([`${store.getState().pet.name} is hungry.`]);
    expect(store.getState().recentEvents.map((e) => e.type)).toEqual(['hungry']);
    a.setNotificationsMuted(true);
    a.dev.skip(18 * H);
    expect(store.getState().hunger).toBe(0);
    expect(platform.notifications).toHaveLength(1);
  });

  it('a 10-day skip with 500 in the pantry leaves 300 and 8 auto-feeds', async () => {
    const { store } = await bootStore();
    const a = store.getState().actions;
    a.depositPantry(500);
    a.dev.skip(10 * DAY_MS);
    const s = store.getState();
    expect(s.pet.alive).toBe(true);
    expect(s.pet.pantry).toBe(300);
    expect(s.recentEvents.filter((e) => e.type === 'auto-fed')).toHaveLength(8);
    // The last auto-feed (231 h) is older than 60 s, so it is not animated live.
    expect(s.lastFeedEvent).toBeNull();
    expect(s.hunger).toBeCloseTo(60, 6);
  });

  it('newPet buries the dead pet, returns the pantry and clears latches', async () => {
    const { store, platform } = await bootStore();
    const a = store.getState().actions;
    a.depositPantry(24);
    a.dev.skip(84 * H);
    const dead = store.getState().pet;
    expect(dead.alive).toBe(false);
    expect(dead.diedAt).toBe(B + 84 * H);
    a.acknowledgeDeath();
    expect(store.getState().latches.deathAcknowledgedFor).toBe(dead.id);
    a.newPet();
    const s = store.getState();
    expect(s.pet.id !== dead.id || s.pet.bornAt !== dead.bornAt).toBe(true);
    expect(s.pet.alive).toBe(true);
    expect(s.pet.bornAt).toBe(B + 84 * H);
    expect(s.balance).toBe(1000);
    expect(s.pet.pantry).toBe(0);
    expect(s.latches).toEqual({ pantryLowFiredForPantry: null, deathAcknowledgedFor: null });
    expect(s.hunger).toBe(100);
    await a.quit();
    const g = platform.files.get(GRAVEYARD_FILE) as GraveyardDoc;
    expect(g.records).toHaveLength(1);
    expect(g.records[0]?.pet.id).toBe(dead.id);
    expect(g.records[0]?.diedAt).toBe(B + 84 * H);
    expect(g.records[0]?.ageMs).toBe(84 * H);
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
    expect(s.hunger).toBe(70);
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
    const events = before.actions.dev.simulateAbsence(10, 500);
    expect(events.filter((e) => e.type === 'auto-fed')).toHaveLength(8);
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
    a.dev.skip(42 * H);
    const reconciledAt = store.getState().pet.lastReconciledAt;
    a.dev.resetClock();
    expect(store.getState().settings.devClockOffsetMs).toBe(0);
    expect(store.getState().pet.lastReconciledAt).toBe(reconciledAt);
    expect(store.getState().hunger).toBeCloseTo(30, 6);
  });

  it('feed after resetClock raises the shown hunger from where the pet already is', async () => {
    const { store } = await bootStore();
    const a = store.getState().actions;
    a.dev.skip(42 * H); // hunger 30
    a.dev.resetClock(); // now() is back at B, pet stays at B + 42 h
    expect(a.feed().ok).toBe(true);
    const s = store.getState();
    expect(s.balance).toBe(975);
    expect(s.pet.meals).toBe(1);
    expect(s.pet.lastFedAt).toBe(B + 42 * H);
    expect(s.pet.lastReconciledAt).toBe(B + 42 * H);
    expect(s.hunger).toBeCloseTo(75, 6);
    expect(s.lastFeedEvent?.kind).toBe('manual');
  });

  it('setScale calls the platform then persists; setHidden hides/shows; setLaunchAtLogin', async () => {
    const { store, platform } = await bootStore();
    const a = store.getState().actions;
    await a.setScale(3);
    expect(platform.scaleCalls).toEqual([3]);
    expect(store.getState().settings.scale).toBe(3);
    await a.setHidden(true);
    expect(platform.visible).toBe(false);
    expect(store.getState().hidden).toBe(true);
    await a.setHidden(false);
    expect(platform.visible).toBe(true);
    expect(store.getState().hidden).toBe(false);
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
    await a.setScale(1);
    const savesBefore = platform.saveCount;
    await a.quit();
    expect(platform.quitCalled).toBe(true);
    expect(platform.saveCount).toBeGreaterThan(savesBefore);
    expect((platform.files.get(PET_FILE) as PetDoc).balance).toBe(950);
    const settings = platform.files.get(SETTINGS_FILE) as SettingsDoc;
    expect(settings.muted).toBe(true);
    expect(settings.scale).toBe(1);
  });

  it('tick after a wake covering hours emits catch-up events', async () => {
    const { store, platform } = await bootStore();
    vi.setSystemTime(B + 45 * H);
    store.getState().actions.tick();
    expect(store.getState().recentEvents.map((e) => e.type)).toEqual(['hungry']);
    expect(platform.notifications).toHaveLength(1);
    vi.setSystemTime(B + 45 * H + 30_000);
    store.getState().actions.tick();
    expect(store.getState().recentEvents.map((e) => e.type)).toEqual(['hungry']);
    expect(store.getState().pet.lastReconciledAt).toBe(B + 45 * H + 30_000);
  });
});
