// UI contract types (owner: ui builder). Everything is plain DOM over the Pixi canvas.

import type { AppStore } from '../app/types';
import type { ProfileStore } from '../app/profile';
import type { Platform } from '../platform/types';
import type { HabitatScene, Rect } from '../render/types';
import type { Species } from '../sim/types';

export type SfxName = 'feed' | 'alert' | 'death';

export interface AudioApi {
  play(name: SfxName): void;
  setAmbient(species: Species, on: boolean): void;
  setMuted(b: boolean): void;
}

export interface UiDeps {
  store: AppStore;
  platform: Platform;
  scene: HabitatScene;
  audio: AudioApi;
  /** What the pets know about you (src/app/profile.ts). */
  profile: ProfileStore;
  /** Ask main.ts to recompute and resend hit regions (call whenever your rects change). */
  requestHitRegions(): void;
}

export interface HudHandle {
  setVisible(b: boolean): void;
  /** Re-position for a new scale / canvas size. */
  relayout(): void;
  /** Window-local CSS px rects that must receive mouse events while visible (pill + strip down to the habitat top, caption). */
  getRects(): Rect[];
  destroy(): void;
}

export interface DevPanelHandle {
  toggle(): void;
  isOpen(): boolean;
  getRect(): Rect | null;
}

export interface SpeechHandle {
  say(line: string): void;
  setMuted(b: boolean): void;
}
