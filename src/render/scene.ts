// The habitat scene. The layer stack is drawn straight to the stage in GRID units: `layers.root` sits
// at (WINDOW_PAD, WINDOW_PAD) and carries the window scale, while each file-backed layer carries the
// reciprocal of its own art resolution. Everything between those two — parallax, flakes, bubbles, the
// fog, the pet's centre — therefore still speaks plain grid px.
//
// This used to composite into a 320x240 RenderTexture at resolution 1 and upscale it with nearest
// filtering. That indirection existed ONLY to guarantee big square pixels, and it is what the drop
// shadow was made of (two black-tinted copies of that one texture). Both are gone with the pixel-art
// direction; the 3D bowl art carries its own baked contact shadow.
//
// Three clocks, which is the other half of the change:
//   - the behaviour steps at PET_FPS (8 Hz) and still returns clamped integer grid positions;
//   - the pet's animation advances at the ART's frame rate, inside the sprite player;
//   - the drawn position is interpolated across the current tick on EVERY rendered frame.
// Bubbles, the pantry blink and the night fade run at ticker rate as before.

import { Application, Container, Rectangle, type Ticker } from 'pixi.js';
import { DEFAULT_SCALE, GRID_H, GRID_W, PET_FPS, WINDOW_PAD, windowSizeForScale, type Scale } from '../sim/constants';
import type { Rect, Rng } from '../sim/types';
import { createFishBehavior } from '../species/fish/behavior';
import { configureAssetPipeline, loadTextures } from './assets';
import { createBubbles, createSheen, parallaxOffset, type Bubbles, type Sheen } from './fx';
import { createFlakes, type Flakes } from './food';
import { buildLayers, type LayerStack } from './layers';
import { createSpritePlayer, type SpritePlayer } from './spritePlayer';
import { stateFiles } from './manifest';
import { makeWaterBounds } from './water';
import type { FishBehavior, HabitatScene, Manifest, ManifestHabitat, ManifestSprite, SceneEvent, SceneView, WaterBounds } from './types';

const STEP_MS = 1000 / PET_FPS;
/** Cap the accumulator so a background tab does not replay minutes of steps at once. */
const MAX_ACC_MS = 1000;
/** Drive the scene from a timer once rAF has been quiet this long (see the watchdog in mount). */
const WATCHDOG_STALL_MS = 400;
const HABITAT_KEY = 'fish/bowl';
const SPRITE_KEY = 'fish';

/** `windowSizeForScale` from `src/sim/constants.ts` in the `{ w, h }` shape the scene uses internally. */
export function windowSize(scale: Scale): { w: number; h: number } {
  const { width, height } = windowSizeForScale(scale);
  return { w: width, h: height };
}

interface Mounted {
  app: Application;
  layers: LayerStack;
  player: SpritePlayer;
  behavior: FishBehavior;
  bounds: WaterBounds;
  flakes: Flakes;
  bubbles: Bubbles;
  sheen: Sheen;
  /** Advance every clock by `dtMs` and redraw. The single funnel: ticker, watchdog and snapshot all use it. */
  advance: (dtMs: number) => void;
  tick: (t: Ticker) => void;
  watchdog: ReturnType<typeof setInterval>;
}

export function createScene(manifest: Manifest, rng: Rng = Math.random): HabitatScene {
  const habitat: ManifestHabitat | undefined = manifest.habitats[HABITAT_KEY];
  const spriteDef: ManifestSprite | undefined = manifest.sprites[SPRITE_KEY];
  if (!habitat) throw new Error(`manifest has no habitat "${HABITAT_KEY}"`);
  if (!spriteDef) throw new Error(`manifest has no sprite "${SPRITE_KEY}"`);
  // The window geometry is derived from the constants, so a manifest describing a different logical
  // grid would be drawn into a window with no room for it. The art's RESOLUTION is free to differ —
  // that factor is derived per texture in layers.ts — but the logical grid is not.
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
  /**
   * Body centre at the start and end of the CURRENT behaviour tick, grid px. Both are seeded to the
   * pet anchor and are never null, which is what makes it impossible for the fish to lerp in from
   * (0, 0) — the failure the old "hidden until the first step" placement had in a different form.
   */
  let poseFrom = { x: habitat.petAnchor[0], y: habitat.petAnchor[1] };
  let poseTo = { x: habitat.petAnchor[0], y: habitat.petAnchor[1] };
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
    // The whole transform chain: grid px -> CSS px happens here, CSS px -> device px is the renderer's
    // resolution, and texture px -> grid px is on each leaf. Nothing in between needs to know.
    m.layers.root.position.set(WINDOW_PAD, WINDOW_PAD);
    m.layers.root.scale.set(scale);
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
      if (alive && prev && prev.phase !== 'alive') {
        // New pet. The behaviour re-inits at the water centre on its next step, but the RENDER-side
        // pose still holds the corpse's: at the surface, possibly far off-centre, facing whichever way
        // it died. Without this the new fish slides in from the dead one's position and plays a
        // spurious flip on the way.
        m.behavior.reset();
        const [ax, ay] = habitat.petAnchor;
        poseFrom = { x: ax, y: ay };
        poseTo = { x: ax, y: ay };
        acc = 0; // the new pet's first tick is a whole one
        m.player.resetPose(ax, ay, 1);
      }
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
    // Roll the segment forward INSIDE the step loop. After a catch-up burst that leaves poseFrom and
    // poseTo bracketing only the final tick, so the fish resumes from where it is rather than
    // rubber-banding through every tick it missed.
    poseFrom = poseTo;
    poseTo = { x: out.x, y: out.y };
    placed = true;
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
        // roundPixels snaps to the RENDER TARGET's pixel grid. That target used to be the 320x240
        // RenderTexture, which is precisely how big square pixels were guaranteed; now it is the canvas
        // in device px, where snapping would quantise the interpolated motion and jitter the sampling
        // of a minified sprite. Off.
        roundPixels: false,
        backgroundAlpha: 0,
        // MSAA on geometry edges; textured quads do not benefit and this is all textured quads.
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
        // Fans out: a strip contributes one path, a rendered sequence one per frame. Every idle frame
        // is required, which is stricter than before and deliberate — a pet missing a frame of its
        // resting animation is broken, and a silent gap there reads as a stutter nobody can place.
        const bucket = state === 'idle' ? required : optional;
        for (const f of stateFiles(st)) bucket.push(f);
      }
      const [requiredTex, optionalTex] = await Promise.all([
        loadTextures(required, false),
        loadTextures(optional, true),
      ]);
      const textures = new Map([...optionalTex, ...requiredTex]);

      const layers = buildLayers(habitat, textures);
      const bounds = makeWaterBounds(habitat.waterShape);
      // The scene is the one module that legitimately knows both clocks, so it passes the tick length
      // in rather than the player importing PET_FPS: a flip then covers exactly the tick the behaviour
      // holds position for, and the fish spins in place before swimming on.
      const player = createSpritePlayer(spriteDef, textures, { turnMs: STEP_MS });
      // Placed at its anchor and shown immediately, NOT hidden until the first behaviour step. The
      // sprite used to start invisible at (0, 0) so a one-frame flash there could not be seen, but
      // that made the fish's visibility depend on the ticker actually running: in a packaged app whose
      // window is occluded the browser throttles requestAnimationFrame to nothing, the first step never
      // came, and the bowl rendered with no fish in it. Positioning it up front removes the flash
      // without the dependency.
      // Through the player's API, not sprite.position: the player re-derives sprite.position from its
      // own px/py inside refresh(), which play()/setFacing() call, so a direct assignment is wiped the
      // first time the view is applied.
      player.resetPose(habitat.petAnchor[0], habitat.petAnchor[1], 1);
      layers.slots.pet.addChild(player.sprite);
      const flakes = createFlakes(habitat.waterShape, bounds);
      layers.slots.food.addChild(flakes.container);
      const bubbles = createBubbles(habitat.waterShape, bounds);
      layers.slots.fx.addChild(bubbles.container);
      const sheen = createSheen();
      layers.slots.glass.addChild(sheen.sprite);

      const stage: Container = app.stage;
      stage.addChild(layers.root);

      /** Advance and redraw by `dtMs`, from whichever clock is driving us. */
      const advance = (dtMs: number): void => {
        if (!m) return;
        lastAdvanceAt = Date.now();
        acc = Math.min(MAX_ACC_MS, acc + dtMs);
        while (acc >= STEP_MS) {
          acc -= STEP_MS;
          stepOnce();
        }
        // What is left of the current tick, in [0, 1). Deriving the interpolation from the SAME
        // accumulator that drives the steps means the two can never drift apart, which a second timer
        // would eventually do.
        //
        // Interpolating between two clamped positions is always legal, and not merely close enough:
        // the legal set for a body centre is the water ellipse eroded by the body box and cut to the
        // surface/floor band. Eroding a convex set leaves it convex and intersecting convex sets keeps
        // them convex, so every point on the segment between two legal centres is itself legal.
        const t = acc / STEP_MS;
        m.player.setPosition(poseFrom.x + (poseTo.x - poseFrom.x) * t, poseFrom.y + (poseTo.y - poseFrom.y) * t);
        m.player.advance(dtMs);
        m.bubbles.update(dtMs, rng);
        m.layers.update(dtMs);
        m.app.render();
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

      m = { app, layers, player, behavior: createFishBehavior(), bounds, flakes, bubbles, sheen, advance, tick, watchdog };
      layoutHabitat();
      if (view) applyView(view, null);
      applyPointer();
      // Draw once before the first ticker callback so the window never shows an empty frame.
      app.render();
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
        // The behaviour's own last position, not the live sprite's. The sprite is mid-interpolation
        // between ticks, and mid-flip its measured width passes through ZERO as scale.x sweeps across
        // — a report of a 0px-wide fish would send someone hunting a bug that does not exist.
        petPos: { x: poseTo.x, y: poseTo.y },
        steps,
        stepSkips,
        hasView: view !== null,
        petFrame: { w: spriteDef.frame[0], h: spriteDef.frame[1] },
        layerAlpha,
      };
    },

    async snapshot() {
      if (!m) throw new Error('scene not mounted');
      // A hidden tab or a suspended webview gets no ticker callbacks, so nothing here can be assumed
      // to have run. Drive one whole tick first, or a capture of a backgrounded page shows a pet that
      // has never been placed and looks like a rendering bug.
      if (!placed) m.advance(STEP_MS);
      m.app.render();
      const { w, h } = windowSize(scale);
      // Framed explicitly to the canvas. Without this the extract frames the STAGE's bounds, which are
      // now the union of the layer sprites rather than one habitat sprite: the transparent pad would be
      // cropped away and anything overhanging the canvas would be included, so captures would silently
      // stop being comparable with each other or with the window.
      return m.app.renderer.extract.base64({ target: m.app.stage, frame: new Rectangle(0, 0, w, h), format: 'png' });
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
      cur.app.destroy({ removeView: true }, { children: true });
      listeners.bite.clear();
      listeners['flakes-gone'].clear();
    },
  };

  return scene;
}
