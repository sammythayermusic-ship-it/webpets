// Typing to the pet (AFTER-BAKEOFF Step E.2): click the pet (or TALK on the bar) and a small field
// opens at the bottom of the habitat. Enter sends, and the pet answers in its bubble; Esc, a minute of
// nothing, or clicking away closes it. The window takes the keyboard only while the field is open
// (platform.window.beginTyping) and hands it back to the app you were in when it closes.

import type { Rect } from '../render/types';
import type { UiDeps } from './types';
import { el, rootSize, stopDrag } from './dom';

export interface ChatInputHandle {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** The field takes the mouse while it is open. */
  getRects(): Rect[];
  relayout(): void;
  destroy(): void;
}

/** Longest message accepted, in characters. */
export const CHAT_MAX_CHARS = 200;
/** Closes after this long with nothing typed. */
const IDLE_CLOSE_MS = 60_000;
const FIELD_MAX_W = 260;
const BOTTOM_INSET = 10;

export function mountChatInput(root: HTMLElement, deps: UiDeps, onSay: (text: string) => void): ChatInputHandle {
  const { store, scene, platform } = deps;
  const form = el('form', 'chat-input');
  form.hidden = true;
  stopDrag(form);
  const field = el('input', 'chat-field');
  field.type = 'text';
  field.maxLength = CHAT_MAX_CHARS;
  field.autocomplete = 'off';
  field.spellcheck = true;
  field.setAttribute('aria-label', 'Say something to your pet');
  const send = el('button', 'chat-send', 'SEND');
  send.type = 'submit';
  form.append(field, send);
  root.append(form);

  let open = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  function armIdle(): void {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => close(), IDLE_CLOSE_MS);
  }

  function position(): void {
    const hit = scene.habitatHitRect();
    const size = rootSize(root);
    const w = Math.max(120, Math.min(FIELD_MAX_W, hit.w - 16, size.w - 8));
    form.style.width = `${Math.round(w)}px`;
    const h = form.offsetHeight;
    form.style.left = `${Math.round(hit.x + hit.w / 2 - w / 2)}px`;
    form.style.top = `${Math.round(hit.y + hit.h - h - BOTTOM_INSET)}px`;
  }

  function openField(): void {
    if (open) {
      field.focus();
      return;
    }
    open = true;
    field.placeholder = 'Say something…';
    form.hidden = false;
    position();
    deps.requestHitRegions();
    armIdle();
    field.focus();
    // The window only gets the keyboard once the app is active; focus again once it is.
    platform.window
      .beginTyping()
      .then(() => {
        if (open) field.focus();
      })
      .catch((e: unknown) => console.warn('[chat] beginTyping failed', e));
  }

  function close(): void {
    if (!open) return;
    open = false;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    field.value = '';
    field.blur();
    form.hidden = true;
    deps.requestHitRegions();
    platform.window.endTyping().catch((e: unknown) => console.warn('[chat] endTyping failed', e));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = field.value.trim();
    field.value = '';
    armIdle();
    if (text.length > 0) onSay(text.slice(0, CHAT_MAX_CHARS));
  });
  field.addEventListener('input', armIdle);
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });
  // Clicking into another app takes the keyboard away: the conversation is over.
  const onBlur = (): void => {
    if (open) close();
  };
  window.addEventListener('blur', onBlur);
  const unsub = store.subscribe((s, prev) => {
    if (open && (!s.pet.alive || s.pet.id !== prev.pet.id)) close();
  });

  return {
    open: openField,
    close,
    isOpen: () => open,
    getRects() {
      if (!open) return [];
      return [{ x: form.offsetLeft, y: form.offsetTop, w: form.offsetWidth, h: form.offsetHeight }];
    },
    relayout() {
      if (open) position();
    },
    destroy() {
      close();
      window.removeEventListener('blur', onBlur);
      unsub();
      form.remove();
    },
  };
}
