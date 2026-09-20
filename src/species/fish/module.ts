// The fish, packaged as a SpeciesModule.
//
// A thin adapter over the existing constants rather than a rewrite of them: `layout.ts` stays the
// authority on the bowl's geometry (and its tests keep asserting it against the manifest), and this
// file only states which of those constants fill which slot of the shared contract.

import type { SpeciesModule } from '../types';
import { createFishBehavior } from './behavior';
import { BOWL_OPAQUE_RECT, BOWL_PET_ANCHOR, BOWL_WATER_SHAPE, FISH_BODY } from './layout';
import { FISH_LINES } from './lines';

export const FISH_MODULE: SpeciesModule = {
  species: 'fish',
  defaultHabitat: 'bowl',
  layouts: {
    bowl: {
      habitat: 'bowl',
      domain: { kind: 'water', shape: BOWL_WATER_SHAPE },
      opaqueRect: BOWL_OPAQUE_RECT,
      petAnchor: BOWL_PET_ANCHOR,
      body: FISH_BODY,
      // A bowl has no furniture: every target the fish picks is computed from the water volume.
      // `sites` stays undefined rather than empty so "this species navigates to places" is a visible
      // distinction rather than a silently empty lookup.
    },
  },
  createBehavior: createFishBehavior,
  lines: FISH_LINES,
};
