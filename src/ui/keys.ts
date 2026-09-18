// Keyboard shortcuts, matched on e.code with modifiers (contract "Pointer, hover and click-through rules" #5):
//   Meta+Equal / Meta+NumpadAdd      scale up
//   Meta+Minus / Meta+NumpadSubtract scale down
//   Alt+Meta+KeyD                    dev panel toggle (Shift is ignored, so Shift+Alt+Meta+KeyD works too;
//                                   macOS claims plain Alt+Meta+D for "Turn Dock Hiding On/Off" and may
//                                   swallow it before the webview sees it, so the Shift variant and the
//                                   tray menu's "Dev panel" item are the documented fallbacks)

import type { AppStore } from '../app/types';
import { clampScale, SCALE_STEPS_PER_UNIT, type Scale } from '../sim/constants';
import type { DevPanelHandle } from './types';

export interface KeyDeps {
  store: AppStore;
  devPanel: Pick<DevPanelHandle, 'toggle'>;
}

export type KeyCommand = 'scale-up' | 'scale-down' | 'dev-panel' | null;

/** Pure mapping so the shortcut table is testable without a DOM. */
export function commandFor(e: Pick<KeyboardEvent, 'code' | 'metaKey' | 'altKey' | 'ctrlKey'>): KeyCommand {
  if (!e.metaKey || e.ctrlKey) return null;
  if (e.altKey) return e.code === 'KeyD' ? 'dev-panel' : null;
  if (e.code === 'Equal' || e.code === 'NumpadAdd') return 'scale-up';
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') return 'scale-down';
  return null;
}

/**
 * One step bigger or smaller, or null at the end of the range.
 *
 * A quarter of the grid per press. At one eighth the ladder is 26 presses end to end, which is not a
 * shortcut; a quarter keeps the named Small/Medium/Large rungs reachable by pressing from any of them.
 */
export const SCALE_STEP = SCALE_STEPS_PER_UNIT / 4;

export function nextScale(current: Scale, dir: 1 | -1): Scale | null {
  const next = clampScale(current + dir * SCALE_STEP);
  return next === current ? null : next;
}

export function installKeys(deps: KeyDeps): () => void {
  function step(dir: 1 | -1): void {
    const s = deps.store.getState();
    const next = nextScale(s.settings.scale, dir);
    if (next !== null) s.actions.setScale(next).catch((err: unknown) => console.warn('[keys] setScale failed', err));
  }

  const handler = (e: KeyboardEvent): void => {
    const cmd = commandFor(e);
    if (cmd === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (cmd === 'scale-up') step(1);
    else if (cmd === 'scale-down') step(-1);
    else deps.devPanel.toggle();
  };

  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}
