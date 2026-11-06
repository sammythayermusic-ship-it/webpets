// Entry point: the boot sequence and all cross-module wiring (docs/ARCHITECTURE.md "Boot sequence" and
// "Pointer, hover and click-through rules"). This file is the ONLY caller of platform.window.setHitRegions.

import { createAppStore, startScheduler, toSceneView } from './app';
import type { AppState, AppStore } from './app';
import { createPlatform } from './platform';
import type { Platform, PointerState } from './platform';
import { createScene, loadManifest } from './render';
import type { HabitatScene, Rect } from './render';
import {
  computeHitRegions,
  initAudio,
  installKeys,
  mountDevPanel,
  mountHud,
  mountMemorial,
  mountMontage,
  mountFeederDialog,
  mountSpeech,
  wireTray,
  mountResizeGrip,
} from './ui';
import type { DevPanelHandle, HudHandle } from './ui';
import { hungerLabel } from './sim';
import { createProfileStore } from './app/profile';
import { mountChatInput } from './ui/chatInput';
import type { World } from './ui/world';
import { createMomentRecorder, type MomentRecorder } from './ui/moments';
import { petCardPng } from './ui/petCard';
import { mountCard, type CardHandle } from './ui/card';
import { CARD_CLOSE_EVENT, CARD_OPEN_EVENT } from './platform/browser';
import { BOND, BOND_WORDS, bondLevel, bondPerks } from './brain/bond';
import { GREET_MS } from './sim/needs';
import { INTERESTS } from './brain/data/interests';
import { LEAGUES, TEAMS } from './brain/data/teams';

/** HUD stays visible this long after the pointer leaves the hit regions (contract rule 3). */
const HUD_GRACE_MS = 400;
/** A press that moves less than this before release is a tap on the glass, not the start of a drag. */
const TAP_SLOP_PX = 4;
/** A click-to-feed within this long of the last one is ignored, so a double click spends one meal. */
const DROP_COOLDOWN_MS = 1200;
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
  return s.pet !== prev.pet || s.hunger !== prev.hunger || s.night !== prev.night || s.daylight !== prev.daylight || s.latches !== prev.latches;
}

async function boot(platform: Platform): Promise<{ store: AppStore; scene: HabitatScene }> {
  // 1. Store.
  const store = createAppStore(platform);
  await store.getState().actions.boot();
  // What the pets know about you; shared with the "Get to know me" card's window.
  const profile = createProfileStore(platform);
  await profile.ready;

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
  // The needs model feeds the behaviour: asked once per tick with whether the pet is napping. A close
  // friend (Step E's bond) also greets you at the glass after a short absence, not only a long one.
  let closeGreetUntil = 0;
  // Your teams and the news (Step F) live with the bubble, which is mounted further down.
  let worldOf: () => World | null = () => null;
  let celebratingNow = (): boolean => false;
  scene.setDrivesSource((napping) => {
    const d = store.getState().actions.drives(napping);
    // Your team's result today (Step F): a win celebrates, a loss sulks.
    // A milestone just marked (Step F2) celebrates whatever the score.
    const cheer = celebratingNow() ? 1 : (worldOf()?.cheer() ?? 0);
    const greeted = Date.now() < closeGreetUntil && store.getState().present && !d.greet ? { ...d, greet: true } : d;
    return cheer !== 0 ? { ...greeted, cheer } : greeted;
  });
  scene.on('bite', () => store.getState().actions.poke('bite'));
  // Step 3: the habitat's ambient events are sound hooks; no sound files exist yet, so all are silent.
  scene.onAmbient((e) => audio.play(e));

  // 3. UI components and wiring.
  let hud: HudHandle | null = null;
  let devPanel: DevPanelHandle | null = null;
  const extraRects: { getRects(): Rect[] }[] = [];
  const refreshHitRegions = (): void => {
    if (!hud || !devPanel) return; // components call requestHitRegions while mounting
    platform.window.setHitRegions(computeHitRegions(scene, hud, devPanel, extraRects)).catch(logRejected('setHitRegions'));
  };
  const deps = { store, platform, scene, audio, profile, requestHitRegions: refreshHitRegions };
  // TALK and a click on the pet open the chat field; it is mounted after the bubble it talks through.
  let openChat = (): void => undefined;
  let canChat = (): boolean => false;
  let shareClip = (): void => undefined;
  hud = mountHud(ui, deps, { onTalk: () => openChat(), canTalk: () => canChat(), onClip: () => shareClip() });
  const grip = mountResizeGrip(ui, deps);
  devPanel = mountDevPanel(ui, deps, { world: () => worldOf(), speakNews: () => speech.speakNews() });
  const speech = mountSpeech(ui, deps);
  const chatInput = mountChatInput(ui, deps, (text) => speech.chat(text));
  canChat = () => speech.canChat();
  worldOf = () => speech.world();
  celebratingNow = () => speech.celebrating();
  hud.relayout();
  openChat = () => {
    if (speech.canChat()) chatInput.open();
  };
  extraRects.push(speech, chatInput);
  // "Forget me" on the card: what you said in chat goes too.
  platform.events.on('forget-me', () => speech.forgetChat());
  const feederDialog = mountFeederDialog(ui, deps);
  const montage = mountMontage(ui, deps);
  mountMemorial(ui, deps);
  grip.relayout();
  // Show it off (Step F2): the last few seconds as a clip, and the pet card, saved to Downloads.
  const appCanvas = app.querySelector<HTMLCanvasElement>('canvas');
  const recorder: MomentRecorder | null = appCanvas ? createMomentRecorder({ canvas: appCanvas, root: ui, save: (n, b) => platform.share.save(n, b) }) : null;
  const toast = (text: string): void => showToast(ui, text);
  const stamp = (): string => {
    const d = new Date();
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
  };
  let saving = false;
  const saveClipNow = async (): Promise<string | null> => {
    if (!recorder || saving) return null;
    saving = true;
    toast('Saving the last few seconds…');
    try {
      const path = await recorder.saveClip(`${store.getState().pet.name} ${stamp()}`);
      toast(path ? 'Saved to Downloads' : 'Nothing to save yet');
      return path;
    } catch {
      toast('Could not save that one');
      return null;
    } finally {
      saving = false;
    }
  };
  shareClip = () => void saveClipNow();
  const shareCard = async (): Promise<string> => {
    const s = store.getState();
    const b = speech.bond();
    const level = b ? bondLevel(b.points) : 0;
    const said = speech.transcript().filter((l) => (l.kind === 'thought' || l.kind === 'chat') && l.text.length <= 110 && !l.text.includes('?'));
    const png = await petCardPng({
      name: s.pet.name,
      id: s.pet.id,
      species: s.pet.species,
      personality: s.pet.personality,
      bornAt: s.pet.bornAt,
      now: Date.now(),
      bond: level > 0 ? BOND_WORDS[level] : null,
      you: profile.get().name,
      quote: said.at(-1)?.text ?? null,
      portrait: (await recorder?.latestFrame()) ?? null,
    });
    return platform.share.save(`${s.pet.name} card ${stamp()}.png`, png);
  };
  const shareCardWithToast = (): void => {
    shareCard().then(
      () => toast('Pet card saved to Downloads'),
      () => toast('Could not make the card'),
    );
  };
  speech.setShareHandler(shareClip);
  wireTray({ ...deps, devPanel, feederDialog, share: { clip: shareClip, card: shareCardWithToast } });
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
      chatInput.relayout();
      refreshHitRegions();
    }

    if (s.pet.species !== prev.pet.species || s.pet.habitat !== prev.pet.habitat) {
      // Re-mount by reloading. The scene is built once at boot and its reference is captured by the
      // HUD, speech, the resize grip, the dev panel and this very subscription, so swapping it live
      // means re-wiring six modules that each believe they own it. A reload re-runs the whole boot
      // sequence against the species now on disk, which is the same path a normal launch takes and is
      // therefore the one path already covered by tests. `setSpecies` has flushed before we get here.
      location.reload();
      return;
    }

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
  let wasInside = false;
  let leftAt = Date.now();
  platform.window.onPointer((p: PointerState) => {
    lastPointer = p;
    // Presence is an attention event: arriving spends curiosity and may earn a greeting; leaving
    // re-anchors the needs as "alone". Edge-triggered, because the poller repeats while inside.
    if (p.inside !== wasInside) {
      wasInside = p.inside;
      const at = Date.now();
      if (p.inside) {
        const b = speech.bond();
        const close = b !== null && bondPerks(bondLevel(b.points)).swimToGlass;
        if (close && at - leftAt >= BOND.CLOSE_GREET_AWAY_MS) closeGreetUntil = at + GREET_MS;
      } else {
        leftAt = at;
      }
      store.getState().actions.setPresence(p.inside);
    }
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
  //
  // The drag starts on the first MOVEMENT past a few px, not on the press. A press-and-release with
  // no movement is a TAP ON THE GLASS, which the pet reacts to (a jolt of stress, a startle), and a
  // drag handed to the window server on mousedown swallowed the mouseup, so a tap could never be
  // told from the start of a drag.
  const canvas = app.querySelector<HTMLCanvasElement>('canvas');
  let press: { x: number; y: number } | null = null;
  canvas?.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    press = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (press === null) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < TAP_SLOP_PX) return;
    press = null;
    platform.window.startDrag().catch(logRejected('startDrag'));
  });
  // A click over the open water at the top of the bowl drops a pinch of food right there; anywhere
  // else on the habitat it is a knock on the glass. The cursor says which: a hand over the water.
  let lastDropAt = 0;
  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (press === null || e.button !== 0) return;
    press = null;
    const spot = scene.feedSpot(e.clientX, e.clientY);
    if (spot !== null) {
      if (Date.now() - lastDropAt < DROP_COOLDOWN_MS) return;
      lastDropAt = Date.now();
      scene.aimFeed(spot);
      if (!store.getState().actions.feed().ok) scene.aimFeed(null);
      return;
    }
    // Reaching for the pet itself is wanting to talk to it, not a knock on the glass.
    if (speech.canChat() && scene.petAt(e.clientX, e.clientY)) {
      chatInput.open();
      return;
    }
    store.getState().actions.poke('tap');
    scene.tap(e.clientX, e.clientY);
    speech.react('tap');
  });
  canvas?.addEventListener('mousemove', (e: MouseEvent) => {
    canvas.style.cursor = press === null && scene.feedSpot(e.clientX, e.clientY) !== null ? 'pointer' : '';
  });
  window.addEventListener('blur', () => {
    press = null;
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
      onDesktop: initial.settings.onDesktop,
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
        hitRegions: () => computeHitRegions(scene, hudHandle, devPanelHandle, extraRects),
        lastPointer: () => lastPointer,
        speech,
      }),
    );
  }

  // Verification-only remote control (docs/HARNESS.md). Same shape as the diag bridge: a dynamic
  // import behind a build-time constant, so a normal build tree-shakes the whole module out. The
  // matching Rust commands exist only under `--features harness`; `npm run build:harness` sets both.
  if (import.meta.env.VITE_WEBPETS_HARNESS === '1') {
    const devPanelHandle = devPanel;
    void import('./dev/harness').then((mod) =>
      mod.installHarness({
        store,
        platform,
        scene,
        devPanel: devPanelHandle,
        hud: hudHandle,
        speech,
        profile,
        chatInput,
        share: { clip: saveClipNow, card: shareCard },
        backdateAway: (ms) => {
          leftAt -= ms;
        },
        cardDo: async (action, value) => {
          const { emit } = await import('@tauri-apps/api/event');
          await emit('harness-card', { action, value });
        },
      }),
    );
  }

  // 5. "While you were gone" montage; recentEvents is read once, right after boot.
  const { recentEvents, pet } = store.getState();
  if (recentEvents.length > 0) {
    speech.hold(true);
    await montage.play(recentEvents, pet.name);
    speech.hold(false);
    // The feeder kept it going while you were away: that is what it wants to tell you first.
    speech.react(recentEvents.some((e) => e.type === 'auto-fed') ? 'feeder' : 'welcome-back');
  }

  // 6. The "Get to know me" card. In the browser it is an overlay on this page (the app gives it its
  // own window). It opens by itself once, on the first launch, in the app only, so tests and the
  // browser preview start on the habitat.
  if (platform.kind === 'browser') mountBrowserCard(platform, profile, store, () => speech.bond());
  if (platform.kind === 'tauri' && !store.getState().settings.cardOffered) {
    store.getState().actions.setCardOffered(true);
    platform.card.open().catch(logRejected('openCard'));
  }

  return { store, scene };
}

/** A short note at the bottom of the window ("Saved to Downloads"). */
function showToast(ui: HTMLElement, text: string): void {
  let el = ui.querySelector<HTMLElement>('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    ui.append(el);
  }
  el.textContent = text;
  el.classList.add('show');
  const mine = el;
  clearTimeout(Number(mine.dataset['timer'] ?? 0));
  mine.dataset['timer'] = String(setTimeout(() => mine.classList.remove('show'), 2600));
}

/** Browser only: the card as an overlay, opened and closed by the mock platform's events. */
function mountBrowserCard(
  platform: Platform,
  profile: ReturnType<typeof createProfileStore>,
  store: AppStore,
  bond: () => { points: number } | null,
): void {
  let overlay: HTMLElement | null = null;
  let card: CardHandle | null = null;
  const close = (): void => {
    card?.destroy();
    overlay?.remove();
    card = null;
    overlay = null;
  };
  window.addEventListener(CARD_CLOSE_EVENT, close);
  window.addEventListener(CARD_OPEN_EVENT, () => {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'gtk-overlay';
    document.body.append(overlay);
    card = mountCard(overlay, {
      profile,
      leagues: LEAGUES,
      teams: TEAMS,
      interests: INTERESTS,
      petName: () => store.getState().pet.name,
      bondWord: () => {
        const b = bond();
        return b ? BOND_WORDS[bondLevel(b.points)] : null;
      },
      onForget: () => void platform.events.emit('forget-me'),
      onDone: () => void platform.card.close(),
    });
  });
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
