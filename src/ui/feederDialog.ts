// Holiday feeder dialog: how many days of food the feeder holds, a free FILL IT UP, one plain line, Close.
// The feeder is `pet.pantry` in code. Food is free; the feeder only matters while nobody is around to feed.
// Positioned inside the habitat's opaque rect so it is always inside a hit region (no extra regions needed).

import type { AppState } from '../app/types';
import { PANTRY_CAPACITY } from '../sim/constants';
import type { UiDeps } from './types';
import { button, centerIn, el, stopDrag } from './dom';
import { pantryDays, pantryMeals } from './model';

export interface FeederDialogHandle {
  open(): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

/** Card width: min(CARD_MAX_WIDTH, habitat hit width - 8), never below CARD_MIN_WIDTH; box-sizing border-box. */
export const CARD_MIN_WIDTH = 120;
export const CARD_MAX_WIDTH = 240;
/** Widest possible text row: CARD_MAX_WIDTH minus the 14 px horizontal padding of `.modal`, no border. */
export const CARD_MAX_INNER_WIDTH = CARD_MAX_WIDTH - 2 * 14;
/**
 * Generous UPPER BOUND on one glyph's advance in the modal's 11 px system face — not an exact figure.
 *
 * It used to be exact: Press Start 2P is a bitmap face that advances exactly 1 em per glyph, so a line's
 * width was its character count times the font size. The chrome now uses a proportional typeface, where
 * no such arithmetic exists, so this is a bound chosen to sit well above the widest mixed-case glyph
 * rather than a measurement. It only supports the "fits on one line" check in the test; nothing lays out
 * against it, and `.modal .line` wraps regardless, so being wrong here is cosmetic rather than broken.
 */
export const MODAL_GLYPH_MAX_PX = 7;

export const FEEDER_TITLE = 'Holiday feeder';
export const FILL_LABEL = 'FILL IT UP';

/** The one plain line under the figure. Wraps at S and with long names (`.modal .line`). */
export function feederHint(name: string): string {
  return `It feeds ${name} while you're away.`;
}

/** The figure: `3 DAYS OF FOOD`, under a day `1 MEAL LEFT`, and `EMPTY` when not even a meal is in it. */
export function feederAmountText(pantry: number): string {
  const meals = pantryMeals(pantry);
  if (meals === 0) return 'EMPTY';
  const days = Math.floor(pantryDays(pantry));
  if (days === 0) return `${meals} ${meals === 1 ? 'MEAL' : 'MEALS'} LEFT`;
  return `${days} ${days === 1 ? 'DAY' : 'DAYS'} OF FOOD`;
}

export function mountFeederDialog(root: HTMLElement, deps: UiDeps): FeederDialogHandle {
  const { store, scene } = deps;

  const card = el('div', 'modal feeder-dialog');
  card.hidden = true;
  stopDrag(card);

  const title = el('h2', '', FEEDER_TITLE);
  const amountLine = el('div', 'line big');
  const hint = el('div', 'line muted');

  const actionsRow = el('div', 'row');
  const fillBtn = button(
    FILL_LABEL,
    () => {
      store.getState().actions.fillPantry();
    },
    'fill',
  );
  const closeBtn = button('CLOSE', () => close(), 'close');
  actionsRow.append(fillBtn, closeBtn);

  card.append(title, amountLine, hint, actionsRow);
  root.append(card);

  let open = false;

  function render(s: AppState): void {
    const pet = s.pet;
    amountLine.textContent = feederAmountText(pet.pantry);
    hint.textContent = feederHint(pet.name);
    const full = pet.pantry >= PANTRY_CAPACITY;
    fillBtn.disabled = !pet.alive || full;
    fillBtn.title = !pet.alive ? `${pet.name} has died` : full ? 'The feeder is full' : 'Free';
  }

  function layout(): void {
    const hit = scene.habitatHitRect();
    card.style.width = `${Math.max(CARD_MIN_WIDTH, Math.min(CARD_MAX_WIDTH, hit.w - 8))}px`;
    centerIn(card, hit, root);
  }

  function openDialog(): void {
    if (open) return;
    open = true;
    render(store.getState());
    card.hidden = false;
    layout();
  }

  function close(): void {
    if (!open) return;
    open = false;
    card.hidden = true;
  }

  const unsub = store.subscribe((s) => {
    if (open) {
      render(s);
      layout();
    }
  });

  return {
    open: openDialog,
    close,
    isOpen: () => open,
    destroy() {
      unsub();
      card.remove();
    },
  };
}
