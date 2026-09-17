// UI API (docs/ARCHITECTURE.md "UI API"). Everything is plain DOM over the Pixi canvas, mounted into #ui.

export { mountHud } from './hud';
export { mountDevPanel, type DevPanelHandleExt } from './devPanel';
export { mountSpeech, type SpeechHandleExt, type SpeechPool } from './speech';
export { mountPantryDialog, type PantryDialogHandle } from './pantryDialog';
export { mountMontage, type MontageHandle } from './montage';
export { mountMemorial, type MemorialHandle } from './memorial';
export { wireTray, type TrayDeps } from './tray';
export { installKeys, type KeyDeps } from './keys';
export { computeHitRegions } from './hitRegions';
export { initAudio } from '../audio';
export type { AudioApi, DevPanelHandle, HudHandle, SfxName, SpeechHandle, UiDeps } from './types';
