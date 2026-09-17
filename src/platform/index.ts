// Platform entry point. `createPlatform()` picks the real Tauri bridge when running inside the Tauri
// webview and the browser mock otherwise (plain `npm run dev`, Playwright).

import { createBrowserPlatform } from './browser';
import { createTauriPlatform } from './tauri';
import type { Platform } from './types';

export type * from './types';

/** True inside a Tauri webview (the runtime injects `__TAURI_INTERNALS__` before any script runs). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function createPlatform(): Platform {
  return isTauri() ? createTauriPlatform() : createBrowserPlatform();
}
