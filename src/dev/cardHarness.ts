// Verification only: lets the harness (docs/HARNESS.md, op `cardDo`) act on the "Get to know me" card
// in its own window, for recordings. Compiled in only by `npm run build:harness`, like ./harness.ts.
// Each action does what a person would: types a name a letter at a time, picks from the selects,
// presses the chips and buttons.

import { listen } from '@tauri-apps/api/event';

const TYPE_MS = 90;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function typeInto(field: HTMLInputElement, text: string): Promise<void> {
  field.focus();
  field.value = '';
  for (const ch of text) {
    field.value += ch;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(TYPE_MS);
  }
}

function q<T extends Element>(root: ParentNode, sel: string): T {
  const e = root.querySelector<T>(sel);
  if (!e) throw new Error(`card: ${sel} not found`);
  return e;
}

function choose(sel: HTMLSelectElement, value: string): void {
  sel.value = value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

async function act(root: HTMLElement, action: string, value: string): Promise<void> {
  switch (action) {
    case 'name': {
      const f = q<HTMLInputElement>(root, '#gtk-name');
      await typeInto(f, value);
      f.dispatchEvent(new Event('change', { bubbles: true }));
      f.blur();
      return;
    }
    case 'league':
      choose(q<HTMLSelectElement>(root, 'select[aria-label="League"]'), value);
      return;
    case 'team':
      choose(q<HTMLSelectElement>(root, 'select[aria-label="Team"]'), value);
      await sleep(300);
      q<HTMLButtonElement>(root, '.gtk-teams .gtk-add').click();
      return;
    case 'interest': {
      const chip = [...root.querySelectorAll<HTMLButtonElement>('.gtk-likes .gtk-chip')].find((c) => c.textContent === value);
      if (!chip) throw new Error(`card: no chip "${value}"`);
      chip.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      await sleep(250);
      chip.click();
      return;
    }
    case 'own': {
      const f = q<HTMLInputElement>(root, '.gtk-likes .gtk-input');
      f.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      await typeInto(f, value);
      q<HTMLButtonElement>(root, '.gtk-likes .gtk-add').click();
      return;
    }
    case 'scroll':
      document.scrollingElement?.scrollTo({ top: Number(value) || 0, behavior: 'smooth' });
      return;
    case 'forget':
      q<HTMLButtonElement>(root, '.gtk-forget').click();
      return;
    case 'done':
      q<HTMLButtonElement>(root, '.gtk-done').click();
      return;
    default:
      throw new Error(`card: unknown action ${action}`);
  }
}

export function installCardHarness(root: HTMLElement): void {
  void listen<{ action: string; value: string }>('harness-card', (e) => {
    act(root, e.payload.action, e.payload.value).catch((err: unknown) => console.error('[card-harness]', err));
  });
}
