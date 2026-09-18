// Which expressive pose the pet is actually holding, as opposed to which one it feels like right now.
//
// Moods are continuous and the labels read off them have boundaries, so a pet sitting on one would ask
// for a different animation every tick. The mood engine is right either way; the fish would just look
// broken. This is the hysteresis that stops that, kept out of scene.ts so it can be tested without a
// renderer.

/** The three states that exist only to express a feeling. Everything else is the simulation's. */
export type Expression = 'happy' | 'excited' | 'curious';

export interface ExpressionGate {
  /** Feed the mood's current request (or null for none) and get back the pose to actually play. */
  update(wanted: Expression | null): Expression | null;
  current(): Expression | null;
  reset(): void;
}

/**
 * @param holdTicks how many consecutive ticks a new expression must be wanted before it is adopted.
 */
export function createExpressionGate(holdTicks: number): ExpressionGate {
  let held: Expression | null = null;
  let pending: Expression | null = null;
  let ticks = 0;

  return {
    update(wanted) {
      if (wanted === held) {
        pending = null;
        ticks = 0;
        return held;
      }
      if (wanted !== pending) {
        pending = wanted;
        ticks = 0;
      }
      ticks += 1;
      // Dropping an expression is immediate; taking one up has to be earned. Waiting to STOP looking
      // excited would leave the pet grinning through a state change the simulation had just made —
      // a delay that reads as a bug, where a delay before starting to look excited reads as nothing.
      if (wanted === null || ticks >= holdTicks) {
        held = wanted;
        pending = null;
        ticks = 0;
      }
      return held;
    },
    current() {
      return held;
    },
    reset() {
      held = null;
      pending = null;
      ticks = 0;
    },
  };
}
