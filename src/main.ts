// Entry point: the boot sequence and all cross-module wiring (docs/ARCHITECTURE.md "Boot sequence" and
// "Pointer, hover and click-through rules"). This file is the ONLY caller of platform.window.setHitRegions.

import { createAppStore, startScheduler, toSceneView } from './app';
import type { AppState } from './app';
import { createPlatform } from './platform';
import type { Platform, PointerState } from './platform';
import { createScene, loadManifest } from './render';
import {
  computeHitRegions,
  initAudio,
  installKeys,
  mountDevPanel,
  mountHud,
  mountMemorial,
  mountMontage,
  mountPantryDialog,
  mountSpeech,
  wireTray,
} from './ui';
import type { DevPanelHandle, HudHandle } from './ui';
import { hungerLabel } from './sim';

/** HUD stays visible this long after the pointer leaves the hit regions (contract rule 3). */
const HUD_GRACE_MS = 400;
/** Day/night is re-evaluated (via a store tick) this often. */
const NIGHT_REFRESH_MS = 60_000;

function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function logRejected(what: string): (err: unknown) => void {
  return (err) => console.warn(`[main] ${what} failed`, err);
}

function requireApp(): HTMLElement {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app is missing from index.html');
  return app;
}

/** Render a fatal boot error into #app so it is visible inside the (still shown) window. */
function renderError(err: unknown): void {
  const app = document.getElementById('app') ?? document.body;
  const box = document.createElement('pre');
  box.id = 'boot-error';
  box.style.cssText =
    'position:absolute;inset:8px;margin:0;padding:8px;overflow:auto;background:#fff;color:#b00;' +
    'border:2px solid #b00;font:12px/1.4 monospace;white-space:pre-wrap;pointer-events:auto;user-select:text;';
  const message = err instanceof Error ? `${err.name}: ${err.message}\n\n${err.stack ?? ''}` : String(err);
  box.textContent = `WebPets failed to start.\n\n${message}`;
  app.append(box);
}

/** Fields of AppState that toSceneView reads; anything else changing does not need a scene update. */
function sceneInputsChanged(s: AppState, prev: AppState): boolean {
  return s.pet !== prev.pet || s.hunger !== prev.hunger || s.night !== prev.night || s.latches !== prev.latches;
}

async function boot(platform: Platform): Promise<void> {
  // 1. Store.
  const store = createAppStore(platform);
  await store.getState().actions.boot();

  // 2. Scene + canvas, then the #ui overlay above it.
  const app = requireApp();
  const manifest = await loadManifest();
  const scene = createScene(manifest);
  const initial = store.getState();
  await scene.mount(app, initial.settings.scale);
  const ui = document.createElement('div');
  ui.id = 'ui';
  app.append(ui);
  const audio = initAudio();
  const reducedMotion = prefersReducedMotion();
  scene.setView(toSceneView(initial, reducedMotion));

  // 3. UI components and wiring.
  let hud: HudHandle | null = null;
  let devPanel: DevPanelHandle | null = null;
  const refreshHitRegions = (): void => {
    if (!hud || !devPanel) return; // components call requestHitRegions while mounting
    platform.window.setHitRegions(computeHitRegions(scene, hud, devPanel)).catch(logRejected('setHitRegions'));
  };
  const deps = { store, platform, scene, audio, requestHitRegions: refreshHitRegions };
  hud = mountHud(ui, deps);
  devPanel = mountDevPanel(ui, deps);
  const speech = mountSpeech(ui, deps);
  const pantryDialog = mountPantryDialog(ui, deps);
  const montage = mountMontage(ui, deps);
  mountMemorial(ui, deps);
  wireTray({ ...deps, devPanel, pantryDialog });
  installKeys({ store, devPanel });
  audio.setAmbient(initial.pet.species, true);
  audio.setMuted(initial.settings.muted);

  const hudHandle = hud;
  store.subscribe((s, prev) => {
    if (sceneInputsChanged(s, prev)) scene.setView(toSceneView(s, reducedMotion));

    if (s.lastFeedEvent !== prev.lastFeedEvent && s.lastFeedEvent !== null) {
      scene.feed();
      audio.play('feed');
    }

    if (s.settings.scale !== prev.settings.scale) {
      // actions.setScale awaited platform.window.setScale before committing, so the window is already resized.
      scene.setScale(s.settings.scale);
      hudHandle.relayout();
      refreshHitRegions();
    }

    if (s.pet.species !== prev.pet.species) audio.setAmbient(s.pet.species, true);

    // Alert / death one-shots on transitions (audio files are optional; missing ones are no-ops).
    if (prev.pet.alive && !s.pet.alive && s.pet.id === prev.pet.id) {
      audio.play('death');
    } else if (s.pet.alive && s.pet.id === prev.pet.id) {
      const label = hungerLabel(s.hunger);
      if (label !== hungerLabel(prev.hunger) && (label === 'hungry' || label === 'starving')) audio.play('alert');
    }
  });

  // Pointer: HUD visible while inside (400 ms grace before hiding); the scene gets window-local CSS px.
  let grace: ReturnType<typeof setTimeout> | null = null;
  let lastPointer: PointerState | null = null;
  platform.window.onPointer((p: PointerState) => {
    lastPointer = p;
    if (p.inside) {
      if (grace !== null) {
        clearTimeout(grace);
        grace = null;
      }
      hudHandle.setVisible(true);
      scene.setPointer(p.x, p.y);
      return;
    }
    scene.setPointer(null, null);
    if (grace === null) {
      grace = setTimeout(() => {
        grace = null;
        hudHandle.setVisible(false);
      }, HUD_GRACE_MS);
    }
  });

  platform.window.onMoved((g) => scene.setResolution(g.scaleFactor));

  // Drag from the canvas only (rule 4); #ui children stop propagation of their own mousedown.
  const canvas = app.querySelector<HTMLCanvasElement>('canvas');
  canvas?.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    platform.window.startDrag().catch(logRejected('startDrag'));
  });
  app.addEventListener('contextmenu', (e: Event) => {
    e.preventDefault();
    platform.window.popupMenu().catch(logRejected('popupMenu'));
  });

  // 4. Window geometry (first call restores the saved position), hit regions, show, scheduler, night refresh.
  await platform.window.setScale(initial.settings.scale);
  refreshHitRegions();
  if (!store.getState().hidden) await platform.window.show();
  startScheduler(store, platform);
  setInterval(() => store.getState().actions.tick(), NIGHT_REFRESH_MS);

  // Dev-only diagnostics bridge (tools/vite-diag-plugin.ts); tree-shaken out of production builds.
  if (import.meta.env.DEV) {
    const devPanelHandle = devPanel;
    void import('./dev/diag').then((mod) =>
      mod.installDiag({
        store,
        platform,
        scene,
        hitRegions: () => computeHitRegions(scene, hudHandle, devPanelHandle),
        lastPointer: () => lastPointer,
      }),
    );
  }

  // 5. "While you were gone" montage; recentEvents is read once, right after boot.
  const { recentEvents, pet } = store.getState();
  if (recentEvents.length > 0) {
    await montage.play(recentEvents, pet.name);
    speech.sayFrom('wake');
  }
}

async function main(): Promise<void> {
  const platform = createPlatform();
  try {
    await boot(platform);
  } catch (err) {
    // 6. Never leave a hidden, broken window: paint the error and show it anyway.
    console.error('[main] boot failed', err);
    renderError(err);
    try {
      await platform.window.show();
    } catch (showErr) {
      console.error('[main] could not show the window after a boot failure', showErr);
    }
  }
}

void main();
