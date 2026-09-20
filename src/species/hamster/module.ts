// The hamster, packaged as a SpeciesModule. A thin adapter, exactly like the fish's: `layout.ts` stays
// the authority on cage geometry and this only says which constant fills which slot of the contract.

import type { SpeciesModule } from '../types';
import { createHamsterBehavior } from './behavior';
import { CAGE_FLOOR_RECT, CAGE_OPAQUE_RECT, CAGE_PET_ANCHOR, CAGE_SITES, CAGE_STAND_Y, HAMSTER_BODY } from './layout';
import {
  TERR_FLOOR_RECT, TERR_OPAQUE_RECT, TERR_PET_ANCHOR, TERR_SITES, TERR_STAND_Y,
} from './terrarium';
import { HAMSTER_LINES } from './lines';

export const HAMSTER_MODULE: SpeciesModule = {
  species: 'hamster',
  // The terrarium, not the cage. The cage stays selectable and its art still ships -- the behaviour
  // is identical in both, because the sites are data and nothing in the state machine names a cage.
  defaultHabitat: 'terrarium',
  layouts: {
    terrarium: {
      habitat: 'terrarium',
      domain: { kind: 'floor', rect: TERR_FLOOR_RECT, standY: TERR_STAND_Y },
      opaqueRect: TERR_OPAQUE_RECT,
      petAnchor: TERR_PET_ANCHOR,
      body: HAMSTER_BODY,
      sites: TERR_SITES,
    },
    cage: {
      habitat: 'cage',
      domain: { kind: 'floor', rect: CAGE_FLOOR_RECT, standY: CAGE_STAND_Y },
      opaqueRect: CAGE_OPAQUE_RECT,
      petAnchor: CAGE_PET_ANCHOR,
      body: HAMSTER_BODY,
      sites: CAGE_SITES,
    },
  },
  createBehavior: createHamsterBehavior,
  lines: HAMSTER_LINES,
};
