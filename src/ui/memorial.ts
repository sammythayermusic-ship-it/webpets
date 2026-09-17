// Memorial card (DOM only; the habitat art for dead/memorial phases is drawn by render).
// Shows name, id, age, meals, born/died dates, "New pet" and "Close" (which acknowledges the death so the
// scene switches from the belly-up fish to the memorial bowl). Self-driven from the store; setDead() is
// also exposed for main.ts and is idempotent.

import type { AppState } from '../app/types';
import type { PetState } from '../sim/types';
import type { UiDeps } from './types';
import { button, centerIn, el, stopDrag } from './dom';
import { formatAge, formatDate } from './format';

export interface MemorialHandle {
  setDead(pet: PetState | null): void;
  destroy(): void;
}

export function mountMemorial(root: HTMLElement, deps: UiDeps): MemorialHandle {
  const { store, scene } = deps;

  const card = el('div', 'modal memorial-card');
  card.hidden = true;
  stopDrag(card);

  const rip = el('h2', 'rip', 'In memory of');
  const nameLine = el('div', 'big');
  const idLine = el('div', 'line muted');
  const ageLine = el('div', 'line');
  const mealsLine = el('div', 'line');
  const bornLine = el('div', 'line');
  const diedLine = el('div', 'line');
  const row = el('div', 'row');
  const newPetBtn = button(
    'NEW PET',
    () => {
      store.getState().actions.newPet();
    },
    'new-pet',
  );
  const closeBtn = button(
    'CLOSE',
    () => {
      store.getState().actions.acknowledgeDeath();
    },
    'close',
  );
  row.append(newPetBtn, closeBtn);
  card.append(rip, nameLine, idLine, ageLine, mealsLine, bornLine, diedLine, row);
  root.append(card);

  let shownFor: string | null = null;

  function layout(): void {
    const hit = scene.habitatHitRect();
    card.style.width = `${Math.max(120, Math.min(240, hit.w - 8))}px`;
    centerIn(card, hit, root);
  }

  function setDead(pet: PetState | null): void {
    if (!pet || pet.alive) {
      shownFor = null;
      card.hidden = true;
      return;
    }
    const diedAt = pet.diedAt ?? store.getState().actions.now();
    nameLine.textContent = pet.name;
    idLine.textContent = `${pet.id} · ${pet.rarity} ${pet.species}`;
    ageLine.textContent = `AGE ${formatAge(diedAt - pet.bornAt)}`;
    mealsLine.textContent = `MEALS ${pet.meals}`;
    bornLine.textContent = `BORN ${formatDate(pet.bornAt)}`;
    diedLine.textContent = `DIED ${formatDate(diedAt)}`;
    shownFor = pet.id;
    card.hidden = false;
    layout();
  }

  function sync(s: AppState): void {
    const pet = s.pet;
    const shouldShow = !pet.alive && s.latches.deathAcknowledgedFor !== pet.id;
    if (shouldShow) {
      if (shownFor !== pet.id) setDead(pet);
      else layout();
    } else if (shownFor !== null) {
      setDead(null);
    }
  }

  const unsub = store.subscribe(sync);
  sync(store.getState());

  return {
    setDead,
    destroy() {
      unsub();
      card.remove();
    },
  };
}
