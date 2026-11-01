import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../sim/test-helpers';
import { RECENT_LINES, emptyMemory, lineId, normalizeMemory, sayFact, sayLine } from './say';
import type { Voice } from './types';

const voice: Voice = {
  lines: {
    sarcastic: { thought: ['A', 'B', 'C'], fed: ['Hi {name}.', 'Plain.'], visit: ['Hello {you}.'] },
    anxious: {},
    zen: {},
    hyper: {},
  },
  facts: [
    { id: 'f1', text: 'One.', source: { title: 'S1', url: 'https://example.org/1' } },
    { id: 'f2', text: 'Two.', source: { title: 'S2', url: 'https://example.org/2' } },
    { id: 'f3', text: 'Three.', source: { title: 'S3', url: 'https://example.org/3' } },
  ],
  factFrames: { sarcastic: ['Fun fact: {fact}'], anxious: [], zen: [], hyper: [] },
};

describe('sayLine', () => {
  it('does not repeat a line until the whole pool has been said', () => {
    const rng = mulberry32(7);
    let mem = emptyMemory();
    const said: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = sayLine(voice, 'sarcastic', 'thought', mem, rng)!;
      said.push(r.utterance.text);
      mem = r.memory;
    }
    expect([...said].sort()).toEqual(['A', 'B', 'C']);
    // All recent now: the next is the one said longest ago.
    expect(sayLine(voice, 'sarcastic', 'thought', mem, rng)!.utterance.text).toBe(said[0]);
  });

  it('fills tokens, and skips a line whose token has no value', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 10; i++) {
      const r = sayLine(voice, 'sarcastic', 'fed', emptyMemory(), rng, { name: 'Goldie' })!;
      expect(['Hi Goldie.', 'Plain.']).toContain(r.utterance.text);
    }
    expect(sayLine(voice, 'sarcastic', 'fed', emptyMemory(), rng)!.utterance.text).toBe('Plain.');
    expect(sayLine(voice, 'sarcastic', 'visit', emptyMemory(), rng)).toBeNull();
  });

  it('returns null for an empty pool', () => {
    expect(sayLine(voice, 'zen', 'thought', emptyMemory(), mulberry32(1))).toBeNull();
  });

  it('keeps ids stable and memory bounded', () => {
    expect(lineId('A')).toBe(lineId('A'));
    expect(lineId('A')).not.toBe(lineId('B'));
    const long = { recent: Array.from({ length: RECENT_LINES + 20 }, (_, i) => `x${i}`), factsTold: [] };
    const r = sayLine(voice, 'sarcastic', 'thought', long, mulberry32(3))!;
    expect(r.memory.recent.length).toBe(RECENT_LINES);
    expect(r.memory.recent[RECENT_LINES - 1]).toBe(r.utterance.id);
  });
});

describe('sayFact', () => {
  it('tells every fact once before any repeats, framed, with its source', () => {
    const rng = mulberry32(11);
    let mem = emptyMemory();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = sayFact(voice, 'sarcastic', mem, rng)!;
      expect(r.utterance.text.startsWith('Fun fact: ')).toBe(true);
      expect(r.utterance.more?.url).toMatch(/^https:\/\/example\.org\//);
      ids.push(r.utterance.id);
      mem = r.memory;
    }
    expect(new Set(ids).size).toBe(3);
    const again = sayFact(voice, 'sarcastic', mem, rng)!;
    expect(again.memory.factsTold).toHaveLength(1);
  });

  it('says the bare fact when the personality has no frames', () => {
    expect(sayFact(voice, 'zen', emptyMemory(), mulberry32(2))!.utterance.text).toMatch(/^(One|Two|Three)\.$/);
  });
});

describe('normalizeMemory', () => {
  it('drops junk', () => {
    expect(normalizeMemory(null)).toEqual(emptyMemory());
    expect(normalizeMemory({ recent: ['a', 3, 'b'], factsTold: 'no' })).toEqual({ recent: ['a', 'b'], factsTold: [] });
  });
});
