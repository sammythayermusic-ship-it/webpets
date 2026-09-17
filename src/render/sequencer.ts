// Pure frame sequencer shared by the sprite player: sequences, loop, play-once-then-returnTo.
// Advances only on step(); no Pixi imports so it is unit-testable.

export interface SequenceDef {
  sequence: readonly number[];
  loop: boolean;
  returnTo?: string;
}

export interface Sequencer {
  /** Switch to a state. Re-requesting the current state, or the returnTo of an unfinished play-once, is a no-op. */
  play(name: string): void;
  /** Advance one 8 fps step. */
  step(): void;
  /** Frame index inside the strip for the current step. */
  frame(): number;
  state(): string;
  /** True while a non-looping state has reached its last frame and has no returnTo. */
  finished(): boolean;
}

export function createSequencer(states: Readonly<Record<string, SequenceDef>>, initial: string): Sequencer {
  let current = initial;
  let idx = 0;
  let done = false;

  const def = (): SequenceDef | undefined => states[current];

  const set = (name: string): void => {
    current = name;
    idx = 0;
    done = false;
  };

  return {
    play(name) {
      if (name === current && !done) return;
      const d = def();
      if (d && !d.loop && !done && d.returnTo === name) return; // let the one-shot finish first
      set(name);
    },
    step() {
      const d = def();
      if (!d || d.sequence.length === 0) return;
      if (done) return;
      idx += 1;
      if (idx < d.sequence.length) return;
      if (d.loop) {
        idx = 0;
      } else if (d.returnTo !== undefined && d.returnTo !== current) {
        set(d.returnTo);
      } else {
        idx = d.sequence.length - 1;
        done = true;
      }
    },
    frame() {
      const d = def();
      if (!d) return 0;
      return d.sequence[idx] ?? 0;
    },
    state() {
      return current;
    },
    finished() {
      return done;
    },
  };
}
