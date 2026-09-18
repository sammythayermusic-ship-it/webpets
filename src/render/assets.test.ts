import { describe, expect, it, vi } from 'vitest';
import { TextureStyle, loadTextures as pixiLoadTextures } from 'pixi.js';
import { assetUrl, configureAssetPipeline, loadTextures } from './assets';

// These pin the fix for a bug that shipped in a release build and that NO other test here can catch:
// Playwright drives `vite preview` over http://, which is precisely the scheme that works. The
// packaged app is served from tauri://localhost, where Pixi's default worker loader silently fails.

describe('asset pipeline configuration', () => {
  it('loads textures on the main thread, never in a worker', () => {
    configureAssetPipeline();
    // Pixi's default is `true`, which loads every PNG inside a Web Worker created from a blob: URL.
    // That worker's fetch() cannot reach Tauri's custom-scheme handler, so in the packaged app every
    // texture failed and the habitat rendered as an empty, fully transparent canvas.
    expect(
      pixiLoadTextures.config?.preferWorkers,
      'Pixi must not load textures in a blob worker: its fetch cannot reach tauri://localhost',
    ).toBe(false);
  });

  it('filters linearly, because the art is minified at every window but the largest', () => {
    configureAssetPipeline();
    // Nothing guarded this before, which is how a one-word change could have silently undone the whole
    // smooth-art switch: no other test in the suite can see a filter mode. The art is rendered at
    // several times the logical grid, so nearest would point-sample one texel in four and crawl.
    expect(TextureStyle.defaultOptions.scaleMode).toBe('linear');
  });

  it('keeps createImageBitmap enabled', () => {
    configureAssetPipeline();
    // Deliberately NOT disabled. The non-bitmap path hard-sets crossOrigin="anonymous" on an
    // HTMLImageElement, and a tauri:// response carries no Access-Control-Allow-Origin header, so
    // turning this off would swap the worker bug for a genuine CORS failure.
    expect(pixiLoadTextures.config?.preferCreateImageBitmap).toBe(true);
  });

  it('resolves manifest paths to fully-qualified URLs, never bare absolute paths', () => {
    // A bare "/habitats/..." is what broke the packaged app: Pixi's URL helper only understands
    // http/https, so for a tauri://localhost page it computed the root as "tauri://" and asked for
    // tauri://habitats/... with "habitats" as the host. Resolving against the document avoids that.
    const url = assetUrl('habitats/fish/bowl/bg.png');
    expect(url.startsWith('/'), `expected a fully-qualified URL, got ${url}`).toBe(false);
    expect(url.endsWith('/habitats/fish/bowl/bg.png')).toBe(true);
    expect(() => new URL(url)).not.toThrow();
  });

  it('keeps the host when the page is served from a custom scheme', () => {
    // Reproduces the exact failure: Pixi's path.rootname('tauri://localhost/index.html') is 'tauri://'.
    // The WHATWG parser keeps the host, which is why resolving against document.baseURI is correct.
    expect(new URL('habitats/fish/bowl/bg.png', 'tauri://localhost/index.html').href).toBe(
      'tauri://localhost/habitats/fish/bowl/bg.png',
    );
  });
});

describe('loadTextures leniency', () => {
  const missing = 'does/not/exist.png';

  it('skips a failed asset when lenient, so optional art never blocks the scene', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const map = await loadTextures([missing], true);
    expect(map.has(missing)).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('rejects when a required asset fails, so a blank habitat is never silent', async () => {
    // main.ts catches this and paints a visible error box. Before this, a total asset outage was
    // indistinguishable from a working app until someone looked at the pixels.
    await expect(loadTextures([missing], false)).rejects.toThrow();
  });
});
