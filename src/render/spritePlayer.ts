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

import { Rectangle, Sprite, Texture } from 'pixi.js';
import { PET_FPS } from '../sim/constants';
import { createSequencer, type SequenceDef } from './sequencer';
import type { Expression } from './expression';
import type { ManifestSprite, PetAnim } from './types';

export interface SpritePlayer {
  readonly sprite: Sprite;
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
  let turnClock = turnMs;

  const refresh = (): void => {
    const state = seq.state();
    const frame = seq.frame();
    const art = frames.get(state);
    let dx = 0;
    let dy = 0;
    let sy = 1;
    let texScale = fallbackBase.texScale;
    if (art) {
      sprite.texture = art.textures[frame] ?? fallbackBase.texture;
      texScale = art.texScale;
      // Registration first: this state's body sits somewhere in its frame, and every state has to put
      // it in the same place or the simulation's idea of where the pet is stops matching the pixels.
      const reg = def.states[state]?.anchor;
      if (reg) {
        dx -= reg[0];
        dy -= reg[1];
      }
      const off = def.states[state]?.offsets?.[frame];
      if (off) {
        dx += off[0];
        dy += off[1];
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
    const t = turnClock / turnMs;
    const flip = t >= 1 ? turnTo : turnFrom * Math.cos(Math.PI * t);
    // texScale converts the texture's px to the frame's logical px, so the pet is drawn at the same
    // size whatever resolution the art was rendered at.
    sprite.scale.set(flip * texScale, sy * texScale);
    // No rounding: quantising to whole grid px was the pixel-art contract and would step the very
    // motion this is meant to smooth.
    sprite.position.set(px + dx * turnTo, py + dy);
  };

  refresh();

  return {
    sprite,
    play(state) {
      const before = seq.state();
      seq.play(state);
      // Only on a real state change, so a new state gets a whole frame's worth of time. Deliberately
      // not reset for a `returnTo` handover inside advance(), which should flow continuously.
      if (seq.state() !== before) {
        frameAcc = 0;
        distAcc = 0;
      }
      refresh();
    },
    advance(dtMs, distancePx = 0) {
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
      if (turnClock < turnMs) turnClock = Math.min(turnMs, turnClock + dtMs);
      refresh();
    },
    setFacing(f, _turning) {
      // Keyed off the change, not off the behaviour's one-tick `turning` pulse: several rendered frames
      // share one tick, so a pulse can be missed or re-applied, while a change cannot.
      if (f === turnTo) return;
      turnFrom = turnTo;
      turnTo = f;
      // A fish spinning on the spot is exactly the motion the reduced-motion setting is about.
      turnClock = reducedMotion ? turnMs : 0;
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
      turnClock = turnMs;
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
      sprite.destroy();
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
