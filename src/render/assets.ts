// Texture loading. Every texture is loaded with LINEAR filtering from an absolute `/...` URL
// (Vite publicDir = assets/, so `habitats/fish/bowl/bg.png` is served at `/habitats/fish/bowl/bg.png`).
// Manifest parsing lives in ./manifest.ts (pure).

import { ImageSource, Texture, TextureStyle, loadTextures as pixiLoadTextures } from 'pixi.js';

export { loadManifest, parseManifest, stateFiles, ManifestError, MANIFEST_URL } from './manifest';

/**
 * Must run before any texture is created; idempotent.
 *
 * Two jobs.
 *
 * Linear scaling is the smooth-3D requirement. The art is pre-rendered at 6x the logical grid, so it is
 * DOWNSCALED at every window size but the largest — exactly the case nearest filtering handles worst,
 * since it point-samples one texel in six and aliases every soft edge the renders have. This was
 * 'nearest' for the whole pixel-art era and was the structural half of that contract.
 *
 * Disabling Pixi's worker loader is what makes the packaged app render at all: by default Pixi loads
 * every texture inside a Web Worker created from
 * a `blob:` URL, and that worker calls plain `fetch()`. Under the dev server's `http://localhost:1420`
 * that is fine, but the packaged app is served from `tauri://localhost`, and a fetch of a custom-scheme
 * URL from a blob-worker never reaches Tauri's protocol handler — so every texture failed and the app
 * rendered an empty bowl. Pixi's own capability probe does not catch it: it tests the worker with an
 * inline `data:` PNG that needs no network, reports success, and commits to the broken path.
 *
 * With workers off, loading goes through Pixi's main-thread `loadImageBitmap`, which fetches from the
 * page context — the same call that already loads `manifest.json` successfully in the bundle. The cost
 * is decoding about a dozen small PNGs on the main thread once at boot.
 */
export function configureAssetPipeline(): void {
  TextureStyle.defaultOptions.scaleMode = 'linear';
  // `config` is optional in Pixi's LoaderParser type but always present on this built-in parser.
  const config = pixiLoadTextures.config;
  if (config) config.preferWorkers = false;
}


/**
 * Fully-qualified URL for a manifest asset path, resolved against the document.
 *
 * Resolved here, and never handed to Pixi as a relative path, because Pixi's URL helper only
 * recognises http and https: for a page at `tauri://localhost/index.html` it computes the root as
 * `tauri://`, dropping the host, and joins `/sprites/fish/idle.png` into `tauri://sprites/fish/idle.png`.
 * That request reaches the protocol handler with "sprites" as the host, returns something that is not
 * a PNG, and `createImageBitmap` then fails with "Cannot decode the data". The dev server never showed
 * it because `http://` is a scheme Pixi does understand.
 */
export function assetUrl(file: string): string {
  const base = typeof document === 'undefined' ? 'http://localhost/' : document.baseURI;
  return new URL(file, base).href;
}

/**
 * Loads one PNG as a linear-filtered Texture.
 *
 * Deliberately does NOT go through `Assets.load`. Pixi's resolver rewrites the URL using a helper that
 * is blind to custom schemes (see {@link assetUrl}), so under `tauri://` it asks for a path that does
 * not exist. Fetching the blob ourselves and building the texture keeps the URL exactly as resolved
 * against the document and works on any scheme. `loadTextures` below does the caching and de-duping
 * that Assets would otherwise have provided, and the scene keeps its own texture map regardless.
 *
 * The ImageSource options mirror Pixi's own loader (`loadTextures.js`) so the art is uploaded
 * identically — `premultiply-alpha-on-upload` in particular, or the transparent edges go wrong.
 */
export async function loadTexture(file: string): Promise<Texture> {
  configureAssetPipeline();
  const url = assetUrl(file);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[render] ${url}: HTTP ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch (err: unknown) {
    // Almost always "the server returned something that is not an image" rather than a corrupt file.
    throw new Error(`[render] ${url}: not decodable as an image (${blob.type || 'unknown type'}, ${blob.size}B)`, { cause: err });
  }
  const source = new ImageSource({
    resource: bitmap,
    alphaMode: 'premultiply-alpha-on-upload',
    scaleMode: 'linear',
    // Mipmaps are not a nicety here. The art is several times the logical grid, so at the smallest
    // window it is minified 4:1 or worse, and bilinear-only minification of a large texture crawls and
    // shimmers as the sprite moves — the exact artefact smooth art is supposed to remove. This is also
    // why animation frames are separate files rather than one packed sheet: neighbouring frames in a
    // sheet bleed into each other at low mip levels.
    autoGenerateMipmaps: true,
    label: url,
  });
  return new Texture({ source, label: url });
}

/**
 * Loads one PNG as a STRAIGHT-alpha ImageBitmap, for a consumer that is not Pixi.
 *
 * Candidate C's water pass samples the bg plate in a Three.js shader and composites it itself; it
 * needs the pixels unpremultiplied and must not share Pixi's texture (which is premultiplied on
 * upload and owned by Pixi's cache). Same fetch path as {@link loadTexture} for the same scheme
 * reasons.
 */
export async function loadBitmap(file: string): Promise<ImageBitmap> {
  const url = assetUrl(file);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[render] ${url}: HTTP ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
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
