// The hamster, packaged as a SpeciesModule. A thin adapter, exactly like the fish's: `layout.ts` stays
// the authority on cage geometry and this only says which constant fills which slot of the contract.

import type { SpeciesModule } from '../types';
import { createHamsterBehavior } from './behavior';
import { CAGE_FLOOR_RECT, CAGE_OPAQUE_RECT, CAGE_PET_ANCHOR, CAGE_SITES, CAGE_STAND_Y, HAMSTER_BODY } from './layout';
import { HAMSTER_LINES } from './lines';

export const HAMSTER_MODULE: SpeciesModule = {
  species: 'hamster',
  layout: {
    habitat: 'cage',
    domain: { kind: 'floor', rect: CAGE_FLOOR_RECT, standY: CAGE_STAND_Y },
    opaqueRect: CAGE_OPAQUE_RECT,
    petAnchor: CAGE_PET_ANCHOR,
    body: HAMSTER_BODY,
    sites: CAGE_SITES,
  },
  createBehavior: createHamsterBehavior,
  lines: HAMSTER_LINES,
};
