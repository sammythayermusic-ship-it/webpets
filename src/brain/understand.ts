// What you typed to the pet, as far as it can tell on its own (AFTER-BAKEOFF Step E.2): the kind of
// thing you said, a yes or a no, your name if you gave it, the teams and things you like that you
// mentioned, and how you are feeling. Plain phrase matching, no network: it works offline, and
// nothing you type leaves the Mac to be understood. Claude, when there is a key, only writes replies.
// Pure.

import { cleanName } from './profile';
import type { Interest } from './interests';
import type { Team } from './teams';
import type { ChatIntent } from './types';

export interface Known {
  teams: readonly Team[];
  interests: readonly Interest[];
}

export interface TeamMention {
  /** The words that named it, as typed (lower case). */
  said: string;
  /** Every team those words could mean; more than one, and the pet asks which. */
  ids: string[];
}

export type Mood = 'sad' | 'happy' | 'tired';

export interface Understood {
  intent: ChatIntent | 'fact';
  /** A short answer to a question the pet asked. */
  answer: 'yes' | 'no' | null;
  name: string | null;
  /** Interest ids, in the order mentioned. */
  interests: string[];
  teams: TeamMention[];
  mood: Mood | null;
}

const P = {
  fact: ['fact', 'facts', 'teach me something', 'tell me something cool', 'tell me something interesting'],
  joke: ['joke', 'jokes', 'make me laugh', 'something funny', 'funny story'],
  'name-ask': ["what's your name", 'whats your name', 'what is your name', 'who are you', 'your name'],
  'how-are-you': [
    'how are you', 'how r u', 'how are u', "how're you", "how's it going", 'hows it going', 'how is it going',
    'how are things', 'how you doing', 'how do you feel', 'you ok', 'you okay', 'are you ok', 'are you okay',
    'you good', "how's your day", 'hows your day', 'how was your day',
  ],
  'what-doing': [
    'what are you doing', 'what you doing', 'whatcha doing', 'what r u doing', 'what are u doing',
    'what are you up to', "what's up", 'whats up', 'wyd',
  ],
  sad: [
    "i'm sad", 'im sad', 'i am sad', 'feel sad', 'feeling sad', 'so sad', 'bad day', 'rough day', 'awful day',
    'terrible day', 'worst day', 'not good', 'not great', "i'm upset", 'im upset', 'i am upset', "i'm lonely",
    'im lonely', 'i am lonely', "i'm not okay", "i'm not ok", 'im not ok', 'im not okay', 'feel bad',
    'feeling down', "i'm down", 'crying', 'i cried', 'i miss',
  ],
  tired: ['tired', 'sleepy', 'exhausted', 'long day', 'need sleep', 'need a nap'],
  bored: ['bored', 'boring', 'nothing to do'],
  'hungry-talk': ['hungry', 'want food', 'want some food', 'want a snack', 'snack', 'snacks', 'dinner', 'lunch', 'breakfast'],
  love: [
    'i love you', 'love you', 'luv you', 'luv u', 'love u', 'i like you', "you're my favorite", 'youre my favorite',
    'you are my favorite', "you're my favourite", 'youre my favourite', 'you are my favourite', 'my best friend',
    'best fish', 'best friend',
  ],
  praise: [
    'cute', 'pretty', 'beautiful', 'adorable', 'handsome', 'good fish', 'good boy', 'good girl', 'good job',
    'well done', 'so cool', "you're cool", 'youre cool', 'you are cool', 'smart', 'clever', "you're awesome",
    'youre awesome', 'you are awesome', "you're amazing", 'you are amazing',
  ],
  thanks: ['thank you', 'thanks', 'thx', 'ty', 'thank u', 'appreciate'],
  bye: [
    'bye', 'goodbye', 'good bye', 'good night', 'goodnight', 'gn', 'see you', 'see ya', 'see u', 'later',
    'gotta go', 'got to go', 'talk later', 'ttyl', 'nighty night', 'sleep well', 'have a good day',
    'have a nice day', 'cya',
  ],
  happy: [
    "i'm happy", 'im happy', 'i am happy', 'so happy', 'great day', 'good day', 'best day', 'awesome day',
    'amazing day', 'good news', 'great news', "i'm excited", 'im excited', 'so excited', 'i did it', 'yay',
    'woohoo', 'feeling good', 'feel good', 'feeling great',
  ],
  hello: [
    'hi', 'hello', 'hey', 'hiya', 'heya', 'yo', 'howdy', 'sup', 'good morning', 'morning', 'good afternoon',
    'good evening', 'hola', 'greetings', 'hey there', 'hi there',
  ],
} as const;

/** Checked in this order: the first kind that matches wins. Feelings come before hello. */
const ORDER = [
  'fact', 'joke', 'name-ask', 'how-are-you', 'what-doing', 'sad', 'tired', 'bored', 'hungry-talk', 'love', 'praise',
  'thanks', 'bye', 'happy', 'hello',
] as const satisfies readonly (keyof typeof P)[];

const QUESTION_WORDS = new Set([
  'who', 'what', 'where', 'when', 'why', 'how', 'do', 'does', 'did', 'is', 'are', 'can', 'could', 'will', 'would',
  'should', 'have', 'has', 'am',
]);

const NEGATION = [
  "don't like", 'dont like', 'do not like', "don't love", 'dont love', 'hate', "can't stand", 'cant stand',
  'not a fan', 'dislike', "don't care about", 'dont care about', 'not into', 'not really into',
];

const YES = /^(yes|yeah|yep|yup|ya|yea|sure|ok|okay|of course|please|yes please|definitely|absolutely|correct|right|uh huh|mhm|y)( |$)/;
const NO = /^(no|nope|nah|not really|no thanks|nevermind|never mind|n)( |$)/;

const NAME = /(?:^| )(?:my name is|my name's|my names|call me|you can call me|i'm called|im called|i am called|name's) ([\p{L}'-]+)(?: ([\p{L}'-]+))?/u;
const NOT_A_NAME = new Set([
  'not', 'a', 'an', 'the', 'so', 'very', 'really', 'just', 'what', 'and', 'but', 'or', 'i', 'im', "i'm", 'me', 'you',
  'is', 'it', 'too', 'sad', 'happy', 'tired', 'bored', 'secret', 'nothing', 'whatever', 'that', 'this',
]);

/** Lower case, curly quotes straightened, anything but letters, digits and apostrophes made a space. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whole-word occurrences of `phrase` in padded text: start offsets. */
function occurrences(padded: string, phrase: string): number[] {
  const needle = ` ${phrase} `;
  const out: number[] = [];
  let i = padded.indexOf(needle);
  while (i >= 0) {
    out.push(i);
    i = padded.indexOf(needle, i + 1);
  }
  return out;
}

function has(padded: string, phrases: readonly string[]): boolean {
  return phrases.some((p) => padded.includes(` ${p} `));
}

function intentOf(padded: string, raw: string, words: string[]): ChatIntent | 'fact' {
  for (const k of ORDER) if (has(padded, P[k])) return k;
  if (raw.trim().endsWith('?') || (words[0] !== undefined && QUESTION_WORDS.has(words[0]))) return 'question';
  return 'unknown';
}

function nameIn(norm: string): string | null {
  const m = NAME.exec(norm);
  if (!m) return null;
  const first = m[1]!;
  if (NOT_A_NAME.has(first)) return null;
  const second = m[2];
  const words = second !== undefined && !NOT_A_NAME.has(second) ? `${first} ${second}` : first;
  return cleanName(words);
}

function interestsIn(padded: string, known: readonly Interest[]): string[] {
  const found: { id: string; at: number }[] = [];
  for (const it of known) {
    let at = Number.POSITIVE_INFINITY;
    for (const ph of [it.label, ...it.words]) for (const o of occurrences(padded, normalizeText(ph))) at = Math.min(at, o);
    if (Number.isFinite(at)) found.push({ id: it.id, at });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.id);
}

function teamsIn(padded: string, known: readonly Team[]): TeamMention[] {
  // Every phrase that can name a team, where it occurs, and the words to report as said.
  const hits: { start: number; end: number; said: string; id: string }[] = [];
  const add = (phrase: string, id: string, said = phrase): void => {
    const p = normalizeText(phrase);
    if (p.length === 0) return;
    for (const o of occurrences(padded, p)) hits.push({ start: o, end: o + p.length + 1, said: normalizeText(said), id });
  };
  for (const t of known) {
    add(t.display, t.id);
    add(`${t.location} ${t.nickname}`, t.id);
    if (t.everydayWord) add(`go ${t.nickname}`, t.id, t.nickname);
    else add(t.nickname, t.id);
    for (const a of t.aliases) add(a, t.id);
  }
  // Longest first; a shorter phrase inside a longer one is the same mention ("giants" in "new york giants").
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const spans: { start: number; end: number; said: string; ids: string[] }[] = [];
  for (const h of hits) {
    const same = spans.find((s) => s.start === h.start && s.end === h.end);
    if (same) {
      if (!same.ids.includes(h.id)) same.ids.push(h.id);
      continue;
    }
    if (spans.some((s) => h.start < s.end && s.start < h.end)) continue;
    spans.push({ start: h.start, end: h.end, said: h.said, ids: [h.id] });
  }
  const order = new Map(known.map((t, i) => [t.id, i] as const));
  return spans
    .sort((a, b) => a.start - b.start)
    .map((s) => ({ said: s.said, ids: [...s.ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)) }));
}

export function understand(text: string, known: Known): Understood {
  const norm = normalizeText(text);
  const padded = ` ${norm} `;
  const words = norm.split(' ').filter((w) => w.length > 0);
  const negated = has(padded, NEGATION);
  const mood: Mood | null = has(padded, P.sad) ? 'sad' : has(padded, P.tired) ? 'tired' : has(padded, P.happy) ? 'happy' : null;
  return {
    intent: intentOf(padded, text, words),
    answer: words.length <= 4 && YES.test(norm) ? 'yes' : words.length <= 4 && NO.test(norm) ? 'no' : null,
    name: nameIn(norm),
    interests: negated ? [] : interestsIn(padded, known.interests),
    teams: negated ? [] : teamsIn(padded, known.teams),
    mood,
  };
}
