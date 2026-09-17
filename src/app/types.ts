// Shared app-layer types. The store implementation lives in ./store.ts (owner: sim builder);
// ui/render/main import these types so they compile against the same shape.

import type { StoreApi } from 'zustand/vanilla';
import type { FeedResult, GraveRecord, PetState, SimEvent } from '../sim/types';
import type { Scale } from '../sim/constants';

export type DayNightMode = 'auto' | 'day' | 'night';

export interface NotificationLatches {
  /** Pantry value when "Pantry is almost empty" last fired; null when it may fire again. */
  pantryLowFiredForPantry: number | null;
}

export interface PetDoc {
  version: 1;
  pet: PetState;
  balance: number;
  latches: NotificationLatches;
}

export interface SettingsDoc {
  version: 1;
  scale: Scale;
  muted: boolean;
  notificationsMuted: boolean;
  dayNight: DayNightMode;
  launchAtLogin: boolean;
  devClockOffsetMs: number;
  /** Minimized to the tray chip. */
  hidden: boolean;
  /** Written by Rust: window position per monitor key. */
  positions: Record<string, { x: number; y: number }>;
}

export interface GraveyardDoc {
  version: 1;
  records: GraveRecord[];
}

export type ForcedState = 'fed' | 'hungry' | 'starving' | 'dead' | 'asleep';

export interface DevActions {
  skip(ms: number): void;
  setHunger(h: number): void;
  setPantry(n: number): void;
  setBalance(n: number): void;
  forceState(s: ForcedState): void;
  /** Runs reconcile over a simulated absence and returns the event list (also applies it). */
  simulateAbsence(days: number, pantry: number): SimEvent[];
  resetClock(): void;
  /** Dev-forced day/night override for the scene; null = follow settings. */
  setNightOverride(night: boolean | null): void;
}

export interface AppActions {
  boot(): Promise<void>;
  tick(): void;
  now(): number;
  feed(): FeedResult;
  depositPantry(n: number): void;
  withdrawPantry(): void;
  newPet(): void;
  setScale(s: Scale): Promise<void>;
  setMuted(b: boolean): void;
  setNotificationsMuted(b: boolean): void;
  setDayNight(m: DayNightMode): void;
  setLaunchAtLogin(b: boolean): Promise<void>;
  /** Minimize to tray chip (true) or restore (false). */
  setHidden(b: boolean): Promise<void>;
  dev: DevActions;
}

export interface AppState {
  hydrated: boolean;
  pet: PetState;
  balance: number;
  settings: SettingsDoc;
  latches: NotificationLatches;
  /** Events from a catch-up reconcile that covered more than 60 s of wall time ("while you were gone"). */
  recentEvents: SimEvent[];
  /** Wall time of the last manual feed, for render/audio one-shots. */
  lastFeedAt: number | null;
  /** Derived hunger at the last tick. */
  hunger: number;
  /** True when the scene should render night (settings + local sunset, or dev override). */
  night: boolean;
  /** Set by the scheduler when it is safe to persist (after boot). */
  actions: AppActions;
}

export type AppStore = StoreApi<AppState>;
