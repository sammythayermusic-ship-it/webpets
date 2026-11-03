import { describe, expect, it } from 'vitest';
import { ageText } from './petCard';

describe('the pet card', () => {
  it('says how old the pet is in words', () => {
    const born = new Date(2026, 0, 1).getTime();
    const at = (days: number): number => born + days * 86_400_000 + 3_600_000;
    expect(ageText(born, at(0))).toBe('born today');
    expect(ageText(born, at(1))).toBe('1 day old');
    expect(ageText(born, at(9))).toBe('9 days old');
    expect(ageText(born, at(21))).toBe('3 weeks old');
    expect(ageText(born, at(95))).toBe('3 months old');
    expect(ageText(born, at(400))).toBe('1 year old');
    expect(ageText(born, at(800))).toBe('2 years old');
  });
});
