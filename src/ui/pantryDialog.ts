// Pantry dialog: balance, pantry, amount input, Deposit, Withdraw all, Close.
// Positioned inside the habitat's opaque rect so it is always inside a hit region (no extra regions needed).

import type { AppState } from '../app/types';
import type { UiDeps } from './types';
import { button, centerIn, el, stopDrag } from './dom';
import { pantryDays } from './model';

export interface PantryDialogHandle {
  open(): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

const DEFAULT_AMOUNT = 100;

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
 * rather than a measurement. It only supports the "fits on one line" check below; nothing lays out
 * against it, and `.modal .line` wraps regardless, so being wrong here is cosmetic rather than broken.
 */
export const MODAL_GLYPH_MAX_PX = 7;

/** Kept short enough to fit CARD_MAX_INNER_WIDTH on one line at M/L; wraps to two lines at S (`.modal .line`). */
export const PANTRY_HINT = 'Auto-feeds 25 at hunger 30';

export function mountPantryDialog(root: HTMLElement, deps: UiDeps): PantryDialogHandle {
  const { store, scene } = deps;

  const card = el('div', 'modal pantry-dialog');
  card.hidden = true;
  stopDrag(card);

  const title = el('h2', '', 'Pantry');
  const balanceLine = el('div', 'line');
  const pantryLine = el('div', 'line');
  const hint = el('div', 'line muted', PANTRY_HINT);

  const amountRow = el('div', 'row');
  const amountLabel = el('span', '', 'AMOUNT');
  const amount = el('input');
  amount.type = 'number';
  amount.min = '0';
  amount.step = '25';
  amount.value = String(DEFAULT_AMOUNT);
  const depositBtn = button(
    'DEPOSIT',
    () => {
      const n = Math.floor(Number(amount.value));
      if (!Number.isFinite(n) || n <= 0) return;
      store.getState().actions.depositPantry(n);
    },
    'deposit',
  );
  amountRow.append(amountLabel, amount, depositBtn);

  const actionsRow = el('div', 'row');
  const withdrawBtn = button(
    'WITHDRAW ALL',
    () => {
      store.getState().actions.withdrawPantry();
    },
    'withdraw',
  );
  const closeBtn = button('CLOSE', () => close(), 'close');
  actionsRow.append(withdrawBtn, closeBtn);

  card.append(title, balanceLine, pantryLine, hint, amountRow, actionsRow);
  root.append(card);

  let open = false;

  function render(s: AppState): void {
    const pet = s.pet;
    balanceLine.textContent = `BALANCE ${s.balance} $FEED`;
    pantryLine.textContent = `PANTRY ${pet.pantry} $FEED · ${Math.floor(pantryDays(pet.pantry))} DAYS`;
    depositBtn.disabled = !pet.alive || s.balance <= 0;
    withdrawBtn.disabled = pet.pantry <= 0;
    const n = Math.floor(Number(amount.value));
    if (n > s.balance) amount.value = String(Math.max(0, s.balance));
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
