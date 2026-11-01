import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CARD_MAX_INNER_WIDTH,
  CARD_MAX_WIDTH,
  FEEDER_TITLE,
  FILL_LABEL,
  MODAL_GLYPH_MAX_PX,
  feederAmountText,
  feederHint,
} from './feederDialog';
import { NAME_POOLS } from '../sim/pet';
import { PANTRY_CAPACITY } from '../sim/constants';

describe('holiday feeder dialog copy', () => {
  it('says how much food is in the feeder, in days, then meals, then empty', () => {
    expect(feederAmountText(PANTRY_CAPACITY)).toBe('3 DAYS OF FOOD');
    expect(feederAmountText(125)).toBe('2 DAYS OF FOOD');
    expect(feederAmountText(50)).toBe('1 DAY OF FOOD');
    expect(feederAmountText(25)).toBe('1 MEAL LEFT');
    expect(feederAmountText(24)).toBe('EMPTY');
    expect(feederAmountText(0)).toBe('EMPTY');
    expect(feederHint('Gus')).toBe("It feeds Gus while you're away.");
  });

  it('never mentions money', () => {
    const copy = [FEEDER_TITLE, FILL_LABEL, feederHint('Gus'), ...[0, 25, 50, 150].map(feederAmountText)].join(' ');
    expect(copy).not.toMatch(/\$|balance|deposit|withdraw|price|cost|buy|pay/i);
  });
});

// The chrome moved from a monospace bitmap face to a proportional system one, so a line's width is no
// longer its character count times the font size. The first checks are therefore upper bounds rather
// than measurements; the last is the one that actually guarantees nothing overflows the card.
describe('feeder dialog text fits the card', () => {
  it('the amount fits on one line inside the widest card (M/L scales)', () => {
    expect(CARD_MAX_WIDTH).toBe(240);
    for (const pantry of [0, 25, 50, 75, 100, 125, PANTRY_CAPACITY]) {
      expect(feederAmountText(pantry).length * MODAL_GLYPH_MAX_PX).toBeLessThanOrEqual(CARD_MAX_INNER_WIDTH);
    }
    expect(FILL_LABEL.length * MODAL_GLYPH_MAX_PX).toBeLessThanOrEqual(CARD_MAX_INNER_WIDTH);
  });

  it('the hint takes at most two lines with the longest built-in name', () => {
    const longest = Object.values(NAME_POOLS)
      .flat()
      .reduce((a, b) => (b.length > a.length ? b : a), '');
    expect(feederHint(longest).length * MODAL_GLYPH_MAX_PX).toBeLessThanOrEqual(2 * CARD_MAX_INNER_WIDTH);
  });

  it('.modal .line wraps instead of overflowing the card border', () => {
    const css = readFileSync(resolve(__dirname, 'styles.css'), 'utf8');
    const block = /\.modal \.line \{([^}]*)\}/.exec(css);
    expect(block).not.toBeNull();
    const body = block![1];
    expect(body).toMatch(/white-space:\s*normal/);
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
    expect(body).not.toMatch(/nowrap/);
  });
});
