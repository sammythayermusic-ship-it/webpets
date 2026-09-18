import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_MAX_INNER_WIDTH, CARD_MAX_WIDTH, MODAL_GLYPH_MAX_PX, PANTRY_HINT } from './pantryDialog';

// The chrome moved from a monospace bitmap face to a proportional system one, so a line's width is no
// longer its character count times the font size. The first check is therefore an upper bound rather
// than a measurement; the second is the one that actually guarantees nothing overflows the card.
describe('pantry dialog text fits the card', () => {
  it('hint fits on one line inside the widest card (M/L scales)', () => {
    expect(CARD_MAX_WIDTH).toBe(240);
    expect(PANTRY_HINT.length * MODAL_GLYPH_MAX_PX).toBeLessThanOrEqual(CARD_MAX_INNER_WIDTH);
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
