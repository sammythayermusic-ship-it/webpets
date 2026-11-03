// The "Get to know me" card (AFTER-BAKEOFF Step E.1): what to call you, the teams you follow (pick a
// league, then the team), the things you like as tap-to-pick chips plus your own words, and what
// happens to all of it (it stays on this Mac; "Forget me" clears it). Opened from the tray and once on
// the first launch. In the app it is its own window (card.html, src/card.ts); in the browser it is an
// overlay on the page. Every change saves at once; the pet hears about it (src/app/profile.ts).

import {
  MAX_INTERESTS,
  MAX_OWN,
  MAX_TEAMS,
  cleanName,
  withInterest,
  withName,
  withOwn,
  withTeam,
  withoutInterest,
  withoutOwn,
  withoutTeam,
  type Profile,
} from '../brain/profile';
import type { Interest } from '../brain/interests';
import type { League, Team } from '../brain/teams';
import type { ProfileStore } from '../app/profile';
import { button, el } from './dom';
import './card.css';

export interface CardDeps {
  profile: ProfileStore;
  leagues: readonly League[];
  teams: readonly Team[];
  interests: readonly Interest[];
  /** The pet's name, and how close you are in words ("good friends"), when known. */
  petName(): string;
  bondWord(): string | null;
  /** "Forget me" was confirmed: the profile is already empty; this clears what the pet remembers of chats. */
  onForget(): void;
  onDone(): void;
  now?: () => number;
}

export interface CardHandle {
  /** Redraw from the profile and the pet (after a change made elsewhere). */
  refresh(): void;
  destroy(): void;
}

export const CARD_TITLE = 'Get to know me';
export const PRIVACY_NOTE =
  'Everything here stays on this Mac. If you add an Anthropic key, Claude writes some of the lines, and it is told only your name and the one thing that line is about.';

export function mountCard(root: HTMLElement, deps: CardDeps): CardHandle {
  const now = deps.now ?? Date.now;
  const card = el('div', 'gtk-card');
  root.append(card);

  const get = (): Profile => deps.profile.get();
  const save = (p: Profile): void => {
    if (p !== get()) deps.profile.set(p);
  };

  // ----- header -----
  const title = el('h1', 'gtk-title', CARD_TITLE);
  const subtitle = el('p', 'gtk-sub');
  card.append(title, subtitle);

  // ----- your name -----
  const nameSec = section('gtk-name');
  const nameLabel = el('label', 'gtk-label');
  const nameField = el('input', 'gtk-input');
  nameField.type = 'text';
  nameField.maxLength = 24;
  nameField.placeholder = 'Your name';
  nameField.autocomplete = 'off';
  nameField.id = 'gtk-name';
  nameLabel.htmlFor = 'gtk-name';
  const nameHint = el('p', 'gtk-hint');
  nameSec.append(nameLabel, nameField, nameHint);
  const commitName = (): void => {
    const raw = nameField.value.trim();
    if (raw === '') {
      if (get().name !== null) save(withName(get(), null, now()));
      nameHint.textContent = '';
      return;
    }
    const name = cleanName(raw);
    if (name === null) {
      nameHint.textContent = 'Letters only, please, up to 24.';
      return;
    }
    save(withName(get(), name, now()));
    nameField.value = name;
    nameHint.textContent = 'Saved.';
  };
  nameField.addEventListener('change', commitName);
  nameField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitName();
      nameField.blur();
    }
  });

  // ----- teams -----
  const teamSec = section('gtk-teams', 'Teams you follow');
  const teamRow = el('div', 'gtk-row');
  const leagueSel = el('select', 'gtk-select');
  leagueSel.setAttribute('aria-label', 'League');
  const teamSel = el('select', 'gtk-select');
  teamSel.setAttribute('aria-label', 'Team');
  const addTeam = button('Add', () => {
    const id = teamSel.value;
    if (id) save(withTeam(get(), id, now()));
  }, 'gtk-add');
  teamRow.append(leagueSel, teamSel, addTeam);
  const teamChips = el('div', 'gtk-chips gtk-mine');
  teamSec.append(teamRow, teamChips);
  leagueSel.append(new Option('League…', ''));
  for (const l of deps.leagues) leagueSel.append(new Option(l.short, l.id));
  const fillTeams = (): void => {
    teamSel.replaceChildren(new Option(leagueSel.value ? 'Team…' : 'Pick a league first', ''));
    for (const t of deps.teams.filter((x) => x.league === leagueSel.value)) teamSel.append(new Option(t.display, t.id));
    teamSel.disabled = leagueSel.value === '';
    addTeam.disabled = true;
  };
  leagueSel.addEventListener('change', fillTeams);
  teamSel.addEventListener('change', () => (addTeam.disabled = teamSel.value === '' || get().teams.length >= MAX_TEAMS));
  fillTeams();

  // ----- things you like -----
  const likeSec = section('gtk-likes', 'Things you like');
  const likeChips = el('div', 'gtk-chips');
  const ownRow = el('div', 'gtk-row');
  const ownField = el('input', 'gtk-input');
  ownField.type = 'text';
  ownField.maxLength = 24;
  ownField.placeholder = 'Something else?';
  ownField.autocomplete = 'off';
  const addOwn = button('Add', () => {
    const next = withOwn(get(), ownField.value, now());
    if (next !== get()) {
      save(next);
      ownField.value = '';
    }
  }, 'gtk-add');
  ownField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addOwn.click();
    }
  });
  ownRow.append(ownField, addOwn);
  const ownChips = el('div', 'gtk-chips gtk-mine');
  likeSec.append(likeChips, ownRow, ownChips);
  const interestChips = new Map<string, HTMLButtonElement>();
  for (const it of deps.interests) {
    const chip = button(it.label, () => {
      const p = get();
      save(p.interests.includes(it.id) ? withoutInterest(p, it.id, now()) : withInterest(p, it.id, now()));
    }, 'gtk-chip');
    chip.setAttribute('aria-pressed', 'false');
    interestChips.set(it.id, chip);
    likeChips.append(chip);
  }

  // ----- privacy -----
  const privSec = section('gtk-privacy', 'What happens to this');
  const privNote = el('p', 'gtk-note', PRIVACY_NOTE);
  const forgetRow = el('div', 'gtk-row');
  const forgetBtn = button('Forget me', () => {
    forgetRow.hidden = true;
    confirmRow.hidden = false;
  }, 'gtk-forget');
  forgetRow.append(forgetBtn);
  const confirmRow = el('div', 'gtk-row gtk-confirm');
  confirmRow.hidden = true;
  const confirmText = el('p', 'gtk-note');
  const yesForget = button('Forget', () => {
    deps.profile.forget();
    deps.onForget();
    confirmRow.hidden = true;
    forgetRow.hidden = false;
    nameField.value = '';
    nameHint.textContent = 'Forgotten.';
  }, 'gtk-forget');
  const keep = button('Keep it', () => {
    confirmRow.hidden = true;
    forgetRow.hidden = false;
  }, 'gtk-add');
  confirmRow.append(confirmText, yesForget, keep);
  privSec.append(privNote, forgetRow, confirmRow);

  // ----- done -----
  const footer = el('div', 'gtk-footer');
  footer.append(button('Done', () => deps.onDone(), 'gtk-done'));
  card.append(footer);

  function section(cls: string, heading?: string): HTMLElement {
    const s = el('section', `gtk-section ${cls}`);
    if (heading !== undefined) s.append(el('h2', 'gtk-h2', heading));
    card.append(s);
    return s;
  }

  function chip(label: string, onRemove: () => void, color?: string): HTMLElement {
    const c = el('span', 'gtk-chip gtk-on');
    if (color) {
      const dot = el('span', 'gtk-dot');
      dot.style.background = color;
      c.append(dot);
    }
    c.append(document.createTextNode(label));
    const x = button('×', onRemove, 'gtk-x');
    x.setAttribute('aria-label', `Remove ${label}`);
    c.append(x);
    return c;
  }

  function render(): void {
    const p = get();
    const pet = deps.petName();
    const bond = deps.bondWord();
    subtitle.textContent = bond ? `${pet} and you: ${bond}.` : `So ${pet} knows who you are.`;
    nameLabel.textContent = `What should ${pet} call you?`;
    if (document.activeElement !== nameField) nameField.value = p.name ?? '';
    teamChips.replaceChildren(
      ...p.teams.map((id) => {
        const t = deps.teams.find((x) => x.id === id);
        return chip(t?.display ?? id, () => save(withoutTeam(get(), id, now())), t?.color);
      }),
    );
    addTeam.disabled = teamSel.value === '' || p.teams.length >= MAX_TEAMS;
    for (const [id, c] of interestChips) {
      const on = p.interests.includes(id);
      c.classList.toggle('gtk-on', on);
      c.setAttribute('aria-pressed', String(on));
      c.disabled = !on && p.interests.length >= MAX_INTERESTS;
    }
    ownChips.replaceChildren(...p.own.map((s) => chip(s, () => save(withoutOwn(get(), s, now())))));
    addOwn.disabled = p.own.length >= MAX_OWN;
    ownField.disabled = p.own.length >= MAX_OWN;
    confirmText.textContent = `This clears your name, your teams, the things you like and what you have told ${pet}. ${pet} still knows you as a friend.`;
  }

  const unsub = deps.profile.subscribe(render);
  render();

  return {
    refresh: render,
    destroy() {
      unsub();
      card.remove();
    },
  };
}
