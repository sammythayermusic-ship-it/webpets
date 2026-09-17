// Shared app-layer types. The store implementation lives in ./store.ts (owner: sim builder);
// ui/render/main import these types so they compile against the same shape.

import type { StoreApi } from 'zustand/vanilla';
import type { FeedResult, GraveRecord, Habitat, PetState, SimEvent, Species } from '../sim/types';
import type { Scale } from '../sim/constants';

export type DayNightMode = 'auto' | 'day' | 'night';

export interface NotificationLatches {
  /** Pantry value when "Pantry is almost empty" last fired; null when it may fire again. */
  pantryLowFiredForPantry: number | null;
  /** Pet id whose death card the user has dismissed; the scene then shows the memorial instead of the dead pet. */
  deathAcknowledgedFor: string | null;
}

export interface PetDoc {
  version: 1;
  pet: PetState;
  balance: number;
  latches: NotificationLatches;
}

/** Persisted user settings. TS writes this whole document under key "doc"; Rust writes the separate top-level key "positions". */
export interface SettingsDoc {
  version: 1;
  scale: Scale;
  muted: boolean;
  notificationsMuted: boolean;
  dayNight: DayNightMode;
  launchAtLogin: boolean;
  /** Added to Date.now() by app.now(). Persisted so a faked clock survives relaunch. */
  devClockOffsetMs: number;
  /** Armed by dev.skipOnNextLaunch: consumed at boot (added to devClockOffsetMs before the first reconcile). */
  pendingSkipMs: number;
}

export interface GraveyardDoc {
  version: 1;
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
  /** reconcile, set pantry = max(0, floor(n)) bypassing the ledger, reconcile again (may auto-feed at now). */
  setPantry(n: number): void;
  setBalance(n: number): void;
  /** fed = setHunger(100); hungry = setHunger(20)+setPantry(0); starving = setHunger(0)+setPantry(0); dead = withdraw pantry, alive=false, diedAt=now; asleep = night override on. */
  forceState(s: ForcedState): void;
  /** Pure dry run: reconcile(withPantry(pet, pantry), now + days) events. Does not mutate the store. */
  simulateAbsence(days: number, pantry: number): SimEvent[];
  /** Sets devClockOffsetMs = 0. Cannot undo skipped time: the pet stays where it is until real time catches up. */
  resetClock(): void;
  /** Dev-forced day/night override for the scene; null = follow settings. */
  setNightOverride(night: boolean | null): void;
  /** Phase 0: only fish/bowl is selectable; the control renders disabled for other species. */
  setSpecies(species: Species, habitat: Habitat): void;
}

export interface AppActions {
  boot(): Promise<void>;
  tick(): void;
  now(): number;
  feed(): FeedResult;
  depositPantry(n: number): void;
  withdrawPantry(): void;
  /** Withdraws the pantry, buries the dead pet in the graveyard, mints a fresh one; balance is kept. */
  newPet(): void;
  /** Marks the current dead pet's card as seen so the scene switches to the memorial. */
  acknowledgeDeath(): void;
  setScale(s: Scale): Promise<void>;
  setMuted(b: boolean): void;
  setNotificationsMuted(b: boolean): void;
  setDayNight(m: DayNightMode): void;
  setLaunchAtLogin(b: boolean): Promise<void>;
  /** Minimize to tray chip (true) or restore (false). Runtime only, not persisted. */
  setHidden(b: boolean): Promise<void>;
  /** Flushes pending saves, then platform.quit(). */
  quit(): Promise<void>;
  dev: DevActions;
}

export interface AppState {
  hydrated: boolean;
  pet: PetState;
  balance: number;
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
  /** Dev panel override; null = follow settings. */
  nightOverride: boolean | null;
  actions: AppActions;
}

export type AppStore = StoreApi<AppState>;
