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
import { DEFAULT_SCALE, GRID_H, GRID_W, PET_FPS, WINDOW_PAD, scaleFactor, windowSizeForScale, type Scale } from '../sim/constants';
import type { Rect, Rng } from '../sim/types';
import { requireSpecies } from '../species';
import { configureAssetPipeline, loadTextures } from './assets';
import { createBubbles, createSheen, parallaxOffset, type Bubbles, type Sheen } from './fx';
import { createFlakes, type Flakes } from './food';
import { buildLayers, type LayerStack } from './layers';
import { createSpritePlayer, type SpritePlayer } from './spritePlayer';
import { stateFiles } from './manifest';
import { makeFloorBounds, makeWaterBounds } from './water';
import { decayAttention, moodAnim, moodOf, type Mood } from '../sim/mood';
import { createExpressionGate } from './expression';
import { createPacer, type Pacer } from './pacer';
import type { HabitatScene, Manifest, ManifestHabitat, ManifestSprite, MoveBounds, PetBehavior, SceneEvent, SceneView } from './types';
import type { Habitat, Species } from '../sim/types';

const STEP_MS = 1000 / PET_FPS;
/** Cap the accumulator so a background tab does not replay minutes of steps at once. */
const MAX_ACC_MS = 1000;
/** Treat requestAnimationFrame as dead once it has been quiet this long (see the watchdog in mount). */
const WATCHDOG_STALL_MS = 250;
/** How often the watchdog checks, and therefore the frame rate it drives when rAF is dead. */
/**
 * Pacer interval when requestAnimationFrame is dead. Aims at 60 Hz and lands nearer 15-18 in the
 * packaged app, because WebKit delivers a hidden document's worker messages in bursts rather than on
 * the interval. Measured: 33 ms yields ~12/s and 8 ms yields ~18/s, so the interval does matter and
 * this is not a hard clamp — but it is diminishing returns against a wakeup every 16 ms forever, which
 * a pet idling in the corner of someone's screen should not be spending battery on.
 */
const WATCHDOG_INTERVAL_MS = 16;
/** Ticks a new expressive mood must hold before the pet changes pose. One second at the sim's 8 Hz. */
const MOOD_HOLD_TICKS = 8;
/** How fast the pointer's pull on the pet rises and falls, per tick. Roughly half a second either way. */
const PULL_EASE = 0.25;
/**
 * Which species the scene draws, when the caller does not say.
 *
 * A default rather than a constant: `createScene` used to hardcode `'fish/bowl'` and `'fish'` as
 * module-level keys and take no species argument at all, which is the single reason a second species
 * could not be displayed however much of it was implemented.
 */
const DEFAULT_SUBJECT: SceneSubject = { species: 'fish', habitat: 'bowl' };

/** Which species and habitat a scene is mounted for. */
export interface SceneSubject {
  species: Species;
  habitat: Habitat;
}

/** `windowSizeForScale` from `src/sim/constants.ts` in the `{ w, h }` shape the scene uses internally. */
export function windowSize(scale: Scale): { w: number; h: number } {
  const { width, height } = windowSizeForScale(scale);
  return { w: width, h: height };
}

interface Mounted {
  app: Application;
  layers: LayerStack;
  player: SpritePlayer;
  behavior: PetBehavior;
  bounds: MoveBounds;
  flakes: Flakes;
  bubbles: Bubbles;
  sheen: Sheen;
  /** Advance every clock by `dtMs` and redraw. The single funnel: ticker, watchdog and snapshot all use it. */
  advance: (dtMs: number) => void;
  tick: (t: Ticker) => void;
  watchdog: Pacer;
}

export function createScene(
  manifest: Manifest,
  subject: SceneSubject = DEFAULT_SUBJECT,
  rng: Rng = Math.random,
): HabitatScene {
  const species = requireSpecies(subject.species);
  const habitatKey = `${subject.species}/${subject.habitat}`;
  const habitat: ManifestHabitat | undefined = manifest.habitats[habitatKey];
  const spriteDef: ManifestSprite | undefined = manifest.sprites[subject.species];
  if (!habitat) throw new Error(`manifest has no habitat "${habitatKey}"`);
  if (!spriteDef) throw new Error(`manifest has no sprite "${subject.species}"`);
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
   * Last time the ticker ran, as distinct from the last time anything advanced.
   *
   * These have to be separate. The watchdog used to gate on `lastAdvanceAt`, which `advance` itself
   * bumps, so it was re-gating against its own output: it could never tell "rAF is running" from "I ran
   * a moment ago". Gating on a timestamp only the ticker writes is what lets it stand down the instant
   * rAF recovers and run at its full rate the whole time rAF is dead.
   */
  let lastRafAt = 0;
  /**
   * Body centre at the start and end of the CURRENT behaviour tick, grid px. Both are seeded to the
   * pet anchor and are never null, which is what makes it impossible for the fish to lerp in from
   * (0, 0) — the failure the old "hidden until the first step" placement had in a different form.
   */
  let poseFrom = { x: habitat.petAnchor[0], y: habitat.petAnchor[1] };
  let poseTo = { x: habitat.petAnchor[0], y: habitat.petAnchor[1] };
  /**
   * The mood engine's state lives HERE rather than in the store, because attention has to be advanced
   * every rendered frame and a store write per frame would re-run every subscriber sixty times a second
   * to move one number. Nothing else needs it, and it is cheap to reconstruct: attention is a decaying
   * accumulator that converges within minutes of the app starting.
   */
  let attention = 0;
  let lastInteractionAt = 0;
  /**
   * How strongly the pet is currently drawn toward the pointer, and the point it is drawn toward.
   *
   * Eased rather than switched. The pull blends the wander target up to 55% of the way to the cursor,
   * so dropping it the instant the pointer left the hit region reversed the target by tens of px in a
   * single tick and threw a facing flip — on every mouse exit, and repeatedly when the cursor rested
   * near an edge, because the region test comes from a 20 Hz poll whose answer chatters there. The
   * aim point is remembered while the pull fades so the target does not jump as well as shrink.
   */
  let pull = 0;
  let pullX = 0;
  let pullY = 0;
  let mood: Mood | null = null;
  /** Hysteresis on the mood-driven pose; see expression.ts for why a feeling has to hold before it shows. */
  const expression = createExpressionGate(MOOD_HOLD_TICKS);
  /** False until the behavior has positioned the pet once; the sprite stays hidden so it never flashes at (0, 0). */
  let placed = false;
  const listeners: Record<SceneEvent, Set<() => void>> = { bite: new Set(), 'flakes-gone': new Set() };
  /** Unbanked `speciesData` increments since the last drain. See `drainSpeciesDelta`. */
  let speciesAccum: Record<string, number> = {};

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
    // `scale` counts EIGHTHS of the grid, so it has to go through scaleFactor before it multiplies
    // anything. Nothing here type-checks that for us: the scale is a plain number.
    m.layers.root.scale.set(scaleFactor(scale));
  };

  const applyPointer = (): void => {
    if (!m) return;
    const reduced = view?.reducedMotion ?? false;
    const f = scaleFactor(scale);
    const gx = pointer ? (pointer.x - WINDOW_PAD) / f : null;
    const gy = pointer ? (pointer.y - WINDOW_PAD) / f : null;
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
        expression.reset();
        m.player.resetPose(ax, ay, 1);
        // `resetPose` moves the sprite but does not touch the sequencer, so the new pet was drawn
        // using whatever state the old one died in — the belly-up `dead` art, which also carries the
        // largest registration offset of any state — until the next behaviour tick replaced it.
        m.player.play('idle');
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
  /** How many times anything advanced, and by how much. The only way to tell which clock is driving. */
  let advances = 0;
  let lastDtMs = 0;
  /** Rolling mean cost of one advance, in ms. Distinguishes "throttled" from "too slow to keep up". */
  let costMs = 0;
  const stepOnce = (): void => {
    if (!m || !view) {
      stepSkips += 1;
      return;
    }
    steps += 1;
    const before = m.flakes.count();
    const dissolved = m.flakes.step(rng);
    const alive = view.phase === 'alive' && view.alive;
    const now = Date.now();
    mood = moodOf({
      hunger: view.hunger,
      label: view.label,
      alive,
      asleep: view.asleep,
      personality: view.personality,
      sinceFedMs: Math.max(0, now - view.lastFedAt),
      attention,
      sinceInteractionMs: lastInteractionAt === 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, now - lastInteractionAt),
    });
    // Somewhere to be curious about, in grid px. Only when there IS a pointer and the pet is in a mood
    // to care; `interest` already collapses when it is starving or asleep.
    const f = scaleFactor(scale);
    const gx = pointer ? (pointer.x - WINDOW_PAD) / f : null;
    const gy = pointer ? (pointer.y - WINDOW_PAD) / f : null;
    if (gx !== null && gy !== null) {
      pullX = gx;
      pullY = gy;
    }
    pull += ((gx !== null && gy !== null ? mood.interest : 0) - pull) * PULL_EASE;
    const attract = pull > 0.02 ? { x: pullX, y: pullY, strength: pull } : null;
    const out = m.behavior.step({
      hunger: view.hunger,
      label: view.label,
      alive,
      asleep: view.asleep,
      flakes: m.flakes.positions(),
      bounds: m.bounds,
      body: spriteDef.body,
      attract,
      rng,
    });
    let ate = false;
    if (out.biteFlakeIndex !== null) {
      m.flakes.remove(out.biteFlakeIndex);
      ate = true;
    }
    // The mood only ever gets to speak when the simulation has nothing to say. `idle` means "nothing in
    // particular is happening", which is exactly the gap a feeling belongs in; eating, hunger posture,
    // sleep and death are facts and outrank it.
    // The mood only ever gets to speak when the simulation has nothing to say. `idle` means "nothing in
    // particular is happening", which is exactly the gap a feeling belongs in; eating, hunger posture,
    // sleep and death are facts and outrank it. While one of those is playing the gate HOLDS rather
    // than being told the mood wants nothing, so the pet picks its face straight back up afterwards.
    const simDriving = out.anim !== 'idle';
    const expressed = simDriving ? expression.hold() : expression.update(moodAnim(mood));
    m.player.play(simDriving ? out.anim : (expressed ?? 'idle'));
    m.player.setFacing(out.facing, out.turning);
    // Roll the segment forward INSIDE the step loop. After a catch-up burst that leaves poseFrom and
    // poseTo bracketing only the final tick, so the fish resumes from where it is rather than
    // rubber-banding through every tick it missed.
    poseFrom = poseTo;
    poseTo = { x: out.x, y: out.y };
    placed = true;
    if (ate) emit('bite');
    if (before > 0 && m.flakes.count() === 0 && (ate || dissolved > 0)) emit('flakes-gone');
    // Species counters accumulate here and are drained by the app on its own cadence rather than
    // written through on every tick: the hamster earns a fraction of a metre 8 times a second, and a
    // store write per tick would be 8 persisted saves a second to record a number nobody reads live.
    if (out.speciesDelta) {
      for (const [k, v] of Object.entries(out.speciesDelta)) speciesAccum[k] = (speciesAccum[k] ?? 0) + v;
    }
  };

  const scene: HabitatScene = {
    drainSpeciesDelta() {
      const out = speciesAccum;
      speciesAccum = {};
      return out;
    },
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
      // The movement domain comes from the SPECIES, not from the habitat's art. A bowl is an ellipse
      // of water; a cage is a line of bedding to walk along. Both satisfy the same MoveBounds contract,
      // which is what lets the tick interpolation, the body-box clamp and every behaviour branch stay
      // identical between them.
      const domain = species.layout.domain;
      const bounds =
        domain.kind === 'water'
          ? makeWaterBounds(domain.shape)
          : makeFloorBounds({ rect: domain.rect, standY: domain.standY });
      // Bubbles, the glass sheen and the death fog are water PHYSICS, not geometry that happens to be
      // elliptical -- bubbles rise from a floor to a surface and pop, and a fog needs a volume to fill.
      // On land there is no sensible parameterisation of them, so they are absent rather than degenerate.
      const aquatic = domain.kind === 'water';
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
      if (aquatic) layers.slots.fx.addChild(bubbles.container);
      const sheen = createSheen();
      if (aquatic) layers.slots.glass.addChild(sheen.sprite);

      const stage: Container = app.stage;
      stage.addChild(layers.root);

      /** Advance and redraw by `dtMs`, from whichever clock is driving us. */
      const advance = (dtMs: number): void => {
        if (!m) return;
        lastAdvanceAt = Date.now();
        advances += 1;
        lastDtMs = dtMs;
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
        attention = decayAttention(attention, dtMs, pointer !== null);
        const t = acc / STEP_MS;
        m.player.setPosition(poseFrom.x + (poseTo.x - poseFrom.x) * t, poseFrom.y + (poseTo.y - poseFrom.y) * t);
        m.player.advance(dtMs);
        m.flakes.interpolate(t, dtMs);
        m.bubbles.update(dtMs, rng);
        m.layers.update(dtMs);
        const t0 = performance.now();
        m.app.render();
        costMs = costMs === 0 ? performance.now() - t0 : costMs * 0.9 + (performance.now() - t0) * 0.1;
      };

      const tick = (t: Ticker): void => {
        lastRafAt = Date.now();
        advance(t.deltaMS);
      };

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
      // of whether anyone is looking. When rAF goes quiet this drives the same `advance` from a timer,
      // at a rate the motion can actually be smooth at.
      //
      // It used to tick every 125 ms but only act after 400 ms of quiet, so the first firing that
      // passed the gate was at 500 ms and ran FOUR simulation steps at once. The pet therefore ran at
      // 2 fps in half-second lurches, and because 500 is an exact multiple of the tick the accumulator
      // landed on zero every time and the interpolation between ticks contributed nothing whatsoever.
      // For a window that is hidden at launch, unfocused and click-through — which is what WebKit
      // throttles — that was very likely the normal path, not the exception.
      // Paced from a Worker, not a plain interval. The packaged app's document reports itself hidden
      // while the window is on screen — it is never activated, because a desktop pet must not steal
      // focus — and WebKit clamps a hidden document's timers to ONE PER SECOND. Measured in a real
      // build: one advance per second, each replaying a whole second of simulation. A worker has no
      // visibility state and is not clamped. See pacer.ts.
      const watchdog = createPacer(WATCHDOG_INTERVAL_MS, () => {
        if (!m) return;
        const now = Date.now();
        if (now - lastRafAt < WATCHDOG_STALL_MS) return; // rAF is healthy; stand down
        advance(Math.min(MAX_ACC_MS, now - lastAdvanceAt));
      });

      m = { app, layers, player, behavior: species.createBehavior(), bounds, flakes, bubbles, sheen, advance, tick, watchdog };
      layoutHabitat();
      if (view) applyView(view, null);
      applyPointer();
      // Seed both clocks. `lastAdvanceAt` started at 0, so the first watchdog firing computed an
      // elapsed time of "now", clamped it to a full second, and ran eight simulation steps before the
      // first frame the user ever saw — the pet lurched across the bowl on launch.
      lastAdvanceAt = Date.now();
      lastRafAt = lastAdvanceAt;
      // Pixi's ticker plugin renders the stage on its own at a lower priority, and `advance` renders
      // too, so every frame was drawn twice — at the largest window, a 2016x1536 target for no benefit.
      // `advance` is the one path both clocks share, so it keeps the render and the plugin loses it.
      app.ticker.remove(app.render, app);
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
      // Feeding is the strongest form of attention there is; it should not read as neglect just because
      // it happened from the tray with the pointer nowhere near the bowl.
      lastInteractionAt = Date.now();
      attention = Math.max(attention, 0.6);
      m.flakes.feed(rng);
    },

    setPointer(x, y) {
      const was = pointer !== null;
      pointer = x === null || y === null ? null : { x, y };
      if (pointer && !was) lastInteractionAt = Date.now();
      applyPointer();
    },

    on(event, cb) {
      listeners[event].add(cb);
      return () => {
        listeners[event].delete(cb);
      };
    },

    habitatOpaqueRect(): Rect {
      return { ...habitat.opaqueRect };
    },

    habitatHitRect(): Rect {
      const o = habitat.opaqueRect;
      const f = scaleFactor(scale);
      return { x: WINDOW_PAD + o.x * f, y: WINDOW_PAD + o.y * f, w: o.w * f, h: o.h * f };
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
          drawnPos: { x: 0, y: 0 },
          advances,
          lastDtMs: 0,
          pacer: 'timer' as const,
          renderMs: 0,
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
        petPos: { x: Math.round(poseTo.x * 100) / 100, y: Math.round(poseTo.y * 100) / 100 },
        // Where the pet is actually DRAWN, which is the simulated position plus the interpolation
        // across the current tick and the state's registration offset. The two differing is normal;
        // them differing by a lot is the registration bug this pins.
        drawnPos: { x: Math.round(sprite.x * 100) / 100, y: Math.round(sprite.y * 100) / 100 },
        advances,
        lastDtMs: Math.round(lastDtMs * 10) / 10,
        pacer: m.watchdog.kind(),
        renderMs: Math.round(costMs * 10) / 10,
        steps,
        stepSkips,
        hasView: view !== null,
        petFrame: { w: spriteDef.frame[0], h: spriteDef.frame[1] },
        layerAlpha,
        mood: mood
          ? { label: mood.label, valence: Number(mood.valence.toFixed(3)), arousal: Number(mood.arousal.toFixed(3)), interest: Number(mood.interest.toFixed(3)) }
          : null,
        attention: Number(attention.toFixed(3)),
        expression: expression.current(),
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
      cur.watchdog.stop();
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
