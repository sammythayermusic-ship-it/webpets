// Zustand vanilla store: the single owner of pet/balance/settings state. Every mutation goes through the pure
// sim, then routes the returned events to notifications and to lastFeedEvent, then persists.
import { createStore } from 'zustand/vanilla';
import type { Layering, Platform } from '../platform/types';
import type { GraveRecord, PetState, ReconcileResult, Rng, SimEvent } from '../sim/index';
import {
  DAY_MS,
  DEFAULT_CONSTANTS,
  LocalLedger,
  clampScale,
  STARTING_BALANCE,
  depositPantry as simDeposit,
  feed as simFeed,
  hungerAt,
  newPet as mintPet,
  reconcile,
  defaultNeeds,
  drivesOf,
  normalizeNeeds,
  stimulate,
  advanceNeeds,
  toGraveRecord,
  withdrawPantry as simWithdraw,
} from '../sim/index';
import type { Scale } from '../sim/constants';
import type {
  AppActions,
  AppState,
  AppStore,
  DevActions,
  ForcedState,
  GraveyardDoc,
  NotificationLatches,
  PetDoc,
  SettingsDoc,
} from './types';
import { createPersistence, defaultGraveyard, defaultSettings, migratePetDoc, PET_VERSION, type Persistence } from './persistence';
import { speciesModule } from '../species';
import { decide } from './notifications';
import { PURE_DAY, resolveDaylight, resolveNight } from './daynight';
import { advanceNeedsTo, regimeNow } from './needsBridge';
import type { RegimeSource } from './needsBridge';

/** Reconciles that cover more than this much wall time produce `recentEvents` (the "while you were gone" montage). */
export const CATCH_UP_SPAN_MS = 60_000;
/** Auto-feeds older than this are only listed in recentEvents, never animated live. */
export const LIVE_FEED_WINDOW_MS = 60_000;

export interface AppStoreOptions {
  /** Defaults to Math.random; tests pass a seeded rng. */
  rng?: Rng;
  /** Defaults to createPersistence(platform.store). */
  persistence?: Persistence;
}

function freshLatches(): NotificationLatches {
  return { pantryLowFiredForPantry: null, deathAcknowledgedFor: null };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Hunger shown for a pet. Evaluated at max(now, lastReconciledAt): after dev.resetClock the pet keeps the hunger
 * it already reached instead of snapping back to its anchor while real time catches up.
 */
function derivedHunger(pet: PetState, at: number): number {
  return hungerAt(pet, Math.max(at, pet.lastReconciledAt));
}

function sameGrave(r: GraveRecord, pet: PetState): boolean {
  return r.pet.id === pet.id && r.pet.bornAt === pet.bornAt;
}

export function createAppStore(platform: Platform, opts: AppStoreOptions = {}): AppStore {
  const rng: Rng = opts.rng ?? Math.random;
  const persist: Persistence = opts.persistence ?? createPersistence(platform.store);
  let graveyard: GraveyardDoc = defaultGraveyard();
  let feedSeq = 0;

  const store = createStore<AppState>()((set, get) => {
    const now = (): number => Date.now() + get().settings.devClockOffsetMs;

    const petDoc = (): PetDoc => {
      const s = get();
      return { version: PET_VERSION, pet: s.pet, balance: s.balance, latches: s.latches, needs: s.needs };
    };
    /** What the needs model is told about the pet's circumstances. */
    const regimeSource = (): RegimeSource => {
      const s = get();
      return { pet: s.pet, dayNight: s.settings.dayNight, nightOverride: s.nightOverride, present: s.present, hunger: s.hunger };
    };
    const savePet = (): void => persist.savePet(petDoc());
    const saveSettings = (): void => persist.saveSettings(get().settings);
    /** The layering flags on their own, so the platform is handed a complete set rather than a patch. */
    const layeringOf = (st: SettingsDoc): Layering => ({
      alwaysOnTop: st.alwaysOnTop,
      allDesktops: st.allDesktops,
      overFullscreen: st.overFullscreen,
    });
    const saveGraveyard = (): void => persist.saveGraveyard(graveyard);

    const notify = (title: string, body: string): void => {
      if (get().settings.notificationsMuted) return;
      console.log(`[notify] ${title}: ${body}`);
      platform.notify(title, body).catch((err: unknown) => console.warn('[notify] failed', err));
    };

    /**
     * Commit the result of a sim operation: route events to notifications and lastFeedEvent, derive hunger/night,
     * remember catch-up events, persist. `prev` is the pet before the operation (its lastReconciledAt bounds the
     * covered span).
     */
    const commit = (
      prev: PetState,
      r: ReconcileResult,
      at: number,
      extra: { balance?: number; manualFeed?: boolean } = {},
    ): void => {
      const s = get();
      const span = at - prev.lastReconciledAt;
      const decision = decide(prev, r.state, r.events, at, s.latches);

      let lastFeedEvent = s.lastFeedEvent;
      for (const e of r.events) {
        if (e.type === 'auto-fed' && e.at >= at - LIVE_FEED_WINDOW_MS) {
          lastFeedEvent = { at: e.at, kind: 'auto', seq: ++feedSeq };
        }
      }
      if (extra.manualFeed === true) lastFeedEvent = { at, kind: 'manual', seq: ++feedSeq };

      // Needs are advanced under the regime that held since their anchors -- read from the state BEFORE
      // this commit -- and over a long gap walked hour by hour (see needsBridge).
      const needs = advanceNeedsTo(s.needs, at, regimeSource(), prev, r.events);
      const patch: Partial<AppState> = {
        pet: r.state,
        latches: decision.latches,
        hunger: derivedHunger(r.state, at),
        night: resolveNight(s.settings.dayNight, s.nightOverride, at),
        daylight: resolveDaylight(s.settings.dayNight, s.nightOverride, at),
        lastFeedEvent,
        needs,
      };
      if (extra.balance !== undefined) patch.balance = extra.balance;
      if (span > CATCH_UP_SPAN_MS) patch.recentEvents = r.events;
      set(patch);

      for (const t of decision.toasts) notify(t.title, t.body);

      const changed =
        r.state !== prev ||
        extra.balance !== undefined ||
        decision.latches.pantryLowFiredForPantry !== s.latches.pantryLowFiredForPantry ||
        needs !== s.needs;
      if (changed) savePet();
    };

    const tick = (): void => {
      if (!get().hydrated) return;
      const at = now();
      const prev = get().pet;
      commit(prev, reconcile(prev, at), at);
    };

    const setHunger = (h: number): void => {
      const at = now();
      const prev = get().pet;
      const r = reconcile(prev, at);
      const pet: PetState = {
        ...r.state,
        hungerAtLastFed: clamp(Number.isFinite(h) ? h : 0, 0, DEFAULT_CONSTANTS.MAX_HUNGER),
        lastFedAt: at,
        lastReconciledAt: at - 1,
      };
      commit(prev, { state: pet, events: r.events }, at);
    };

    const setPantry = (n: number): void => {
      const at = now();
      const prev = get().pet;
      const r1 = reconcile(prev, at);
      const funded: PetState = { ...r1.state, pantry: Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)) };
      const r2 = reconcile(funded, at);
      commit(prev, { state: r2.state, events: [...r1.events, ...r2.events] }, at);
    };

    const forceDead = (): void => {
      const at = now();
      const s = get();
      if (!s.pet.alive) return;
      const ledger = new LocalLedger(s.balance);
      const w = simWithdraw(s.pet, at, ledger);
      const pet: PetState = w.state.alive
        ? { ...w.state, alive: false, diedAt: at, lastReconciledAt: at }
        : w.state;
      const events: SimEvent[] = w.state.alive ? [...w.events, { type: 'died', at }] : w.events;
      commit(s.pet, { state: pet, events }, at, { balance: ledger.toJSON() });
    };

    const dev: DevActions = {
      skip(ms) {
        const delta = Number.isFinite(ms) ? ms : 0;
        set({ settings: { ...get().settings, devClockOffsetMs: get().settings.devClockOffsetMs + delta } });
        saveSettings();
        tick();
      },
      async skipOnNextLaunch(ms) {
        const delta = Number.isFinite(ms) ? ms : 0;
        set({ settings: { ...get().settings, pendingSkipMs: delta } });
        saveSettings();
        await persist.flush();
      },
      setHunger,
      setPantry,
      setBalance(n) {
        const balance = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
        set({ balance });
        savePet();
      },
      forceState(state: ForcedState) {
        switch (state) {
          case 'fed':
            setHunger(100);
            break;
          case 'hungry':
            setHunger(20);
            setPantry(0);
            break;
          case 'starving':
            setHunger(0);
            setPantry(0);
            break;
          case 'dead':
            forceDead();
            break;
          case 'asleep':
            dev.setNightOverride(true);
            break;
        }
      },
      simulateAbsence(days, pantry) {
        const s = get();
        const at = now();
        const withPantry: PetState = { ...s.pet, pantry: Math.max(0, Math.floor(Number.isFinite(pantry) ? pantry : 0)) };
        return reconcile(withPantry, at + days * DAY_MS).events;
      },
      resetClock() {
        set({ settings: { ...get().settings, devClockOffsetMs: 0 } });
        saveSettings();
        tick();
      },
      setNeeds(values) {
        const s = get();
        const at = now();
        const n = advanceNeeds(s.needs, at, regimeNow(regimeSource(), at));
        const pick = (k: 'energy' | 'curiosity' | 'comfort' | 'stress') => {
          const v = values[k];
          return v === undefined || !Number.isFinite(v) ? n[k] : { value: Math.max(0, Math.min(1, v)), at };
        };
        set({ needs: { ...n, energy: pick('energy'), curiosity: pick('curiosity'), comfort: pick('comfort'), stress: pick('stress') } });
        savePet();
      },
      setNightOverride(night) {
        const s = get();
        set({ nightOverride: night, night: resolveNight(s.settings.dayNight, night, now()), daylight: resolveDaylight(s.settings.dayNight, night, now()) });
      },
      async setSpecies(species, habitat) {
        // Was a hardcoded `!== 'fish' || !== 'bowl'`. Now it asks the registry, so a species becomes
        // switchable the moment it is built rather than when someone remembers to edit this line --
        // and a species that is declared in the union but has no module still cannot be selected into
        // an empty habitat.
        const mod = speciesModule(species);
        if (!mod || mod.layouts[habitat] === undefined) {
          console.warn(`[dev] species ${species}/${habitat} is not implemented`);
          return;
        }
        const s = get();
        if (s.pet.species === species && s.pet.habitat === habitat) return;
        set({ pet: { ...s.pet, species, habitat } });
        savePet();
        // Flushed rather than left to the 500 ms throttle: main.ts reloads the app to re-mount the
        // scene for the new species, and a reload inside that window would lose the very change that
        // triggered it and bring back the old pet.
        await persist.flush();
      },
    };

    const actions: AppActions = {
      async boot() {
        const [loadedPet, loadedSettings, loadedGraveyard] = await Promise.all([
          persist.loadPet(),
          persist.loadSettings(),
          persist.loadGraveyard(),
        ]);
        graveyard = loadedGraveyard;

        let settings: SettingsDoc = loadedSettings;
        if (settings.pendingSkipMs !== 0) {
          settings = {
            ...settings,
            devClockOffsetMs: settings.devClockOffsetMs + settings.pendingSkipMs,
            pendingSkipMs: 0,
          };
        }
        set({ settings });
        const at = now();

        let pet: PetState;
        let balance: number;
        let latches: NotificationLatches;
        /** A fresh pet, or one the migration rewrote: either way the file on disk is now behind. */
        let petNeedsSave = false;
        if (loadedPet !== null) {
          // Migrated HERE rather than inside `loadPet` because it needs `at`, and `at` is only correct
          // once the settings (and therefore the dev clock offset, including any pending skip) have been
          // folded in. Migrating against the raw wall clock would re-anchor a time-travelled pet to the
          // wrong instant, which is precisely the bug the dev panel exists to find.
          const migrated = migratePetDoc(loadedPet, at);
          pet = migrated.pet;
          balance = migrated.balance;
          latches = migrated.latches;
          petNeedsSave = migrated !== loadedPet;
        } else {
          pet = mintPet(at, rng);
          balance = STARTING_BALANCE;
          latches = freshLatches();
        }
        set({
          pet,
          balance,
          latches,
          hydrated: true,
          hidden: false,
          recentEvents: [],
          lastFeedEvent: null,
          hunger: derivedHunger(pet, at),
          night: resolveNight(settings.dayNight, get().nightOverride, at),
          daylight: resolveDaylight(settings.dayNight, get().nightOverride, at),
          // A pet saved before needs existed wakes rested and settled, anchored at the moment it is
          // read. Anchoring at `at` rather than at its lastReconciledAt is deliberate: nothing is owed
          // for the time before the model existed.
          needs: normalizeNeeds(loadedPet?.needs, at),
          present: false,
        });
        if (loadedPet === null || petNeedsSave) savePet();
        if (loadedSettings.pendingSkipMs !== 0) saveSettings();

        commit(pet, reconcile(pet, at), at);
      },

      tick,
      now,

      feed() {
        const s = get();
        const at = now();
        const ledger = new LocalLedger(s.balance);
        const r = simFeed(s.pet, at, ledger);
        commit(s.pet, { state: r.state, events: r.events }, at, { balance: ledger.toJSON(), manualFeed: r.ok });
        if (r.ok) set({ needs: stimulate(get().needs, 'feed', at, regimeNow(regimeSource(), at)) });
        return r;
      },

      depositPantry(n) {
        const s = get();
        const at = now();
        const ledger = new LocalLedger(s.balance);
        const r = simDeposit(s.pet, n, at, ledger);
        commit(s.pet, { state: r.state, events: r.events }, at, { balance: ledger.toJSON() });
      },

      withdrawPantry() {
        const s = get();
        const at = now();
        const ledger = new LocalLedger(s.balance);
        const r = simWithdraw(s.pet, at, ledger);
        commit(s.pet, { state: r.state, events: r.events }, at, { balance: ledger.toJSON() });
      },

      newPet() {
        const s = get();
        const at = now();
        const ledger = new LocalLedger(s.balance);
        const w = simWithdraw(s.pet, at, ledger);
        const old = w.state;
        if (!old.alive && !graveyard.records.some((r) => sameGrave(r, old))) {
          graveyard = { ...graveyard, records: [...graveyard.records, toGraveRecord(old, at)] };
          saveGraveyard();
        }
        const pet = mintPet(at, rng);
        set({
          pet,
          balance: ledger.toJSON(),
          latches: freshLatches(),
          hunger: derivedHunger(pet, at),
          lastFeedEvent: null,
          recentEvents: [],
          needs: defaultNeeds(at),
        });
        savePet();
      },

      addSpeciesData(delta) {
        const entries = Object.entries(delta).filter(([, v]) => Number.isFinite(v) && v !== 0);
        if (entries.length === 0) return;
        const s = get();
        // A dead pet earns nothing. Without this a scene still mounted over a corpse could keep
        // crediting the wheel, and `speciesData` is the one part of the pet that survives into the
        // graveyard record.
        if (!s.pet.alive) return;
        const next = { ...s.pet.speciesData };
        for (const [k, v] of entries) next[k] = (next[k] ?? 0) + v;
        set({ pet: { ...s.pet, speciesData: next } });
        savePet();
      },

      acknowledgeDeath() {
        const s = get();
        if (s.pet.alive || s.latches.deathAcknowledgedFor === s.pet.id) return;
        set({ latches: { ...s.latches, deathAcknowledgedFor: s.pet.id } });
        savePet();
      },

      async setScale(raw: Scale) {
        // Clamped rather than rejected. The scale is continuous now and arrives from a drag as well as
        // from the menu, so "out of range" is a cursor at the edge of its travel, not a caller bug.
        const scale = clampScale(raw);
        if (scale === get().settings.scale) return;
        await platform.window.setScale(scale);
        set({ settings: { ...get().settings, scale } });
        saveSettings();
      },

      setMuted(b) {
        set({ settings: { ...get().settings, muted: b } });
        saveSettings();
      },

      setNotificationsMuted(b) {
        set({ settings: { ...get().settings, notificationsMuted: b } });
        saveSettings();
      },

      setDayNight(mode) {
        const settings: SettingsDoc = { ...get().settings, dayNight: mode };
        set({ settings, night: resolveNight(mode, get().nightOverride, now()), daylight: resolveDaylight(mode, get().nightOverride, now()) });
        saveSettings();
      },

      async setLayering(patch) {
      const next = { ...layeringOf(get().settings), ...patch };
      // Platform first, then commit: if the window manager refuses, the setting must not claim it
      // happened -- the same order setScale and setLaunchAtLogin use.
      await platform.window.setLayering(next);
      set({ settings: { ...get().settings, ...next } });
      saveSettings();
    },

    async setLaunchAtLogin(b) {
        await platform.autostart.setEnabled(b);
        set({ settings: { ...get().settings, launchAtLogin: b } });
        saveSettings();
      },

      async setHidden(b) {
        if (b) {
          await persist.flush();
          await platform.window.hide();
        } else {
          await platform.window.show();
        }
        set({ hidden: b });
      },

      async quit() {
        await persist.flush();
        await platform.quit();
      },

      poke(kind) {
        const at = now();
        set({ needs: stimulate(get().needs, kind, at, regimeNow(regimeSource(), at)) });
        savePet();
      },

      setPresence(present) {
        const s = get();
        if (s.present === present) return;
        const at = now();
        // Both directions re-anchor under the OLD regime first (stimulate does that internally), so
        // the span with the pointer around is charged as present and the span without it as absent.
        const regime = regimeNow(regimeSource(), at);
        const needs = present ? stimulate(s.needs, 'pointer', at, regime) : advanceNeeds(s.needs, at, regime);
        set({ needs, present });
        savePet();
      },

      drives(napping) {
        const s = get();
        const at = now();
        return drivesOf(s.needs, at, { ...regimeNow(regimeSource(), at), alive: s.pet.alive, napping });
      },

      dev,
    };

    const placeholder = mintPet(Date.now(), rng);
    return {
      hydrated: false,
      pet: placeholder,
      balance: STARTING_BALANCE,
      settings: defaultSettings(),
      latches: freshLatches(),
      hidden: false,
      recentEvents: [],
      lastFeedEvent: null,
      hunger: 100,
      night: false,
      daylight: PURE_DAY,
      nightOverride: null,
      needs: defaultNeeds(Date.now()),
      present: false,
      actions,
    };
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      void persist.flush();
    });
  }

  return store;
}
