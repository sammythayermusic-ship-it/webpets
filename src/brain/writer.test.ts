import { describe, expect, it } from 'vitest';
import { addSpend, buildLinePrompt, canSpend, cleanLine, spendToday } from './writer';

describe('buildLinePrompt', () => {
  const req = {
    species: 'fish' as const,
    personality: 'zen' as const,
    name: 'Goldie',
    moment: 'thought' as const,
    situation: ['it is evening', 'it ate an hour ago'],
    recent: ['The water is the water.'],
  };

  it('keeps everything that changes out of the system prompt, so it caches', () => {
    const a = buildLinePrompt(req);
    const b = buildLinePrompt({ ...req, moment: 'tap', situation: [], recent: [] });
    expect(a.system).toBe(b.system);
    expect(a.system).toContain('Goldie');
    expect(a.system).toMatch(/kids and adults/);
    expect(a.user).toContain('it is evening; it ate an hour ago');
    expect(a.user).toContain('- The water is the water.');
    expect(b.user).not.toContain('lately');
  });
});

describe('cleanLine', () => {
  it('tidies quotes, a speaker label and spacing', () => {
    expect(cleanLine('  "Bubbles  are   tiny moons."  ')).toBe('Bubbles are tiny moons.');
    expect(cleanLine('Goldie: The plant waved at me.')).toBe('The plant waved at me.');
  });

  it('rejects anything off-brief', () => {
    expect(cleanLine('')).toBeNull();
    expect(cleanLine('x'.repeat(200))).toBeNull();
    expect(cleanLine('Check https://example.com')).toBeNull();
    expect(cleanLine('As an AI, I love water.')).toBeNull();
    expect(cleanLine('Love this bowl 🐟')).toBeNull();
    expect(cleanLine('#blessed bowl life')).toBeNull();
  });
});

describe('spend', () => {
  it('counts per day and stops at the cap', () => {
    expect(spendToday(null, '2026-10-31')).toBe(0);
    let s = addSpend(null, '2026-10-31', 0.1);
    s = addSpend(s, '2026-10-31', 0.1);
    expect(s.usd).toBeCloseTo(0.2);
    expect(canSpend(s, '2026-10-31', 0.25)).toBe(true);
    s = addSpend(s, '2026-10-31', 0.06);
    expect(canSpend(s, '2026-10-31', 0.25)).toBe(false);
    expect(canSpend(s, '2026-11-01', 0.25)).toBe(true);
    expect(addSpend(s, '2026-11-01', 0.01).usd).toBeCloseTo(0.01);
    expect(canSpend(null, '2026-11-01', 0)).toBe(false);
  });
});
