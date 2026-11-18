// "A new pet": choose which. Opened by the tray's New pet and by the memorial card's NEW PET.
//
// Until Step 5 a new pet was always a fish, and the other species could only be reached from the dev
// panel. Now there are four, so getting one asks which. It lists what the registry says is built, so a
// species appears here the day it exists. Positioned inside the habitat's opaque rect, like the feeder
// dialog, so it is always inside a hit region.
//
// Choosing a different species makes main.ts reload the app to mount the other habitat.

import type { Rect, Species } from '../sim/types';
import { implementedSpecies } from '../species';
import type { UiDeps } from './types';
import { button, centerIn, el, relRect, stopDrag } from './dom';
import { CARD_MAX_WIDTH, CARD_MIN_WIDTH } from './feederDialog';

export interface PetPickerHandle {
  open(): void;
  close(): void;
  isOpen(): boolean;
  /**
   * The card's rect while it is open (window-local CSS px), for the click-through window's hit
   * regions. Unlike the feeder dialog it can be taller than a small habitat, and its Cancel is at
   * the bottom.
   */
  getRects(): Rect[];
  destroy(): void;
}

export const PICKER_TITLE = 'A new pet';

/** What each choice is called, and the one line under the title when you point at it. */
export const SPECIES_CHOICES: Readonly<Record<Species, { label: string; about: string }>> = {
  fish: { label: 'FISH', about: 'A goldfish in a bowl.' },
  hamster: { label: 'HAMSTER', about: 'A hamster in a glass tank, with a wheel.' },
  frog: { label: 'FROG', about: 'A frog on a pond. It hunts its own crickets.' },
  chicken: { label: 'CHICKEN', about: 'A chick that grows into a hen and lays eggs.' },
};

/** The line shown before you point at anything: what choosing does to the pet you have. */
export function pickerHint(name: string, alive: boolean): string {
  return alive ? `It takes ${name}'s place.` : 'Which would you like?';
}

export function mountPetPicker(root: HTMLElement, deps: UiDeps): PetPickerHandle {
  const { store, scene } = deps;

  const card = el('div', 'modal pet-picker');
  card.hidden = true;
  stopDrag(card);

  const title = el('h2', '', PICKER_TITLE);
  // Under the buttons, with room for two lines kept whatever it says: it changes as you point at a
  // choice, and a line that grew above the buttons moved them out from under the pointer.
  const hint = el('div', 'line muted hint');
  const choices = el('div', 'row');
  let open = false;

  const restHint = (): void => {
    const pet = store.getState().pet;
    hint.textContent = pickerHint(pet.name, pet.alive);
  };

  for (const species of implementedSpecies()) {
    const c = SPECIES_CHOICES[species];
    const b = button(
      c.label,
      () => {
        close();
        store.getState().actions.newPet(species);
      },
      `pick pick-${species}`,
    );
    b.addEventListener('mouseenter', () => {
      hint.textContent = c.about;
    });
    b.addEventListener('mouseleave', restHint);
    choices.append(b);
  }

  const actionsRow = el('div', 'row');
  actionsRow.append(button('CANCEL', () => close(), 'close'));
  card.append(title, choices, hint, actionsRow);
  root.append(card);

  function layout(): void {
    const hit = scene.habitatHitRect();
    card.style.width = `${Math.max(CARD_MIN_WIDTH, Math.min(CARD_MAX_WIDTH, hit.w - 8))}px`;
    centerIn(card, hit, root);
  }

  function openDialog(): void {
    if (open) return;
    open = true;
    restHint();
    card.hidden = false;
    layout();
    deps.requestHitRegions();
  }

  function close(): void {
    if (!open) return;
    open = false;
    card.hidden = true;
    deps.requestHitRegions();
  }

  return {
    open: openDialog,
    close,
    isOpen: () => open,
    getRects: () => (open ? [relRect(card, root)] : []),
    destroy() {
      card.remove();
    },
  };
}
