// The drag handle for resizing the habitat.
//
// A DOM element rather than something drawn into the Pixi canvas, and that is not a style preference:
// `main.ts` starts a native window drag on any `mousedown` over the canvas, which hands the mouse to
// the window server and stops the webview seeing another event. A handle drawn there could be pressed
// but never dragged. Overlay children stop that propagation, so it has to live in `#ui`.
//
// It sits at the habitat's TOP-LEFT, which is unconventional and is the right corner here. Resizing
// anchors the window's bottom-right, because this is a corner pet that lives in the bottom right of a
// screen. Growing therefore moves the top-left up and out, so a handle there travels with the cursor;
// a handle at the bottom-right would stay put while the window grew away behind it.

import type { UiDeps } from './types';
import { clampScale, GRID_H, GRID_W, SCALE_STEPS_PER_UNIT } from '../sim/constants';
import { el, stopDrag } from './dom';

export interface ResizeGripHandle {
  relayout(): void;
  setVisible(b: boolean): void;
  destroy(): void;
}

/** Side of the square handle, CSS px. */
const SIZE = 18;
/**
 * How long each move renews the cursor lock for.
 *
 * Renewed rather than set once, and a deadline rather than a flag: if the release is swallowed — a
 * Space switch, Mission Control, a crash — the window would otherwise stay non-click-through forever
 * and the user could never click their own desktop again.
 */
const LOCK_MS = 1500;

export function mountResizeGrip(root: HTMLElement, deps: UiDeps): ResizeGripHandle {
  const { store, platform, scene } = deps;
  const grip = el('div', 'resize-grip');
  grip.title = 'Drag to resize';
  grip.hidden = true;
  stopDrag(grip);
  root.append(grip);

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startScale = 0;
  let live = 0;
  let pending = false;

  function relayout(): void {
    const hit = scene.habitatHitRect();
    // Centred on the habitat's top-left corner, so the thing being dragged reads as that corner.
    grip.style.left = `${Math.round(hit.x - SIZE / 2)}px`;
    grip.style.top = `${Math.round(hit.y - SIZE / 2)}px`;
  }

  /**
   * The scale the cursor is asking for.
   *
   * With the bottom-right pinned, the habitat's top-left sits at `-(GRID - opaque) * factor` from the
   * window's far corner, so a cursor movement of one px along an axis is a known fraction of a scale
   * step. Both axes are averaged so a diagonal drag behaves, and neither axis alone is required.
   */
  function scaleFor(x: number, y: number): number {
    const o = scene.habitatOpaqueRect();
    const perFactorX = GRID_W - o.x;
    const perFactorY = GRID_H - o.y;
    const dx = (startX - x) / perFactorX;
    const dy = (startY - y) / perFactorY;
    const deltaFactor = (dx + dy) / 2;
    return clampScale(startScale + deltaFactor * SCALE_STEPS_PER_UNIT);
  }

  /** One resize in flight at a time; the next cursor position supersedes any it overtook. */
  function push(scale: number, isLive: boolean): void {
    if (pending) return;
    pending = true;
    void platform.window
      .setScaleLive(scale, isLive)
      .catch((err: unknown) => console.warn('[resizeGrip] setScaleLive failed', err))
      .finally(() => {
        pending = false;
      });
  }

  grip.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    startX = e.screenX;
    startY = e.screenY;
    startScale = store.getState().settings.scale;
    live = startScale;
    grip.setPointerCapture(e.pointerId);
    grip.classList.add('dragging');
    void platform.window.setInteractionLock(LOCK_MS);
  });

  grip.addEventListener('pointermove', (e: PointerEvent) => {
    if (!dragging) return;
    void platform.window.setInteractionLock(LOCK_MS);
    const next = scaleFor(e.screenX, e.screenY);
    if (next === live) return;
    live = next;
    push(next, true);
  });

  const end = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    grip.classList.remove('dragging');
    if (grip.hasPointerCapture(e.pointerId)) grip.releasePointerCapture(e.pointerId);
    // Commit through the store so the size is snapped, persisted and reflected in the tray menu. The
    // drag itself deliberately bypassed all three: snapping would have pulled the window out from
    // under the cursor and persisting writes to disk.
    void store.getState().actions.setScale(live);
    void platform.window.setInteractionLock(0);
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  // The browser can take capture away -- a Space switch, another app stealing the pointer. Without
  // this the lock would sit until its deadline and the drag would never commit.
  grip.addEventListener('lostpointercapture', end);

  relayout();

  return {
    relayout,
    setVisible(b) {
      grip.hidden = !b && !dragging;
    },
    destroy() {
      grip.remove();
    },
  };
}

/** The handle's footprint in CSS px; exported so the stylesheet and the tests agree with the code. */
export const RESIZE_GRIP_SIZE = SIZE;
