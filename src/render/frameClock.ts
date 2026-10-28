// The clock an animated layer plays on. Pure, so the sequencing is unit-testable without Pixi.
//
// Elapsed time in, frame index out. Deliberately stateless: the layer keeps its own elapsed-ms
// accumulator and asks every rendered frame, which means a stall of any length (an occluded window,
// a long GC) lands on exactly the frame the wall clock says and never replays the gap.

/**
 * Frame to show after `elapsedMs` of playback through `count` frames at `fps`.
 *
 * A looping sequence wraps; a one-shot holds its last frame. Non-finite or negative time, or a
 * degenerate sequence, is frame 0 rather than an exception -- an ambient layer is decoration and
 * must never take the scene down.
 */
export function frameAt(elapsedMs: number, count: number, fps: number, loop: boolean): number {
  if (count <= 1 || fps <= 0 || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  const raw = Math.floor((elapsedMs * fps) / 1000);
  if (loop) return raw % count;
  return Math.min(count - 1, raw);
}

/** Milliseconds one full pass of the sequence takes. */
export function cycleMs(count: number, fps: number): number {
  return fps > 0 ? (count * 1000) / fps : 0;
}

/**
 * Wrap an accumulated time into one cycle so a loop that has run for a day does not carry a huge
 * float around. Only valid for looping sequences; a one-shot keeps its raw time.
 */
export function wrapMs(elapsedMs: number, count: number, fps: number): number {
  const cycle = cycleMs(count, fps);
  if (cycle <= 0 || elapsedMs < cycle) return elapsedMs;
  return elapsedMs % cycle;
}
