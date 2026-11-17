// Sprite player: per-state frames (a strip's sub-rectangles, or one texture per file) -> the drawn
// Sprite; sequences/loop/returnTo via the sequencer; mirror via scale.x with anchor 0.5; transform
// fallback (bob/squash) for states with no art.
//
// THREE CLOCKS, and the reason they are separate:
//
//   - The behaviour ticks at PET_FPS (8 Hz) and is not this file's business.
//   - The animation advances at the ART's own frame rate (`ManifestSprite.fps`), because a 12 fps swim
//     cycle and an 8 Hz simulation are unrelated facts.
//   - Position and the turn tween advance every rendered frame, which is what stops motion looking
//     stepped.
//
// Making the fish *look* smooth by speeding the simulation up instead would have rescaled every
// per-tick constant in the behaviour — px/tick speeds, cooldowns, the wander rate — and invalidated
// their tests. Interpolating a slow, correct simulation is the cheaper and safer half of that trade.

import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { PET_FPS } from '../sim/constants';
import { createSequencer, type SequenceDef } from './sequencer';
import type { Expression } from './expression';
import type { ManifestSprite, PetAnim } from './types';

export interface SpritePlayer {
  /** The drawn pet. Positioned, scaled and textured here; the scene adds `view`, not this. */
  readonly sprite: Sprite;
  /**
   * What the scene adds to its slot and shows, hides and tints: the pet, and above it the fading
   * last frame of the state it just left (Step 4: blends, not cuts).
   */
  readonly view: Container;
  /** Show `state` at once: no transition, no crossfade. For a pet that is already asleep or dead when the scene mounts. */
  jump(state: string): void;
  play(state: string): void;
  /**
   * Advance every render-rate clock this player owns.
   *
   * `dtMs` drives the turn tween, and the frame clock for ordinary states. `distancePx` is the ground
   * the pet covered on screen since the last call, and it drives the frame clock instead for any state
   * that declares a `stridePx` -- see {@link ManifestSpriteState.stridePx}. Omitting it leaves
   * locomotor states frozen, which is the correct reading of "went nowhere".
   */
  advance(dtMs: number, distancePx?: number): void;
  /** Target facing. The flip is tweened; `turning` is accepted for contract compatibility and ignored. */
  setFacing(facing: 1 | -1, turning: boolean): void;
  /** Body centre in grid px. Fractional between behaviour ticks — the scene interpolates. */
  setPosition(x: number, y: number): void;
  setReducedMotion(b: boolean): void;
  /** Snap to a pose with no turn tween and the frame clock at zero: first placement, or a new pet. */
  resetPose(x: number, y: number, facing: 1 | -1): void;
  state(): string;
  destroy(): void;
}

/**
 * The frame size the fallback's offsets below were authored against, in LOGICAL px, so raising the
 * art's resolution leaves the bob alone.
 */
const FALLBACK_REF_FRAME = 80;

/** How long the outgoing state's last frame takes to fade off the incoming one. */
export const CROSSFADE_MS = 150;
/** A turn with real frames plays them over at least this long (they are drawn, not squashed). */
export const TURN_FRAMES_MS = 360;
/**
 * The settle: a damped spring on squash, kicked when the pet stops, lands or finishes a turn. Stiff
 * and well damped, so it reads as weight (a small give and back) rather than as a wobble.
 */
const SETTLE_K = 520;
const SETTLE_C = 26;
/** Kick sizes, as the spring's starting velocity (squash units per second). */
const KICK_STOP = 0.9;
const KICK_LAND = 1.6;
const KICK_TURN = 0.6;

/** Ceiling on frames advanced in one `advance()`, so a long stall cannot spin the sequencer. */
const MAX_FRAMES_PER_ADVANCE = 16;

/**
 * Bob/squash fallback for states whose art is missing.
 *
 * Typed as every state the app can ask for -- `PetAnim` from the simulation, `Expression` from the
 * mood -- so leaving one out is a compile error rather than a silent freeze. It was `Record<string,
 * _>` and the three mood poses were missing, which is exactly the bug that invites:
 *
 * `moodAnim()` names happy/excited/curious for EVERY species and there is no capability check at the
 * call site, but only the fish has that art. With neither art nor a fallback, the sequencer's frame
 * index never advances, `refresh()` draws the base texture with a zero offset forever, and the hamster
 * stops breathing and blinking the moment it feels happy -- which a content, well-fed one does easily,
 * and which the whole wheel errand does too. No crash, no warning, just a still photograph.
 */
const FALLBACK_SEQUENCES: Readonly<Record<PetAnim | Expression, SequenceDef>> = {
  idle: { sequence: [0, 0, 0, 0, 1, 1, 1, 1], loop: true },
  eat: { sequence: [0, 1, 1, 0], loop: false, returnTo: 'idle' },
  hungry: { sequence: [0, 0, 0, 1, 1, 1], loop: true },
  sleep: { sequence: [0, 0, 0, 0, 1, 1, 1, 1], loop: true },
  dead: { sequence: [0, 0, 0, 0, 1, 1, 1, 1], loop: true },
  // Without an entry here a `walk` with no art does not fail loudly -- the sequencer returns frame 0
  // forever and the pet slides along frozen, which is the exact bug the walk exists to fix, wearing a
  // disguise. The fallback at least bobs.
  walk: { sequence: [0, 0, 1, 1], loop: true },
  happy: { sequence: [0, 1, 1, 0], loop: true },
  excited: { sequence: [0, 1, 0, 1], loop: true },
  curious: { sequence: [0, 0, 1, 1], loop: true },
};

export interface SpritePlayerOptions {
  /**
   * How long a facing flip takes. The scene passes its own tick length: the behaviour holds position
   * for exactly the tick it turns on, so the fish spins in place and then swims away, which is what
   * the two-tick turn always described.
   */
  turnMs: number;
  initial?: string;
}

interface StateFrames {
  readonly textures: readonly Texture[];
  /** Grid px per texture px for this state's frames, so `frame` stays the logical footprint. */
  readonly texScale: number;
  /**
   * True when this player created the Texture objects and must destroy them. A strip's frames are
   * sub-rectangles we built over a shared source, so they are ours. A sequence's frames ARE the
   * scene's own textures, and destroying those here would leave the scene holding freed handles.
   */
  readonly owned: boolean;
}

export function createSpritePlayer(
  def: ManifestSprite,
  textures: ReadonlyMap<string, Texture>,
  options: SpritePlayerOptions,
): SpritePlayer {
  const [fw] = def.frame;
  const turnMs = Math.max(1, options.turnMs);
  const frameMs = 1000 / (def.fps ?? PET_FPS);

  const frames = new Map<string, StateFrames>();
  for (const [name, state] of Object.entries(def.states)) {
    const src = state.source;
    if (src.kind === 'strip') {
      const strip = textures.get(src.file);
      if (!strip) continue;
      // Cell width comes from the texture, not from the manifest's `frame`. That is what lets a 1x
      // pixel strip and a 4x rendered one both be correct with no extra field to keep in sync.
      const cell = strip.width / state.frames;
      const list = Array.from(
        { length: state.frames },
        (_, i) => new Texture({ source: strip.source, frame: new Rectangle(i * cell, 0, cell, strip.height), label: `${name}#${i}` }),
      );
      frames.set(name, { textures: list, texScale: fw / cell, owned: true });
    } else {
      const list: Texture[] = [];
      for (const f of src.files) {
        const t = textures.get(f);
        if (!t) break;
        list.push(t);
      }
      // All or nothing: a partial sequence falls back to the transform pose rather than playing a
      // cycle with holes in it, which would read as a stutter rather than as missing art.
      const first = list[0];
      if (list.length !== state.frames || !first) continue;
      frames.set(name, { textures: list, texScale: fw / first.width, owned: false });
    }
  }
  const fallbackBase = (() => {
    for (const f of frames.values()) {
      const first = f.textures[0];
      if (first) return { texture: first, texScale: f.texScale };
    }
    return { texture: Texture.WHITE, texScale: 1 };
  })();
  /** Logical px per fallback offset unit, from the logical frame rather than the texture. */
  const unit = Math.max(1, Math.round(def.frame[1] / FALLBACK_REF_FRAME));

  // Sequences: states with art play their own; anything else uses the fallback table.
  const sequences: Record<string, SequenceDef> = {};
  for (const [name, state] of Object.entries(def.states)) {
    if (frames.has(name)) sequences[name] = { sequence: state.sequence, loop: state.loop, ...(state.returnTo !== undefined ? { returnTo: state.returnTo } : {}) };
  }
  for (const [name, seq] of Object.entries(FALLBACK_SEQUENCES)) {
    if (sequences[name] === undefined) sequences[name] = seq;
  }
  const seq = createSequencer(sequences, options.initial ?? 'idle');

  const sprite = new Sprite({ texture: fallbackBase.texture, anchor: 0.5 });
  // The outgoing state's last frame, drawn over the new one and fading: a cut becomes a dissolve.
  const ghost = new Sprite({ texture: fallbackBase.texture, anchor: 0.5 });
  ghost.alpha = 0;
  ghost.visible = false;
  const view = new Container({ label: 'pet' });
  view.addChild(sprite, ghost);
  let fadeClock = CROSSFADE_MS;
  /** States to play in order after the current transition ends (exitVia, enterVia, the target). */
  let queue: string[] = [];
  /** What the caller last asked for, so a request repeated every tick does not restart a transition. */
  let requested: string = options.initial ?? 'idle';
  /** True until the first play() after creation or a resetPose: that one jumps. */
  let fresh = true;
  // The settle spring: squash amount and its velocity.
  let settle = 0;
  let settleV = 0;
  const kick = (v: number): void => {
    if (reducedMotion) return;
    settleV += v;
  };
  const turnDef = def.states['turn'];
  const hasTurnFrames = frames.has('turn') && turnDef !== undefined;
  const turnSpan = (): number => (hasTurnFrames ? Math.max(turnMs, TURN_FRAMES_MS) : turnMs);
  /** States a turn is drawn from: standing or walking. Anything else still flips with the squash. */
  const turnsFrom = (st: string): boolean => st === 'idle' || st === 'walk';
  let px = 0;
  let py = 0;
  let reducedMotion = false;
  let frameAcc = 0;
  /** Ground covered since the last frame step, for locomotor states. Reset on any state change. */
  let distAcc = 0;

  /**
   * Px of ground per animation frame for a locomotor state, or null for a time-driven one.
   *
   * Divided by the SEQUENCE length rather than the frame count: the sequence is what the player
   * actually steps through, and a cycle that holds a frame twice covers its stride over those steps
   * too. Getting this wrong by using `frames` would make any state with a non-trivial sequence drift.
   */
  const strideOf = (state: string): number | null => {
    const st = def.states[state];
    if (!st || st.stridePx === undefined) return null;
    const steps = st.sequence.length;
    return steps > 0 ? st.stridePx / steps : null;
  };
  /** The flip tween: scale.x sweeps turnFrom -> turnTo as turnClock runs 0 -> turnMs. */
  let turnFrom: 1 | -1 = 1;
  let turnTo: 1 | -1 = 1;
  let turnClock = Number.POSITIVE_INFINITY;

  const refresh = (): void => {
    let state = seq.state();
    let frame = seq.frame();
    // A turn with real frames: while the flip is under way, draw the turn instead of squashing the
    // standing pose. Always unflipped: frame 0 faces right and the last frame IS the mirrored first
    // frame, so a right-to-left turn plays forward and a left-to-right one backward.
    const span = turnSpan();
    const turningNow = hasTurnFrames && !reducedMotion && turnClock < span && turnFrom !== turnTo && turnsFrom(state);
    if (turningNow && turnDef) {
      const k = Math.min(turnDef.frames - 1, Math.floor((turnClock / span) * turnDef.frames));
      frame = turnTo === -1 ? k : turnDef.frames - 1 - k;
      state = 'turn';
    }
    const art = frames.get(state);
    let dx = 0;
    let dy = 0;
    let sy = 1;
    const ds = def.drawScale ?? 1;
    let texScale = fallbackBase.texScale * ds;
    if (art) {
      sprite.texture = art.textures[frame] ?? fallbackBase.texture;
      texScale = art.texScale * ds;
      // Registration first: this state's body sits somewhere in its frame, and every state has to put
      // it in the same place or the simulation's idea of where the pet is stops matching the pixels.
      // Anchors and offsets are logical px of the FRAME, so they shrink with the drawing.
      const reg = def.states[state]?.anchor;
      if (reg) {
        dx -= reg[0] * ds;
        dy -= reg[1] * ds;
      }
      const off = def.states[state]?.offsets?.[frame];
      if (off) {
        dx += off[0] * ds;
        dy += off[1] * ds;
      }
    } else {
      // Transform fallback: the base frame with a bob / squash / flip.
      sprite.texture = fallbackBase.texture;
      switch (state) {
        case 'eat':
          sy = frame === 1 ? 0.75 : 1;
          break;
        case 'dead':
          sy = -1; // belly-up
          dy = frame === 1 ? unit : 0;
          break;
        case 'hungry':
          dy = 2 * unit + (reducedMotion ? 0 : frame * unit);
          break;
        case 'sleep':
          dy = reducedMotion ? 0 : frame * unit;
          break;
        default:
          dy = reducedMotion ? 0 : frame === 1 ? -unit : 0;
      }
    }
    // Facing as an orthographic yaw: cos sweeps +1 -> -1 through zero, which is what a half-turn about
    // the fish's vertical axis actually projects to. It is also steeper at the pinch than a linear
    // ramp, so the sprite spends less time as a zero-width sliver. This replaces the pixel-art device
    // of drawing one 8 fps frame at half width.
    const t = turnClock / span;
    const flip = turningNow ? 1 : t >= 1 || hasTurnFrames ? turnTo : turnFrom * Math.cos(Math.PI * t);
    const facing = turningNow ? 1 : turnTo;
    // The settle: squash down and spread a little, about the feet rather than the middle, so the
    // pet gives under its own weight instead of shrinking toward its centre.
    const sq = reducedMotion ? 0 : Math.max(-0.12, Math.min(0.12, settle));
    const settleY = 1 - sq;
    const settleX = 1 + 0.6 * sq;
    const feet = (def.body.h / 2) * ds;
    // texScale converts the texture's px to the frame's logical px, so the pet is drawn at the same
    // size whatever resolution the art was rendered at.
    sprite.scale.set(flip * texScale * settleX, sy * texScale * settleY);
    // No rounding: quantising to whole grid px was the pixel-art contract and would step the very
    // motion this is meant to smooth.
    sprite.position.set(px + dx * facing, py + dy + feet * (1 - settleY));
  };

  /** Change state, with the outgoing frame left to fade over the incoming one unless told not to. */
  const startState = (state: string, blend: boolean): void => {
    const before = seq.state();
    if (blend && before !== state && !reducedMotion) {
      ghost.texture = sprite.texture;
      ghost.anchor.copyFrom(sprite.anchor);
      ghost.scale.copyFrom(sprite.scale);
      ghost.position.copyFrom(sprite.position);
      ghost.alpha = 1;
      ghost.visible = true;
      fadeClock = 0;
    }
    seq.play(state);
    // Only on a real state change, so a new state gets a whole frame's worth of time. Deliberately
    // not reset for a `returnTo` handover inside advance(), which should flow continuously.
    if (seq.state() !== before) {
      frameAcc = 0;
      distAcc = 0;
      // Weight: stopping, and landing from a startle, give a little under the body.
      if (before === 'walk' && state === 'idle') kick(KICK_STOP);
    }
    refresh();
  };

  refresh();

  return {
    sprite,
    view,
    play(state) {
      if (fresh) {
        fresh = false;
        requested = state;
        queue = [];
        startState(state, false);
        return;
      }
      if (state === requested) return;
      requested = state;
      const cur = seq.state();
      // The way there: leave by the current state's exit, enter by the target's entrance, then the
      // target. A transition only counts if its art is there; otherwise it is simply skipped.
      const curDef = def.states[cur];
      const toDef = def.states[state];
      const path: string[] = [];
      if (curDef?.exitVia && frames.has(curDef.exitVia) && cur !== state) path.push(curDef.exitVia);
      if (toDef?.enterVia && frames.has(toDef.enterVia) && cur !== toDef.enterVia && cur !== state) path.push(toDef.enterVia);
      path.push(state);
      const first = path.shift() as string;
      queue = path;
      startState(first, true);
    },
    jump(state) {
      fresh = false;
      requested = state;
      queue = [];
      startState(state, false);
    },
    advance(dtMs, distancePx = 0) {
      const playingBefore = seq.state();
      // Which clock drives the frames depends on the state, not on the caller. A locomotor state
      // measures ground covered; everything else measures time. The turn tween below is always
      // time-based -- a pet that turns on the spot covers no distance, and freezing its turn until it
      // walked somewhere would be absurd.
      const stride = strideOf(seq.state());
      let guard = 0;
      if (stride !== null) {
        distAcc += Math.abs(distancePx);
        while (distAcc >= stride && guard < MAX_FRAMES_PER_ADVANCE) {
          distAcc -= stride;
          seq.step();
          guard += 1;
        }
        if (guard >= MAX_FRAMES_PER_ADVANCE) distAcc = 0;
      } else {
        frameAcc += dtMs;
        while (frameAcc >= frameMs && guard < MAX_FRAMES_PER_ADVANCE) {
          frameAcc -= frameMs;
          seq.step();
          guard += 1;
        }
        // A stall long enough to hit the ceiling has no meaningful animation phase left to preserve.
        if (guard >= MAX_FRAMES_PER_ADVANCE) frameAcc = 0;
      }
      // A transition has ended when the sequencer has handed over to its returnTo; the queue, if
      // any, says where the caller actually wanted to go.
      const now = seq.state();
      if (now !== playingBefore) {
        if (playingBefore === 'startle') kick(KICK_LAND);
        const next = queue.shift();
        if (next !== undefined && next !== now) startState(next, false);
      }
      const span = turnSpan();
      if (turnClock < span) {
        turnClock = Math.min(span, turnClock + dtMs);
        if (turnClock >= span && hasTurnFrames) kick(KICK_TURN);
      }
      if (fadeClock < CROSSFADE_MS) {
        fadeClock = Math.min(CROSSFADE_MS, fadeClock + dtMs);
        ghost.alpha = 1 - fadeClock / CROSSFADE_MS;
        ghost.visible = ghost.alpha > 0.001;
      }
      // The settle spring, integrated in small steps so a long frame cannot blow it up.
      let left = Math.min(dtMs, 100) / 1000;
      while (left > 0) {
        const h = Math.min(left, 1 / 120);
        settleV += (-SETTLE_K * settle - SETTLE_C * settleV) * h;
        settle += settleV * h;
        left -= h;
      }
      if (Math.abs(settle) < 1e-4 && Math.abs(settleV) < 1e-3) {
        settle = 0;
        settleV = 0;
      }
      refresh();
    },
    setFacing(f, _turning) {
      // Keyed off the change, not off the behaviour's one-tick `turning` pulse: several rendered frames
      // share one tick, so a pulse can be missed or re-applied, while a change cannot.
      if (f === turnTo) return;
      turnFrom = turnTo;
      turnTo = f;
      // A fish spinning on the spot is exactly the motion the reduced-motion setting is about.
      turnClock = reducedMotion ? turnSpan() : 0;
      refresh();
    },
    setPosition(x, y) {
      px = x;
      py = y;
      refresh();
    },
    setReducedMotion(b) {
      reducedMotion = b;
      refresh();
    },
    resetPose(x, y, facing) {
      px = x;
      py = y;
      turnFrom = facing;
      turnTo = facing;
      turnClock = turnSpan();
      fresh = true;
      queue = [];
      settle = 0;
      settleV = 0;
      fadeClock = CROSSFADE_MS;
      ghost.visible = false;
      frameAcc = 0;
      // The stride clock too. Without this, ground banked by the outgoing pet survives into the
      // incoming one and it takes its first step early -- the same class of bug as leaving frameAcc
      // set, and just as invisible.
      distAcc = 0;
      refresh();
    },
    state() {
      return seq.state();
    },
    destroy() {
      view.destroy({ children: true });
      // Only the sub-rectangle Textures we built. `false` keeps the ImageSource, which belongs to the
      // scene's texture map either way.
      for (const f of frames.values()) {
        if (!f.owned) continue;
        for (const t of f.textures) t.destroy(false);
      }
      frames.clear();
    },
  };
}
