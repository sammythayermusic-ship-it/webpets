// "While you were gone…" montage: lists catch-up events chronologically with relative times, one line
// every 700 ms, with a Continue button. play() resolves when the overlay is closed.
// The overlay covers the habitat's opaque rect so it always sits inside a hit region.

import type { SimEvent } from '../sim/types';
import type { UiDeps } from './types';
import { button, el, stopDrag } from './dom';
import { eventLine, formatRelative, sortEvents } from './format';

export interface MontageHandle {
  play(events: SimEvent[], name: string): Promise<void>;
  /** Close a running montage early (resolves its promise). */
  dismiss(): void;
}

export const MONTAGE_LINE_MS = 700;

export function mountMontage(root: HTMLElement, deps: UiDeps): MontageHandle {
  const { store, scene } = deps;
  let active: { close: () => void } | null = null;

  function play(events: SimEvent[], name: string): Promise<void> {
    if (events.length === 0) return Promise.resolve();
    if (active) active.close();

    const overlay = el('div', 'montage');
    stopDrag(overlay);
    const card = el('div', 'modal');
    const title = el('h2', '', 'While you were gone…');
    const list = el('ol');
    const row = el('div', 'row');
    const continueBtn = button('CONTINUE', () => close(), 'continue');
    row.append(continueBtn);
    card.append(title, list, row);
    overlay.append(card);
    root.append(overlay);

    const now = store.getState().actions.now();
    const sorted = sortEvents(events);
    const timers: ReturnType<typeof setTimeout>[] = [];

    function layout(): void {
      const hit = scene.habitatHitRect();
      overlay.style.left = `${hit.x}px`;
      overlay.style.top = `${hit.y}px`;
      overlay.style.width = `${hit.w}px`;
      overlay.style.height = `${hit.h}px`;
      card.style.left = '4px';
      card.style.width = `${Math.max(96, hit.w - 8)}px`;
      const top = Math.max(0, Math.round((hit.h - card.offsetHeight) / 2));
      card.style.top = `${top}px`;
    }

    function appendLine(e: SimEvent): void {
      const li = el('li');
      const when = el('span', 'when', formatRelative(now - e.at));
      const text = document.createTextNode(eventLine(e, name));
      li.append(when, text);
      list.append(li);
      list.scrollTop = list.scrollHeight;
      layout();
    }

    let resolveDone: () => void = () => {};
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    function close(): void {
      if (active === null) return;
      for (const t of timers) clearTimeout(t);
      overlay.remove();
      active = null;
      resolveDone();
    }

    active = { close };
    layout();
    sorted.forEach((e, i) => {
      timers.push(setTimeout(() => appendLine(e), i * MONTAGE_LINE_MS));
    });
    return done;
  }

  return {
    play,
    dismiss() {
      if (active) active.close();
    },
  };
}
