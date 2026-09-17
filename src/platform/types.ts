// The TypeScript side of the Tauri boundary. Two implementations: tauri (real) and browser (mock for Playwright/dev).
// Keep this surface small. Rust owns window geometry, tray, notifications, file persistence and the clock.

import type { Scale } from '../sim/constants';

export interface ClockReading {
  wallMs: number; // SystemTime epoch ms
  monoMs: number; // Instant-based, does not advance during sleep on macOS
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WindowGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  monitorKey: string; // "<name>@<w>x<h>" of the monitor the window is on
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
  | 'dev-panel'
  | 'new-pet'
  | 'show'
  | 'quit';

export interface TrayMenuState {
  scale: Scale;
  muted: boolean;
  notificationsMuted: boolean;
  dayNight: 'auto' | 'day' | 'night';
  launchAtLogin: boolean;
  alive: boolean; // feed/pantry items disabled when false
  hidden: boolean; // "Show" vs "Minimize" label
}

export interface StoreApi {
  /** Returns null when the file does not exist yet. */
  load<T>(file: string): Promise<T | null>;
  save<T>(file: string, data: T): Promise<void>;
}

export interface WindowApi {
  /** Resize to the given scale keeping the bottom-right corner anchored, clamped to the current monitor. */
  setScale(scale: Scale): Promise<void>;
  /** Begin a native drag of the window (call from mousedown on the habitat). */
  startDrag(): Promise<void>;
  /**
   * Regions (window-local CSS px) that should receive mouse events. Everything else is click-through.
   * Call whenever the HUD appears/disappears or the scale changes. Rust polls the cursor and toggles
   * ignore-cursor-events itself, because a webview that ignores cursor events cannot see the cursor return.
   */
  setHitRegions(regions: Rect[]): Promise<void>;
  getGeometry(): Promise<WindowGeometry>;
  hide(): Promise<void>;
  show(): Promise<void>;
  isVisible(): Promise<boolean>;
  /** Fires after a drag settles (Rust snaps to edges, clamps to the monitor and persists the position first). */
  onMoved(cb: (g: WindowGeometry) => void): () => void;
}

export interface TrayApi {
  /** Replace the tray icon with a 22x22 (or 44x44 for 2x) RGBA bitmap: mini pet + hunger ring. */
  setChip(rgba: Uint8Array, width: number, height: number): Promise<void>;
  setTooltip(text: string): Promise<void>;
  setMenuState(state: TrayMenuState): Promise<void>;
  onAction(cb: (action: TrayAction) => void): () => void;
}

export interface Platform {
  readonly kind: 'tauri' | 'browser';
  clock(): Promise<ClockReading>;
  store: StoreApi;
  window: WindowApi;
  tray: TrayApi;
  notify(title: string, body: string): Promise<void>;
  autostart: {
    isEnabled(): Promise<boolean>;
    setEnabled(on: boolean): Promise<void>;
  };
  /** Global shortcut (default Cmd+Shift+P) toggles show/hide; Rust emits this. */
  onToggleVisibility(cb: () => void): () => void;
  /** Fired by Rust when the system wakes from sleep or the monotonic/wall clocks diverge. */
  onWake(cb: () => void): () => void;
  quit(): Promise<void>;
}
