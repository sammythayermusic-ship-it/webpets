import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD_MAX_INNER_WIDTH, CARD_MAX_WIDTH, MODAL_GLYPH_PX, PANTRY_HINT } from './pantryDialog';

// Press Start 2P is a monospace bitmap face: every glyph advances 1 em, so text width is chars × font-size.
describe('pantry dialog text fits the card', () => {
  it('hint fits on one line inside the widest card (M/L scales)', () => {
    expect(CARD_MAX_WIDTH).toBe(240);
    expect(PANTRY_HINT.length * MODAL_GLYPH_PX).toBeLessThanOrEqual(CARD_MAX_INNER_WIDTH);
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
