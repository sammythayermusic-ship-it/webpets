// The chicken, packaged as a SpeciesModule. Two habitats that are two stages of one life: a chick in
// the brooder, then (after seven days, decided by the sim) a hen in the coop. The behaviour is one
// state machine told which bird it is.

import type { SpeciesModule } from '../types';
import { createChickenBehavior } from './behavior';
import {
  BROODER_FLOOR_RECT, BROODER_FOOD_ROW, BROODER_OPAQUE_RECT, BROODER_PET_ANCHOR, BROODER_SITES, BROODER_STAND_Y, CHICK_BODY,
  COOP_FLOOR_RECT, COOP_FOOD_ROW, COOP_OPAQUE_RECT, COOP_PET_ANCHOR, COOP_SITES, COOP_STAND_Y, HEN_BODY,
} from './layout';
import { CHICKEN_VOICE } from './voice/index';

export const CHICKEN_MODULE: SpeciesModule = {
  species: 'chicken',
  defaultHabitat: 'brooder',
  layouts: {
    brooder: {
      habitat: 'brooder',
      domain: { kind: 'floor', rect: BROODER_FLOOR_RECT, standY: BROODER_STAND_Y, restBelow: BROODER_FOOD_ROW - BROODER_STAND_Y },
      opaqueRect: BROODER_OPAQUE_RECT,
      petAnchor: BROODER_PET_ANCHOR,
      body: CHICK_BODY,
      sites: BROODER_SITES,
    },
    coop: {
      habitat: 'coop',
      domain: { kind: 'floor', rect: COOP_FLOOR_RECT, standY: COOP_STAND_Y, restBelow: COOP_FOOD_ROW - COOP_STAND_Y },
      opaqueRect: COOP_OPAQUE_RECT,
      petAnchor: COOP_PET_ANCHOR,
      body: HEN_BODY,
      sites: COOP_SITES,
    },
  },
  createBehavior: (layout) => createChickenBehavior(layout.habitat === 'coop' ? 'hen' : 'chick', layout.sites),
  voice: CHICKEN_VOICE,
};
