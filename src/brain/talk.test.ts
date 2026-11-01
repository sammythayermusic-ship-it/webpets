import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../sim/test-helpers';
import { TALK, decide, initialTalk, normalizeTalk, react, type TalkInput, type TalkState, type Volunteer } from './talk';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;

function input(over: Partial<TalkInput> = {}): TalkInput {
  return {
    now: T0,
    present: false,
    awake: true,
    busy: false,
    muted: false,
    alive: true,
    night: false,
    dayKey: '2026-10-31',
    hour: 15,
    rng: mulberry32(5),
    ...over,
  };
}

/** Run decide once a second over [from, to), collecting what was said and when. */
function run(s0: TalkState, from: number, to: number, over: (t: number) => Partial<TalkInput> = () => ({})) {
  let s = s0;
  const rng = mulberry32(9);
  const said: { at: number; say: Volunteer }[] = [];
  for (let t = from; t < to; t += 1000) {
    const r = decide(s, input({ now: t, rng, ...over(t) }));
    s = r.state;
    if (r.say) said.push({ at: t, say: r.say });
  }
  return { said, state: s };
}

describe('decide', () => {
  it('stays quiet most of the time when nobody is around: a few lines an hour at most', () => {
    const { said } = run(initialTalk(T0, mulberry32(1)), T0, T0 + 6 * HOUR);
    const perHour = said.length / 6;
    expect(perHour).toBeGreaterThan(1);
    expect(perHour).toBeLessThan(5);
    for (let i = 1; i < said.length; i++) expect(said[i]!.at - said[i - 1]!.at).toBeGreaterThanOrEqual(TALK.MIN_GAP_MS);
  });

  it('says hello when you come back after a while, then talks more while you stay', () => {
    const s = { ...initialTalk(T0, mulberry32(1)), nextThoughtAt: T0 + HOUR };
    const { said } = run(s, T0 + 10 * MIN, T0 + 15 * MIN, () => ({ present: true }));
    expect(said[0]).toEqual({ at: T0 + 10 * MIN, say: 'visit' });
    const thoughts = said.filter((x) => x.say === 'thought' || x.say === 'fact');
    expect(thoughts.length).toBeGreaterThanOrEqual(2);
    expect(thoughts.length).toBeLessThanOrEqual(TALK.THOUGHTS_PER_VISIT);
  });

  it('says welcome back after hours away, and good morning on the first visit of a morning', () => {
    const s = initialTalk(T0, mulberry32(1));
    expect(decide(s, input({ now: T0 + 3 * HOUR, present: true })).say).toBe('welcome-back');
    const m = decide(s, input({ now: T0 + 3 * HOUR, present: true, hour: 8 }));
    expect(m.say).toBe('morning');
    // Only once that day.
    const left = decide(m.state, input({ now: T0 + 3 * HOUR + MIN, present: false, hour: 8 })).state;
    expect(decide(left, input({ now: T0 + 3 * HOUR + 10 * MIN, present: true, hour: 8 })).say).toBe('visit');
  });

  it('says nothing volunteered while you type, while muted, or when the pet has died', () => {
    const s = { ...initialTalk(T0, mulberry32(1)), nextThoughtAt: T0 };
    expect(decide(s, input({ busy: true })).say).toBeNull();
    expect(decide(s, input({ muted: true })).say).toBeNull();
    expect(decide(s, input({ alive: false })).say).toBeNull();
    expect(decide(s, input()).say).not.toBeNull();
  });

  it('says goodnight once when it settles for the night, then sleeps', () => {
    const s = { ...initialTalk(T0, mulberry32(1)), nextThoughtAt: T0 };
    const { said } = run(s, T0, T0 + 4 * HOUR, () => ({ night: true, awake: false }));
    expect(said).toEqual([{ at: T0, say: 'night' }]);
  });

  it('notices when nobody has come by for hours, but not more than every few hours', () => {
    const s = { ...initialTalk(T0, mulberry32(1)), nextThoughtAt: Number.POSITIVE_INFINITY };
    const { said } = run(s, T0, T0 + 7 * HOUR);
    expect(said.map((x) => x.say)).toEqual(['lonely', 'lonely']);
    expect(said[1]!.at - said[0]!.at).toBeGreaterThanOrEqual(TALK.LONELY_AFTER_MS);
  });

  it('never goes over the hourly cap', () => {
    const s = initialTalk(T0, mulberry32(1));
    let count = 0;
    let st = s;
    // Come and go every 4 minutes for an hour: a hello each time, thoughts in between.
    for (let t = T0; t < T0 + HOUR; t += 1000) {
      const present = Math.floor((t - T0) / (4 * MIN)) % 2 === 1;
      const r = decide(st, input({ now: t, present }));
      st = r.state;
      if (r.say && r.say !== 'visit' && r.say !== 'welcome-back' && r.say !== 'morning') count++;
    }
    expect(count).toBeLessThanOrEqual(TALK.HOURLY_CAP);
  });
});

describe('react', () => {
  const base = { now: T0, muted: false, alive: true, rng: mulberry32(3) };

  it('answers a meal, but not twice inside the gap', () => {
    const s = initialTalk(T0, mulberry32(1));
    const a = react(s, 'fed', base);
    expect(a.say).toBe(true);
    expect(react(a.state, 'meal', { ...base, now: T0 + 5000 }).say).toBe(false);
    expect(react(a.state, 'meal', { ...base, now: T0 + TALK.MIN_GAP_MS }).say).toBe(true);
  });

  it('lets hunger through a short gap, never over a bubble that just went up', () => {
    const s = react(initialTalk(T0, mulberry32(1)), 'fed', base).state;
    expect(react(s, 'hungry', { ...base, now: T0 + 2000 }).say).toBe(false);
    expect(react(s, 'hungry', { ...base, now: T0 + 6000 }).say).toBe(true);
  });

  it('is silent when muted or dead', () => {
    const s = initialTalk(T0, mulberry32(1));
    expect(react(s, 'fed', { ...base, muted: true }).say).toBe(false);
    expect(react(s, 'starving', { ...base, alive: false }).say).toBe(false);
  });
});

describe('normalizeTalk', () => {
  it('restores what it can and starts fresh otherwise', () => {
    const r = normalizeTalk({ lastSpokeAt: T0 - 1000, spoken: [T0 - 2 * HOUR, T0 - MIN, 'x'], nightSaidOn: '2026-10-30' }, T0, mulberry32(1));
    expect(r.lastSpokeAt).toBe(T0 - 1000);
    expect(r.spoken).toEqual([T0 - MIN]);
    expect(r.nightSaidOn).toBe('2026-10-30');
    expect(normalizeTalk('junk', T0, mulberry32(1)).spoken).toEqual([]);
  });
});
