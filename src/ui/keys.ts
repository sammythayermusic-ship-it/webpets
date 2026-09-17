// Keyboard shortcuts, matched on e.code with modifiers (contract "Pointer, hover and click-through rules" #5):
//   Meta+Equal / Meta+NumpadAdd      scale up
//   Meta+Minus / Meta+NumpadSubtract scale down
//   Alt+Meta+KeyD                    dev panel toggle (Shift is ignored, so Shift+Alt+Meta+KeyD works too;
//                                   macOS claims plain Alt+Meta+D for "Turn Dock Hiding On/Off" and may
//                                   swallow it before the webview sees it, so the Shift variant and the
//                                   tray menu's "Dev panel" item are the documented fallbacks)

import type { AppStore } from '../app/types';
import { SCALES, type Scale } from '../sim/constants';
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

export function nextScale(current: Scale, dir: 1 | -1): Scale | null {
  const i = SCALES.indexOf(current);
  const next = SCALES[i + dir];
  return next === undefined || next === current ? null : next;
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
