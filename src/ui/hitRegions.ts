// DOM-free hit-region math. main.ts is the only caller of platform.window.setHitRegions; it uses
// computeHitRegions(scene, hud, devPanel) from here. All rects are window-local CSS px, integer.

import type { Rect } from '../sim/types';
import type { HabitatScene } from '../render/types';
import type { DevPanelHandle, HudHandle } from './types';

/**
 * The pill rect extended down to the habitat's opaque top so the 4 px gap between the pill and the bowl is not
 * click-through (otherwise crossing it flips ignore-cursor-events and the FEED button becomes unreachable).
 */
export function pillStripRect(pill: Rect, habitatTop: number): Rect {
  const bottom = Math.max(pill.y + pill.h, habitatTop);
  return {
    x: Math.round(pill.x),
    y: Math.round(pill.y),
    w: Math.round(pill.w),
    h: Math.round(bottom - pill.y),
  };
}

/** True when both rects have identical x/y/w/h (used to decide whether hit regions must be resent). */
export function rectEquals(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** Integer-rounded rect, never negative in size. */
export function roundRect(r: Rect): Rect {
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.max(0, Math.round(r.w)),
    h: Math.max(0, Math.round(r.h)),
  };
}

/** Habitat opaque rect + HUD rects (empty while hidden) + dev panel rect (null while closed). */
export function computeHitRegions(
  scene: Pick<HabitatScene, 'habitatHitRect'>,
  hud: Pick<HudHandle, 'getRects'>,
  devPanel: Pick<DevPanelHandle, 'getRect'>,
  others: ReadonlyArray<{ getRects(): Rect[] }> = [],
): Rect[] {
  const regions: Rect[] = [roundRect(scene.habitatHitRect())];
  for (const r of hud.getRects()) {
    const rr = roundRect(r);
    if (rr.w > 0 && rr.h > 0) regions.push(rr);
  }
  for (const o of others) {
    for (const r of o.getRects()) {
      const rr = roundRect(r);
      if (rr.w > 0 && rr.h > 0) regions.push(rr);
    }
  }
  const dev = devPanel.getRect();
  if (dev) {
    const rr = roundRect(dev);
    if (rr.w > 0 && rr.h > 0) regions.push(rr);
  }
  return regions;
}
