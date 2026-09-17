// The habitat scene. Everything except the drop shadow renders into a 160x120 RenderTexture (nearest,
// resolution 1) in grid units; that one texture is drawn at (WINDOW_PAD, WINDOW_PAD) scaled by the integer
// scale, which is the structural pixel-grid guarantee. Pet + flakes step at PET_FPS via a deltaMS
// accumulator; bubbles, the pantry blink and the night fade run at ticker rate.

import { Application, Container, RenderTexture, Sprite, type Ticker } from 'pixi.js';
import { GRID_H, GRID_W, PET_FPS, WINDOW_PAD, type Scale } from '../sim/constants';
import type { Rect, Rng } from '../sim/types';
import { createFishBehavior } from '../species/fish/behavior';
import { configureNearestTextures, loadTextures } from './assets';
import { createBubbles, createSheen, parallaxOffset, type Bubbles, type Sheen } from './fx';
import { createFlakes, type Flakes } from './food';
import { buildLayers, type LayerStack } from './layers';
import { createSpritePlayer, type SpritePlayer } from './spritePlayer';
import { makeWaterBounds } from './water';
import type { FishBehavior, HabitatScene, Manifest, ManifestHabitat, ManifestSprite, SceneEvent, SceneView, WaterBounds } from './types';

const STEP_MS = 1000 / PET_FPS;
/** Cap the accumulator so a background tab does not replay minutes of steps at once. */
const MAX_ACC_MS = 1000;
const HABITAT_KEY = 'fish/bowl';
const SPRITE_KEY = 'fish';

export function windowSize(scale: Scale): { w: number; h: number } {
  return { w: GRID_W * scale + 2 * WINDOW_PAD, h: GRID_H * scale + 2 * WINDOW_PAD };
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
}

export function createScene(manifest: Manifest, rng: Rng = Math.random): HabitatScene {
  const habitat: ManifestHabitat | undefined = manifest.habitats[HABITAT_KEY];
  const spriteDef: ManifestSprite | undefined = manifest.sprites[SPRITE_KEY];
  if (!habitat) throw new Error(`manifest has no habitat "${HABITAT_KEY}"`);
  if (!spriteDef) throw new Error(`manifest has no sprite "${SPRITE_KEY}"`);
  const [gridW, gridH] = habitat.grid;
  if (gridW !== GRID_W || gridH !== GRID_H) throw new Error(`habitat grid must be ${GRID_W}x${GRID_H}`);

  let m: Mounted | null = null;
  let scale: Scale = 3;
  let view: SceneView | null = null;
  let pointer: { x: number; y: number } | null = null;
  let acc = 0;
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
    // Stepped 2-tone drop shadow: two black-tinted copies of the habitat texture offset by 1 and 2 grid px.
    m.shadowNear.position.set(WINDOW_PAD + scale, WINDOW_PAD + scale);
    m.shadowNear.scale.set(scale);
    m.shadowFar.position.set(WINDOW_PAD + 2 * scale, WINDOW_PAD + 2 * scale);
    m.shadowFar.scale.set(scale);
  };

  const applyPointer = (): void => {
    if (!m) return;
    const reduced = view?.reducedMotion ?? false;
    const gx = pointer ? (pointer.x - WINDOW_PAD) / scale : null;
    const gy = pointer ? (pointer.y - WINDOW_PAD) / scale : null;
    m.sheen.setPointer(gx, gy, m.bounds);
    const { dx, dy } = parallaxOffset(gx, gy, reduced);
    m.layers.setParallax(dx, dy);
  };

  const applyView = (next: SceneView, prev: SceneView | null): void => {
    if (!m) return;
    const alive = next.phase === 'alive';
    if (!prev || prev.phase !== next.phase) {
      m.layers.setPhase(next.phase);
      m.bubbles.setEnabled(alive);
      m.player.sprite.visible = placed && next.phase !== 'memorial';
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

  const stepOnce = (): void => {
    if (!m || !view) return;
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
    if (!placed) {
      placed = true;
      m.player.sprite.visible = view.phase !== 'memorial';
    }
    m.player.step();
    if (ate) emit('bite');
    if (before > 0 && m.flakes.count() === 0 && (ate || dissolved > 0)) emit('flakes-gone');
  };

  const scene: HabitatScene = {
    async mount(el, s) {
      if (m) throw new Error('scene already mounted');
      scale = s;
      configureNearestTextures();
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

      const files: string[] = [];
      for (const l of habitat.layers) if (l.file !== undefined) files.push(l.file);
      for (const st of Object.values(spriteDef.states)) files.push(st.file);
      const textures = await loadTextures(files);

      const layers = buildLayers(habitat, textures);
      const bounds = makeWaterBounds(habitat.waterShape);
      const player = createSpritePlayer(spriteDef, textures);
      player.sprite.visible = false; // shown by the first behavior step (see `placed`)
      layers.slots.pet.addChild(player.sprite);
      const flakes = createFlakes(habitat.waterShape, bounds);
      layers.slots.food.addChild(flakes.container);
      const bubbles = createBubbles(habitat.waterShape, bounds);
      layers.slots.fx.addChild(bubbles.container);
      const sheen = createSheen();
      layers.slots.glass.addChild(sheen.sprite);

      const rt = RenderTexture.create({
        width: GRID_W,
        height: GRID_H,
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

      const tick = (t: Ticker): void => {
        if (!m) return;
        acc = Math.min(MAX_ACC_MS, acc + t.deltaMS);
        while (acc >= STEP_MS) {
          acc -= STEP_MS;
          stepOnce();
        }
        m.bubbles.update(t.deltaMS, rng);
        m.layers.update(t.deltaMS);
        m.app.renderer.render({ container: m.layers.root, target: m.rt });
      };

      m = { app, rt, habitatSprite, shadowFar, shadowNear, layers, player, behavior: createFishBehavior(), bounds, flakes, bubbles, sheen, tick };
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

    async snapshot() {
      if (!m) throw new Error('scene not mounted');
      return m.app.renderer.extract.base64({ target: m.app.stage, format: 'png' });
    },

    destroy() {
      if (!m) return;
      const cur = m;
      m = null;
      cur.app.ticker.remove(cur.tick);
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
