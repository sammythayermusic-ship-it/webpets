// Speech bubbles: personality-flavored one-liners above the habitat. Max one every 15 s (one queued),
// silent when dead or muted. Line pools come from src/species/fish/lines.ts (data only).

import type { AppState } from '../app/types';
import { FISH_LINES } from '../species/fish/lines';
import type { SpeechHandle, UiDeps } from './types';
import { el, pickRandom, rootSize } from './dom';
import { labelFor } from './model';

export type SpeechPool = 'idle' | 'fed' | 'hungry' | 'starving' | 'wake';

export interface SpeechHandleExt extends SpeechHandle {
  /** Pick a random line from one of the personality pools (used by main.ts for the 'wake' line after a montage). */
  sayFrom(pool: SpeechPool): void;
  destroy(): void;
}

export const SPEECH_COOLDOWN_MS = 15_000;
const IDLE_MIN_MS = 60_000;
const IDLE_MAX_MS = 180_000;
/** Bubble bottom edge overlaps the habitat's opaque top by this much so it visibly "belongs" to the bowl. */
const BUBBLE_OVERLAP = 8;

function durationFor(line: string): number {
  return Math.min(6000, 2500 + line.length * 60);
}

export function mountSpeech(root: HTMLElement, deps: UiDeps): SpeechHandleExt {
  const { store, scene } = deps;
  const bubble = el('div', 'speech-bubble');
  bubble.hidden = true;
  root.append(bubble);

  let muted = false;
  let lastShownAt = Number.NEGATIVE_INFINITY;
  let queued: string | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function alive(): boolean {
    return store.getState().pet.alive;
  }

  function position(): void {
    const hit = scene.habitatHitRect();
    const size = rootSize(root);
    bubble.style.maxWidth = `${Math.max(64, Math.min(200, size.w - 8))}px`;
    const w = bubble.offsetWidth;
    const h = bubble.offsetHeight;
    let x = Math.round(hit.x + hit.w / 2 - w / 2);
    x = Math.max(0, Math.min(Math.max(0, size.w - w), x));
    let y = Math.round(hit.y + BUBBLE_OVERLAP - h);
    y = Math.max(0, y);
    bubble.style.left = `${x}px`;
    bubble.style.top = `${y}px`;
  }

  function hide(): void {
    bubble.hidden = true;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function show(line: string): void {
    bubble.textContent = line;
    bubble.hidden = false;
    position();
    lastShownAt = Date.now();
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, durationFor(line));
  }

  function flush(): void {
    flushTimer = null;
    const line = queued;
    queued = null;
    if (line) enqueue(line, false);
  }

  function enqueue(line: string, allowQueue: boolean): void {
    if (muted || !alive() || !line) return;
    const wait = lastShownAt + SPEECH_COOLDOWN_MS - Date.now();
    if (wait <= 0) {
      show(line);
      return;
    }
    if (!allowQueue) return;
    queued = line; // at most one queued line; the newest wins
    if (!flushTimer) flushTimer = setTimeout(flush, wait);
  }

  function say(line: string): void {
    enqueue(line, true);
  }

  function pick(pool: SpeechPool): string | null {
    const personality = store.getState().pet.personality;
    const pools = FISH_LINES[personality];
    return pickRandom(pools[pool]);
  }

  function sayFrom(pool: SpeechPool): void {
    const line = pick(pool);
    if (line) enqueue(line, pool !== 'fed');
  }

  function scheduleIdle(): void {
    if (idleTimer) clearTimeout(idleTimer);
    const delay = IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS);
    idleTimer = setTimeout(() => {
      sayFrom('idle');
      scheduleIdle();
    }, delay);
  }

  function setMuted(b: boolean): void {
    muted = b;
    if (b) {
      queued = null;
      hide();
    }
  }

  // Triggers ---------------------------------------------------------------
  const offBite = scene.on('bite', () => sayFrom('fed'));

  let lastPetId = store.getState().pet.id;
  let lastLabel = labelFor(store.getState().hunger);
  const unsub = store.subscribe((s: AppState) => {
    if (s.pet.id !== lastPetId) {
      lastPetId = s.pet.id;
      lastLabel = labelFor(s.hunger);
      queued = null;
      hide();
      return;
    }
    if (!s.pet.alive) {
      queued = null;
      hide();
      return;
    }
    const label = labelFor(s.hunger);
    if (label === lastLabel) return;
    lastLabel = label;
    if (label === 'hungry') sayFrom('hungry');
    else if (label === 'starving') sayFrom('starving');
  });

  scheduleIdle();

  return {
    say,
    sayFrom,
    setMuted,
    destroy() {
      offBite();
      unsub();
      if (idleTimer) clearTimeout(idleTimer);
      if (flushTimer) clearTimeout(flushTimer);
      hide();
      bubble.remove();
    },
  };
}
