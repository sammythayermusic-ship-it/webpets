// Talking with the pet (AFTER-BAKEOFF Step E.2): what it does with what you typed. It asks before it
// keeps anything ("You're a Red Sox fan? Want me to keep an eye on them?"), asks which when a team
// name is shared, puts how you feel before filing things away, and otherwise answers in kind.
// Pure: the reply is a kind of line (or "a fact"); the caller picks the words, from the pet's voice
// or, with a key, from Claude.

import { MAX_INTERESTS, MAX_TEAMS, withInterest, withName, withTeam, type Profile } from './profile';
import type { Known, Understood } from './understand';
import { normalizeText } from './understand';
import type { ChatIntent, Choice, TeachMoment } from './types';

/** A question the pet asked you and is waiting on. */
export type Pending =
  | { kind: 'save-interest'; id: string }
  | { kind: 'save-team'; id: string }
  | { kind: 'pick-team'; ids: readonly string[] }
  | { kind: 'save-name'; name: string };

export interface Exchange {
  you: string;
  pet: string;
}

export interface ChatState {
  pending: Pending | null;
  /** The last few exchanges, newest last: context for a written reply. "Forget me" clears them. */
  recent: readonly Exchange[];
  /** How you said you felt, and when; the pet asks about it the next time it sees you. */
  mood: { mood: 'sad' | 'tired'; at: number } | null;
  /** How many times you have brought up each interest: what inside jokes are made of. */
  mentions: Readonly<Record<string, number>>;
}

export type Say =
  | { kind: 'teach'; moment: TeachMoment; vars: Record<string, string>; choices?: Choice[] }
  | { kind: 'chat'; intent: ChatIntent }
  | { kind: 'fact' };

export const RECENT_EXCHANGES = 4;
const EXCHANGE_MAX = 200;
/** Ask how you are only after this long, and not once it is old news. */
const MOOD_ASK_AFTER_MS = 4 * 3_600_000;
const MOOD_ASK_UNTIL_MS = 3 * 24 * 3_600_000;
const MAX_TEAM_CHOICES = 4;

const YES_NO: Choice[] = [
  { label: 'Yes', value: 'yes' },
  { label: 'No thanks', value: 'no' },
];

export function emptyChat(): ChatState {
  return { pending: null, recent: [], mood: null, mentions: {} };
}

export function withExchange(s: ChatState, you: string, pet: string): ChatState {
  const recent = [...s.recent, { you: you.slice(0, EXCHANGE_MAX), pet: pet.slice(0, EXCHANGE_MAX) }];
  return { ...s, recent: recent.slice(Math.max(0, recent.length - RECENT_EXCHANGES)) };
}

/** You said you were sad or tired a while ago (not just now, not days ago): ask if today is better. */
export function moodToAsk(s: ChatState, now: number): boolean {
  if (s.mood === null) return false;
  const age = now - s.mood.at;
  return age >= MOOD_ASK_AFTER_MS && age <= MOOD_ASK_UNTIL_MS;
}

export function clearMood(s: ChatState): ChatState {
  return s.mood === null ? s : { ...s, mood: null };
}

interface Result {
  say: Say;
  state: ChatState;
  profile: Profile;
  /** You told the pet something it kept: the bond grows a little more than for chatter. */
  told: boolean;
}

function teach(moment: TeachMoment, vars: Record<string, string> = {}, choices?: Choice[]): Say {
  return choices ? { kind: 'teach', moment, vars, choices } : { kind: 'teach', moment, vars };
}

/** Which of `ids` you meant, from a button or from words that name just one of them. */
function pickedTeam(ids: readonly string[], choice: string | null, text: string, known: Known): string | null {
  if (choice !== null && ids.includes(choice)) return choice;
  const said = ` ${normalizeText(text)} `;
  const named = ids.filter((id) => {
    const t = known.teams.find((k) => k.id === id);
    if (!t) return false;
    return [t.location, t.display, t.abbr].some((w) => said.includes(` ${normalizeText(w)} `));
  });
  return named.length === 1 ? named[0]! : null;
}

export function converse(
  state: ChatState,
  u: Understood,
  choice: string | null,
  profile: Profile,
  known: Known,
  now: number,
  text = '',
): Result {
  let s: ChatState = { ...state, pending: null };
  let p = profile;
  const answer = choice === 'yes' || choice === 'no' ? choice : u.answer;
  const nickname = (id: string): string => known.teams.find((t) => t.id === id)?.nickname ?? id;
  const label = (id: string): string => known.interests.find((i) => i.id === id)?.label ?? id;

  // 1. A question it asked: a yes, a no, or the team you meant. Anything else and it moves on.
  const q = state.pending;
  if (q !== null) {
    if (q.kind === 'pick-team') {
      const id = pickedTeam(q.ids, choice, text, known);
      if (id !== null) {
        p = withTeam(p, id, now);
        return { say: teach('saved-team', { team: nickname(id) }), state: s, profile: p, told: true };
      }
      if (answer === 'no') return { say: teach('declined'), state: s, profile: p, told: false };
    } else if (answer === 'yes') {
      if (q.kind === 'save-interest') {
        p = withInterest(p, q.id, now);
        return { say: teach('saved-interest', { interest: label(q.id) }), state: s, profile: p, told: true };
      }
      if (q.kind === 'save-team') {
        p = withTeam(p, q.id, now);
        return { say: teach('saved-team', { team: nickname(q.id) }), state: s, profile: p, told: true };
      }
      p = withName(p, q.name, now);
      return { say: teach('saved-name', { you: p.name ?? q.name }), state: s, profile: p, told: true };
    } else if (answer === 'no') {
      return { say: teach('declined'), state: s, profile: p, told: false };
    }
  }

  // 2. How you feel comes first.
  if (u.mood === 'sad' || u.mood === 'tired') {
    s = { ...s, mood: { mood: u.mood, at: now } };
    return { say: { kind: 'chat', intent: u.mood }, state: s, profile: p, told: false };
  }
  if (u.mood === 'happy') s = clearMood(s);

  if (u.interests.length > 0) {
    const mentions = { ...s.mentions };
    for (const id of u.interests) mentions[id] = (mentions[id] ?? 0) + 1;
    s = { ...s, mentions };
  }

  // 3. Your name.
  if (u.name !== null) {
    if (p.name === u.name) return { say: teach('already-know', { thing: u.name }), state: s, profile: p, told: false };
    s = { ...s, pending: { kind: 'save-name', name: u.name } };
    return { say: teach('ask-name', { you: u.name }, YES_NO), state: s, profile: p, told: false };
  }

  // 4. A team.
  const mention = u.teams[0];
  if (mention !== undefined) {
    const fresh = mention.ids.filter((id) => !p.teams.includes(id));
    if (fresh.length === 0 && u.intent === 'unknown') {
      return { say: teach('already-know', { thing: nickname(mention.ids[0]!) }), state: s, profile: p, told: false };
    }
    if (fresh.length > 0 && p.teams.length < MAX_TEAMS) {
      if (mention.ids.length > 1) {
        const ids = mention.ids.slice(0, MAX_TEAM_CHOICES);
        const choices = ids.map((id) => ({ label: known.teams.find((t) => t.id === id)?.display ?? id, value: id }));
        s = { ...s, pending: { kind: 'pick-team', ids } };
        return { say: teach('which-team', {}, [...choices, { label: 'Neither', value: 'no' }]), state: s, profile: p, told: false };
      }
      s = { ...s, pending: { kind: 'save-team', id: fresh[0]! } };
      return { say: teach('ask-team', { team: nickname(fresh[0]!) }, YES_NO), state: s, profile: p, told: false };
    }
  }

  // 5. Something you like.
  const interest = u.interests[0];
  if (interest !== undefined) {
    if (p.interests.includes(interest)) {
      if (u.intent === 'unknown') return { say: teach('already-know', { thing: label(interest) }), state: s, profile: p, told: false };
    } else if (u.liking && p.interests.length < MAX_INTERESTS) {
      s = { ...s, pending: { kind: 'save-interest', id: interest } };
      return { say: teach('ask-interest', { interest: label(interest) }, YES_NO), state: s, profile: p, told: false };
    }
  }

  // 6. Everything else, in kind.
  return { say: u.intent === 'fact' ? { kind: 'fact' } : { kind: 'chat', intent: u.intent }, state: s, profile: p, told: false };
}

/** Parse saved chat state; anything malformed starts fresh. */
export function normalizeChat(v: unknown): ChatState {
  if (typeof v !== 'object' || v === null) return emptyChat();
  const o = v as Record<string, unknown>;
  const recent: Exchange[] = [];
  if (Array.isArray(o['recent'])) {
    for (const e of o['recent']) {
      if (typeof e === 'object' && e !== null && typeof (e as Exchange).you === 'string' && typeof (e as Exchange).pet === 'string') {
        recent.push({ you: (e as Exchange).you.slice(0, EXCHANGE_MAX), pet: (e as Exchange).pet.slice(0, EXCHANGE_MAX) });
      }
    }
  }
  const m = o['mood'] as { mood?: unknown; at?: unknown } | null | undefined;
  const feeling: 'sad' | 'tired' | null = m?.mood === 'sad' ? 'sad' : m?.mood === 'tired' ? 'tired' : null;
  const mood = feeling !== null && typeof m?.at === 'number' ? { mood: feeling, at: m.at } : null;
  const mentions: Record<string, number> = {};
  if (typeof o['mentions'] === 'object' && o['mentions'] !== null) {
    for (const [k, n] of Object.entries(o['mentions'] as Record<string, unknown>)) if (typeof n === 'number' && n > 0) mentions[k] = Math.floor(n);
  }
  // A question left hanging across a restart is not worth answering.
  return { pending: null, recent: recent.slice(-RECENT_EXCHANGES), mood, mentions };
}
