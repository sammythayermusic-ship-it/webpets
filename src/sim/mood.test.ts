import { describe, expect, it } from 'vitest';
import { HOUR_MS, MINUTE_MS } from './constants';
import { decayAttention, moodAnim, moodOf, type MoodInput } from './mood';
import { hungerLabel } from './hunger';
import type { Personality } from './types';

/**
 * The mood engine has no clock and no RNG, so every one of these is an exact statement about the model
 * rather than a sample of it. They are written as claims about the ANIMAL — "a starving pet is not its
 * most energetic" — because that is the thing that would be wrong if the arithmetic drifted, and a test
 * that just restated the formula would not notice.
 */

function input(over: Partial<MoodInput> = {}): MoodInput {
  const hunger = over.hunger ?? 80;
  return {
    hunger,
    label: hungerLabel(hunger),
    alive: true,
    asleep: false,
    personality: 'zen',
    sinceFedMs: 2 * HOUR_MS,
    attention: 0,
    sinceInteractionMs: 2 * HOUR_MS,
    ...over,
  };
}

const PERSONALITIES: Personality[] = ['zen', 'sarcastic', 'anxious', 'hyper'];

describe('the shape of the model', () => {
  it('keeps valence and arousal in range for every combination it can be asked about', () => {
    for (const personality of PERSONALITIES) {
      for (const hunger of [0, 1, 10, 20, 30, 50, 80, 100]) {
        for (const attention of [0, 0.5, 1]) {
          for (const sinceFedMs of [0, MINUTE_MS, HOUR_MS, 48 * HOUR_MS]) {
            for (const asleep of [false, true]) {
              const m = moodOf(input({ personality, hunger, label: hungerLabel(hunger), attention, sinceFedMs, asleep }));
              expect(m.valence, `valence for ${personality} h=${hunger}`).toBeGreaterThanOrEqual(-1);
              expect(m.valence).toBeLessThanOrEqual(1);
              expect(m.arousal).toBeGreaterThanOrEqual(0);
              expect(m.arousal).toBeLessThanOrEqual(1);
              expect(m.interest).toBeGreaterThanOrEqual(0);
              expect(m.interest).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
  });

  it('is deterministic: the same inputs give the same mood', () => {
    const i = input({ hunger: 42, attention: 0.3, sinceFedMs: 11 * MINUTE_MS });
    expect(moodOf(i)).toEqual(moodOf(i));
  });

  it('a dead pet has no mood to report, and does not throw being asked', () => {
    const m = moodOf(input({ alive: false }));
    expect(m.label).toBe('miserable');
    expect(m.interest).toBe(0);
    expect(moodAnim(m)).toBeNull();
  });
});

describe('hunger', () => {
  it('feels worse the hungrier it gets, at every step', () => {
    const vs = [0, 10, 30, 60, 100].map((hunger) => moodOf(input({ hunger, label: hungerLabel(hunger) })).valence);
    for (let i = 1; i < vs.length; i += 1) expect(vs[i], `h step ${i}`).toBeGreaterThan(vs[i - 1] ?? 0);
  });

  it('is agitated when hungry but LETHARGIC when starving, not its most energetic', () => {
    // The trap a linear model falls into: arousal rising with need would make an animal at death's door
    // the liveliest thing on screen.
    const peckish = moodOf(input({ hunger: 55, label: hungerLabel(55) })).arousal;
    const hungry = moodOf(input({ hunger: 20, label: hungerLabel(20) })).arousal;
    const starving = moodOf(input({ hunger: 0, label: hungerLabel(0) })).arousal;
    expect(hungry).toBeGreaterThan(peckish);
    expect(starving).toBeLessThan(peckish);
    expect(starving).toBeLessThan(hungry);
  });

  it('a starving pet is miserable and has no interest in investigating anything', () => {
    const m = moodOf(input({ hunger: 0, label: 'starving', attention: 1 }));
    expect(m.valence).toBeLessThan(-0.4);
    expect(m.interest).toBeLessThan(0.35);
    expect(moodAnim(m)).toBeNull();
  });
});

describe('feeding', () => {
  it('lifts the mood, and the lift fades', () => {
    const just = moodOf(input({ sinceFedMs: 0 }));
    const later = moodOf(input({ sinceFedMs: 20 * MINUTE_MS }));
    const longAgo = moodOf(input({ sinceFedMs: 6 * HOUR_MS }));
    expect(just.valence).toBeGreaterThan(later.valence);
    expect(later.valence).toBeGreaterThan(longAgo.valence);
  });

  it('the thrill fades faster than the contentment', () => {
    // Arousal is on a 3-minute half-life and valence on 20, so ten minutes after a meal the pet should
    // have calmed down while still feeling good about it.
    const fresh = moodOf(input({ sinceFedMs: 0 }));
    const after = moodOf(input({ sinceFedMs: 10 * MINUTE_MS }));
    const arousalLost = (fresh.arousal - after.arousal) / fresh.arousal;
    const valenceLost = (fresh.valence - after.valence) / fresh.valence;
    expect(arousalLost).toBeGreaterThan(valenceLost);
  });
});

describe('attention', () => {
  it('rises in seconds of presence and fades over minutes of absence', () => {
    // Asymmetric deliberately: a pet that forgot you the instant your cursor left would read as a state
    // machine, and one as slow to notice as to miss you would never react to a passing visit.
    let a = 0;
    for (let i = 0; i < 10; i += 1) a = decayAttention(a, 1000, true);
    expect(a).toBeCloseTo(0.5, 2);
    const afterTenSecondsAway = decayAttention(a, 10_000, false);
    expect(afterTenSecondsAway).toBeGreaterThan(0.4); // barely moved
    let b = a;
    for (let i = 0; i < 180; i += 1) b = decayAttention(b, 1000, false);
    expect(b).toBe(0);
  });

  it('clamps, and ignores a zero or negative step', () => {
    expect(decayAttention(0.5, 0, true)).toBe(0.5);
    expect(decayAttention(0.5, -5, false)).toBe(0.5);
    expect(decayAttention(1, 60_000, true)).toBe(1);
    expect(decayAttention(0, 60_000, false)).toBe(0);
  });

  it('being watched makes a well-fed pet curious rather than merely pleased', () => {
    const alone = moodOf(input({ hunger: 70, attention: 0, sinceInteractionMs: HOUR_MS }));
    const watched = moodOf(input({ hunger: 70, attention: 1, sinceInteractionMs: 0 }));
    expect(watched.valence).toBeGreaterThan(alone.valence);
    expect(watched.interest).toBeGreaterThan(alone.interest);
    expect(watched.label).toBe('curious');
  });

  it('gets lonely when ignored for a long time', () => {
    const seenRecently = moodOf(input({ hunger: 45, attention: 0.2, sinceInteractionMs: MINUTE_MS }));
    const ignored = moodOf(input({ hunger: 45, attention: 0, sinceInteractionMs: 12 * HOUR_MS }));
    expect(ignored.valence).toBeLessThan(seenRecently.valence);
    expect(ignored.label).toBe('lonely');
  });
});

describe('sleep', () => {
  it('is calm whatever it was doing a moment ago, and stops investigating', () => {
    const wiredThenAsleep = moodOf(input({ hunger: 100, sinceFedMs: 0, attention: 1, asleep: true, personality: 'hyper' }));
    expect(wiredThenAsleep.arousal).toBeLessThanOrEqual(0.18);
    expect(wiredThenAsleep.label).toBe('sleepy');
    expect(wiredThenAsleep.interest).toBe(0);
  });
});

describe('personality', () => {
  it('changes the resting mood, not just its labels', () => {
    const base = { hunger: 55, label: hungerLabel(55) } as const;
    const zen = moodOf(input({ ...base, personality: 'zen' }));
    const anxious = moodOf(input({ ...base, personality: 'anxious' }));
    const hyper = moodOf(input({ ...base, personality: 'hyper' }));
    expect(zen.valence).toBeGreaterThan(anxious.valence);
    expect(zen.arousal).toBeLessThan(hyper.arousal);
  });

  it('changes how far the mood MOVES, which is what makes them feel different over time', () => {
    // A zen pet is not merely happier than an anxious one; it is less moved by the same bad news.
    const swing = (p: Personality): number => {
      const good = moodOf(input({ personality: p, hunger: 95, label: hungerLabel(95), sinceFedMs: 0 }));
      const bad = moodOf(input({ personality: p, hunger: 5, label: hungerLabel(5), sinceFedMs: 20 * HOUR_MS }));
      return good.valence - bad.valence;
    };
    expect(swing('zen')).toBeLessThan(swing('anxious'));
    expect(swing('zen')).toBeLessThan(swing('hyper'));
  });
});

describe('moodAnim', () => {
  it('only ever asks for the three states that exist to express feeling', () => {
    const seen = new Set<string>();
    for (const personality of PERSONALITIES) {
      for (const hunger of [0, 15, 40, 70, 100]) {
        for (const attention of [0, 0.5, 1]) {
          for (const sinceFedMs of [0, 5 * MINUTE_MS, 3 * HOUR_MS]) {
            const a = moodAnim(moodOf(input({ personality, hunger, label: hungerLabel(hunger), attention, sinceFedMs })));
            if (a) seen.add(a);
          }
        }
      }
    }
    // Everything else -- eating, hunger posture, sleep, death -- is the simulation's call and outranks
    // the mood, so moodAnim must never name one of those states.
    expect([...seen].sort()).toEqual(['curious', 'excited', 'happy']);
  });

  it('reaches every one of them under conditions the app can actually produce', () => {
    expect(moodAnim(moodOf(input({ hunger: 100, sinceFedMs: 0, attention: 1, personality: 'hyper' })))).toBe('excited');
    expect(moodAnim(moodOf(input({ hunger: 80, attention: 0.7, sinceInteractionMs: 0, personality: 'zen' })))).toBe('curious');
    expect(moodAnim(moodOf(input({ hunger: 90, sinceFedMs: 30 * MINUTE_MS, attention: 0, personality: 'zen' })))).toBe('happy');
  });
});
