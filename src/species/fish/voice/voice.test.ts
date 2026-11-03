import { describe, expect, it } from 'vitest';
import type { Personality } from '../../../sim/types';
import type { BondMoment, ChatIntent, Moment, TeachMoment, WorldMoment } from '../../../brain/types';
import { FISH_CHAT } from './chat';
import { FISH_FACT_FRAMES } from './lines';
import { FISH_VOICE } from './index';
import { FISH_WORLD } from './world';

const PERSONALITIES: readonly Personality[] = ['sarcastic', 'anxious', 'zen', 'hyper'];
const MOMENTS: readonly Moment[] = [
  'thought', 'fed', 'meal', 'hungry', 'starving', 'tap', 'visit', 'welcome-back', 'lonely', 'morning', 'night', 'feeder',
];
// Words that have no place in a pet for kids and adults, or that belong to the crypto days.
const UNKIND = /\b(die|dying|dead|death|kill\w*|hate|stupid|shut up|damn|hell)\b/i;
const CRYPTO_SLANG = /\b(crypto|coin|wallet|token|rekt|degen|wen|gm|ser|fren|based|rug|liquidat\w*)\b/i;

const allLines = PERSONALITIES.flatMap((p) => MOMENTS.flatMap((m) => FISH_VOICE.lines[p][m] ?? []));

describe('the goldfish voice', () => {
  it('has at least 150 lines, and every personality has something for every moment', () => {
    expect(allLines.length).toBeGreaterThanOrEqual(150);
    for (const p of PERSONALITIES) for (const m of MOMENTS) expect(FISH_VOICE.lines[p][m]?.length ?? 0, `${p}/${m}`).toBeGreaterThanOrEqual(4);
  });

  it('keeps lines short enough for the bubble, and kind', () => {
    for (const l of allLines) {
      expect(l.length, l).toBeLessThanOrEqual(100);
      expect(l, l).not.toMatch(UNKIND);
      expect(l, l).not.toMatch(CRYPTO_SLANG);
    }
    expect(new Set(allLines).size).toBe(allLines.length);
  });

  it('has at least 100 facts, each one sentence with an https source', () => {
    expect(FISH_VOICE.facts.length).toBeGreaterThanOrEqual(100);
    const ids = new Set<string>();
    for (const f of FISH_VOICE.facts) {
      expect(ids.has(f.id), f.id).toBe(false);
      ids.add(f.id);
      expect(f.text.length, f.id).toBeLessThanOrEqual(110);
      expect(f.text, f.id).toMatch(/[.!]$/);
      expect(f.source.url, f.id).toMatch(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//i);
      expect(f.source.title.length, f.id).toBeGreaterThan(0);
      expect(f.text, f.id).not.toMatch(UNKIND);
    }
  });

  it('frames every fact in each personality\'s voice', () => {
    for (const p of PERSONALITIES) {
      expect(FISH_VOICE.factFrames[p].length).toBeGreaterThanOrEqual(3);
      for (const fr of FISH_VOICE.factFrames[p]) expect(fr).toContain('{fact}');
    }
  });
});

// Talking with you (chat.ts). The `satisfies` keeps these lists in step with the types.
const CHAT_INTENTS = Object.keys({
  hello: 1, 'how-are-you': 1, 'what-doing': 1, love: 1, praise: 1, thanks: 1, bye: 1, sad: 1, happy: 1, tired: 1,
  bored: 1, 'hungry-talk': 1, 'name-ask': 1, joke: 1, question: 1, unknown: 1,
} satisfies Record<ChatIntent, 1>) as ChatIntent[];
const TEACH_MOMENTS = Object.keys({
  'ask-interest': 1, 'ask-team': 1, 'which-team': 1, 'ask-name': 1, 'saved-interest': 1, 'saved-team': 1,
  'saved-name': 1, declined: 1, 'already-know': 1,
} satisfies Record<TeachMoment, 1>) as TeachMoment[];
const BOND_MOMENTS = Object.keys({
  'thought-you': 1, 'thought-interest': 1, 'thought-team': 1, 'visit-close': 1, 'mood-check': 1, 'joke-knock': 1,
  'joke-shared': 1,
} satisfies Record<BondMoment, 1>) as BondMoment[];

/** Each token other than {name} lives only in these places, and every line there uses it. */
const TOKEN_HOMES: Record<'you' | 'interest' | 'team' | 'thing', readonly string[]> = {
  you: ['teach.ask-name', 'teach.saved-name', 'bond.thought-you', 'bond.visit-close'],
  interest: ['teach.ask-interest', 'teach.saved-interest', 'bond.thought-interest', 'bond.joke-shared'],
  team: ['teach.ask-team', 'teach.saved-team', 'bond.thought-team'],
  thing: ['teach.already-know'],
};
/** The longest values a line should still fit with. */
const LONG_VALUES: Record<string, string> = {
  you: 'Christopher', interest: 'video games', team: 'Timberwolves', thing: 'video games', name: 'Bubbles',
};
const YES_NO = ['teach.ask-interest', 'teach.ask-team', 'teach.ask-name'];
const NO_TOKEN_QUESTION = ['teach.which-team', 'bond.mood-check'];
const NOT_ABOUT_ITSELF = /\b(ai|robot|chatbot|bot|model|app|apps|program|software|computer|algorithm)\b/i;
const RESULTS = /\b(win|wins|won|winning|winner|lose|loses|lost|losing|loss|score\w*|beat|beats|champion\w*|playoff\w*|title|record|season)\b/i;

interface Entry { key: string; where: string; line: string }
const chatEntries: Entry[] = [];
for (const p of PERSONALITIES) {
  for (const m of CHAT_INTENTS) for (const line of FISH_CHAT.chat[p][m]) chatEntries.push({ key: `chat.${m}`, where: `chat.${p}.${m}`, line });
  for (const m of TEACH_MOMENTS) for (const line of FISH_CHAT.teach[p][m]) chatEntries.push({ key: `teach.${m}`, where: `teach.${p}.${m}`, line });
  for (const m of BOND_MOMENTS) for (const line of FISH_CHAT.bond[p][m]) chatEntries.push({ key: `bond.${m}`, where: `bond.${p}.${m}`, line });
}
const fill = (line: string): string => line.replace(/\{(\w+)\}/g, (_, t: string) => LONG_VALUES[t] ?? `{${t}}`);

describe('the goldfish talking with you', () => {
  it('is part of the fish voice', () => {
    expect(FISH_VOICE.chat).toBe(FISH_CHAT);
  });

  it('has enough to say in every personality: 4 per chat intent (6 jokes), 3 per teach moment, 4 per bond moment', () => {
    for (const p of PERSONALITIES) {
      for (const m of CHAT_INTENTS) expect(FISH_CHAT.chat[p][m].length, `chat.${p}.${m}`).toBeGreaterThanOrEqual(m === 'joke' ? 6 : 4);
      for (const m of TEACH_MOMENTS) expect(FISH_CHAT.teach[p][m].length, `teach.${p}.${m}`).toBeGreaterThanOrEqual(3);
      for (const m of BOND_MOMENTS) expect(FISH_CHAT.bond[p][m].length, `bond.${p}.${m}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('uses each token only where it belongs, and in every line there', () => {
    for (const { key, where, line } of chatEntries) {
      for (const t of line.match(/\{[^}]*\}/g) ?? []) expect(['{name}', '{you}', '{interest}', '{team}', '{thing}'], `${where}: ${line}`).toContain(t);
      for (const [token, homes] of Object.entries(TOKEN_HOMES)) {
        if (homes.includes(key)) expect(line, `${where} needs {${token}}`).toContain(`{${token}}`);
        else expect(line, `${where} must not use {${token}}`).not.toContain(`{${token}}`);
      }
    }
    for (const p of PERSONALITIES) for (const line of FISH_CHAT.chat[p]['name-ask']) expect(line, `name-ask.${p}`).toContain('{name}');
  });

  it('reads naturally whatever the interest or team is', () => {
    for (const { where, line } of chatEntries) {
      // "video games" and "baking" both have to fit: no plural, no article, no verb that picks one.
      expect(line, where).not.toMatch(/\{(interest|team|thing)\}s\b/);
      expect(line, where).not.toMatch(/\ban? \{(interest|team|thing)\}/i);
      expect(line, where).not.toMatch(/\{(interest|thing)\} (is|are|was|were|has|have)\b/);
      // Lower case values never start a sentence.
      expect(line, where).not.toMatch(/(^|[.!?]\s+)\{(interest|thing)\}/);
    }
  });

  it('fits the bubble with long names filled in', () => {
    for (const { where, line } of chatEntries) expect(fill(line).length, `${where}: ${fill(line)}`).toBeLessThanOrEqual(100);
  });

  it('asks yes/no questions where the bubble shows Yes / No, and plain questions where it shows teams or asks how you are', () => {
    for (const { key, where, line } of chatEntries) {
      if (YES_NO.includes(key)) expect(line, where).toMatch(/\?$/);
      if (NO_TOKEN_QUESTION.includes(key)) {
        expect(line, where).toMatch(/\?$/);
        expect(line, where).not.toContain('{');
      }
    }
  });

  it('keeps the inside jokes and team talk on topic, with no results', () => {
    for (const p of PERSONALITIES) {
      for (const line of FISH_CHAT.bond[p]['joke-knock']) expect(line, `joke-knock.${p}`).toMatch(/knock/i);
      for (const line of FISH_CHAT.bond[p]['thought-team']) expect(line, `thought-team.${p}`).not.toMatch(RESULTS);
    }
  });

  it('is kind and clean: no unkind words, no crypto, no talk of being a program, no quotes, links, tags or emoji', () => {
    for (const { where, line } of chatEntries) {
      expect(line, where).not.toMatch(UNKIND);
      expect(line, where).not.toMatch(CRYPTO_SLANG);
      expect(line, where).not.toMatch(NOT_ABOUT_ITSELF);
      expect(line, where).not.toMatch(/["\u201C\u201D\u2018#]|https?:|www\./);
      expect(line, where).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(line.trim(), where).toBe(line);
    }
  });

  it('never repeats a line, here or from the rest of the voice', () => {
    const lines = chatEntries.map((e) => e.line);
    const dupes = lines.filter((l, i) => lines.indexOf(l) !== i);
    expect(dupes).toEqual([]);
    const elsewhere = new Set([...allLines, ...PERSONALITIES.flatMap((p) => FISH_FACT_FRAMES[p])]);
    expect(lines.filter((l) => elsewhere.has(l))).toEqual([]);
  });
});

// Your teams' games and the news (world.ts). Every fact in these lines comes from a token.
const WORLD_MOMENTS = Object.keys({
  'game-day': 1, live: 1, won: 1, lost: 1, tied: 1, 'still-happy': 1, mope: 1, 'no-game': 1, news: 1, 'news-interest': 1,
} satisfies Record<WorldMoment, 1>) as WorldMoment[];
/** Per moment: the tokens every line needs, and the ones it may add ({name} is allowed anywhere). */
const WORLD_TOKENS: Record<WorldMoment, { needs: readonly string[]; may: readonly string[] }> = {
  'game-day': { needs: ['team'], may: ['opponent', 'time'] },
  live: { needs: ['team', 'score'], may: ['opponent'] },
  won: { needs: ['team', 'score'], may: ['opponent'] },
  lost: { needs: ['team', 'score'], may: ['opponent'] },
  tied: { needs: ['team', 'score'], may: ['opponent'] },
  'still-happy': { needs: ['team'], may: [] },
  mope: { needs: ['team'], may: [] },
  'no-game': { needs: ['team'], may: [] },
  news: { needs: ['headline'], may: [] },
  'news-interest': { needs: ['interest', 'headline'], may: [] },
};
const WORLD_VALUES: Record<string, string> = {
  team: 'Timberwolves', opponent: 'Trail Blazers', score: '117-112', time: '10:30 pm', interest: 'video games',
  name: 'Bubbles', headline: '',
};
const MORE_UNKIND = /\b(suck\w*)\b/i;
const GAMBLING = /\b(bet|betting|odds)\b/i;
const PREDICTION = /\b(will|gonna|going to) (win|beat|lose)\b/i;

interface WorldEntry { moment: WorldMoment; where: string; line: string }
const worldEntries: WorldEntry[] = PERSONALITIES.flatMap((p) =>
  WORLD_MOMENTS.flatMap((m) => FISH_WORLD[p][m].map((line) => ({ moment: m, where: `world.${p}.${m}`, line }))),
);
const fillWorld = (line: string): string => line.replace(/\{(\w+)\}/g, (_, t: string) => WORLD_VALUES[t] ?? `{${t}}`);

describe('the goldfish on your teams and the news', () => {
  it('is part of the fish voice', () => {
    expect(FISH_VOICE.world).toBe(FISH_WORLD);
  });

  it('has enough to say: 5 per moment in every personality, 7 for a win or a loss', () => {
    for (const p of PERSONALITIES) {
      for (const m of WORLD_MOMENTS) {
        expect(FISH_WORLD[p][m].length, `world.${p}.${m}`).toBeGreaterThanOrEqual(m === 'won' || m === 'lost' ? 7 : 5);
      }
    }
  });

  it('uses only the tokens each moment has, and the ones it needs in every line', () => {
    for (const { moment, where, line } of worldEntries) {
      const { needs, may } = WORLD_TOKENS[moment];
      const allowed = new Set(['name', ...needs, ...may]);
      for (const t of line.match(/\{[^}]*\}/g) ?? []) expect(allowed.has(t.slice(1, -1)), `${where}: ${line}`).toBe(true);
      for (const t of needs) expect(line, `${where} needs {${t}}`).toContain(`{${t}}`);
    }
  });

  it('ends with the headline, once, after its frame', () => {
    for (const { moment, where, line } of worldEntries) {
      const count = line.split('{headline}').length - 1;
      if (moment === 'news' || moment === 'news-interest') {
        expect(count, where).toBe(1);
        expect(line, where).toMatch(/[^\s]( |: )\{headline\}$/);
      } else {
        expect(count, where).toBe(0);
      }
    }
  });

  it('reads naturally whatever the team, score or interest is', () => {
    for (const { where, line } of worldEntries) {
      expect(line, where).not.toMatch(/\{(team|opponent|interest)\}s\b/);
      expect(line, where).not.toMatch(/\ban? \{(team|opponent|interest)\}/i);
      expect(line, where).not.toMatch(/\{interest\} (is|are|was|were|has|have)\b/);
      expect(line, where).not.toMatch(/(^|[.!?]\s+)\{interest\}/);
      // The score is your team's number first, win or lose: never "by {score}".
      expect(line, where).not.toMatch(/\bby \{score\}/i);
    }
  });

  it('keeps frames short, and fits the bubble with long names filled in', () => {
    for (const { where, line } of worldEntries) {
      expect(line.replace('{headline}', '').length, `${where}: ${line}`).toBeLessThanOrEqual(70);
      expect(fillWorld(line).length, `${where}: ${fillWorld(line)}`).toBeLessThanOrEqual(100);
    }
  });

  it('states no facts of its own: no numbers, no predictions', () => {
    for (const { where, line } of worldEntries) {
      expect(line, where).not.toMatch(/\d/);
      expect(line, where).not.toMatch(PREDICTION);
    }
  });

  it('is kind and clean: no unkind words, no crypto or gambling, no talk of being a program, no quotes, links, tags or emoji', () => {
    for (const { where, line } of worldEntries) {
      expect(line, where).not.toMatch(UNKIND);
      expect(line, where).not.toMatch(MORE_UNKIND);
      expect(line, where).not.toMatch(CRYPTO_SLANG);
      expect(line, where).not.toMatch(GAMBLING);
      expect(line, where).not.toMatch(NOT_ABOUT_ITSELF);
      expect(line, where).not.toMatch(/["\u201C\u201D\u2018#]|https?:|www\./);
      expect(line, where).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(line.trim(), where).toBe(line);
    }
  });

  it('never repeats a line, here or from the rest of the voice', () => {
    const lines = worldEntries.map((e) => e.line);
    const dupes = lines.filter((l, i) => lines.indexOf(l) !== i);
    expect(dupes).toEqual([]);
    const elsewhere = new Set([
      ...allLines,
      ...PERSONALITIES.flatMap((p) => FISH_FACT_FRAMES[p]),
      ...chatEntries.map((e) => e.line),
    ]);
    expect(lines.filter((l) => elsewhere.has(l))).toEqual([]);
  });
});
