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

import { Container, Graphics, Rectangle, Sprite, Texture, VideoSource } from 'pixi.js';
import { frameAt, wrapMs } from './frameClock';
import { layerArt, layerNightArt } from './manifest';
import type { LayerArt, LayerName, ManifestHabitat, ManifestLayer, ScenePhase } from './types';
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
  /** Render this into the RenderTexture. */
  readonly root: Container;
  readonly slots: Readonly<Record<SlotName, Container>>;
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
function layerArtScale(file: string, tex: { width: number; height: number }, grid: readonly [number, number]): number {
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

/**
 * One drawable plate: a still, a frame sequence, or a video. `advance` moves a sequence's clock; a
 * video keeps its own (the browser's) and `video` is exposed so a night crossfade can pause the one
 * nobody can see.
 */
interface Plate {
  readonly sprite: Sprite;
  readonly artScale: number;
  readonly frames: readonly Texture[] | null;
  readonly fps: number;
  readonly loop: boolean;
  readonly video: HTMLVideoElement | null;
  elapsedMs: number;
  frame: number;
}

const PET_NIGHT_TINT = 0x9ca8dc;

/**
 * Build the sprite for one piece of layer art. The texture may cover the whole grid or, for a
 * cropped animated layer, just `region`; either way its scale is DERIVED from the texture against
 * the rect it covers, and a texture that is not a whole multiple of that rect throws.
 */
function buildPlate(
  layer: ManifestLayer,
  art: LayerArt,
  textures: ReadonlyMap<string, Texture>,
  videos: ReadonlyMap<string, Texture>,
  grid: readonly [number, number],
): Plate | null {
  const covers: readonly [number, number] = layer.region ? [layer.region.w, layer.region.h] : grid;
  let plate: Plate | null = null;
  if (art.kind === 'image') {
    const tex = textures.get(art.file);
    if (!tex) return null;
    const artScale = layerArtScale(art.file, tex, covers);
    plate = { sprite: new Sprite({ texture: tex, label: layer.name }), artScale, frames: null, fps: 0, loop: false, video: null, elapsedMs: 0, frame: 0 };
  } else if (art.kind === 'frames') {
    const list: Texture[] = [];
    for (const f of art.files) {
      const t = textures.get(f);
      if (!t) break;
      list.push(t);
    }
    const first = list[0];
    // All or nothing, as for a sprite state: a sequence with holes is a stutter nobody can place.
    if (!first || list.length !== art.files.length) return null;
    const artScale = layerArtScale(art.files[0] ?? layer.name, first, covers);
    for (const [i, t] of list.entries()) {
      if (t.width !== first.width || t.height !== first.height) {
        throw new Error(`[render] ${art.files[i]}: ${t.width}x${t.height} differs from the sequence's first frame`);
      }
    }
    plate = { sprite: new Sprite({ texture: first, label: layer.name }), artScale, frames: list, fps: art.fps, loop: art.loop, video: null, elapsedMs: 0, frame: 0 };
  } else {
    const tex = videos.get(art.file);
    if (!tex) return null;
    const artScale = layerArtScale(art.file, tex, covers);
    const src = tex.source;
    const video = src instanceof VideoSource ? src.resource : null;
    plate = { sprite: new Sprite({ texture: tex, label: layer.name }), artScale, frames: null, fps: 0, loop: art.loop, video, elapsedMs: 0, frame: 0 };
  }
  plate.sprite.scale.set(1 / plate.artScale);
  if (layer.region) plate.sprite.position.set(layer.region.x, layer.region.y);
  if (layer.blend === 'multiply') plate.sprite.blendMode = 'multiply';
  return plate;
}

/** Advance a frame-sequence plate's own clock and swap its texture when the frame changes. */
function advancePlate(p: Plate, deltaMS: number): void {
  if (!p.frames) return;
  p.elapsedMs = p.loop ? wrapMs(p.elapsedMs + deltaMS, p.frames.length, p.fps) : p.elapsedMs + deltaMS;
  const f = frameAt(p.elapsedMs, p.frames.length, p.fps, p.loop);
  if (f !== p.frame) {
    p.frame = f;
    const t = p.frames[f];
    if (t) p.sprite.texture = t;
  }
}

/** Play or pause one video, seeking to `twin`'s time first when it resumes beside a running twin. */
function wantVideo(v: HTMLVideoElement, playing: boolean, twin: HTMLVideoElement | null): void {
  if (playing && v.paused) {
    if (twin && !twin.paused) v.currentTime = twin.currentTime;
    void v.play().catch(() => undefined);
  } else if (!playing && !v.paused) {
    v.pause();
  }
}

/**
 * Keep a night video and its day twin in step while only ONE of them decodes, and neither while
 * the page cannot be seen.
 *
 * Both clips are the same loop under different light, so the one that is fully faded out can stop;
 * when it is needed again it is seeked to its twin's time before it plays, which lands within a
 * frame of the right phase -- invisible under a two-second crossfade, and it halves the steady-state
 * decode cost. A hidden document (the window hidden with Cmd+Shift+P, or off every screen) pauses
 * both: the decoder does not know nobody is watching, and measured on the packaged app it kept the
 * GPU process at ~10% of a core for a bowl nobody could see. Called every tick; cheap when nothing
 * changes.
 */
function syncVideoPair(day: Plate, night: Plate | null, nightT: number, visible: boolean): void {
  const d = day.video;
  const n = night?.video ?? null;
  if (!d) return;
  if (n) wantVideo(n, visible && nightT > 0, d);
  wantVideo(d, visible && (n === null || nightT < 1), n);
}

/** Whether anyone could see the page. True where there is no document (tests, a worker). */
function docVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

export function buildLayers(
  habitat: ManifestHabitat,
  textures: ReadonlyMap<string, Texture>,
  videos: ReadonlyMap<string, Texture> = new Map(),
): LayerStack {
  const root = new Container({ label: 'habitat' });
  const slots = Object.fromEntries(SLOT_ORDER.map((n) => [n, new Container({ label: `slot:${n}` })])) as Record<SlotName, Container>;
  for (const n of SLOT_ORDER) root.addChild(slots[n]);

  let bg: Sprite | null = null;
  let memorial: Sprite | null = null;
  let medium: Sprite | null = null;
  /**
   * Every sprite the world tint applies to: the habitat's own art, whichever variant is showing. A
   * plate with its own night art is exempt from the night half of the tint -- it has a real night.
   */
  const worldSprites: Array<{ sprite: Sprite; hasNight: boolean }> = [];
  /** Day/night pairs to crossfade, and the frame-sequence plates to clock. */
  const pairs: Array<{ day: Plate; night: Plate | null }> = [];
  /** True once any layer ships a night plate; then the pet and food are dimmed too, so they belong. */
  let hasNightPlates = false;
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
    const dayArt = layerArt(l);
    if (!dayArt) continue;
    const built = buildPlate(l, dayArt, textures, videos, habitat.grid);
    if (!built) continue;
    const { sprite, artScale: art } = built;
    const nightArtDef = layerNightArt(l);
    const nightPlate = nightArtDef ? buildPlate(l, nightArtDef, textures, videos, habitat.grid) : null;
    pairs.push({ day: built, night: nightPlate });
    if (nightPlate) hasNightPlates = true;
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
    if (l.name === 'bg' || l.name === 'memorial' || l.name === 'decor_back' || l.name === 'decor_front' || l.name === 'glass' || l.name === 'medium') {
      worldSprites.push({ sprite, hasNight: nightPlate !== null });
    }
    slot.addChild(sprite);
    if (nightPlate) {
      // Directly above its day twin, so nothing can slip between them, invisible until night comes.
      nightPlate.sprite.alpha = 0;
      nightPlate.sprite.visible = false;
      slot.addChild(nightPlate.sprite);
    }
    if (l.mask) {
      // A stencil, not an alpha mask: the ellipse is geometry, and a Graphics mask costs nothing per
      // frame where a texture mask would render the layer through an intermediate target.
      const clip = new Graphics({ label: `${l.name}:mask` });
      clip.ellipse(l.mask.cx, l.mask.cy, l.mask.rx, l.mask.ry).fill({ color: 0xffffff, alpha: 1 });
      slot.addChild(clip);
      sprite.mask = clip;
      if (nightPlate) nightPlate.sprite.mask = clip;
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
    const starvingTint = towards(STARVING_TINT, starvingT);
    const tinted = mixTint(towards(NIGHT_TINT, nightT), starvingTint);
    for (const { sprite: sp, hasNight } of worldSprites) sp.tint = hasNight ? starvingTint : tinted;
    // The night plates: faded in over their day twins by the same amount, so the light itself
    // changes rather than the colour of the picture.
    for (const { day, night: n } of pairs) {
      if (!n) continue;
      n.sprite.alpha = nightT;
      n.sprite.visible = nightT > 0;
      if (day.video) syncVideoPair(day, n, nightT, docVisible());
    }
    // The pet, its food and the bubbles are lit by the day render whatever the hour. With real night
    // plates behind them a full-brightness fish would glow; a mild dim keeps it in the same room.
    if (hasNightPlates) {
      const dim = towards(PET_NIGHT_TINT, nightT);
      slots.pet.tint = dim;
      slots.food.tint = dim;
      slots.fx.tint = dim;
    }
    // A habitat that still ships a painted night overlay keeps working; the bowl no longer has one.
    if (night) {
      night.alpha = nightT;
      night.visible = nightT > 0;
    }
  };

  applyWorldTint();
  applyPantry();

  /** The videos follow the page's visibility; the tint path only re-evaluates them when it changes. */
  const onVisibility = (): void => {
    const visible = docVisible();
    for (const { day, night: n } of pairs) if (day.video) syncVideoPair(day, n, nightT, visible);
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  onVisibility();

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
      nightTargetT = on ? 1 : 0;
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
      // Frame sequences keep their own clocks; a video keeps the browser's. The night twin of a
      // sequence advances by the same delta so the crossfade blends matching frames.
      for (const { day, night: n } of pairs) {
        advancePlate(day, deltaMS);
        if (n) advancePlate(n, deltaMS);
      }
    },
    destroy() {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      root.destroy({ children: true });
    },
  };
}
