// Test hooks exposed by the browser mock (`src/platform/browser.ts`) on `window.__webpetsMock`.
// Absent under Tauri, so the property is optional.

import type { TrayAction, WindowGeometry } from './types';

export interface WebpetsMock {
  /** Simulate a tray menu click. */
  emitTray(action: TrayAction): void;
  /** Simulate the Rust sleep/wake detector firing. */
  emitWake(): void;
  /** Simulate the global shortcut / tray left-click. */
  emitToggleVisibility(): void;
  /** Simulate the Rust cursor poller (window-local CSS px). */
  emitPointer(inside: boolean, x: number, y: number): void;
  /** Every `platform.notify` call, in order. */
  notifications: Array<{ title: string; body: string }>;
  /** Current mock window geometry (`#app` bounding rect, contract size for the current scale). */
  geometry(): WindowGeometry;
  /** Clears every `webpets:*` localStorage key and the in-memory fallbacks. */
  reset(): void;
  /** The 22 px `#mock-tray` canvas painted by `tray.setChip` (visible while hidden). */
  trayChip: HTMLCanvasElement;
}

declare global {
  interface Window {
    __webpetsMock?: WebpetsMock;
  }
}
