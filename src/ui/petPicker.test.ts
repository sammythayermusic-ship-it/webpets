import { describe, expect, it } from 'vitest';
import { SPECIES_CHOICES, pickerHint } from './petPicker';
import { CARD_MAX_INNER_WIDTH, MODAL_GLYPH_MAX_PX } from './feederDialog';
import { implementedSpecies } from '../species';

describe('the new-pet picker', () => {
  it('has a choice for every species that is built, and nothing else to maintain', () => {
    for (const s of implementedSpecies()) {
      expect(SPECIES_CHOICES[s].label.length).toBeGreaterThan(0);
      expect(SPECIES_CHOICES[s].about.endsWith('.')).toBe(true);
    }
    expect(implementedSpecies().sort()).toEqual(['chicken', 'fish', 'frog', 'hamster']);
  });

  it('says whose place a new pet takes while one is alive, and only asks when none is', () => {
    expect(pickerHint('Gill', true)).toBe("It takes Gill's place.");
    expect(pickerHint('Gill', false)).toBe('Which would you like?');
  });

  it('keeps each line short enough for two lines of the card at most', () => {
    for (const c of Object.values(SPECIES_CHOICES)) expect(c.about.length * MODAL_GLYPH_MAX_PX).toBeLessThanOrEqual(2 * CARD_MAX_INNER_WIDTH);
  });

  it('never talks about money or buying', () => {
    const text = Object.values(SPECIES_CHOICES).map((c) => `${c.label} ${c.about}`).join(' ') + pickerHint('x', true);
    expect(text).not.toMatch(/buy|coin|token|price|\$|free trial|unlock/i);
  });
});
