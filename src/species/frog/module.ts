// The frog, packaged as a SpeciesModule. The pond is its home and the jar its upgrade; the behaviour
// is the same in both, because the perches and the bank are data.

import type { SpeciesModule } from '../types';
import { createFrogBehavior } from './behavior';
import {
  FROG_BODY, JAR_BANK, JAR_FLOOR_RECT, JAR_OPAQUE_RECT, JAR_PET_ANCHOR, JAR_SITES, JAR_STAND_Y,
  POND_BANK, POND_FLOOR_RECT, POND_OPAQUE_RECT, POND_PET_ANCHOR, POND_SITES, POND_STAND_Y,
} from './layout';
import { FROG_VOICE } from './voice/index';

export const FROG_MODULE: SpeciesModule = {
  species: 'frog',
  defaultHabitat: 'pond',
  layouts: {
    pond: {
      habitat: 'pond',
      domain: { kind: 'floor', rect: POND_FLOOR_RECT, standY: POND_STAND_Y },
      opaqueRect: POND_OPAQUE_RECT,
      petAnchor: POND_PET_ANCHOR,
      body: FROG_BODY,
      sites: POND_SITES,
      food: POND_BANK,
    },
    jar: {
      habitat: 'jar',
      domain: { kind: 'floor', rect: JAR_FLOOR_RECT, standY: JAR_STAND_Y },
      opaqueRect: JAR_OPAQUE_RECT,
      petAnchor: JAR_PET_ANCHOR,
      body: FROG_BODY,
      sites: JAR_SITES,
      food: JAR_BANK,
    },
  },
  createBehavior: (layout) => createFrogBehavior(layout.sites),
  voice: FROG_VOICE,
};
