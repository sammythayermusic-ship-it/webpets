// Shared app-layer types. The store implementation lives in ./store.ts (owner: sim builder);
// ui/render/main import these types so they compile against the same shape.

import type { StoreApi } from 'zustand/vanilla';
import type { FeedResult, GraveRecord, Habitat, PetState, SimEvent, Species } from '../sim/types';
import type { Drives, NeedsState, Stimulus } from '../sim/needs';
import type { Scale } from '../sim/constants';
import type { Layering } from '../platform/types';
import type { Daylight, LightOverride } from './daynight';

export type DayNightMode = 'auto' | 'day' | 'night';

export interface NotificationLatches {
  /** Pantry value when "The feeder is almost empty" last fired; null when it may fire again. */
  pantryLowFiredForPantry: number | null;
  /** Pet id whose death card the user has dismissed; the scene then shows the memorial instead of the dead pet. */
  deathAcknowledgedFor: string | null;
}

/** `pet.json` as this build writes it. Versions 1 and 2 are read as `LegacyPetDoc` and upgraded by `migratePetDoc`. */
export interface PetDoc {
  version: 3;
  pet: PetState;
  latches: NotificationLatches;
  /**
   * Energy, curiosity, comfort and stress (`src/sim/needs.ts`). Optional on disk: every pet saved
   * before needs existed loads with the defaults, and no version bump is needed for that.
   */
  needs?: NeedsState;
}

/**
 * Persisted user settings. TS writes this whole document under key "doc"; Rust writes the separate
 * top-level key "positions".
 *
 * Version 2 (Stage 1): the habitat grid doubled to 320x240 and the scale ladder moved from 2/3/4 to
 * 1/2/3, so the *number* stored in `scale` changed meaning (v1 `scale: 2` was 368x288; v2 `scale: 2`
 * is 688x528). The version bump is what lets `normalizeSettings` tell the two apart and migrate a v1
 * document by on-screen size instead of silently quadrupling the window.
 */
export interface SettingsDoc {
  version: 2;
  scale: Scale;
  muted: boolean;
  notificationsMuted: boolean;
  /** The pet's speech bubbles are off (tray: Pet talks). */
  talkMuted: boolean;
  /** Daily cap on Claude-written lines, US dollars; 0 turns them off. */
  dailyCapUsd: number;
  /** The "Get to know me" card has been offered once (it opens by itself on the first launch only). */
  cardOffered: boolean;
  /** News may include politics and other serious stories (off: light news only). Never crime or harm. */
  seriousNews: boolean;
  dayNight: DayNightMode;
  launchAtLogin: boolean;
  /**
   * Where the window sits relative to everything else. All three default to on, which is what the app
   * did unconditionally before they were settings.
   *
   * Added to a version-2 document without bumping the version, deliberately: `normalizeSettings` fills
   * a missing field from the defaults but returns defaults wholesale for a version it does not know,
   * so bumping would discard every existing user's mute, day/night and launch-at-login preferences to
   * add three booleans.
   */
  alwaysOnTop: boolean;
  allDesktops: boolean;
  overFullscreen: boolean;
  onDesktop: boolean;
  /** Added to Date.now() by app.now(). Persisted so a faked clock survives relaunch. */
  devClockOffsetMs: number;
  /** Armed by dev.skipOnNextLaunch: consumed at boot (added to devClockOffsetMs before the first reconcile). */
  pendingSkipMs: number;
}

/** Version 2 renamed the buried pets' `feedBurned` to `foodEaten`; version 1 records are upgraded on load. */
export interface GraveyardDoc {
  version: 2;
  records: GraveRecord[];
}

export type ForcedState = 'fed' | 'hungry' | 'starving' | 'dead' | 'asleep';

export interface FeedEvent {
  at: number;
  kind: 'manual' | 'auto';
  /** Increments per feed so two feeds in the same ms are distinguishable by subscribers. */
  seq: number;
}

export interface DevActions {
  /** Adds ms to devClockOffsetMs, persists, and ticks (reconciles) immediately. */
  skip(ms: number): void;
  /** Arms pendingSkipMs so the NEXT launch reconciles across the gap (produces the "while you were gone" montage). */
  skipOnNextLaunch(ms: number): Promise<void>;
  /** reconcile, then hungerAtLastFed = clamp(h), lastFedAt = now, lastReconciledAt = now - 1. */
  setHunger(h: number): void;
  /** reconcile, set pantry = max(0, floor(n)) (may exceed PANTRY_CAPACITY; dev only), reconcile again (may auto-feed at now). */
  setPantry(n: number): void;
  /** fed = setHunger(100); hungry = setHunger(20)+setPantry(0); starving = setHunger(0)+setPantry(0); dead = empty the feeder, alive=false, diedAt=now; asleep = night override on. */
  forceState(s: ForcedState): void;
  /** Pure dry run: reconcile(withPantry(pet, pantry), now + days) events. Does not mutate the store. */
  simulateAbsence(days: number, pantry: number): SimEvent[];
  /** Sets devClockOffsetMs = 0. Cannot undo skipped time: the pet stays where it is until real time catches up. */
  resetClock(): void;
  /** Dev-forced day/night override for the scene; null = follow settings. */
  setNightOverride(night: LightOverride): void;
  /** Re-anchor any of the four needs at now (0..1 each); the others keep their anchors. */
  setNeeds(values: Partial<Record<'energy' | 'curiosity' | 'comfort' | 'stress', number>>): void;
  /**
   * Switch the pet's species, if that species is implemented. Flushes to disk before resolving,
   * because the caller reloads the app to re-mount the scene and a throttled save would be lost.
   */
  setSpecies(species: Species, habitat: Habitat): Promise<void>;
}

export interface AppActions {
  boot(): Promise<void>;
  tick(): void;
  now(): number;
  /** Free; fails only when the pet is dead. */
  feed(): FeedResult;
  /** Fills the holiday feeder to PANTRY_CAPACITY, for free; a hungry pet eats from it at once. No-op for a dead pet. */
  fillPantry(): void;
  /** Reconciles, buries the pet if it is dead, mints a fresh one (its feeder starts empty). */
  newPet(): void;
  /** Marks the current dead pet's card as seen so the scene switches to the memorial. */
  acknowledgeDeath(): void;
  /**
   * Bank `speciesData` counters earned by the scene — the hamster's `wheelKm`, later the frog's
   * `cricketsCaught` and the chicken's `eggs`. Additive and idempotent-on-empty.
   */
  addSpeciesData(delta: Readonly<Record<string, number>>): void;
  setScale(s: Scale): Promise<void>;
  setMuted(b: boolean): void;
  setNotificationsMuted(b: boolean): void;
  setTalkMuted(b: boolean): void;
  setCardOffered(b: boolean): void;
  setSeriousNews(b: boolean): void;
  setDayNight(m: DayNightMode): void;
  setLaunchAtLogin(b: boolean): Promise<void>;
  /** Change any of the window layering flags; the rest keep their current values. */
  setLayering(patch: Partial<Layering>): Promise<void>;
  /** Minimize to tray chip (true) or restore (false). Runtime only, not persisted. */
  setHidden(b: boolean): Promise<void>;
  /** Flushes pending saves, then platform.quit(). */
  quit(): Promise<void>;
  /** Something happened to the pet: a tap on the glass, a bite. (A meal and the pointer's arrival are reported by feed() and setPresence().) */
  poke(kind: Stimulus): void;
  /** The pointer is over the habitat (true) or has left (false). Arrival is a stimulus; both re-anchor the needs. */
  setPresence(present: boolean): void;
  /** What the pet wants to do about its needs right now. `napping` is what the behaviour is doing, for the nap hysteresis. */
  drives(napping: boolean): Drives;
  dev: DevActions;
}

export interface AppState {
  hydrated: boolean;
  pet: PetState;
  settings: SettingsDoc;
  latches: NotificationLatches;
  /** Runtime: window minimized to the tray chip. */
  hidden: boolean;
  /** Events from a catch-up reconcile that covered more than 60 s of wall time ("while you were gone"). */
  recentEvents: SimEvent[];
  /** Last feed (manual or auto); main.ts subscribes and plays the flakes + sfx for both kinds. */
  lastFeedEvent: FeedEvent | null;
  /** Derived hunger at the last tick. */
  hunger: number;
  /** True when the scene should render night (settings + local sunset, or dev override). */
  night: boolean;
  /** The four light sets' weights for the same moment and settings; `night` is its night past 0.5. */
  daylight: Daylight;
  /** Dev panel override; null = follow settings. */
  nightOverride: LightOverride;
  /** The pet's needs, anchored at the last tick or stimulus. Persisted inside the pet document. */
  needs: NeedsState;
  /** Runtime: the pointer is over the habitat. */
  present: boolean;
  actions: AppActions;
}

export type AppStore = StoreApi<AppState>;
