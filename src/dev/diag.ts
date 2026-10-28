// Dev-only: answers `webpets:snap` HMR events from tools/vite-diag-plugin.ts with a canvas PNG and a
// state dump. Loaded by main.ts only when `import.meta.env.DEV`; tree-shaken out of production builds.

import type { AppStore } from '../app/types';
import type { Platform, PointerState } from '../platform/types';
import type { HabitatScene, Rect } from '../render/types';

export interface DiagContext {
  store: AppStore;
  platform: Platform;
  scene: HabitatScene;
  hitRegions(): Rect[];
  lastPointer(): PointerState | null;
}

declare global {
  interface Window {
    /** Dev-only handle for driving the scene from a browser console or an automation script. */
    __webpets?: { scene: HabitatScene; store: AppStore };
  }
}

export function installDiag(ctx: DiagContext): void {
  const hot = import.meta.hot;
  let lastHandled = '';
  // The scene and the store, reachable from devtools. Never in a production build: this file is only
  // imported under `import.meta.env.DEV`.
  window.__webpets = { scene: ctx.scene, store: ctx.store };

  const capture = async (rawName: string): Promise<void> => {
    // The Tauri webview and any browser tab both answer the same request; keep their files apart.
    const name = `${rawName}-${ctx.platform.kind}`;
    if (name === lastHandled) return; // both delivery paths may fire for one request
    lastHandled = name;
    let png: string | undefined;
    try {
      png = await ctx.scene.snapshot();
    } catch (e) {
      console.warn('[diag] snapshot failed', e);
    }
    const s = ctx.store.getState();
    const canvas = document.querySelector('canvas');
    // mountHud (src/ui/hud.ts) creates the pill and caption with class names only, no ids.
    const hud = document.querySelector<HTMLElement>('.hud-pill');
    let geometry: unknown = null;
    try {
      geometry = await ctx.platform.window.getGeometry();
    } catch (e) {
      geometry = String(e);
    }
    const state = {
      at: Date.now(),
      platform: ctx.platform.kind,
      visibility: document.visibilityState,
      dpr: window.devicePixelRatio,
      inner: { w: window.innerWidth, h: window.innerHeight },
      canvas: canvas
        ? { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight }
        : null,
      geometry,
      hitRegions: ctx.hitRegions(),
      lastPointer: ctx.lastPointer(),
      hud: hud ? { className: hud.className, rect: hud.getBoundingClientRect().toJSON() as unknown, text: hud.textContent } : null,
      caption: document.querySelector<HTMLElement>('.hud-caption')?.textContent ?? null,
      hunger: s.hunger,
      night: s.night,
      hidden: s.hidden,
      pet: s.pet,
      balance: s.balance,
      settings: s.settings,
      fps: ctx.scene.fps(),
      scene: ctx.scene.debugState(),
    };
    await fetch('/__webpets/diag', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, png, state }),
    });
  };

  // Two delivery paths. The HMR push is instant, but the Tauri webview does not reliably receive
  // Vite custom events on its first page load, so poll as well. Whichever arrives first wins;
  // `lastHandled` makes the other a no-op.
  hot?.on('webpets:snap', (data: { name?: string }) => void capture(data.name ?? 'snap'));
  setInterval(() => {
    void fetch('/__webpets/poll')
      .then((r) => r.json() as Promise<{ name?: string }>)
      .then((d) => (d.name ? capture(d.name) : undefined))
      .catch(() => undefined);
  }, 1000);
}
