import { describe, expect, it } from 'vitest';
import {
  COMFORT_TAU_MS,
  CURIOSITY_TO_FULL_MS,
  ENERGY_ASLEEP_TO_FULL_MS,
  ENERGY_AWAKE_TO_EMPTY_MS,
  GREET_MS,
  LONG_ABSENCE_MS,
  NAP_ENERGY,
  NAP_QUIET_MS,
  NAP_WAKE_ENERGY,
  STRESS_HALF_LIFE_MS,
  advanceNeeds,
  comfortTarget,
  curiosityAt,
  defaultNeeds,
  drivesOf,
  energyAt,
  needsAt,
  normalizeNeeds,
  stimulate,
  stressAt,
  type DrivesContext,
  type NeedsRegime,
  type NeedsState,
} from './needs';
import { HOUR_MS } from './constants';
import type { Personality } from './types';

const B = 1_700_000_000_000;
const H = HOUR_MS;


const awake = (p: Personality = 'zen'): NeedsRegime => ({ asleep: false, hungerLabel: 'full', present: false, personality: p });
const asleep = (p: Personality = 'zen'): NeedsRegime => ({ ...awake(p), asleep: true });
const ctx = (over: Partial<DrivesContext> = {}): DrivesContext => ({ ...awake(), alive: true, napping: false, ...over });

describe('anchors and the clock', () => {
  it('a fresh pet is rested, mildly curious, settled and calm', () => {
    const n = defaultNeeds(B);
    expect(needsAt(n, B, awake())).toEqual({ energy: 1, curiosity: 0.5, comfort: 0.6, stress: 0 });
  });

  it('advancing to a time at or before the anchor changes nothing (backwards clock)', () => {
    const n = defaultNeeds(B);
    expect(advanceNeeds(n, B, awake())).toEqual(n);
    expect(advanceNeeds(n, B - H, awake())).toEqual(n);
  });

  it('splitting a span into segments gives the same answer as one span', () => {
    const n = stimulate(defaultNeeds(B), 'tap', B, awake('anxious'));
    const whole = advanceNeeds(n, B + 3 * H, awake('anxious'));
    const halves = advanceNeeds(advanceNeeds(n, B + 1 * H, awake('anxious')), B + 3 * H, awake('anxious'));
    for (const k of ['energy', 'curiosity', 'stress'] as const) {
      expect(halves[k].value).toBeCloseTo(whole[k].value, 9);
    }
    // Comfort's target depends on decaying stress, evaluated at each segment's midpoint: close, not exact.
    expect(halves.comfort.value).toBeCloseTo(whole.comfort.value, 2);
  });
});

describe('energy', () => {
  it('drains to empty over 16 awake hours and restores to full over 8 asleep', () => {
    const n = defaultNeeds(B);
    expect(energyAt(n, B + ENERGY_AWAKE_TO_EMPTY_MS / 2, awake())).toBeCloseTo(0.5, 9);
    expect(energyAt(n, B + ENERGY_AWAKE_TO_EMPTY_MS, awake())).toBe(0);
    expect(energyAt(n, B + 40 * H, awake())).toBe(0);
    const tired = advanceNeeds(n, B + ENERGY_AWAKE_TO_EMPTY_MS, awake());
    expect(energyAt(tired, tired.energy.at + ENERGY_ASLEEP_TO_FULL_MS / 2, asleep())).toBeCloseTo(0.5, 9);
    expect(energyAt(tired, tired.energy.at + ENERGY_ASLEEP_TO_FULL_MS, asleep())).toBe(1);
  });

  it('a starving pet runs out twice as fast; a hungry one 1.3x', () => {
    const n = defaultNeeds(B);
    expect(energyAt(n, B + 4 * H, { ...awake(), hungerLabel: 'starving' })).toBeCloseTo(1 - 0.5, 9);
    expect(energyAt(n, B + 4 * H, { ...awake(), hungerLabel: 'hungry' })).toBeCloseTo(1 - 0.25 * 1.3, 9);
  });
});

describe('curiosity', () => {
  it('rises to full in two quiet hours for a baseline personality and faster for a degen', () => {
    const n = { ...defaultNeeds(B), curiosity: { value: 0, at: B } };
    expect(curiosityAt(n, B + CURIOSITY_TO_FULL_MS, { ...awake('zen'), personality: 'zen' })).toBeCloseTo(0.6, 9);
    expect(curiosityAt(n, B + CURIOSITY_TO_FULL_MS, awake('degen'))).toBe(1);
    expect(curiosityAt(n, B + CURIOSITY_TO_FULL_MS / 1.6, awake('degen'))).toBeCloseTo(1, 9);
  });

  it('does not build while asleep or while starving', () => {
    const n = { ...defaultNeeds(B), curiosity: { value: 0.2, at: B } };
    expect(curiosityAt(n, B + 10 * H, asleep('degen'))).toBe(0.2);
    expect(curiosityAt(n, B + 1 * H, { ...awake('degen'), hungerLabel: 'starving' })).toBeCloseTo(0.2 + 0.5 * 1.6 * 0.3, 9);
  });

  it('a pointer arrival spends half of it; a tap and a meal spend less', () => {
    const n = { ...defaultNeeds(B), curiosity: { value: 0.9, at: B } };
    expect(stimulate(n, 'pointer', B, awake()).curiosity.value).toBeCloseTo(0.4, 9);
    expect(stimulate(n, 'tap', B, awake()).curiosity.value).toBeCloseTo(0.6, 9);
    expect(stimulate(n, 'feed', B, awake()).curiosity.value).toBeCloseTo(0.7, 9);
    expect(stimulate(n, 'bite', B, awake()).curiosity.value).toBeCloseTo(0.85, 9);
  });
});

describe('stress', () => {
  it('a tap adds a jolt sized by personality and it halves every ten minutes', () => {
    const z = stimulate(defaultNeeds(B), 'tap', B, awake('zen'));
    const a = stimulate(defaultNeeds(B), 'tap', B, awake('anxious'));
    expect(z.stress.value).toBeCloseTo(0.15, 9);
    expect(a.stress.value).toBeCloseTo(0.4, 9);
    expect(stressAt(a, B + STRESS_HALF_LIFE_MS)).toBeCloseTo(0.2, 9);
    expect(stressAt(a, B + 3 * STRESS_HALF_LIFE_MS)).toBeCloseTo(0.05, 9);
  });

  it('taps stack, and are capped at 1', () => {
    let n = defaultNeeds(B);
    n = stimulate(n, 'tap', B, awake('anxious'));
    n = stimulate(n, 'tap', B + 1000, awake('anxious'));
    expect(n.stress.value).toBeCloseTo(0.4 * Math.pow(0.5, 1000 / STRESS_HALF_LIFE_MS) + 0.4, 6);
    n = stimulate(n, 'tap', B + 2000, awake('anxious'));
    expect(n.stress.value).toBe(1);
  });
});

describe('comfort', () => {
  it('has a target set by personality, hunger, stress, company and sleep', () => {
    expect(comfortTarget(0, awake('zen'))).toBeCloseTo(1, 9); // 0.75 + 0.25 full
    expect(comfortTarget(0, awake('anxious'))).toBeCloseTo(0.65, 9);
    expect(comfortTarget(0, { ...awake('anxious'), hungerLabel: 'starving' })).toBeCloseTo(0, 9);
    expect(comfortTarget(1, awake('zen'))).toBeCloseTo(0.5, 9);
    expect(comfortTarget(0, { ...awake('degen'), present: true })).toBeCloseTo(0.6 + 0.25 + 0.13, 9);
    expect(comfortTarget(0, asleep('sarcastic'))).toBeCloseTo(0.55 + 0.25 + 0.1, 9);
  });

  it('eases toward its target with a 45-minute time constant', () => {
    const n = { ...defaultNeeds(B), comfort: { value: 0, at: B } };
    const target = comfortTarget(0, awake('zen'));
    expect(needsAt(n, B + COMFORT_TAU_MS, awake('zen')).comfort).toBeCloseTo(target * (1 - Math.exp(-1)), 9);
    expect(needsAt(n, B + 20 * H, awake('zen')).comfort).toBeCloseTo(target, 6);
  });
});

describe('the attention model', () => {
  it('greets you only after a long absence, for twenty seconds', () => {
    const n = defaultNeeds(B);
    const soon = stimulate(n, 'pointer', B + LONG_ABSENCE_MS - 1, awake());
    expect(soon.greetUntil).toBe(0);
    const later = stimulate(n, 'pointer', B + LONG_ABSENCE_MS, awake());
    expect(later.greetUntil).toBe(B + LONG_ABSENCE_MS + GREET_MS);
    const c = ctx({ present: true });
    expect(drivesOf(later, B + LONG_ABSENCE_MS + 1000, c).greet).toBe(true);
    expect(drivesOf(later, B + LONG_ABSENCE_MS + GREET_MS, c).greet).toBe(false);
    expect(drivesOf(later, B + LONG_ABSENCE_MS + 1000, { ...c, present: false }).greet).toBe(false);
  });

  it('being present keeps lastSeenAt current, so no greeting is due after a long visit', () => {
    let n = defaultNeeds(B);
    n = advanceNeeds(n, B + 3 * H, { ...awake(), present: true });
    expect(n.lastSeenAt).toBe(B + 3 * H);
    expect(stimulate(n, 'pointer', B + 3 * H + 1000, awake()).greetUntil).toBe(0);
  });

  it('a rattled pet does not come to greet you', () => {
    let n = defaultNeeds(B);
    n = stimulate(n, 'pointer', B + LONG_ABSENCE_MS, awake('anxious'));
    n = stimulate(n, 'tap', B + LONG_ABSENCE_MS, awake('anxious'));
    n = stimulate(n, 'tap', B + LONG_ABSENCE_MS, awake('anxious'));
    expect(drivesOf(n, B + LONG_ABSENCE_MS + 1000, ctx({ present: true, personality: 'anxious' })).greet).toBe(false);
  });
});

describe('drives', () => {
  it('a dead pet wants nothing; an asleep pet only hides from stress', () => {
    const n = defaultNeeds(B);
    expect(drivesOf(n, B, ctx({ alive: false }))).toEqual({ activity: 0, approach: 0, hide: 0, nap: false, greet: false, surface: 0 });
    const d = drivesOf(n, B, ctx({ asleep: true }));
    expect(d.activity).toBe(0);
    expect(d.approach).toBe(0);
    expect(d.nap).toBe(false);
  });

  it('activity follows energy and collapses with starvation', () => {
    const n = defaultNeeds(B);
    const rested = drivesOf(n, B, ctx()).activity;
    const tired = drivesOf(n, B + 12 * H, ctx()).activity;
    expect(rested).toBeGreaterThan(tired);
    expect(tired).toBeGreaterThan(0);
    expect(drivesOf(n, B, ctx({ hungerLabel: 'starving' })).activity).toBeLessThan(rested * 0.5);
    expect(drivesOf(n, B, ctx({ personality: 'degen' })).activity).toBeGreaterThan(drivesOf(n, B, ctx({ personality: 'zen' })).activity);
  });

  it('naps when exhausted and quiet, and keeps napping until half rested', () => {
    const n = { ...defaultNeeds(B), energy: { value: NAP_ENERGY - 0.01, at: B }, lastStimulusAt: B - NAP_QUIET_MS };
    expect(drivesOf(n, B, ctx()).nap).toBe(true);
    expect(drivesOf({ ...n, lastStimulusAt: B }, B, ctx()).nap).toBe(false);
    const halfway = { ...n, energy: { value: (NAP_ENERGY + NAP_WAKE_ENERGY) / 2, at: B } };
    expect(drivesOf(halfway, B, ctx({ napping: true })).nap).toBe(true);
    expect(drivesOf(halfway, B, ctx({ napping: false })).nap).toBe(false);
    expect(drivesOf({ ...n, energy: { value: NAP_WAKE_ENERGY, at: B } }, B, ctx({ napping: true })).nap).toBe(false);
  });

  it('approach needs someone there, grows with curiosity, and a sarcastic pet ignores you until it cannot', () => {
    const bored = { ...defaultNeeds(B), curiosity: { value: 1, at: B } };
    const sated = { ...defaultNeeds(B), curiosity: { value: 0, at: B } };
    expect(drivesOf(bored, B, ctx()).approach).toBe(0);
    expect(drivesOf(bored, B, ctx({ present: true })).approach).toBeGreaterThan(drivesOf(sated, B, ctx({ present: true })).approach);
    const s = ctx({ present: true, personality: 'sarcastic' });
    const mild = { ...defaultNeeds(B), curiosity: { value: 0.5, at: B } };
    expect(drivesOf(mild, B, s).approach).toBeLessThan(0.25);
    expect(drivesOf(bored, B, s).approach).toBeGreaterThanOrEqual(0.9);
  });

  it('hides after taps, sooner for an anxious pet, and when starving', () => {
    let a = defaultNeeds(B);
    let z = defaultNeeds(B);
    for (let i = 0; i < 2; i++) {
      a = stimulate(a, 'tap', B, awake('anxious'));
      z = stimulate(z, 'tap', B, awake('zen'));
    }
    expect(drivesOf(a, B, ctx({ personality: 'anxious' })).hide).toBeGreaterThan(0.5);
    expect(drivesOf(z, B, ctx({ personality: 'zen' })).hide).toBe(0);
    expect(drivesOf(defaultNeeds(B), B, ctx({ hungerLabel: 'starving' })).hide).toBeGreaterThan(0);
    expect(drivesOf(defaultNeeds(B), B + 2 * H, ctx({ personality: 'anxious' })).hide).toBe(0);
  });

  it('surface interest peaks when hungry and fades when exhausted', () => {
    const n = defaultNeeds(B);
    const full = drivesOf(n, B, ctx()).surface;
    const hungry = drivesOf(n, B, ctx({ hungerLabel: 'hungry' })).surface;
    const starving = drivesOf(n, B, ctx({ hungerLabel: 'starving' })).surface;
    expect(hungry).toBeGreaterThan(full);
    expect(starving).toBeLessThan(hungry);
    expect(drivesOf(n, B + 16 * H, ctx({ hungerLabel: 'hungry' })).surface).toBeCloseTo(hungry * 0.4, 9);
  });
});

describe('normalizeNeeds', () => {
  it('fills a missing or partial block from the defaults', () => {
    expect(normalizeNeeds(undefined, B)).toEqual(defaultNeeds(B));
    expect(normalizeNeeds('nope', B)).toEqual(defaultNeeds(B));
    const partial: Partial<NeedsState> = { energy: { value: 0.3, at: B - H }, greetUntil: B + 5 };
    const n = normalizeNeeds(partial, B);
    expect(n.energy).toEqual({ value: 0.3, at: B - H });
    expect(n.greetUntil).toBe(B + 5);
    expect(n.curiosity).toEqual(defaultNeeds(B).curiosity);
  });

  it('clamps a stored value into 0..1 and drops a malformed anchor', () => {
    const n = normalizeNeeds({ stress: { value: 7, at: B }, comfort: { value: 'x', at: B } }, B);
    expect(n.stress).toEqual({ value: 1, at: B });
    expect(n.comfort).toEqual(defaultNeeds(B).comfort);
  });
});

describe('a day in the life', () => {
  it('a zen fish left alone: curious by lunch, tired by evening, rested after a night', () => {
    let n = defaultNeeds(B); // 08:00
    n = advanceNeeds(n, B + 4 * H, awake()); // noon
    const noon = needsAt(n, B + 4 * H, awake());
    expect(noon.curiosity).toBeGreaterThan(0.9);
    expect(noon.energy).toBeCloseTo(0.75, 9);
    n = advanceNeeds(n, B + 15 * H, awake()); // 23:00
    expect(drivesOf(n, B + 15 * H, ctx()).nap).toBe(true);
    n = advanceNeeds(n, B + 23 * H, asleep()); // 07:00 after eight hours asleep
    expect(needsAt(n, B + 23 * H, asleep()).energy).toBe(1);
  });
});
