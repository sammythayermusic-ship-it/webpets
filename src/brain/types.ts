// The pet's brain: what it says, and when. Shared by every species (AFTER-BAKEOFF Step G); each species
// brings only its voice. Pure: imports nothing from outside src/brain except src/sim types.

import type { Personality } from '../sim/types';

/** The situations a pet has something to say about. A fact is not a moment; it is a thought with a source. */
export type Moment =
  | 'thought' // unprompted, while you are around or now and then
  | 'fed' // a bite of food
  | 'meal' // a meal finished
  | 'hungry'
  | 'starving'
  | 'tap' // a knock on the glass
  | 'visit' // you came back after a few minutes away
  | 'welcome-back' // you came back after hours or days
  | 'lonely' // nobody has come by for hours
  | 'morning'
  | 'night'
  | 'feeder'; // the holiday feeder fed it while you were away

/** Where a fact comes from: shown when you tap the bubble. */
export interface Source {
  title: string;
  url: string;
}

/** One true thing, in plain words a child can read. `text` is a whole sentence; it must be supported by `source`. */
export interface Fact {
  id: string;
  text: string;
  source: Source;
}

/** A species' voice: what each personality says in each moment, its facts, and how each personality brings a fact up. */
export interface Voice {
  lines: Record<Personality, Partial<Record<Moment, readonly string[]>>>;
  facts: readonly Fact[];
  /** Templates containing `{fact}`, per personality ("Fun fact, since you didn't ask: {fact}"). */
  factFrames: Record<Personality, readonly string[]>;
  /** Talking with you and getting to know you (Step E). A species without it cannot be typed to yet. */
  chat?: ChatVoice;
  /** Your teams' games and the news (Step F). Every token is filled from data the app fetched. */
  world?: Record<Personality, Record<WorldMoment, readonly string[]>>;
}

/**
 * Sports and news (AFTER-BAKEOFF Step F). Lines are frames; the facts in them come only from a
 * scoreboard or a feed the app fetched (src/brain/sports.ts, src/brain/news.ts), never from the line.
 * Tokens: `{team}` (your team's nickname, "Red Sox"), `{opponent}` (theirs), `{score}` ("5-3", your
 * team first), `{time}` ("7:10 pm"), `{headline}` (a real headline, as published), `{interest}`.
 */
export type WorldMoment =
  | 'game-day' // your team plays today: {team}, {opponent}, {time}
  | 'live' // you asked, a game is on: {team}, {opponent}, {score}
  | 'won' // final, your team won: {team}, {opponent}, {score}
  | 'lost' // final, your team lost: {team}, {opponent}, {score}
  | 'tied' // final, a draw: {team}, {opponent}, {score}
  | 'still-happy' // later the same day after a win: {team}
  | 'mope' // the evening or the next morning after a loss: {team}
  | 'no-game' // you asked, no game today: {team}
  | 'news' // a feel-good headline: {headline}
  | 'news-interest'; // a headline about something you like: {interest}, {headline}

/**
 * What you typed, as far as the pet understands it without Claude (src/brain/understand.ts). A
 * reply to each, per personality. `fact` asks for a fact and is answered from the facts, not lines.
 */
export type ChatIntent =
  | 'hello' // hi, hey, good morning
  | 'how-are-you' // how are you, you ok?
  | 'what-doing' // what are you doing
  | 'love' // I love you, you're my favourite
  | 'praise' // you're cute, good fish, so pretty
  | 'thanks' // thank you
  | 'bye' // bye, goodnight, see you
  | 'sad' // I'm sad, bad day
  | 'happy' // I'm happy, great day, good news
  | 'tired' // I'm tired, sleepy
  | 'bored' // I'm bored
  | 'hungry-talk' // are you hungry? want food?
  | 'name-ask' // what's your name?
  | 'joke' // tell me a joke
  | 'question' // any other question
  | 'unknown'; // anything else

/**
 * Getting to know you: the pet asks before it keeps anything, and says so when it has. Tokens:
 * `{interest}` (a hobby, lower case: "baking", "video games"), `{team}` (a nickname: "Red Sox"),
 * `{you}` (your name), `{thing}` (an interest or a team it already knew).
 */
export type TeachMoment =
  | 'ask-interest' // "You like {interest}? Want me to remember that?"
  | 'ask-team' // "You're a {team} fan? Want me to keep an eye on them?"
  | 'which-team' // more than one team goes by that name: which one?
  | 'ask-name' // "Can I call you {you}?"
  | 'saved-interest'
  | 'saved-team'
  | 'saved-name' // uses {you}
  | 'declined' // you said no: fine, it won't
  | 'already-know'; // uses {thing}

/**
 * Lines that only come once the pet knows you (src/brain/bond.ts). Tokens as in `TeachMoment`.
 */
export type BondMoment =
  | 'thought-you' // a thought about you, by name ({you})
  | 'thought-interest' // a thought about something you like ({interest})
  | 'thought-team' // a thought about your team ({team}); no results or scores, those come in Step F
  | 'visit-close' // hello when you come back, by name ({you}), for a close friend
  | 'mood-check' // you said you were sad or tired last time: is today better?
  | 'joke-knock' // an inside joke about all the knocking on the glass
  | 'joke-shared'; // an inside joke about a thing you both like ({interest})

export interface ChatVoice {
  chat: Record<Personality, Record<ChatIntent, readonly string[]>>;
  teach: Record<Personality, Record<TeachMoment, readonly string[]>>;
  bond: Record<Personality, Record<BondMoment, readonly string[]>>;
}

/** What the bubble shows, and what tapping it opens. */
export interface Utterance {
  /** Stable across launches, so the pet does not repeat itself ("thought:zen:1a2b3c", "fact:gf-012"). */
  id: string;
  text: string;
  kind: Moment | 'fact' | 'chat';
  more?: { label: string; url: string };
  /** Buttons under the line, for a question the pet asked you ("Yes" / "No thanks", or which team). */
  choices?: readonly Choice[];
}

export interface Choice {
  label: string;
  /** What choosing it says back to the chat ("yes", "no", or a team id). */
  value: string;
}
