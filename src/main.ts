// Entry point: the boot sequence and all cross-module wiring (docs/ARCHITECTURE.md "Boot sequence" and
// "Pointer, hover and click-through rules"). This file is the ONLY caller of platform.window.setHitRegions.

import { createAppStore, startScheduler, toSceneView } from './app';
import type { AppState, AppStore } from './app';
import { createPlatform } from './platform';
import type { Platform, PointerState } from './platform';
import { createScene, loadManifest } from './render';
import type { HabitatScene } from './render';
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
  mountResizeGrip,
} from './ui';
import type { DevPanelHandle, HudHandle } from './ui';
import { hungerLabel } from './sim';

/** HUD stays visible this long after the pointer leaves the hit regions (contract rule 3). */
const HUD_GRACE_MS = 400;
/**
 * macOS window collection-behaviour bits, for decoding the layering read-back into something readable.
 *
 * Named rather than reported raw because the point of recording this at all is that someone reading a
 * boot report can see at a glance which flag is missing. A bitmask cannot do that.
 */
const COLLECTION_BEHAVIOR = {
  canJoinAllSpaces: 1 << 0,
  moveToActiveSpace: 1 << 1,
  managed: 1 << 2,
  transient: 1 << 3,
  stationary: 1 << 4,
  fullScreenAuxiliary: 1 << 8,
} as const;

/** Window the boot report measures the scene's frame rate over. */
const RATE_SAMPLE_MS = 1500;
/** Day/night is re-evaluated (via a store tick) this often. */
const NIGHT_REFRESH_MS = 60_000;

function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Records what the app actually managed to render, for builds that cannot be inspected any other way.
 *
 * Deliberately written on BOTH the success and the failure path, and deliberately tolerant of a
 * half-built app: the first version only ran after a clean boot, which is backwards for a diagnostic —
 * when boot failed it wrote nothing at all and the packaged app stayed exactly as opaque as before.
 */
/**
 * The running build, formatted for someone reading the JSON, and guaranteed not to throw.
 *
 * Never throwing matters more here than anywhere else in the report: this is the field that says
 * whether the other fields describe the build you think they do, so losing it to an exception would
 * take the rest of the report down with it in credibility.
 */
async function buildIdentity(platform: Platform): Promise<unknown> {
  try {
    const { builtAtMs, ...rest } = await platform.buildIdentity();
    return { ...rest, builtAt: builtAtMs === null ? null : new Date(builtAtMs).toISOString() };
  } catch (e) {
    return `unavailable: ${String(e)}`;
  }
}

async function writeBootReport(
  platform: Platform,
  store: AppStore | null,
  scene: HabitatScene | null,
  error?: unknown,
): Promise<void> {
  const canvas = document.querySelector('canvas');
  const s = store?.getState();
  const report: Record<string, unknown> = {
    at: new Date().toISOString(),
    ok: error === undefined,
    platform: platform.kind,
    // WHICH BINARY WROTE THIS. First field after the timestamp because it is the first question, and
    // because for one evening it had no answer: three copies of the app shared a bundle id, macOS
    // handed every launch to whichever was already running, and this report described the window in
    // forensic detail while staying silent about its own author. A fix sat unopened on the Desktop
    // looking exactly like a fix that did not work. Read `build.bundle` before believing anything else
    // in this file.
    build: await buildIdentity(platform),
    // Why the clocks might be slow. WebKit clamps setTimeout/setInterval to 1 Hz and stops
    // requestAnimationFrame entirely for a document it considers hidden, and a window that is
    // never activated can be considered hidden while being plainly visible on screen.
    visibility: typeof document === 'undefined' ? 'no-document' : document.visibilityState,
    hasFocus: typeof document === 'undefined' ? false : document.hasFocus(),
    canvas: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight } : null,
  };
  if (error !== undefined) {
    report['error'] = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    report['stack'] = error instanceof Error ? (error.stack ?? null) : null;
  }
  try {
    if (scene) {
      // Pixi's own `fps` is seeded to 60 and only corrected by a tick that never comes, so on the exact
      // failure worth catching it reports 60 while nothing is running. Sampling the scene's advance
      // counter across a known interval is the honest measure: it says which clock is actually driving
      // and how fast. A packaged window that the compositor considers occluded has both
      // requestAnimationFrame AND setInterval throttled, and that shows up here as a rate near zero.
      const before = scene.debugState();
      const t0 = Date.now();
      await new Promise((r) => setTimeout(r, RATE_SAMPLE_MS));
      const after = scene.debugState();
      const elapsed = Math.max(1, Date.now() - t0);
      report['scene'] = {
        ...after,
        fps: Math.round(scene.fps()),
        advancesPerSec: Math.round(((after.advances - before.advances) / elapsed) * 1000),
        stepsPerSec: Math.round(((after.steps - before.steps) / elapsed) * 1000 * 10) / 10,
      };
    }
  } catch (e) {
    report['scene'] = `debugState threw: ${String(e)}`;
  }
  // What the window ACTUALLY has, not what was asked for. The layering failure that prompted this
  // was invisible precisely because the window config kept the window floating whatever else failed,
  // so the intended state and the visible symptom disagreed and nothing recorded the difference.
  try {
    const { level, behavior } = await platform.window.getLayering();
    report['layering'] = {
      level,
      ...Object.fromEntries(Object.entries(COLLECTION_BEHAVIOR).map(([k, bit]) => [k, (behavior & bit) !== 0])),
    };
  } catch (e) {
    report['layering'] = `read-back failed: ${String(e)}`;
  }
  if (s) {
    report['scale'] = s.settings.scale;
    report['pet'] = { id: s.pet.id, name: s.pet.name, alive: s.pet.alive, hunger: Math.round(s.hunger) };
  }
  const file = 'boot-report.json';
  await platform.store.set(file, report);
  await platform.store.save(file);
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

async function boot(platform: Platform): Promise<{ store: AppStore; scene: HabitatScene }> {
  // 1. Store.
  const store = createAppStore(platform);
  await store.getState().actions.boot();

  // 2. Scene + canvas, then the #ui overlay above it.
  const app = requireApp();
  const manifest = await loadManifest();
  // Read the store BEFORE building the scene: which species the pet is decides which behaviour,
  // habitat art and speech pool the scene mounts, and the scene used to be built from two hardcoded
  // keys that made the saved pet's species purely decorative.
  const initial = store.getState();
  const scene = createScene(manifest, { species: initial.pet.species, habitat: initial.pet.habitat });
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
  const grip = mountResizeGrip(ui, deps);
  devPanel = mountDevPanel(ui, deps);
  const speech = mountSpeech(ui, deps);
  const pantryDialog = mountPantryDialog(ui, deps);
  const montage = mountMontage(ui, deps);
  mountMemorial(ui, deps);
  grip.relayout();
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
      grip.relayout();
      speech.relayout();
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
      grip.setVisible(true);
      scene.setPointer(p.x, p.y);
      return;
    }
    scene.setPointer(null, null);
    if (grace === null) {
      grace = setTimeout(() => {
        grace = null;
        hudHandle.setVisible(false);
        grip.setVisible(false);
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
  // Layering before the window is shown, so it never appears in the wrong place and then jumps. These
  // were hard-coded on in the window config and in Rust's setup; they are the user's choice now.
  await platform.window
    .setLayering({
      alwaysOnTop: initial.settings.alwaysOnTop,
      allDesktops: initial.settings.allDesktops,
      overFullscreen: initial.settings.overFullscreen,
    })
    .catch(logRejected('setLayering'));
  refreshHitRegions();
  if (!store.getState().hidden) await platform.window.show();
  startScheduler(store, platform);
  setInterval(() => store.getState().actions.tick(), NIGHT_REFRESH_MS);
  // Bank what the pet earned while we were not looking. On the same cadence as the day/night refresh
  // because it is the same kind of thing: a slow counter that nobody watches tick.
  setInterval(() => store.getState().actions.addSpeciesData(scene.drainSpeciesDelta()), NIGHT_REFRESH_MS);


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

  return { store, scene };
}

async function main(): Promise<void> {
  const platform = createPlatform();
  try {
    const booted = await boot(platform);
    // Deliberately delayed. Written immediately it captures the scene before the ticker's first step,
    // which leaves the pet reported as not-yet-placed and makes a healthy app look broken. A second is
    // long past the 8 fps first step and still early enough to be there when anyone looks.
    setTimeout(() => {
      void writeBootReport(platform, booted.store, booted.scene).catch(logRejected('bootReport'));
    }, 1000);
  } catch (err) {
    // 6. Never leave a hidden, broken window: paint the error and show it anyway.
    console.error('[main] boot failed', err);
    renderError(err);
    // The report matters most here: a packaged app has no devtools, so this file is the only way to
    // learn WHY it failed.
    await writeBootReport(platform, null, null, err).catch(logRejected('bootReport'));
    try {
      await platform.window.show();
    } catch (showErr) {
      console.error('[main] could not show the window after a boot failure', showErr);
    }
  }
}

void main();
