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

export function installDiag(ctx: DiagContext): void {
  const hot = import.meta.hot;
  if (!hot) return;
  hot.on('webpets:snap', async (data: { name?: string }) => {
    // Both the Tauri webview and any browser tab share the dev server's HMR channel; keep their files apart.
    const name = `${data.name ?? 'snap'}-${ctx.platform.kind}`;
    let png: string | undefined;
    try {
      png = await ctx.scene.snapshot();
    } catch (e) {
      console.warn('[diag] snapshot failed', e);
    }
    const s = ctx.store.getState();
    const canvas = document.querySelector('canvas');
    const hud = document.getElementById('hud');
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
      caption: document.getElementById('caption')?.textContent ?? null,
      hunger: s.hunger,
      night: s.night,
      hidden: s.hidden,
      pet: s.pet,
      balance: s.balance,
      settings: s.settings,
      fps: ctx.scene.fps(),
    };
    await fetch('/__webpets/diag', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, png, state }),
    });
  });
}
