// Texture loading. Every texture is loaded nearest-neighbor from an absolute `/...` URL
// (Vite publicDir = assets/, so `habitats/fish/bowl/bg.png` is served at `/habitats/fish/bowl/bg.png`).
// Manifest parsing lives in ./manifest.ts (pure).

import { Assets, TextureStyle, type Texture } from 'pixi.js';

export { loadManifest, parseManifest, ManifestError, MANIFEST_URL } from './manifest';

/** Must run before any texture is created; idempotent. */
export function configureNearestTextures(): void {
  TextureStyle.defaultOptions.scaleMode = 'nearest';
}

/** Absolute URL for a manifest asset path. */
export function assetUrl(file: string): string {
  return `/${file}`;
}

/** Loads one PNG as a nearest-neighbor Texture (cached by Pixi Assets). */
export async function loadTexture(file: string): Promise<Texture> {
  configureNearestTextures();
  const tex = await Assets.load<Texture>({ src: assetUrl(file), data: { scaleMode: 'nearest' } });
  tex.source.scaleMode = 'nearest';
  return tex;
}

/**
 * Loads a set of files in parallel into a map keyed by the manifest path. With `lenient`, a file that fails
 * to load is logged and skipped (layers/sprites fall back), so missing art never blocks the scene.
 */
export async function loadTextures(files: Iterable<string>, lenient = true): Promise<Map<string, Texture>> {
  const unique = Array.from(new Set(files));
  const map = new Map<string, Texture>();
  await Promise.all(
    unique.map(async (f) => {
      try {
        map.set(f, await loadTexture(f));
      } catch (err: unknown) {
        if (!lenient) throw err;
        console.warn(`[render] missing asset ${assetUrl(f)}:`, err);
      }
    }),
  );
  return map;
}
