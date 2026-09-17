// Public render API (contract: docs/ARCHITECTURE.md "Render API").
// Note for ui/tests: `paintTrayChip`, `makeWaterBounds` and `parseManifest` are Pixi-free; import them from
// './trayChip', './water', './manifest' directly when running under node to avoid pulling in pixi.js.

export { createScene, windowSize } from './scene';
export { loadManifest, parseManifest, ManifestError, MANIFEST_URL } from './manifest';
export { paintTrayChip, CHIP_RING_COLORS } from './trayChip';
export { makeWaterBounds } from './water';
export type * from './types';
