// The TypeScript side of the Tauri boundary. Two implementations: tauri (real) and browser (mock for Playwright/dev).
// Keep this surface small. Rust owns window geometry, tray, notifications, file persistence and the clock.

import type { Scale, TrayChipSize } from '../sim/constants';
import type { Rect } from '../sim/types';

export type { Rect };

export interface ClockReading {
  wallMs: number; // SystemTime epoch ms
  monoMs: number; // Instant-based, does not advance during sleep on macOS
}

export interface WindowGeometry {
  x: number; // outer position, logical (CSS) px
  y: number;
  width: number; // outer size, logical px
  height: number;
  scaleFactor: number;
  monitorKey: string; // "<name or 'unknown'>@<w>x<h>" (logical size) of the monitor the window is on
}

/** Cursor state relative to the window, from the Rust poller. Coordinates are window-local CSS px. */
export interface PointerState {
  inside: boolean;
  x: number;
  y: number;
}

export type TrayAction =
  | 'feed'
  | 'pantry'
  | 'size-s'
  | 'size-m'
  | 'size-l'
  | 'mute'
  | 'notifications'
  | 'daynight-auto'
  | 'daynight-day'
  | 'daynight-night'
  | 'launch-at-login'
  | 'always-on-top'
  | 'all-desktops'
  | 'over-fullscreen'
  | 'dev-panel'
  | 'new-pet'
  | 'toggle-visibility'
  | 'quit';

export interface TrayMenuState {
  scale: Scale;
  muted: boolean;
  notificationsMuted: boolean;
  dayNight: 'auto' | 'day' | 'night';
  launchAtLogin: boolean;
  alwaysOnTop: boolean;
  allDesktops: boolean;
  overFullscreen: boolean;
  alive: boolean; // feed/pantry items disabled when false
  hidden: boolean; // menu item reads "Show" when true, "Minimize" when false
}

/**
 * Whole-document persistence. Each file holds one JSON document under the store key "doc".
 * `set` updates the store's in-memory document (what the plugin's exit safety-save writes); `save` flushes that
 * document to disk. src/app/persistence.ts calls `set` on every save and throttles `save`.
 */
export interface PersistApi {
  /** Returns null when the file does not exist yet. */
  load<T>(file: string): Promise<T | null>;
  /** Replace key "doc" in the store's in-memory cache. Never throttled. */
  set<T>(file: string, data: T): Promise<void>;
  /** Write the store's current in-memory document to disk. */
  save(file: string): Promise<void>;
}

export interface WindowApi {
  /**
   * Resize to the given scale keeping the bottom-right corner anchored, restore/clamp the position for the
   * current monitor (first call after launch restores the saved position or defaults to bottom-right), and
   * return the resulting geometry. Does not show the window.
   */
  setScale(scale: Scale): Promise<WindowGeometry>;
  /** Begin a native drag of the window (call from mousedown on the habitat). */
  startDrag(): Promise<void>;
  /**
   * Regions (window-local CSS px) that should receive mouse events. Everything else is click-through.
   * main.ts is the ONLY caller. Rust polls the cursor every POINTER_POLL_MS and toggles ignore-cursor-events itself,
   * because a webview that ignores cursor events cannot see the cursor return.
   */
  setHitRegions(regions: Rect[]): Promise<void>;
  /** Fired by the same Rust poller: on every inside/outside change, and at poll rate while inside. */
  onPointer(cb: (p: PointerState) => void): () => void;
  getGeometry(): Promise<WindowGeometry>;
  hide(): Promise<void>;
  /** Orders the window front without activating the app. Never focuses. */
  show(): Promise<void>;
  isVisible(): Promise<boolean>;
  /** Show the tray/context menu at the cursor (right-click on the habitat). */
  popupMenu(): Promise<void>;
  /** Fires after Rust has snapped, clamped and persisted the position following a move (150 ms settle). */
  onMoved(cb: (g: WindowGeometry) => void): () => void;
  /**
   * Where the window sits relative to everything else on screen. Applied as a set rather than one
   * switch at a time, because on macOS these are facets of the same two window properties — the level
   * and the collection behaviour — and reading-modifying-writing them independently races.
   */
  setLayering(opts: Layering): Promise<void>;
  /**
   * Resize during a drag. `live` skips the edge snapping, which would pull the window out from under
   * the cursor, and skips writing the position to disk, which a drag would do every few pixels.
   */
  setScaleLive(scale: Scale, live: boolean): Promise<WindowGeometry>;
  /**
   * Hand the pointer to the webview for `ms`, renewable; 0 releases it.
   *
   * Needed because the window is click-through outside its hit regions, enforced by a cursor poller
   * that toggles ignore-cursor-events. Mid-drag that would take the pointer away from the element that
   * captured it and the drag would die halfway. A deadline rather than a flag, so a swallowed
   * pointerup cannot leave the padding permanently opaque.
   */
  setInteractionLock(ms: number): Promise<void>;
  /**
   * The window's level and collection-behaviour bits, read back off the LIVE window.
   *
   * What was intended is not worth reporting; what the window actually has is. The failure this exists
   * to catch was invisible for exactly that reason — the window kept floating whatever else failed, so
   * "always on top" looked fine while the collection behaviour was silently never applied.
   */
  getLayering(): Promise<{ level: number; behavior: number }>;
}

/** How the habitat window relates to other windows, desktops and fullscreen apps. */
export interface Layering {
  /** Float above other windows instead of being ordered with them. */
  alwaysOnTop: boolean;
  /** Appear on every desktop/Space rather than only the one it was launched on. */
  allDesktops: boolean;
  /**
   * Stay visible when another app goes fullscreen. macOS gates this separately from the window level,
   * and neither Tauri nor the windowing layer under it exposes the flag, so this is the one place the
   * app reaches into AppKit directly.
   */
  overFullscreen: boolean;
}

export interface TrayApi {
  /** Replace the tray icon with an 18x18 (36x36 on Retina) RGBA bitmap: mini pet + hunger ring. */
  setChip(rgba: Uint8Array, size: TrayChipSize): Promise<void>;
  setTooltip(text: string): Promise<void>;
  setMenuState(state: TrayMenuState): Promise<void>;
  onAction(cb: (action: TrayAction) => void): () => void;
}

export interface Platform {
  readonly kind: 'tauri' | 'browser';
  clock(): Promise<ClockReading>;
  store: PersistApi;
  window: WindowApi;
  tray: TrayApi;
  notify(title: string, body: string): Promise<void>;
  autostart: {
    isEnabled(): Promise<boolean>;
    setEnabled(on: boolean): Promise<void>;
  };
  /** Global shortcut Cmd+Shift+P (key press only) or tray left-click; Rust emits this. */
  onToggleVisibility(cb: () => void): () => void;
  /** Fired by Rust when the wall clock advanced more than 5 s beyond the monotonic clock (sleep/wake). */
  onWake(cb: () => void): () => void;
  quit(): Promise<void>;
}
