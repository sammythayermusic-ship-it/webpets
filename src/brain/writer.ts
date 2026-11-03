// Claude-written lines (AFTER-BAKEOFF Step D.2): what we ask for, what we accept back, and the daily cap.
// Pure. The request itself goes through the platform (Rust holds the key; it never reaches this side).
//
// The built-in library always works. A written line is an extra, used for some of the pet's thoughts
// when a key is set, the Mac is online and today's spend is under the cap; anything else, or any doubt
// about what came back, and the pet says a library line instead.

import type { Personality, Species } from '../sim/types';
import type { Moment } from './types';

/** Share of volunteered thoughts that ask Claude, when Claude is available. */
export const WRITTEN_SHARE = 0.4;
/** Default daily cap, in US dollars. Settable; 0 turns written lines off. */
export const DEFAULT_DAILY_CAP_USD = 0.25;
/** Longest line we accept (the bubble holds about this much). */
export const MAX_WRITTEN_CHARS = 120;
/** A reply in chat may run a little longer than a passing thought. */
export const MAX_REPLY_CHARS = 160;

const VOICE: Record<Personality, string> = {
  sarcastic: 'deadpan and dry; pretends not to care and plainly does; teases gently, never mean',
  anxious: 'sweet and a little worried; overthinks small things; relieved and grateful whenever the person shows up',
  zen: 'calm, gentle and grateful; finds small wonders in ordinary things; speaks simply',
  hyper: 'excitable and goofy; everything is the best thing ever; lots of energy and exclamation marks, never rude',
};

const SPECIES_LIFE: Record<Species, string> = {
  fish: 'a goldfish in a round glass bowl with gravel, a few pebbles and a plant, floating on the corner of a computer screen',
  hamster: 'a hamster in a cage with a wheel, bedding and a food hopper, floating on the corner of a computer screen',
  frog: 'a frog in a little pond, floating on the corner of a computer screen',
  chicken: 'a chicken in a small coop, floating on the corner of a computer screen',
};

export interface LineRequest {
  species: Species;
  personality: Personality;
  name: string;
  moment: Moment;
  /** Plain facts about right now: "it is evening", "it just ate", "the person has been away for two days". */
  situation: readonly string[];
  /** The pet's last few lines, so the new one is different. */
  recent: readonly string[];
}

export interface LinePrompt {
  system: string;
  user: string;
}

/** The system prompt is the same for every request of a pet, so it caches; everything that changes goes in `user`. */
export function buildLinePrompt(r: LineRequest): LinePrompt {
  const system = [
    `You are ${r.name}, ${SPECIES_LIFE[r.species]}. You are a pet in a desktop app used by kids and adults.`,
    `Your personality: ${VOICE[r.personality]}.`,
    'Write exactly one thing you say out loud, in a speech bubble: one or two short sentences, at most 100 characters.',
    'Rules:',
    '- Kind and clean. Nothing a parent would mind a child reading. No romance, violence, scary or sad topics beyond being a bit hungry or bored.',
    '- Stay in character as the pet. Never mention being an AI, a model, a prompt or an app.',
    '- No facts, numbers, news, scores or claims about the real world: only your own little life and feelings.',
    '- No links, hashtags, emoji or quotation marks. No questions that need an answer to make sense.',
    '- Reply with the line only.',
  ].join('\n');
  const lines = [
    `Moment: ${MOMENT_PLAIN[r.moment]}.`,
    ...(r.situation.length > 0 ? [`Right now: ${r.situation.join('; ')}.`] : []),
    ...(r.recent.length > 0 ? [`Things you said lately (say something different):\n${r.recent.map((l) => `- ${l}`).join('\n')}`] : []),
  ];
  return { system, user: lines.join('\n') };
}

const MOMENT_PLAIN: Record<Moment, string> = {
  thought: 'a random thought while swimming or pottering about',
  fed: 'you just got a bite of food',
  meal: 'you just finished a meal',
  hungry: 'you are getting hungry',
  starving: 'you are very hungry',
  tap: 'someone just knocked on your glass',
  visit: 'the person came back after a few minutes away',
  'welcome-back': 'the person came back after a long time away',
  lonely: 'nobody has come by for hours',
  morning: 'it is morning',
  night: 'it is getting dark and you are settling down for the night',
  feeder: 'the automatic feeder fed you while the person was away',
};

const BANNED = /https?:|www\.|#\w|@\w|\bAI\b|\bmodel\b|\bprompt\b|\bClaude\b|\bAnthropic\b/i;
// Emoji and pictographs: the bubble's font is not built for them, and the brief asks for words.
const PICTOGRAPH = /\p{Extended_Pictographic}/u;

export interface ReplyRequest {
  species: Species;
  personality: Personality;
  name: string;
  /** What the pet calls you, if you told it. */
  you: string | null;
  /** How close you are, in words ("good friends"). */
  bond: string;
  /**
   * What the pet knows about you that this reply is about, and nothing more: the team or hobby you
   * just mentioned ("the person follows the Red Sox"). The rest of the profile stays on the Mac.
   */
  about: readonly string[];
  /** The last few exchanges, oldest first. */
  recent: readonly { you: string; pet: string }[];
  /** What you just typed. */
  message: string;
}

/**
 * A reply in chat. Same caching split as `buildLinePrompt`: the system prompt depends only on the
 * pet. Stricter rules, because this is the one place a person, maybe a child, steers the topic.
 */
export function buildReplyPrompt(r: ReplyRequest): LinePrompt {
  const system = [
    `You are ${r.name}, ${SPECIES_LIFE[r.species]}. You are a pet in a desktop app used by kids and adults.`,
    `Your personality: ${VOICE[r.personality]}.`,
    'The person typed something to you. Reply out loud, in a speech bubble: one or two short sentences, at most 140 characters.',
    'Rules:',
    '- Kind and clean. Nothing a parent would mind a child reading. No romance, violence, scary topics, medical or legal advice.',
    '- Stay in character as the pet. Never mention being an AI, a model, a prompt or an app.',
    '- If they say something unkind, rude or unsafe, do not repeat it: reply gently and change the subject to your bowl.',
    '- If they seem sad or worried, be warm and kind. If they say they are hurt, in danger or being hurt, gently say to tell a grown-up or someone they trust, right away.',
    '- Never ask for or repeat personal details: where they live, their school, phone, passwords, photos, or anyone\'s full name.',
    '- No facts, numbers, news, scores or claims about the real world. If asked, say you only know about life in your bowl.',
    '- No links, hashtags, emoji or quotation marks.',
    '- Reply with the line only.',
  ].join('\n');
  const lines = [
    `How close you are: ${r.bond}.`,
    ...(r.you !== null ? [`They like to be called ${r.you}.`] : []),
    ...(r.about.length > 0 ? [`What you know that matters here: ${r.about.join('; ')}.`] : []),
    ...(r.recent.length > 0 ? [`Just before:\n${r.recent.map((e) => `Them: ${e.you}\nYou: ${e.pet}`).join('\n')}`] : []),
    `They just typed: ${r.message.slice(0, 300)}`,
  ];
  return { system, user: lines.join('\n') };
}

/** Accept a written line, tidied, or reject it (null) so a library line is said instead. */
export function cleanLine(raw: string, max: number = MAX_WRITTEN_CHARS): string | null {
  let s = raw.trim();
  // A model sometimes wraps the line in quotes or starts with the pet's name and a colon.
  s = s.replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '');
  s = s.replace(/^[A-Z][\w ]{0,20}:\s+/, '');
  s = s.replace(/\s+/g, ' ');
  if (s.length < 3 || s.length > max) return null;
  if (s.includes('\n') || BANNED.test(s) || PICTOGRAPH.test(s)) return null;
  return s;
}

/** Today's spend, per local day. */
export interface Spend {
  day: string;
  usd: number;
}

export function spendToday(spend: Spend | null, today: string): number {
  return spend && spend.day === today ? spend.usd : 0;
}

export function canSpend(spend: Spend | null, today: string, capUsd: number): boolean {
  return capUsd > 0 && spendToday(spend, today) < capUsd;
}

export function addSpend(spend: Spend | null, today: string, usd: number): Spend {
  return { day: today, usd: spendToday(spend, today) + Math.max(0, usd) };
}
