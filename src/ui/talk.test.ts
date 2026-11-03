import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../sim/test-helpers';
import type { Utterance, Voice } from '../brain/types';
import { createTalk, dayKeyOf, type LineWriter, type TalkEnv, type TalkMemory } from './talk';
import { emptyProfile, type Profile } from '../brain/profile';
import type { ChatVoice } from '../brain/types';
import { FISH_CHAT } from '../species/fish/voice/chat';

const voice: Voice = {
  lines: {
    sarcastic: { thought: ['T1', 'T2', 'T3'], fed: ['Yum, {name}.'], visit: ['Oh. You.'], tap: ['Knock.'], hungry: ['Feed me.'] },
    anxious: {},
    zen: {},
    hyper: {},
  },
  facts: [{ id: 'f1', text: 'Fish are cool.', source: { title: 'Src', url: 'https://example.org/f' } }],
  factFrames: { sarcastic: ['Fact: {fact}'], anxious: [], zen: [], hyper: [] },
  chat: FISH_CHAT as ChatVoice,
};
const KNOWN = {
  teams: [{ id: 'mlb:2', league: 'mlb' as const, espnId: '2', abbr: 'BOS', location: 'Boston', nickname: 'Red Sox', display: 'Boston Red Sox', aliases: [] }],
  interests: [{ id: 'baking', label: 'baking', words: ['bake'] }],
};

function harness(over: Partial<TalkEnv> = {}, start: Profile | null = null) {
  let t = new Date(2026, 9, 31, 7, 0).getTime();
  const shown: Utterance[] = [];
  let saved: TalkMemory | null = null;
  let present = false;
  let profile = start ?? emptyProfile(t);
  const env: TalkEnv = {
    now: () => t,
    rng: mulberry32(4),
    pet: () => ({ species: 'fish', personality: 'sarcastic', name: 'Goldie', alive: true }),
    voice: () => voice,
    present: () => present,
    night: () => false,
    awake: () => true,
    busy: () => false,
    muted: () => false,
    stillTrue: () => true,
    profile: () => profile,
    setProfile: (p) => (profile = p),
    known: () => KNOWN,
    situation: () => ['it is afternoon'],
    writer: null,
    dailyCapUsd: () => 0.25,
    load: () => null,
    save: (m) => (saved = m),
    show: (u) => shown.push(u),
    ...over,
  };
  const talk = createTalk(env);
  return {
    talk,
    shown,
    saved: () => saved,
    advance(ms: number) {
      const end = t + ms;
      for (; t < end; t += 1000) talk.tick();
    },
    setPresent(b: boolean) {
      present = b;
    },
    profile: () => profile,
  };
}

describe('the talk controller', () => {
  it('volunteers library lines and facts now and then, and remembers them', () => {
    const h = harness();
    h.advance(3 * 3600_000);
    expect(h.shown.length).toBeGreaterThan(2);
    for (const u of h.shown) expect(['T1', 'T2', 'T3', 'Fact: Fish are cool.']).toContain(u.text);
    expect(h.saved()!.memory.recent.length).toBeGreaterThan(0);
  });

  it('answers a meal in its own voice, with the pet\'s name', () => {
    const h = harness();
    h.talk.react('fed');
    expect(h.shown.map((u) => u.text)).toEqual(['Yum, Goldie.']);
  });

  it('says hunger late rather than never when another bubble was just up, but only while it is still true', () => {
    let hungry = true;
    const h = harness({ stillTrue: () => hungry });
    h.talk.react('fed');
    expect(h.talk.react('hungry')).toBe(false);
    h.advance(3000);
    expect(h.shown.map((u) => u.text)).toEqual(['Yum, Goldie.']);
    h.advance(5000);
    expect(h.shown.map((u) => u.text)).toEqual(['Yum, Goldie.', 'Feed me.']);
    h.advance(60_000);
    expect(h.shown).toHaveLength(2);

    const g = harness({ stillTrue: () => hungry });
    g.talk.react('fed');
    g.talk.react('hungry');
    hungry = false;
    g.advance(60_000);
    expect(g.shown.map((u) => u.text)).toEqual(['Yum, Goldie.']);
  });

  it('keeps hunger for when you are not busy (typing, or the pet out of sight)', () => {
    let busy = true;
    const h = harness({ busy: () => busy });
    h.talk.react('hungry');
    h.advance(30_000);
    expect(h.shown).toEqual([]);
    busy = false;
    h.advance(2000);
    expect(h.shown.map((u) => u.text)).toEqual(['Feed me.']);
  });

  it('says nothing at all while muted', () => {
    const h = harness({ muted: () => true });
    h.talk.react('fed');
    h.advance(3600_000);
    expect(h.shown).toEqual([]);
  });

  it('asks Claude for some thoughts, charges the cap, and falls back when the line is no good', async () => {
    const calls: string[] = [];
    let reply: string | null = 'The plant waved at me.';
    const writer: LineWriter = {
      available: async () => true,
      write: async (p) => {
        calls.push(p.user);
        return { text: reply, usd: 0.01 };
      },
    };
    const h = harness({ writer });
    const flush = () => new Promise((r) => setTimeout(r, 0));
    h.advance(1000);
    await flush();
    for (let i = 0; i < 6; i++) {
      h.advance(3600_000);
      await flush();
    }
    expect(calls.length).toBeGreaterThan(0);
    expect(h.shown.some((u) => u.text === 'The plant waved at me.')).toBe(true);
    expect(h.saved()!.spend!.usd).toBeCloseTo(0.01 * calls.length);
    reply = 'Visit https://example.com';
    const before = h.shown.length;
    for (let i = 0; i < 4; i++) {
      h.advance(3600_000);
      await flush();
    }
    expect(h.shown.slice(before).some((u) => u.text.includes('https'))).toBe(false);
  });

  it('stops asking Claude once the day\'s cap is spent', async () => {
    let calls = 0;
    const writer: LineWriter = {
      available: async () => true,
      write: async () => {
        calls++;
        return { text: 'Hi.', usd: 1 };
      },
    };
    const h = harness({ writer });
    await Promise.resolve();
    for (let i = 0; i < 12; i++) {
      h.advance(3600_000);
      await new Promise((r) => setTimeout(r, 0));
    }
    expect(calls).toBe(1);
  });
});

describe('talking with you', () => {
  it('asks before it keeps something, with buttons, and keeps it on a yes', () => {
    const h = harness();
    h.talk.chat('I love the Red Sox');
    const ask = h.shown.at(-1)!;
    expect(ask.text).toContain('Red Sox');
    expect(ask.choices?.map((c) => c.value)).toEqual(['yes', 'no']);
    h.talk.choose(ask.choices![0]!);
    expect(h.profile().teams).toEqual(['mlb:2']);
    expect(h.shown.at(-1)!.text).toContain('Red Sox');
    expect(h.shown.at(-1)!.choices).toBeUndefined();
  });

  it('answers in its own voice, and each message warms the bond a little', () => {
    const h = harness();
    h.talk.chat('hi');
    h.talk.chat('how are you?');
    expect(h.shown.length).toBe(2);
    for (const u of h.shown) expect(u.kind).toBe('chat');
    expect(h.talk.bond().points).toBe(2);
    expect(h.saved()!.chat.recent.map((e) => e.you)).toEqual(['hi', 'how are you?']);
  });

  it('once close, brings you up by name in its thoughts and at the door', () => {
    const named = { ...emptyProfile(0), name: 'Sam', interests: ['baking'] };
    const h = harness({}, named);
    h.talk.setBondPoints(90);
    h.advance(4 * 3600_000);
    const personal = h.shown.filter((u) => u.text.includes('Sam') || u.text.includes('baking'));
    expect(personal.length).toBeGreaterThan(0);
  });

  it('a stranger never uses your name', () => {
    const named = { ...emptyProfile(0), name: 'Sam' };
    const h = harness({}, named);
    h.advance(6 * 3600_000);
    expect(h.shown.some((u) => u.text.includes('Sam'))).toBe(false);
  });

  it('asks how you are the next time, if you said you were sad, once it knows you', () => {
    const h = harness();
    h.talk.setBondPoints(60);
    h.talk.chat("I'm sad today");
    h.advance(5 * 3600_000);
    h.setPresent(true);
    h.advance(2000);
    const lines = FISH_CHAT.bond.sarcastic['mood-check'];
    expect(h.shown.some((u) => lines.includes(u.text))).toBe(true);
    expect(h.saved()!.chat.mood).toBeNull();
  });

  it('checks in at a good-morning hello too', () => {
    const h = harness();
    h.talk.setBondPoints(60);
    h.talk.chat("I'm so tired");
    // Overnight: the next visit is the first of a new morning.
    h.advance(22 * 3600_000);
    h.setPresent(true);
    h.advance(2000);
    const lines = FISH_CHAT.bond.sarcastic['mood-check'];
    expect(h.shown.some((u) => lines.includes(u.text))).toBe(true);
  });

  it('forgets what you said when asked, and keeps the bond', () => {
    const h = harness();
    h.talk.chat('hi');
    h.talk.forgetChat();
    expect(h.saved()!.chat.recent).toEqual([]);
    expect(h.talk.bond().points).toBe(1);
  });
});

describe('dayKeyOf', () => {
  it('is the local calendar day', () => {
    expect(dayKeyOf(new Date(2026, 9, 31, 23, 59).getTime())).toBe('2026-10-31');
    expect(dayKeyOf(new Date(2026, 10, 1, 0, 1).getTime())).toBe('2026-11-01');
  });
});
