// Layer stack inside the 160x120 RenderTexture. Fixed slot order (shadow is NOT here: it is drawn in CSS px
// under the habitat sprite by the scene). `memorial` is the bg variant; `pantry_fill` is cropped via a
// dynamic texture frame; `night` multiplies with a 2 s stepped fade.

import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { LayerName, ManifestHabitat, ManifestLayer, ScenePhase } from './types';
import { makeWaterBounds } from './water';

/** Slot order bottom → top. */
export const SLOT_ORDER = [
  'bg',
  'medium',
  'decor_back',
  'pantry',
  'pantry_fill',
  'pet',
  'food',
  'decor_front',
  'glass',
  'fx',
  'night',
] as const;

export type SlotName = (typeof SLOT_ORDER)[number];

const SLOT_OF: Readonly<Record<Exclude<LayerName, 'shadow'>, SlotName>> = {
  bg: 'bg',
  memorial: 'bg',
  medium: 'medium',
  decor_back: 'decor_back',
  pantry: 'pantry',
  pantry_fill: 'pantry_fill',
  pet: 'pet',
  food: 'food',
  decor_front: 'decor_front',
  glass: 'glass',
  fx: 'fx',
  night: 'night',
};

/** medium.tint shifted 10 % toward green for the starving state. */
export const STARVING_MEDIUM_TINT = 0xe6ffe6;
const NIGHT_FADE_MS = 2000;
const NIGHT_FADE_STEPS = 8;
const BLINK_MS = 500;
const BLINK_LOW_ALPHA = 0.6;
const FOG_ALPHA = 0.5;

export interface LayerStack {
  /** Render this into the RenderTexture. */
  readonly root: Container;
  readonly slots: Readonly<Record<SlotName, Container>>;
  setPantryFraction(f: number): void;
  setPantryLow(low: boolean): void;
  setNight(on: boolean): void;
  setPhase(phase: ScenePhase): void;
  setStarving(b: boolean): void;
  /** Integer grid px offset applied to glass and decor_front (parallax). */
  setParallax(dx: number, dy: number): void;
  /** Ticker-rate update for the stepped blink and the night fade. */
  update(deltaMS: number): void;
  destroy(): void;
}

function fileSprite(layer: ManifestLayer, textures: ReadonlyMap<string, Texture>): Sprite | null {
  if (layer.file === undefined) return null;
  const tex = textures.get(layer.file);
  if (!tex) return null;
  const s = new Sprite({ texture: tex, label: layer.name });
  if (layer.blend === 'multiply') s.blendMode = 'multiply';
  return s;
}

export function buildLayers(habitat: ManifestHabitat, textures: ReadonlyMap<string, Texture>): LayerStack {
  const root = new Container({ label: 'habitat' });
  const slots = Object.fromEntries(SLOT_ORDER.map((n) => [n, new Container({ label: `slot:${n}` })])) as Record<SlotName, Container>;
  for (const n of SLOT_ORDER) root.addChild(slots[n]);

  let bg: Sprite | null = null;
  let memorial: Sprite | null = null;
  let medium: Sprite | null = null;
  let pantryFill: Sprite | null = null;
  let night: Sprite | null = null;

  const sorted = habitat.layers
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.name !== 'shadow')
    .sort((a, b) => a.l.z - b.l.z || a.i - b.i);

  for (const { l } of sorted) {
    if (l.name === 'shadow') continue;
    const slot = slots[SLOT_OF[l.name]];
    const sprite = fileSprite(l, textures);
    if (!sprite) continue;
    switch (l.name) {
      case 'bg':
        bg = sprite;
        break;
      case 'memorial':
        memorial = sprite;
        sprite.visible = false;
        break;
      case 'medium':
        medium = sprite;
        break;
      case 'pantry_fill': {
        const r = habitat.pantryRect;
        sprite.texture = new Texture({
          source: sprite.texture.source,
          frame: new Rectangle(r.x, r.y, r.w, r.h),
          dynamic: true,
          label: 'pantry_fill:crop',
        });
        sprite.position.set(r.x, r.y);
        pantryFill = sprite;
        break;
      }
      case 'night':
        night = sprite;
        sprite.blendMode = 'multiply';
        sprite.alpha = 0;
        sprite.visible = false;
        break;
      default:
        break;
    }
    slot.addChild(sprite);
  }

  // Programmatic white fog over the water for the dead phase (glass slot, above the glass art).
  // The ellipse overshoots the water band (ry reaches above surfaceY and below floorY), so it is masked to
  // surfaceY..floorY exactly like every other water-bounded element (see makeWaterBounds). The mask is a child
  // of the fog so it shares its visibility and the glass slot's parallax offset.
  const ws = habitat.waterShape;
  const band = makeWaterBounds(ws).rect;
  const fog = new Graphics({ label: 'fog' });
  fog.ellipse(ws.cx, ws.cy, ws.rx, ws.ry).fill({ color: 0xffffff, alpha: 1 });
  const fogClip = new Graphics({ label: 'fog:clip' });
  fogClip.rect(band.x, band.y, band.w, band.h).fill({ color: 0xffffff, alpha: 1 });
  fog.addChild(fogClip);
  fog.mask = fogClip;
  fog.alpha = FOG_ALPHA;
  fog.visible = false;
  slots.glass.addChild(fog);

  let pantryFraction = 1;
  let pantryLow = false;
  let blinkClock = 0;
  let blinkOn = true;
  let nightTarget = 0;
  let nightStep = 0; // 0..NIGHT_FADE_STEPS
  let nightClock = 0;

  const applyPantry = (): void => {
    if (!pantryFill) return;
    const r = habitat.pantryRect;
    const top = r.y + Math.round(r.h * (1 - pantryFraction));
    const h = r.y + r.h - top;
    const frame = pantryFill.texture.frame;
    frame.x = r.x;
    frame.y = top;
    frame.width = r.w;
    frame.height = Math.max(0, h);
    // update() recomputes the UVs and (because the texture is dynamic) notifies the sprite to re-measure.
    pantryFill.texture.update();
    pantryFill.position.set(r.x, top);
    pantryFill.visible = h > 0;
    pantryFill.alpha = pantryLow && !blinkOn ? BLINK_LOW_ALPHA : 1;
  };

  const applyNight = (): void => {
    if (!night) return;
    night.alpha = nightStep / NIGHT_FADE_STEPS;
    night.visible = nightStep > 0;
  };

  applyPantry();

  return {
    root,
    slots,
    setPantryFraction(f) {
      const v = Math.max(0, Math.min(1, Number.isFinite(f) ? f : 0));
      if (v === pantryFraction) return;
      pantryFraction = v;
      applyPantry();
    },
    setPantryLow(low) {
      if (low === pantryLow) return;
      pantryLow = low;
      blinkOn = true;
      blinkClock = 0;
      applyPantry();
    },
    setNight(on) {
      nightTarget = on ? NIGHT_FADE_STEPS : 0;
    },
    setPhase(phase) {
      const showMemorial = phase === 'memorial';
      if (bg) bg.visible = !showMemorial || memorial === null;
      if (memorial) memorial.visible = showMemorial;
      // The memorial bowl is empty: no water layer over it.
      if (medium) medium.visible = !showMemorial;
      fog.visible = phase === 'dead';
    },
    setStarving(b) {
      if (medium) medium.tint = b ? STARVING_MEDIUM_TINT : 0xffffff;
    },
    setParallax(dx, dy) {
      const x = Math.round(dx);
      const y = Math.round(dy);
      slots.glass.position.set(x, y);
      slots.decor_front.position.set(x, y);
    },
    update(deltaMS) {
      if (pantryLow) {
        blinkClock += deltaMS;
        if (blinkClock >= BLINK_MS) {
          blinkClock -= BLINK_MS;
          blinkOn = !blinkOn;
          applyPantry();
        }
      }
      if (nightStep !== nightTarget) {
        nightClock += deltaMS;
        const stepMs = NIGHT_FADE_MS / NIGHT_FADE_STEPS;
        while (nightClock >= stepMs && nightStep !== nightTarget) {
          nightClock -= stepMs;
          nightStep += nightStep < nightTarget ? 1 : -1;
          applyNight();
        }
      } else {
        nightClock = 0;
      }
    },
    destroy() {
      root.destroy({ children: true });
    },
  };
}
