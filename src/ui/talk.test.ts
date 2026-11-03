import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../sim/test-helpers';
import type { Utterance, Voice } from '../brain/types';
import { createTalk, dayKeyOf, type LineWriter, type TalkEnv, type TalkMemory } from './talk';

const voice: Voice = {
  lines: {
    sarcastic: { thought: ['T1', 'T2', 'T3'], fed: ['Yum, {name}.'], visit: ['Oh. You.'], tap: ['Knock.'], hungry: ['Feed me.'] },
    anxious: {},
    zen: {},
    hyper: {},
  },
  facts: [{ id: 'f1', text: 'Fish are cool.', source: { title: 'Src', url: 'https://example.org/f' } }],
  factFrames: { sarcastic: ['Fact: {fact}'], anxious: [], zen: [], hyper: [] },
};

function harness(over: Partial<TalkEnv> = {}) {
  let t = new Date(2026, 9, 31, 7, 0).getTime();
  const shown: Utterance[] = [];
  let saved: TalkMemory | null = null;
  let present = false;
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

describe('dayKeyOf', () => {
  it('is the local calendar day', () => {
    expect(dayKeyOf(new Date(2026, 9, 31, 23, 59).getTime())).toBe('2026-10-31');
    expect(dayKeyOf(new Date(2026, 10, 1, 0, 1).getTime())).toBe('2026-11-01');
  });
});
