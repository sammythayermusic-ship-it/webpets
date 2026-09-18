// The habitat scene. Everything except the drop shadow renders into a RenderTexture the size of the
// manifest habitat's grid (nearest, resolution 1) in grid units; that one texture is drawn at (WINDOW_PAD, WINDOW_PAD) scaled by the integer
// scale, which is the structural pixel-grid guarantee. Pet + flakes step at PET_FPS via a deltaMS
// accumulator; bubbles, the pantry blink and the night fade run at ticker rate.

import { Application, Container, RenderTexture, Sprite, type Ticker } from 'pixi.js';
import { DEFAULT_SCALE, GRID_H, GRID_W, PET_FPS, WINDOW_PAD, windowSizeForScale, type Scale } from '../sim/constants';
import type { Rect, Rng } from '../sim/types';
import { createFishBehavior } from '../species/fish/behavior';
import { configureAssetPipeline, loadTextures } from './assets';
import { ART_UNIT, createBubbles, createSheen, parallaxOffset, type Bubbles, type Sheen } from './fx';
import { createFlakes, type Flakes } from './food';
import { buildLayers, type LayerStack } from './layers';
import { createSpritePlayer, type SpritePlayer } from './spritePlayer';
import { makeWaterBounds } from './water';
import type { FishBehavior, HabitatScene, Manifest, ManifestHabitat, ManifestSprite, SceneEvent, SceneView, WaterBounds } from './types';

const STEP_MS = 1000 / PET_FPS;
/** Cap the accumulator so a background tab does not replay minutes of steps at once. */
const MAX_ACC_MS = 1000;
/** Drive the scene from a timer once rAF has been quiet this long (see the watchdog in mount). */
const WATCHDOG_STALL_MS = 400;
/**
 * Drop shadow offsets in grid px. They are ART_UNIT-scaled because the shadow is drawn in CSS px
 * (`offset * scale`): a grid px is physically smaller on a finer grid, so a literal 1/2 here would halve
 * the shadow on screen when the grid doubled.
 */
const SHADOW_NEAR_PX = 1 * ART_UNIT;
const SHADOW_FAR_PX = 2 * ART_UNIT;
const HABITAT_KEY = 'fish/bowl';
const SPRITE_KEY = 'fish';

/** `windowSizeForScale` from `src/sim/constants.ts` in the `{ w, h }` shape the scene uses internally. */
export function windowSize(scale: Scale): { w: number; h: number } {
  const { width, height } = windowSizeForScale(scale);
  return { w: width, h: height };
}

interface Mounted {
  app: Application;
  rt: RenderTexture;
  habitatSprite: Sprite;
  shadowFar: Sprite;
  shadowNear: Sprite;
  layers: LayerStack;
  player: SpritePlayer;
  behavior: FishBehavior;
  bounds: WaterBounds;
  flakes: Flakes;
  bubbles: Bubbles;
  sheen: Sheen;
  tick: (t: Ticker) => void;
  watchdog: ReturnType<typeof setInterval>;
}

export function createScene(manifest: Manifest, rng: Rng = Math.random): HabitatScene {
  const habitat: ManifestHabitat | undefined = manifest.habitats[HABITAT_KEY];
  const spriteDef: ManifestSprite | undefined = manifest.sprites[SPRITE_KEY];
  if (!habitat) throw new Error(`manifest has no habitat "${HABITAT_KEY}"`);
  if (!spriteDef) throw new Error(`manifest has no sprite "${SPRITE_KEY}"`);
  // The RenderTexture is sized from the manifest's grid, but the window geometry around it comes from
  // the constants, so the two must agree: a manifest with a different grid would be drawn into a
  // texture the window has no room for.
  const [gridW, gridH] = habitat.grid;
  if (gridW !== GRID_W || gridH !== GRID_H)
    throw new Error(
      `habitat grid ${gridW}x${gridH} must equal GRID_W x GRID_H (${GRID_W}x${GRID_H} in src/sim/constants.ts): the window size is derived from the constants`,
    );

  let m: Mounted | null = null;
  let scale: Scale = DEFAULT_SCALE;
  let view: SceneView | null = null;
  let pointer: { x: number; y: number } | null = null;
  let acc = 0;
  let lastAdvanceAt = 0;
  /** False until the behavior has positioned the pet once; the sprite stays hidden so it never flashes at (0, 0). */
  let placed = false;
  const listeners: Record<SceneEvent, Set<() => void>> = { bite: new Set(), 'flakes-gone': new Set() };

  const emit = (event: SceneEvent): void => {
    for (const cb of Array.from(listeners[event])) cb();
  };

  const layoutHabitat = (): void => {
    if (!m) return;
    const { w, h } = windowSize(scale);
    m.app.renderer.resize(w, h);
    m.habitatSprite.position.set(WINDOW_PAD, WINDOW_PAD);
    m.habitatSprite.scale.set(scale);
    // Stepped 2-tone drop shadow: two black-tinted copies of the habitat texture, offset by SHADOW_NEAR_PX
    // and SHADOW_FAR_PX grid px (2 and 4 CSS px at scale 1, unchanged from the 160x120 grid at scale 2).
    m.shadowNear.position.set(WINDOW_PAD + SHADOW_NEAR_PX * scale, WINDOW_PAD + SHADOW_NEAR_PX * scale);
    m.shadowNear.scale.set(scale);
    m.shadowFar.position.set(WINDOW_PAD + SHADOW_FAR_PX * scale, WINDOW_PAD + SHADOW_FAR_PX * scale);
    m.shadowFar.scale.set(scale);
  };

  const applyPointer = (): void => {
    if (!m) return;
    const reduced = view?.reducedMotion ?? false;
    const gx = pointer ? (pointer.x - WINDOW_PAD) / scale : null;
    const gy = pointer ? (pointer.y - WINDOW_PAD) / scale : null;
    m.sheen.setPointer(gx, gy, m.bounds);
    const { dx, dy } = parallaxOffset(habitat.grid, gx, gy, reduced);
    m.layers.setParallax(dx, dy);
  };

  const applyView = (next: SceneView, prev: SceneView | null): void => {
    if (!m) return;
    const alive = next.phase === 'alive';
    if (!prev || prev.phase !== next.phase) {
      m.layers.setPhase(next.phase);
      m.bubbles.setEnabled(alive);
      m.player.sprite.visible = next.phase !== 'memorial';
      if (!alive) m.flakes.clear();
      if (alive && prev && prev.phase !== 'alive') m.behavior.reset(); // new pet
    }
    if (!prev || prev.label !== next.label || prev.phase !== next.phase) {
      m.layers.setStarving(alive && next.label === 'starving');
    }
    if (!prev || prev.pantryFraction !== next.pantryFraction) m.layers.setPantryFraction(next.pantryFraction);
    if (!prev || prev.pantryLow !== next.pantryLow) m.layers.setPantryLow(next.pantryLow);
    if (!prev || prev.night !== next.night) m.layers.setNight(next.night);
    if (!prev || prev.reducedMotion !== next.reducedMotion) {
      m.player.setReducedMotion(next.reducedMotion);
      applyPointer();
    }
  };

  let steps = 0;
  let stepSkips = 0;
  const stepOnce = (): void => {
    if (!m || !view) {
      stepSkips += 1;
      return;
    }
    steps += 1;
    const before = m.flakes.count();
    const dissolved = m.flakes.step(rng);
    const out = m.behavior.step({
      hunger: view.hunger,
      label: view.label,
      alive: view.phase === 'alive' && view.alive,
      asleep: view.asleep,
      flakes: m.flakes.positions(),
      bounds: m.bounds,
      body: spriteDef.body,
      rng,
    });
    let ate = false;
    if (out.biteFlakeIndex !== null) {
      m.flakes.remove(out.biteFlakeIndex);
      ate = true;
    }
    m.player.play(out.anim);
    m.player.setFacing(out.facing, out.turning);
    m.player.setPosition(out.x, out.y);
    placed = true;
    m.player.step();
    if (ate) emit('bite');
    if (before > 0 && m.flakes.count() === 0 && (ate || dissolved > 0)) emit('flakes-gone');
  };

  const scene: HabitatScene = {
    async mount(el, s) {
      if (m) throw new Error('scene already mounted');
      scale = s;
      configureAssetPipeline();
      const app = new Application();
      const { w, h } = windowSize(scale);
      await app.init({
        width: w,
        height: h,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        roundPixels: true,
        backgroundAlpha: 0,
        antialias: false,
        preference: 'webgl',
      });
      app.canvas.id = 'habitat-canvas';
      app.canvas.style.display = 'block';
      el.appendChild(app.canvas);

      // Required vs optional. Leniency is right for a decorative layer and wrong for the habitat
      // itself: when every texture failed in the packaged app, lenient loading turned a total outage
      // into a silently empty bowl that looked like a working app. The background and the pet's idle
      // strip are the two things without which there is nothing to look at, so a failure there throws
      // and main.ts paints its visible error box instead.
      const required: string[] = [];
      const optional: string[] = [];
      for (const l of habitat.layers) {
        if (l.file === undefined) continue;
        (l.name === 'bg' ? required : optional).push(l.file);
      }
      for (const [state, st] of Object.entries(spriteDef.states)) {
        (state === 'idle' ? required : optional).push(st.file);
      }
      const [requiredTex, optionalTex] = await Promise.all([
        loadTextures(required, false),
        loadTextures(optional, true),
      ]);
      const textures = new Map([...optionalTex, ...requiredTex]);

      const layers = buildLayers(habitat, textures);
      const bounds = makeWaterBounds(habitat.waterShape);
      const player = createSpritePlayer(spriteDef, textures);
      // Placed at its anchor and shown immediately, NOT hidden until the first behaviour step. The
      // sprite used to start invisible at (0, 0) so a one-frame flash there could not be seen, but
      // that made the fish's visibility depend on the ticker actually running: in a packaged app whose
      // window is occluded the browser throttles requestAnimationFrame to nothing, the first step never
      // came, and the bowl rendered with no fish in it. Positioning it up front removes the flash
      // without the dependency.
      // Through the player's API, not sprite.position: the player re-derives sprite.position from its
      // own px/py inside refresh(), which play()/setFacing() call, so a direct assignment is wiped the
      // first time the view is applied.
      player.setPosition(habitat.petAnchor[0], habitat.petAnchor[1]);
      layers.slots.pet.addChild(player.sprite);
      const flakes = createFlakes(habitat.waterShape, bounds);
      layers.slots.food.addChild(flakes.container);
      const bubbles = createBubbles(habitat.waterShape, bounds);
      layers.slots.fx.addChild(bubbles.container);
      const sheen = createSheen();
      layers.slots.glass.addChild(sheen.sprite);

      const rt = RenderTexture.create({
        width: gridW,
        height: gridH,
        resolution: 1,
        scaleMode: 'nearest',
        antialias: false,
        label: 'habitat-rt',
      });
      const shadowFar = new Sprite({ texture: rt, tint: 0x000000, alpha: 0.1, label: 'shadow-far', roundPixels: true });
      const shadowNear = new Sprite({ texture: rt, tint: 0x000000, alpha: 0.16, label: 'shadow-near', roundPixels: true });
      const habitatSprite = new Sprite({ texture: rt, label: 'habitat', roundPixels: true });
      const stage: Container = app.stage;
      stage.addChild(shadowFar, shadowNear, habitatSprite);

      /** Advance and redraw by `dtMs`, from whichever clock is driving us. */
      const advance = (dtMs: number): void => {
        if (!m) return;
        lastAdvanceAt = Date.now();
        acc = Math.min(MAX_ACC_MS, acc + dtMs);
        while (acc >= STEP_MS) {
          acc -= STEP_MS;
          stepOnce();
        }
        m.bubbles.update(dtMs, rng);
        m.layers.update(dtMs);
        m.app.renderer.render({ container: m.layers.root, target: m.rt });
      };

      const tick = (t: Ticker): void => advance(t.deltaMS);

      // Watchdog, because requestAnimationFrame cannot be relied on here.
      //
      // The packaged app loads its page while the window is still hidden (it is created invisible and
      // shown only once boot finishes), so WebKit puts the document in the hidden visibility state and
      // throttles rAF to nothing — and it does not necessarily resume when the window appears. Measured
      // in a real build: the ticker callback had run ZERO times a second after boot while Pixi's own
      // ticker.FPS still cheerfully reported 60, because that value is seeded to 60 and only updated by
      // a tick that never came. The result was a correctly drawn but completely frozen bowl.
      //
      // A pet whose clock never pauses should not have its animation depend on the compositor's opinion
      // of whether anyone is looking. When rAF goes quiet this drives the same `advance` from a timer at
      // the pet's own 8 fps, which is all the fidelity a stepped sprite needs and costs almost nothing.
      // When rAF is healthy the watchdog sees a recent advance and does nothing at all.
      const watchdog = setInterval(() => {
        if (!m) return;
        const since = Date.now() - lastAdvanceAt;
        if (since >= WATCHDOG_STALL_MS) advance(Math.min(MAX_ACC_MS, since));
      }, STEP_MS);

      m = { app, rt, habitatSprite, shadowFar, shadowNear, layers, player, behavior: createFishBehavior(), bounds, flakes, bubbles, sheen, tick, watchdog };
      layoutHabitat();
      if (view) applyView(view, null);
      applyPointer();
      // Render one frame into the RT before the first ticker callback so the shadow/habitat are not blank.
      app.renderer.render({ container: layers.root, target: rt });
      app.ticker.add(tick);
    },

    setScale(s) {
      scale = s;
      layoutHabitat();
      applyPointer();
    },

    setResolution(dpr) {
      if (!m) return;
      const { w, h } = windowSize(scale);
      m.app.renderer.resize(w, h, dpr > 0 ? dpr : 1);
    },

    setView(next) {
      const prev = view;
      view = next;
      applyView(next, prev);
    },

    feed() {
      if (!m || !view || view.phase !== 'alive') return;
      m.flakes.feed(rng);
    },

    setPointer(x, y) {
      pointer = x === null || y === null ? null : { x, y };
      applyPointer();
    },

    on(event, cb) {
      listeners[event].add(cb);
      return () => {
        listeners[event].delete(cb);
      };
    },

    habitatHitRect(): Rect {
      const o = habitat.opaqueRect;
      return { x: WINDOW_PAD + o.x * scale, y: WINDOW_PAD + o.y * scale, w: o.w * scale, h: o.h * scale };
    },

    fps() {
      return m ? m.app.ticker.FPS : 0;
    },

    debugState() {
      if (!m) {
        return {
          petVisible: false,
          petAnim: '(unmounted)',
          petPos: { x: 0, y: 0 },
          petFrame: { w: 0, h: 0 },
          steps,
          stepSkips,
          hasView: view !== null,
          layerAlpha: {},
        };
      }
      const sprite = m.player.sprite;
      const layerAlpha: Record<string, number> = {};
      for (const [name, c] of Object.entries(m.layers.slots)) {
        layerAlpha[name] = c.visible ? c.alpha : 0;
      }
      return {
        petVisible: sprite.visible,
        petAnim: m.player.state(),
        petPos: { x: Math.round(sprite.x), y: Math.round(sprite.y) },
        steps,
        stepSkips,
        hasView: view !== null,
        petFrame: { w: Math.round(sprite.width), h: Math.round(sprite.height) },
        layerAlpha,
      };
    },

    async snapshot() {
      if (!m) throw new Error('scene not mounted');
      // A hidden tab or a suspended webview gets no ticker callbacks, so nothing here can be assumed
      // to have run. Step the behaviour at least once before rendering: the pet sprite stays hidden at
      // (0, 0) until its first step places it, so without this a capture of a backgrounded page shows
      // a bowl with no fish in it and looks like a rendering bug.
      if (!placed) stepOnce();
      m.app.renderer.render({ container: m.layers.root, target: m.rt });
      m.app.render();
      return m.app.renderer.extract.base64({ target: m.app.stage, format: 'png' });
    },

    destroy() {
      if (!m) return;
      const cur = m;
      m = null;
      cur.app.ticker.remove(cur.tick);
      clearInterval(cur.watchdog);
      cur.flakes.destroy();
      cur.bubbles.destroy();
      cur.sheen.destroy();
      cur.player.destroy();
      cur.layers.destroy();
      cur.rt.destroy(true);
      cur.app.destroy({ removeView: true }, { children: true });
      listeners.bite.clear();
      listeners['flakes-gone'].clear();
    },
  };

  return scene;
}
