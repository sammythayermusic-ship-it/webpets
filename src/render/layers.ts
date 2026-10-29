// Layer stack for the habitat. Fixed slot order (`shadow` is NOT here — the bowl art carries its own
// baked contact shadow). `memorial` is the bg variant; `pantry_fill` is cropped via a dynamic texture
// frame; `night` multiplies with a 2 s stepped fade.
//
// Everything in this container is positioned in GRID px. A file-backed layer's art may be any integer
// multiple of the grid, so each such sprite is scaled by grid/texture to cover exactly its grid rect.
// The factor is DERIVED from the texture rather than declared in the manifest, so the two cannot drift
// — and it means a 1x pixel layer and a 4x rendered one can coexist while art is migrated one layer at
// a time. Keeping one set of coordinates for art, procedural sprites and hit regions alike is what
// lets the art's resolution change without touching anything that reasons about position.

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
  // fx sits UNDER decor_front and glass: bubbles rise inside the water, so the front gravel lip and the
  // glass's own highlights belong on top of them. It used to be the topmost slot, which was invisible
  // when the bubbles were 6 px pixel rings and is not once the glass is a real reflective surface.
  'fx',
  'decor_front',
  'glass',
  'night',
] as const;

export type SlotName = (typeof SLOT_ORDER)[number];

/**
 * Where the live layer goes: everything up to and including `decor_back` is drawn BEHIND it, the
 * rest in front. The split is a property of the slot order, not of any habitat, which is what lets
 * a habitat without a live layer draw both halves back to back and look exactly as it did.
 */
export const BACK_SLOTS: readonly SlotName[] = ['bg', 'medium', 'decor_back'];

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

/**
 * Night and starvation are applied as a TINT on the habitat's own sprites rather than as an overlay.
 *
 * Night used to be a painted `night.png` multiplied on top. That art was two flat colours cut to the
 * old bowl's silhouette, so against a re-rendered bowl it was both the wrong resolution and the wrong
 * shape — a blue wash offset from the thing it was meant to be washing. A tint multiplies the texture
 * and therefore respects its alpha for free: perfectly aligned by construction, at any art resolution,
 * with no file to keep in step. Starvation moved the same way when `medium` (the layer it used to tint)
 * stopped existing: the 3D bowl has no separate water layer to shift.
 */
export const STARVING_TINT = 0xe6ffe6;
/** Cool blue the habitat fades toward at night, matching the wash the painted night layer used. */
export const NIGHT_TINT = 0x465496;
const NIGHT_FADE_MS = 2000;
/** How long the starving colour shift takes. Short, but not a single frame. */
const STARVING_FADE_MS = 600;
const BLINK_MS = 500;
const BLINK_LOW_ALPHA = 0.6;
const FOG_ALPHA = 0.5;

export interface LayerStack {
  /** The back half of the stack: bg (or memorial), medium, decor_back. Positioned by the scene. */
  readonly root: Container;
  /**
   * The front half: pantry, pet, food, fx, decor_front, glass, night. The scene gives it the SAME
   * transform as `root`; a live layer is drawn between the two.
   */
  readonly front: Container;
  readonly slots: Readonly<Record<SlotName, Container>>;
  /** The eased night amount, 0..1, for anything else that lights itself by it. */
  nightT(): number;
  setPantryFraction(f: number): void;
  setPantryLow(low: boolean): void;
  setNight(on: boolean): void;
  setPhase(phase: ScenePhase): void;
  setStarving(b: boolean): void;
  /** Grid px offset applied to glass and decor_front (parallax). Fractional: the slide is continuous. */
  setParallax(dx: number, dy: number): void;
  /** Ticker-rate update for the stepped blink and the night fade. */
  update(deltaMS: number): void;
  destroy(): void;
}

/** Art px per grid px for one layer texture, or a thrown error naming art that does not fit the grid. */
function layerArtScale(file: string, tex: Texture, grid: readonly [number, number]): number {
  const kx = tex.width / grid[0];
  const ky = tex.height / grid[1];
  // Loud, because the silent version is a squashed bowl that still looks plausible: a 1920x1080 export
  // of a 4:3 habitat would simply render slightly wrong and nobody would know which file to blame.
  if (kx !== ky || !Number.isInteger(kx) || kx < 1) {
    throw new Error(
      `[render] ${file}: ${tex.width}x${tex.height} is not an integer multiple of the ${grid[0]}x${grid[1]} habitat grid`,
    );
  }
  return kx;
}

function fileSprite(
  layer: ManifestLayer,
  textures: ReadonlyMap<string, Texture>,
  grid: readonly [number, number],
): { sprite: Sprite; artScale: number } | null {
  if (layer.file === undefined) return null;
  const tex = textures.get(layer.file);
  if (!tex) return null;
  const artScale = layerArtScale(layer.file, tex, grid);
  const s = new Sprite({ texture: tex, label: layer.name });
  s.scale.set(1 / artScale);
  if (layer.blend === 'multiply') s.blendMode = 'multiply';
  return { sprite: s, artScale };
}

export function buildLayers(habitat: ManifestHabitat, textures: ReadonlyMap<string, Texture>): LayerStack {
  const root = new Container({ label: 'habitat:back' });
  const front = new Container({ label: 'habitat:front' });
  const slots = Object.fromEntries(SLOT_ORDER.map((n) => [n, new Container({ label: `slot:${n}` })])) as Record<SlotName, Container>;
  for (const n of SLOT_ORDER) (BACK_SLOTS.includes(n) ? root : front).addChild(slots[n]);

  let bg: Sprite | null = null;
  let memorial: Sprite | null = null;
  let medium: Sprite | null = null;
  /** Every sprite the world tint applies to: the habitat's own art, whichever variant is showing. */
  const worldSprites: Sprite[] = [];
  /**
   * Layers with a rendered night variant: the day sprite and the night sprite drawn over it, whose
   * alpha IS the night amount. These are excluded from the night tint (they would be lit twice) but
   * still take the starving tint.
   */
  const nightPairs: Array<{ day: Sprite; night: Sprite }> = [];
  let pantryFill: Sprite | null = null;
  /** Art px per grid px for the pantry_fill texture; its crop rect addresses TEXELS, not grid px. */
  let pantryArt = 1;
  let night: Sprite | null = null;

  const sorted = habitat.layers
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.name !== 'shadow')
    .sort((a, b) => a.l.z - b.l.z || a.i - b.i);

  for (const { l } of sorted) {
    if (l.name === 'shadow') continue;
    const slot = slots[SLOT_OF[l.name]];
    const built = fileSprite(l, textures, habitat.grid);
    if (!built) continue;
    const { sprite, artScale: art } = built;
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
        if (!r) break; // no in-scene gauge in this habitat
        // The crop rect is in grid px but addresses the TEXTURE, so it scales with the art; the sprite's
        // own position stays in grid px because the 1/artScale on the sprite converts for us.
        sprite.texture = new Texture({
          source: sprite.texture.source,
          frame: new Rectangle(r.x * art, r.y * art, r.w * art, r.h * art),
          dynamic: true,
          label: 'pantry_fill:crop',
        });
        sprite.position.set(r.x, r.y);
        pantryFill = sprite;
        pantryArt = art;
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
    const isWorld = l.name === 'bg' || l.name === 'memorial' || l.name === 'decor_back' || l.name === 'decor_front' || l.name === 'glass';
    const nightTex = l.night === undefined ? undefined : textures.get(l.night);
    if (isWorld && nightTex !== undefined) {
      const night = new Sprite({ texture: nightTex, label: `${l.name}:night` });
      night.scale.set(1 / layerArtScale(l.night as string, nightTex, habitat.grid));
      night.alpha = 0;
      night.visible = false;
      if (l.blend === 'multiply') night.blendMode = 'multiply';
      slot.addChild(night);
      nightPairs.push({ day: sprite, night });
    } else if (isWorld) {
      worldSprites.push(sprite);
    }
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
  /**
   * Night and starvation as continuous 0..1 amounts, eased at ticker rate.
   *
   * Night used to advance in eight discrete jumps over two seconds — one visible step every 250 ms,
   * which bands on the gradients the rendered art is made of. Starvation had no transition at all: the
   * whole bowl changed colour in a single frame. Both were the last stepped things in a renderer that
   * had gone continuous everywhere else.
   */
  let nightT = 0;
  let nightTargetT = 0;
  let starvingT = 0;

  const applyPantry = (): void => {
    const r = habitat.pantryRect;
    if (!pantryFill || !r) return;
    const top = r.y + Math.round(r.h * (1 - pantryFraction));
    const h = r.y + r.h - top;
    // The frame addresses the texture, so it is in art px; the sprite's position stays in grid px,
    // because the 1/artScale already on the sprite converts the framed size back for us.
    const frame = pantryFill.texture.frame;
    frame.x = r.x * pantryArt;
    frame.y = top * pantryArt;
    frame.width = r.w * pantryArt;
    frame.height = Math.max(0, h * pantryArt);
    // update() recomputes the UVs and (because the texture is dynamic) notifies the sprite to re-measure.
    pantryFill.texture.update();
    pantryFill.position.set(r.x, top);
    pantryFill.visible = h > 0;
    pantryFill.alpha = pantryLow && !blinkOn ? BLINK_LOW_ALPHA : 1;
  };

  let starving = false;

  /** Multiply two 0xRRGGBB tints channel by channel, which is what stacking two tints means. */
  const mixTint = (a: number, b: number): number => {
    const ch = (shift: number): number => Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255);
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  };

  /** Blend `to` into white by `t`, so a fade to night is a fade of the tint itself. */
  const towards = (to: number, t: number): number => {
    const ch = (shift: number): number => Math.round(255 + (((to >> shift) & 0xff) - 255) * t);
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  };

  const applyWorldTint = (): void => {
    const tint = mixTint(towards(NIGHT_TINT, nightT), towards(STARVING_TINT, starvingT));
    for (const sp of worldSprites) sp.tint = tint;
    // A rendered night is a crossfade, not a tint. The starving shift still applies to both halves.
    const starve = towards(STARVING_TINT, starvingT);
    for (const { day, night } of nightPairs) {
      day.tint = starve;
      night.tint = starve;
      night.alpha = nightT;
      night.visible = nightT > 0 && day.visible;
    }
    // A habitat that still ships a painted night overlay keeps working; the bowl no longer has one.
    if (night) {
      night.alpha = nightT;
      night.visible = nightT > 0;
    }
  };

  applyWorldTint();
  applyPantry();

  return {
    root,
    front,
    slots,
    nightT: () => nightT,
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
      nightTargetT = on ? 1 : 0;
    },
    setPhase(phase) {
      const showMemorial = phase === 'memorial';
      if (bg) bg.visible = !showMemorial || memorial === null;
      if (memorial) memorial.visible = showMemorial;
      applyWorldTint(); // a night sprite follows its day sprite's visibility
      // The memorial bowl is empty: no water layer over it.
      if (medium) medium.visible = !showMemorial;
      fog.visible = phase === 'dead';
    },
    setStarving(b) {
      starving = b;
      if (medium) medium.tint = b ? STARVING_TINT : 0xffffff;
    },
    setParallax(dx, dy) {
      // Unrounded. Snapping to whole grid px turned a continuous slide into a four-step stagger, which
      // was invisible when a grid px was the smallest thing that could move and is not now.
      const x = dx;
      const y = dy;
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
      const toward = (v: number, target: number, ms: number): number => {
        if (v === target) return v;
        const step = deltaMS / ms;
        return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
      };
      const nextNight = toward(nightT, nightTargetT, NIGHT_FADE_MS);
      const nextStarving = toward(starvingT, starving ? 1 : 0, STARVING_FADE_MS);
      if (nextNight !== nightT || nextStarving !== starvingT) {
        nightT = nextNight;
        starvingT = nextStarving;
        applyWorldTint();
      }
    },
    destroy() {
      root.destroy({ children: true });
      front.destroy({ children: true });
    },
  };
}
