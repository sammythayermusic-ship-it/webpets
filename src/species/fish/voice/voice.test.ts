import { describe, expect, it } from 'vitest';
import type { Personality } from '../../../sim/types';
import type { Moment } from '../../../brain/types';
import { FISH_VOICE } from './index';

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
