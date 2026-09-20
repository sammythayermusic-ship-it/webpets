import { describe, expect, it } from 'vitest';
import { hungerLabel } from '../sim/hunger';
import { DEFAULT_CONSTANTS, FULL_ABOVE } from '../sim/constants';
import { labelFor } from './model';

// `hungerLabel` (sim) and `labelFor` (ui) are the same function written twice, on purpose: `src/ui` must
// not import `src/sim`, and docs/DECISIONS.md records that as a deliberate boundary. What it did NOT
// record is anything holding the two copies together -- the upper boundary was the literal `60` in both
// files, and retuning the hunger clock is exactly the kind of change that would have moved one and not
// the other. The symptom would have been almost invisible: the tray and HUD calling the fish "hungry"
// while its posture, its starving tint and its mood still thought it was peckish, because those read the
// sim copy and everything else reads the ui copy.
//
// Deliberate duplication is only safe while something fails when the copies disagree. This is that thing.

describe('the two hunger labels', () => {
  it('agree at every tenth of a point across the whole range', () => {
    for (let h = 0; h <= 1000; h += 1) {
      const v = h / 10;
      expect(labelFor(v), `hunger ${v}`).toBe(hungerLabel(v));
    }
  });

  it('agree on the exact boundaries, where an inclusive/exclusive slip would hide', () => {
    // The interesting values are the boundaries themselves and the smallest step either side, because
    // that is where `>` and `<=` disagree and nowhere else.
    const { PANTRY_TRIGGER } = DEFAULT_CONSTANTS;
    for (const h of [0, 0.01, PANTRY_TRIGGER - 0.01, PANTRY_TRIGGER, PANTRY_TRIGGER + 0.01, FULL_ABOVE - 0.01, FULL_ABOVE, FULL_ABOVE + 0.01, 100]) {
      expect(labelFor(h), `hunger ${h}`).toBe(hungerLabel(h));
    }
  });

  it('agree on values no pet should ever have', () => {
    // Neither is the guard; both are reached from a dev-panel override or a corrupt save.
    for (const h of [-1, -0.0001, 100.5, 1e9, Number.MAX_SAFE_INTEGER]) {
      expect(labelFor(h), `hunger ${h}`).toBe(hungerLabel(h));
    }
  });

  it('still names the four states in the order the contract gives them', () => {
    expect(hungerLabel(100)).toBe('full');
    expect(hungerLabel(FULL_ABOVE)).toBe('peckish');
    expect(hungerLabel(DEFAULT_CONSTANTS.PANTRY_TRIGGER)).toBe('hungry');
    expect(hungerLabel(0)).toBe('starving');
  });
});
