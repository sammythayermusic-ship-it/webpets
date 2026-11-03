# WebPets architecture contract (Phase 0)

This is the contract between modules so they can be built in parallel. Every path, event name and
function signature here is binding. The shared type files are the source of truth for shapes:
`src/sim/types.ts`, `src/sim/constants.ts`, `src/platform/types.ts`, `src/app/types.ts`, `src/render/types.ts`,
`src/ui/types.ts`. If a builder needs to change one, they change this file and the type file together.

## Directory ownership

| Path | Owner | Notes |
|---|---|---|
| `src/sim/**` | sim | Pure TS. Zero imports from outside `src/sim`. Vitest tests first. |
| `src/app/**` | sim | Store (Zustand vanilla), persistence, scheduler (30 s reconcile), notification decisions, `view.ts`. Imports sim + platform types. |
| `src/platform/**` | shell | `types.ts` (fixed), `tauri.ts` (real), `browser.ts` (mock), `index.ts` (`createPlatform()`, `isTauri()`). |
| `src-tauri/**` | shell | Window, tray, click-through poller, notifications, clock, autostart, shortcut, single-instance. |
| `src/render/**` | render | PixiJS scene, layers, sprite player, FX, scaling, tray chip painter. |
| `src/species/fish/**` | render | Pure behavior state machine + bowl layout + speech line pools (`lines.ts`). No Pixi imports in `behavior.ts`. |
| `tools/gen_placeholders.py`, `assets/manifest.json`, `assets/habitats/**` | render | Synthetic layers, stamped with the full word PLACEHOLDER; `PH` in the stamp colour only inside `pantry_fill`, which is too narrow for the word. Asserted by `src/render/placeholderStamps.test.ts`. |
| `tools/gen_bg.py`, `tools/gen_fish.py`, `assets/sprites/fish/**` | render | Real art derived from `assets/reference/habitats-hires/fish-bowl.png`: the bowl `bg` and the fish strips. Carries no stamp; asserted by `src/render/bgArt.test.ts` and `src/render/spriteStrips.test.ts`. |
| `src/ui/**`, `src/audio/**` | ui | DOM HUD, dev panel, speech bubbles, holiday-feeder dialog, montage, memorial card, tray wiring, audio hooks. |
| `src/main.ts` | integration | Boot sequence and all cross-module wiring. Written last. |
| `vite.config.ts`, `index.html`, `package.json`, `tsconfig.json`, `vitest.config.ts` | integration | Already configured; changes require a contract edit. |
| `tests/e2e/**`, `playwright.config.ts`, `README.md` | integration | Playwright smoke + acceptance recording in browser mode. |
| `docs/DECISIONS.md` | everyone | Each builder appends under its own `### <owner>` heading only. |

Dependency direction: `sim` ← `app` ← (`render`, `ui`) ← `main`. `platform` is imported by `app`, `ui`, `main` only.
`render` and `species` import from `sim` (types, constants) only, never from `app`, `ui` or `platform`.
`ui` may additionally import `src/species/*/lines.ts` (data only) and `src/render` (types + `paintTrayChip`).
`Rect` lives in `src/sim/types.ts`; platform and render re-export it.

Rust commands are the only path for notifications, autostart, the global shortcut and positioning. The JS plugin
packages for those stay installed but unused in Phase 0 (the store plugin JS API is used).

Tests: Vitest picks up `src/**/*.test.ts` and `tests/unit/**`; Playwright uses `tests/e2e/**` (`testDir`).

## Assets and URLs

Vite `publicDir` is the repo `assets/` folder (configured), so `assets/habitats/fish/bowl/bg.png` is served at
`/habitats/fish/bowl/bg.png` in dev and in the Tauri bundle (`tauri://localhost/...`). A build plugin deletes
`dist/reference` so the 1024 px references never ship (the rest of `assets/` does ship; acceptable).
Never name an asset with an `@2x`/`@Nx` suffix: Pixi's resolver would halve its logical size. Art may be any
integer multiple of the logical grid; the multiple is derived from the texture and never declared, so art and
manifest cannot drift. Textures load with `linear` filtering and generated mipmaps.

```
assets/
  manifest.json                     habitats + sprites index (schema = Manifest in src/render/types.ts)
  habitats/fish/bowl/<layer>.png    1280x960 Blender renders = 4x the 320x240 logical grid:
                                    bg (stand, back glass, water, gravel, plant, baked contact shadow),
                                    decor_front (front gravel lip + frontmost plant blade), glass (front
                                    glass only, on alpha), memorial. `decor_front` and `glass` draw AFTER
                                    the pet slot, which is what puts the fish inside the tank.
                                    There is no `night` layer: night is a tint on these sprites.
  habitats/fish/bowl/geometry.json  waterline, gravel floor and inner ellipse PROJECTED out of the bowl
                                    camera, in art px. The source of the manifest's water numbers; they
                                    are authored by the renderer, never measured off colour.
  sprites/fish/<state>/*.png        320x320 frames, one PNG per frame = 4x the 80x80 logical frame.
                                    idle 12, eat 8, hungry 8, sleep 6, dead 6, happy 8, excited 8,
                                    curious 6, rendered at 12 fps. Separate files rather than a sheet
                                    because only separate files can be mipmapped.
  sprites/fish/geometry.json        frame counts, fps, anchor and the projected body box.
  habitats-160x120/*.png            the Phase 0 concept art. Reference only; nothing reads it now.
  reference/habitats-hires/*.png    1168x880 concept renders. Source, never shipped (a build plugin drops them).
  sprites/pets-80, sprites/strips-80  earlier-round reference sprites; nothing reads them.
  fonts/PressStart2P-Regular.ttf    unused since the chrome moved to a system typeface
  audio/fish/{ambient,feed,alert,death}.ogg   optional; missing files are silently skipped
```

`manifest.json` for the bowl. Every number below is MEASURED from `habitats/fish/bowl/bg.png` by
`tools/gen_bg.py --report-only`, not authored; the art on disk is the source of truth and the manifest and
`src/species/fish/layout.ts` must agree with it and with each other. `opaqueRect` is the bg's alpha bbox
**exactly** — `habitatHitRect()` is `pad + opaqueRect * scale`, so any slack there either eats clicks at the
bowl's rim or makes the transparent pad steal clicks from the apps behind the window:

```json
{
  "version": 1,
  "habitats": {
    "fish/bowl": {
      "grid": [320, 240],
      "layers": [
        { "name": "bg",          "file": "habitats/fish/bowl/bg.png", "z": 0 },
        { "name": "memorial",    "file": "habitats/fish/bowl/memorial.png", "z": 0 },
        { "name": "medium",      "file": "habitats/fish/bowl/medium.png", "z": 0 },
        { "name": "decor_back",  "file": "habitats/fish/bowl/decor_back.png", "z": 0 },
        { "name": "pantry",      "file": "habitats/fish/bowl/pantry.png", "z": 0 },
        { "name": "pantry_fill", "file": "habitats/fish/bowl/pantry_fill.png", "z": 1 },
        { "name": "pet", "z": 0 },
        { "name": "food", "z": 0 },
        { "name": "decor_front", "file": "habitats/fish/bowl/decor_front.png", "z": 0 },
        { "name": "glass",       "file": "habitats/fish/bowl/glass.png", "z": 0 },
        { "name": "fx", "z": 0 },
        { "name": "night",       "file": "habitats/fish/bowl/night.png", "z": 0, "blend": "multiply" },
        { "name": "shadow", "z": 0 }
      ],
      "water": { "x": 81, "y": 44, "w": 158, "h": 147 },
      "waterShape": { "cx": 160, "cy": 116, "rx": 78, "ry": 80, "surfaceY": 44, "floorY": 190 },
      "pantryRect": { "x": 180, "y": 11, "w": 36, "h": 29 },
      "petAnchor": [160, 120],
      "opaqueRect": { "x": 79, "y": 8, "w": 162, "h": 224 }
    }
  },
  "sprites": {
    "fish": {
      "frame": [160, 160],
      "body": { "w": 56, "h": 46 },
      "states": {
        "idle":   { "file": "sprites/fish/idle.png",   "frames": 4, "sequence": [0,0,0,0,1,1,0,0,2,0,0,3,3,0], "loop": true },
        "eat":    { "file": "sprites/fish/eat.png",    "frames": 4, "sequence": [0,1,2,3], "loop": false, "returnTo": "idle" },
        "hungry": { "file": "sprites/fish/hungry.png", "frames": 4, "sequence": [0,0,1,1,2,2,3,3], "loop": true },
        "sleep":  { "file": "sprites/fish/sleep.png",  "frames": 2, "sequence": [0,0,0,1,1,1], "loop": true },
        "dead":   { "file": "sprites/fish/dead.png",   "frames": 2, "sequence": [0,0,0,0,1,1,1,1], "loop": true }
      }
    }
  }
}
```

Measured from `habitats/fish/bowl/bg.png` (grid px at 320x240): the bowl's opaque pixels span x 79..240,
y 8..231, and `opaqueRect` is exactly that box. The bowl's interior spans y 44..190, with rows x 81..238 at
the widest (y 104..128) narrowing to about x 115..190 at the rim and x 137..182 at the gravel; `waterShape`
is a least-squares ellipse fit to those rows (rms 0.58px), rounded inward. `surfaceY` is the bowl's topmost
opaque row, not the painted meniscus -- the fish may swim into the air gap, which is Phase 0 behaviour that
Stage 2 re-measured rather than redesigned. `water` is the bounding rect of those rows and is inclusive of
the floor row (h = floorY - surfaceY + 1 = 147); `makeWaterBounds().rect` is the half-open surface..floor band
(h = 146). Behavior keeps the `body` box inside the ellipse, and `body` (56x46) is smaller than the drawn
fish (~64x48) in both axes so fins and tail may brush the glass.

These numbers are NOT the Stage 1 values doubled. The shipped 160x120 art is about 3% larger than any
downscale of the current hi-res reference, anchored at its top-left, so the doubles were 1-6px wide of the
real art on the right and bottom edges. The art on disk wins; `tools/gen_bg.py --report-only` reprints the
whole measurement report, and `src/render/bgArt.test.ts` pins `opaqueRect` to the alpha bbox.

Every distance in `src/species/fish/behavior.ts`, `src/render/food.ts` and `src/render/fx.ts`, and the drop
shadow offsets in `src/render/scene.ts`, are grid px and were doubled with the grid in Stage 1.

Layer semantics: `layers[].name` must be one of the 13 names in `LayerName`; the draw order is the fixed slot order
(shadow, bg/memorial, medium, decor_back, pantry, pantry_fill, pet, food, decor_front, glass, fx, night) with `z`
only ordering entries that share a slot. `memorial` is a `bg` variant shown instead of `bg` when `phase === 'memorial'`.
`pantry_fill` is a full grid-sized PNG whose non-transparent pixels lie inside `pantryRect`; the visible rows are
`top = pantryRect.y + round(pantryRect.h * (1 - pantryFraction))` to the rect bottom, implemented as one Sprite whose
`Texture` has a dynamic `frame` (`texture.frame = ...; texture.updateUvs()`), positioned at `(pantryRect.x, top)`.
`pantryLow` blink = alpha stepped 1.0/0.6 every 500 ms, never tweened. Layers without `file` are procedural.

## Layout and window geometry

- Habitat grid 320×240, integer scale `s ∈ {1,2,3}`. Habitat CSS size = `320s × 240s`.
- `WINDOW_PAD = 24` CSS px on every side (screen px, not grid px). Window size = `(320s + 48) × (240s + 48)`:
  S 368×288, M 688×528, L 1008×768. `tauri.conf.json` is 688×528 (the `DEFAULT_SCALE` fallback before TS boots).
  A 4× rung is deliberately absent: 1328×1008 is taller than the target display's 982 px work area.
  `SCALE_S`/`SCALE_M`/`SCALE_L` and `DEFAULT_SCALE` in `src/sim/constants.ts` are the names for these rungs;
  nothing else spells a scale as a bare number (`src/ui/tray.ts`, `src/platform/browser.ts` and
  `src-tauri/src/tray.rs` all use them).
- That formula is written once, as `windowSizeForScale(scale: Scale): { width, height }` in `src/sim/constants.ts`
  (re-exported by `src/platform/geometry.ts`, wrapped as `windowSize(scale): { w, h }` by `src/render/scene.ts`).
  `src-tauri/src/window.rs` mirrors `GRID_W`/`GRID_H`/`WINDOW_PAD`/`SCALE_S`/`SCALE_M`/`SCALE_L`/the scale range in
  Rust and pins them — plus the `tauri.conf.json` fallback size — to `src/sim/constants.ts` in its `contract_sync`
  test (`include_str!` + a string scan), so the grid, the padding and the scale ladder can only be changed in all
  four places at once. `tests/unit/contract-sync.test.ts` mirrors the same assertions in Vitest, because drift is
  almost always introduced from the TypeScript side where `npm test` is the loop people actually run.
- The tray's Size submenu greys out a rung whose window would not fit the current monitor's work area
  (`window::scale_fits_work_area`); the rung currently in use always stays selectable.
- Habitat origin inside the window = `(24, 24)`. HUD pill is centered horizontally above the habitat inside the top pad
  (its bottom edge 4 px above the habitat, sliding up 8 px on appear). Caption sits in the bottom pad.
- **Grid = logical coordinates, not pixels.** 320×240 defines behaviour, water bounds, hit regions and every
  manifest number; it says nothing about resolution. The layer stack draws straight to the stage: `layers.root` at
  `(24, 24)` with `scale = s`, each file-backed layer at `1/artScale` where `artScale = texture.width / 320` is
  derived per texture. There is **no RenderTexture and no drop shadow** — both were the pixel-grid guarantee, and
  the habitat art now carries its own baked contact shadow.
- Pixi init is exactly: `app.init({ width: 320s+48, height: 240s+48, resolution: devicePixelRatio, autoDensity: true,
  roundPixels: false, backgroundAlpha: 0, antialias: false, preference: 'webgl' })`. No `resizeTo`.
  `scene.setScale(s)` calls `renderer.resize(320s+48, 240s+48)`; `scene.setResolution(dpr)` calls
  `renderer.resize(w, h, dpr)`. `roundPixels` is off because it snaps to the RENDER TARGET's grid, which is now the
  canvas in device px rather than a grid-unit texture. `TextureStyle.defaultOptions.scaleMode = 'linear'` is set
  before any load and `loadTexture` builds every `ImageSource` with `scaleMode: 'linear'` and
  `autoGenerateMipmaps: true` (art is minified several times over at the smallest window; bilinear-only
  minification crawls). Phase 0 uses no filters at all; the starving water tint is `medium.tint`; the night layer
  uses `blendMode = 'multiply'` (native). Any future filter is created with `{ resolution: 'inherit', antialias: 'off' }`.
- Hit regions (window-local CSS px) sent to Rust by `main.ts` only (`refreshHitRegions()`): the habitat opaque rect
  `(24 + opaqueRect.x·s, 24 + opaqueRect.y·s, opaqueRect.w·s, opaqueRect.h·s)` always; `hud.getRects()` while visible
  (pill rect extended down to the habitat top so the 4 px gap is not click-through, plus the caption rect);
  `devPanel.getRect()` while open. Everything else is click-through. The HUD calls `deps.requestHitRegions()` on every
  visibility toggle and whenever `relayout()` changes either the pill rect or the caption rect while visible (a longer
  name widens and re-centers the pill, so the strip must follow it). The bounding-box approximation of "opaque pixels"
  is logged in DECISIONS.md.
- Rust snaps to the work-area edges within `SNAP_PX = 16`, clamps inside the monitor work area, and saves the position
  per monitor key in `settings.json` under the top-level key `positions` (never inside `doc`).
- `set_scale` keeps the bottom-right corner fixed; its first call after launch restores the saved position for the
  monitor recorded in `positions.last` (when that monitor is connected), else for the current monitor, else for any
  connected monitor with a saved entry, or defaults to the bottom-right corner of the primary work area with a 24 px
  margin.
- The window is created hidden. Rust never shows it on its own except a 10 s safety fallback (so a frontend crash is
  visible). TS shows it at the end of boot unless minimized. Never call `set_focus`/`setFocus`; `show()` alone orders the
  window front without activating the app (Accessory policy: no Dock icon; the tray is the app's home).

## Pointer, hover and click-through rules

1. `#ui { position: absolute; inset: 0; pointer-events: none }`; `pointer-events: auto` only on the pill, caption,
   dev panel, dialogs and bubbles that need clicks. Those elements call `stopPropagation()` on `mousedown` so the
   habitat drag handler never sees them.
2. Rust polls `app.cursor_position()` every `POINTER_POLL_MS = 50`, converts to window-local CSS px
   (`(cursor - outer_position) / scale_factor`), tests the regions, calls `set_ignore_cursor_events(!inside)` only on
   change, and emits `pointer` `{ inside, x, y }` on every inside/outside change and at poll rate while inside.
3. HUD visibility = `pointer.inside` (from Rust) with a 400 ms grace timer before hiding; in browser mode the mock
   derives `pointer` from DOM `mousemove`/`mouseleave` on `#app`. On `inside: false` main.ts calls
   `scene.setPointer(null, null)`.
4. `mousedown` on the canvas (outside `#ui`) → `platform.window.startDrag()`. `contextmenu` on `#app` →
   `platform.window.popupMenu()` (Rust shows the tray menu at the cursor).
5. Keyboard: matched on `e.code` with modifiers, `preventDefault()`: `Meta+Equal`/`Meta+NumpadAdd` scale up,
   `Meta+Minus`/`Meta+NumpadSubtract` scale down, `Alt+Meta+KeyD` dev panel.
6. Fonts: `-webkit-font-smoothing: none; text-rendering: optimizeSpeed; font-size: 8px | 16px; line-height: 1`;
   `image-rendering: pixelated` only on `<img>`/`<canvas>`. All offsets are integer CSS px.

## Tauri commands and events (Rust ↔ TS)

Commands (invoke names; args/returns are camelCase JSON matching `src/platform/types.ts`):

| Command | Args | Returns | Purpose |
|---|---|---|---|
| `clock_now` | – | `ClockReading` | epoch + monotonic |
| `set_scale` | `{ scale }` | `WindowGeometry` | resize keeping bottom-right anchored; first call restores position |
| `set_scale_live` | `{ scale, live }` | `WindowGeometry` | as above; `live` skips edge snapping and the position write, for a drag in flight |
| `set_interaction_lock` | `{ ms }` | — | hands the pointer to the webview for `ms` (renewable, 0 releases); the cursor poller stands down |
| `set_layering` | `{ alwaysOnTop, allDesktops, overFullscreen }` | — | window level and collection behaviour, applied as a set |
| `get_layering` | – | `{ level, behavior }` | level and collection-behaviour bits read off the LIVE window, for the boot report |
| `build_identity` | – | `BuildIdentity` | `{ bundle, exe, version, builtAtMs, staleLaunch }` — which binary is running |
| `set_hit_regions` | `{ regions: Rect[] }` | – | regions in window-local CSS px |
| `get_geometry` | – | `WindowGeometry` | |
| `show_window` / `hide_window` | – | – | show never focuses |
| `popup_menu` | – | – | `ContextMenu::popup(window)` with the tray menu |
| `tray_set_chip` | `{ rgba: number[], size }` | – | raw RGBA, size 18 or 36 |
| `tray_set_tooltip` | `{ text }` | – | |
| `tray_set_menu_state` | `TrayMenuState` | – | updates check/enabled state and the Show/Minimize label |
| `notify` | `{ title, body }` | – | `app.notification().builder().title().body().show()`; log before calling (errors are swallowed by the plugin) |
| `autostart_get` / `autostart_set` | – / `{ on }` | `bool` / – | `ManagerExt::autolaunch()` |
| `quit_app` | – | – | |
| `voice_status` | – | `{ hasKey }` | is a Keychain generic password set (service `com.sammythayer.webpets`, account `anthropic`) |
| `voice_write` | `{ system, user }` | `{ text: string \| null, usd }` | one Claude-written line (Messages API, Claude Opus 5.5, low effort, default refusal fallbacks); `text` null on refusal, a cut-off reply or no key; `usd` is what it cost, for the daily cap. The key never crosses to TS |
| `input_idle` | – | `{ keys, any, unseen }` | seconds since the last key press / any input (window server counters; no permission); `unseen`: the pet's own window is not on screen, or the Dock's full-screen backdrop is up (`idle.rs`) |
| `open_link` | `{ url }` | – | `open <url>` for plain https links to a real host only; anything else is an error |
| `begin_typing` | – | – | remembers the frontmost app, then makes the habitat window key (`focus.rs`): the only time it takes focus, while the chat field is open |
| `end_typing` | – | – | hands focus back to the remembered app, unless the card window is open |
| `open_card` | – | – | opens (or focuses) the "Get to know me" window, label `card`, `card.html`, 440×640, taking focus the same way |
| `close_card` | – | – | closes it; its `Destroyed` event gives focus back |

Events (Rust → TS, on the main window):

| Event | Payload |
|---|---|
| `tray-action` | `TrayAction` string (menu item ids equal the action strings) |
| `toggle-visibility` | none: global shortcut `Cmd+Shift+P` on `ShortcutState::Pressed` only, or tray `Click { Left, Up }` (config `showMenuOnLeftClick: false`; right-click opens the menu) |
| `pointer` | `PointerState` |
| `window-moved` | `WindowGeometry` after snap/clamp/persist |
| `wake` | none: a thread samples wall and monotonic every 5 s; emitted when wall delta − mono delta > 5 s |

Between windows (TS → TS through the event system, `platform.events`): `profile-changed` (a window saved
`profile.json`; the other reloads it) and `forget-me` (the card cleared the profile; the habitat window
clears what the pet remembers of chats). The card window (`src/card.ts`) shares the store plugin's files
with the habitat window: the plugin keeps one copy of a file per path in Rust, whichever window loads it.

Moved handling: Rust records the time of each `WindowEvent::Moved`; a helper waits until 150 ms pass with no new
Moved, then snaps, clamps, calls `set_position` only if it differs from `outer_position`, persists, and emits
`window-moved`. Moved events at a position Rust itself just set are ignored (re-entrancy guard).

Plugin order in `lib.rs`: single-instance first (callback shows the main window, no focus), then store,
notification, autostart, global-shortcut, positioner.

The single-instance callback also compares `argv[0]`'s `.app` bundle against `std::env::current_exe()`'s
(`identity.rs`) and notifies when they differ. Every build shares the bundle id, so macOS routes a launch
of a NEWLY built copy to whichever copy is already running: without the comparison, opening a new build
while an old one runs silently surfaces the old one and discards the launch. Install with
`npm run install:app`, which quits the running copy (matched on the executable name — a bundle-path match
misses Finder's "WebPets 2.app") and replaces one canonical `/Applications/WebPets.app`.

Notifications from `tauri dev` are posted under the Terminal identity (allow notifications for Terminal); only the
bundled `.app` uses `com.sammythayer.webpets`. Document this in the README.

The scale is an integer count of EIGHTHS of the grid: 8 is 1×, 16 is 2×, 24 is 3×, and anything from 6 to 32 is
legal. `GRID_W` and `GRID_H` both divide by 8, so `windowSizeForScale` is `40n + 48` by `30n + 48` — whole pixels
in both languages with no rounding rule to keep in step. It is written to disk as `scaleSteps`; the older `scale`
key is read as a rung of the three-rung ladder it replaced.

`settings.json`'s document is **version 2**. Version 1 held the old 2/3/4 scale ladder, so the same number means a
different window size in each; `normalizeSettings` migrates a v1 document by preserving on-screen size
(`2 → 1`, `3 → 2`, `4 → 2`) and carries every other field forward. Only an unknown version falls back to defaults.

`pet.json`'s document is **version 3**: `{ version, pet, latches, needs? }`. Version 2 added the twice-a-day clock;
version 3 made food free. `migratePetDoc` upgrades any older document on load: version 1 is re-anchored at the hunger
it was showing (see "The rate is versioned" below), and versions 1 and 2 drop their food `balance`, rename the pet's
`feedBurned` to `foodEaten`, and give the fourth personality its new name, `hyper` (same behaviour). The upgraded
document is written back.
`graveyard.json` is **version 2**: version 1 records carry the same old pet shape and are upgraded on load, never
dropped.

`brain.json` (one per pet; a new pet starts it fresh) holds what the pet has said lately and which facts it has
told (`memory`), its talk timing (`talk`), today's spend on written lines (`spend`), the bond (`bond`:
`src/brain/bond.ts`) and chat (`chat`: the last four exchanges, how you said you felt, how often you brought
each interest up). `profile.json` is about you, not a pet, and survives new pets: `{ version: 1, name, teams,
interests, own, updatedAt }` (`src/brain/profile.ts`); "Forget me" writes an empty one.

Store files (Tauri store plugin, app-data dir): `pet.json`, `settings.json`, `graveyard.json`, `brain.json`, `profile.json`. TS reads/writes them
through `platform.store` (`PersistApi`: `load(file)`, `set(file, data)`, `save(file)`) which only ever touches the
key `"doc"`; `src/app/persistence.ts` calls `set` (plugin `store.set('doc', data)`) immediately on every save and
throttles `save` (plugin `store.save()`) to 500 ms, so the plugin's exit safety-save always writes the latest document. Rust writes only the top-level key
`positions` in `settings.json`: `{ "<monitorKey>": { "x", "y" }, "last": "<monitorKey>" }`, where `last` is the key
persisted most recently (monitor keys always contain `@`, so `last` cannot collide).

## Browser mock (`src/platform/browser.ts`)

Same `Platform` interface for `npm run dev` in a normal browser and for Playwright, no Tauri:
- `store`: `localStorage` keys `webpets:<file>`; `clock()` returns `Date.now()` for both fields.
- `window.setScale` resizes `#app` to the contract window size and dispatches `window-moved`; `hide()` sets
  `#app.hidden = true` and shows a fixed 22 px `#mock-tray` canvas (painted by `tray.setChip`, click = toggle);
  `show()` reverses it; `popupMenu` renders a simple DOM menu of `TrayAction`s; `startDrag` is a no-op;
  `pointer` is derived from `mousemove`/`mouseleave` on `#app`.
- `window.__webpetsMock = { emitTray(a), emitWake(), emitToggleVisibility(), emitPointer(inside, x, y),
  notifications: Array<{ title; body }>, geometry(), reset() /* clears the webpets:* keys */, trayChip: HTMLCanvasElement }`,
  typed in `src/platform/mock.d.ts`.

## Time

`app.now()` = `Date.now() + settings.devClockOffsetMs`. Dev `skip(ms)` adds to the offset, persists and ticks.
`dev.skipOnNextLaunch(ms)` writes `settings.pendingSkipMs` and flushes; `boot()` adds it to `devClockOffsetMs` and
clears it before the first reconcile, so quit → relaunch produces the "while you were gone" montage.
The scheduler calls `tick()` (reconcile at `now()`) on boot, every 30 s, on `visibilitychange`, on `focus`, and on
`wake`. All sim math uses timestamps, never elapsed timers.

## Simulation API (`src/sim/index.ts` re-exports everything)

```ts
hungerAt(state, now, c = DEFAULT_CONSTANTS): number   // 0 for dead pets; else clamp(hungerAtLastFed - decay * max(0, now - lastFedAt)/HOUR_MS, 0, MAX)
hungerLabel(h): HungerLabel                           // full if h > 60; peckish if 30 < h <= 60; hungry if 0 < h <= 30; starving if h === 0
zeroAt(state, c): number                              // alive: lastFedAt + hungerAtLastFed / DECAY_PER_HOUR * HOUR_MS (ignores pantry); dead: diedAt - 24 h
projectedDeathAt(state, now, c): number               // dead: diedAt; alive: simulate auto-feeds from now until pantry < MEAL_SIZE, then zeroAt + DEATH_AFTER_ZERO_HOURS
reconcile(state, now, c): ReconcileResult             // see rules below; no-op (unchanged state, []) when now <= lastReconciledAt or the pet is dead
feed(state, now, c): FeedResult                      // free; reconcile first; dead → { ok: false, reason: 'dead' } (the only FeedFailure); t = max(now, lastReconciledAt); hungerAtLastFed = min(MAX, hungerAt(t) + gain); lastFedAt = lastReconciledAt = t; meals++; foodEaten += MEAL_SIZE
fillPantry(state, now, c): ReconcileResult            // free; reconcile first; dead (or dies in that catch-up) → returned unfilled; pantry = max(pantry, PANTRY_CAPACITY); reconcile again at max(now, lastReconciledAt) (may auto-feed there)
pantryDays(pantry, c): number                         // (pantry / MEAL_SIZE) * (FEED_GAIN / DECAY_PER_HOUR) / 24; PANTRY_CAPACITY (150) is 3 days
ageMs(state, now): number                             // (diedAt ?? now) - bornAt
formatAge(ms): string                                 // "3d 4h" (floor), minimum "0d 0h"
newPet(now, rng, opts?: { species?; name? }): PetState // id "#0001".."#9999" from rng; name from a species pool; rarity 70/20/8/2; personality uniform; lastReconciledAt = lastFedAt = bornAt = now; hunger 100; pantry 0; no diedAt key
toGraveRecord(state, now): GraveRecord
```

Invariants: `lastReconciledAt >= lastFedAt` always. Food is free: there is no balance, and nothing a mutator does can
fail for want of food. Every mutator first reconciles to `now`, then builds the new state. Mutators never move the
pet's clock backwards: when `now < lastReconciledAt` (dev `resetClock` after a skip, or a system clock correction)
reconcile is a no-op and `feed` / `fillPantry` act at `max(now, lastReconciledAt)`, so a manual feed raises the hunger
the pet has already reached (the store shows hunger at that same time) instead of spending the meal on a gain that
decays away before real time catches up. `foodEaten === meals * MEAL_SIZE`; only `fillPantry` and the dev panel put
food in the pantry and only auto-feeds take it out, so outside the dev panel `0 <= pantry <= PANTRY_CAPACITY`.
`pantry`, `meals`, `foodEaten` are non-negative integers; hunger is the only float. Dead states are built by setting
`alive: false` and adding `diedAt`; alive states never carry a `diedAt` key.

Auto-feed rule: walking forward from `from = lastReconciledAt`, the next auto-feed time is
`t* = max(from, lastFedAt + (hungerAtLastFed - PANTRY_TRIGGER) / DECAY_PER_HOUR * HOUR_MS)`, applied only if
`t* <= now`, the pet is alive at `t*` (i.e. `t* < zeroAt + 24 h`), and `pantry >= MEAL_SIZE`. The trigger is inclusive
(`hunger <= 30`, deliberate: identical instant with continuous decay; a pet exactly at 30 is fed). Each auto-feed sets
`lastFedAt = t*`, `hungerAtLastFed = min(MAX, hungerAt(t*) + FEED_GAIN)`, `pantry -= MEAL_SIZE`, `meals++`,
`foodEaten += MEAL_SIZE`, emits `auto-fed`. Repeat until no feed fits. Auto-feeds are applied for
`from <= t* <= now` (inclusive at `from`, so filling the feeder feeds at `now`; a feed at `from` cannot repeat because it moves
the next crossing into the future). `hungry` (crossing 30 with no auto-feed there), `starving` (zero), `dying-soon`
(zero + 18 h) and `died` (zero + 24 h, sets `alive = false`, `diedAt`) are emitted only for event times `e` with
`from < e <= now` (half-open). Result sets `lastReconciledAt = now`. `reconcile(reconcile(s, t).state, t)` returns a
deep-equal state and `[]` for every `t`, including event times. Timestamps for the default constants are integer ms;
round emitted timestamps with overridden constants.

Reference numbers (the pet eats twice a day): fresh pet at 100 with a full feeder (150, six meals), away →
auto-feeds at 16.8 h then every 12 h (80 → 30), the last at 76.8 h; at 72 h it is alive at hunger 50 with one meal
left; hungry at 88.8 h, starving at 96 h, dead at 108 h. With 1000 in the pantry (dev panel), 10 days away: 19 feeds,
pantry 525, hunger 50 at 240 h, alive. Full to empty is 24 h; death at 36 h with an empty feeder. A meal is exactly
half the bar, which is why the manual and auto-feed cycles are both 12 h.

The rate is versioned. Hunger is derived from an anchor and never stored, so changing `DECAY_PER_HOUR` or
`FEED_GAIN` re-simulates every saved pet at the new speed — a fish showing 65 % can reappear dead. Any such
change needs a `PetDoc` version bump plus a `migratePetDoc` case that re-anchors the pet at its currently
displayed hunger and sets `lastReconciledAt = now` (which is what suppresses the retroactive event burst).
Version 2 is the twice-a-day clock; version 1 was a 45-point meal on a 60-hour bar. Version 3 (free food) is a
rename only and re-anchors nothing.

The sim builder implements the test list in `docs/SIM-TESTS.md` first.

## Species

`src/species/index.ts` maps `Species` to a `SpeciesModule` — layout, behaviour factory, line pools.
Its map is `Partial<Record<Species, SpeciesModule>>` deliberately: the union has had four members since
the first commit while only some are built, and a total map would be a lie. `requireSpecies` throws;
`speciesModule` returns null. Both "is this available" guards — the dev panel's option list and
`store.setSpecies` — ask the registry rather than keeping their own list.

A species' movement domain is a `MoveBounds`: `rect`, `surfaceY`, `floorY`, `inside`, `clamp`. Two
implementations — `makeWaterBounds` (an ellipse clipped to a band) and `makeFloorBounds` (a walkable
line, where `surfaceY === floorY`). The behaviour cannot tell them apart, and neither can the scene's
tick interpolation, which relies only on the body-eroded region being convex. Bubbles, the glass sheen
and the death fog are gated on the domain being water; they are aquatic physics, not parameterisable
geometry.

`PetOutput.speciesDelta` carries per-tick `speciesData` increments (the hamster's `wheelKm`). The scene
accumulates them; the app calls `scene.drainSpeciesDelta()` on the day/night cadence and banks them
with `actions.addSpeciesData`, which refuses to credit a dead pet. Writing through per tick would be 8
throttled disk saves a second.

Switching species calls `location.reload()` after a flush. The scene is built once at boot and its
reference is held by five modules, so a live swap means re-wiring all of them; a reload re-runs the
boot sequence against the species on disk, which is the path already under test.

## App store (`src/app/store.ts`, Zustand vanilla, no React)

`createAppStore(platform: Platform): AppStore` implementing `AppState`/`AppActions` from `src/app/types.ts`.
- `boot()`: load docs (defaults on first run: new pet with an empty feeder), migrate `pet.json` (`migratePetDoc`), consume `pendingSkipMs`, reconcile at
  `now()`; if the covered span (`now − pet.lastReconciledAt` before the reconcile) exceeds 60 s set `recentEvents`.
- `tick()`: reconcile; route events to `notifications.decide` and to `lastFeedEvent` (every `auto-fed` event with
  `at > previous lastReconciledAt` and within the last 60 s becomes `{ at, kind: 'auto', seq }`; older ones are only
  listed in `recentEvents`). Manual `feed()` sets `{ at: now, kind: 'manual', seq }`.
- `feed()` (free; fails only for a dead pet) and `fillPantry()` (free; fills the holiday feeder to `PANTRY_CAPACITY`)
  route their returned `events` exactly like `tick()` events.
- `acknowledgeDeath()` sets `latches.deathAcknowledgedFor = pet.id`. `newPet()`: reconcile → bury (if dead and
  not yet in the graveyard) → mint (empty feeder) → clear latches.
- `setScale` → `platform.window.setScale` then persist. `setHidden(b)` → hide/show, runtime only.
- `quit()` → flush all pending saves → `platform.quit()`.
- `dev.*` per the doc comments in `DevActions`.
- Persistence: `store.set('doc')` immediately, disk save throttled 500 ms per file, `flush()` on `beforeunload`, hide and quit.

`src/app/view.ts`: `toSceneView(s: AppState, prefersReducedMotion: boolean): SceneView` with
`phase = alive ? 'alive' : latches.deathAcknowledgedFor === pet.id ? 'memorial' : 'dead'`,
`pantryFraction = clamp(pantry / PANTRY_CAPACITY, 0, 1)`, `pantryLow = pantry > 0 && pantryDays(pantry) < PANTRY_LOW_DAYS` (1 day),
`asleep = night && alive`; and `toHudModel(s): { name, id, hungerPct, label, pantry, pantryDays, alive, age, canFeed }` with `canFeed = alive`.
`src/app/daynight.ts`: `isNightAt(now): boolean` = local hour < 7 or >= 19 (no location); `night = dayNight === 'night'
|| (dayNight === 'auto' && isNightAt(now))`, overridden by `nightOverride`.

`src/app/notifications.ts`: pure `decide(prev: PetState, next: PetState, events: SimEvent[], now: number,
latches: NotificationLatches, c = DEFAULT_CONSTANTS): { toasts: { title; body }[]; latches: NotificationLatches }`.
Copy: "<name> is hungry." (event `hungry`), "<name> is starving. 12h to live." (`starving`, from `DEATH_AFTER_ZERO_HOURS`), "<name> has 6 hours."
(`dying-soon`), "<name> has died." (`died`), "The feeder is almost empty." (when `pantry > 0 && pantryDays < PANTRY_LOW_DAYS (1) &&
hunger < 60` and `latches.pantryLowFiredForPantry !== pantry`; the latch resets to null when the feeder rises to >= 1 day).
The scheduler calls `platform.notify` for each toast unless `settings.notificationsMuted`.

## Render API (`src/render/index.ts`)

`createScene(manifest: Manifest): HabitatScene`, `loadManifest(): Promise<Manifest>`,
`paintTrayChip(view: SceneView, size: TrayChipSize): Uint8Array` (RGBA, mini fish + hunger ring colored by label;
no Pixi dependency; works with a manual pixel buffer so it runs in tests).

Scene rules: the layer stack is drawn **straight to the stage**, no RenderTexture. `layers.root` sits at
(`WINDOW_PAD`, `WINDOW_PAD`) and carries the window scale; every file-backed layer carries `1/artScale`, where
`artScale = texture.width / grid.w` is **derived from the texture** (`layerArtScale`, which throws by name if the
axes disagree or the ratio is not a whole number). Everything between those two — parallax, flakes, bubbles, the
fog, the pet's centre — is in plain grid px.

**Three clocks.** The behaviour steps at `PET_FPS = 8` on a `deltaMS` accumulator and returns clamped integer grid
positions. The pet's animation advances at the ART's rate (`ManifestSprite.fps`, default `PET_FPS`) on the sprite
player's own accumulator. The drawn position is interpolated across the current tick on **every rendered frame**,
using `acc / STEP_MS` from that same accumulator so the two cannot drift. Raising `PET_FPS` instead would rescale
every per-tick constant in the behaviour. FX (bubbles) at ticker rate. `phase === 'dead'`: pet plays
`dead` at `surfaceY + 6`, bubbles stop, a programmatic white fog (alpha 0.5; the `waterShape` ellipse masked to
`surfaceY..floorY`, i.e. `makeWaterBounds(waterShape).rect`) is added to the `glass` slot.
`phase === 'memorial'`: pet hidden, `memorial` drawn instead of `bg`, fog off. Starving: `medium.tint` shifted 10 %
toward green. `asleep`: fish still near the floor, `sleep` anim. Reduced motion: no idle bob, no parallax; state
changes still animate. Glass sheen follows the pointer on the `glass` slot; `glass` and `decor_front` get a +2 px
parallax offset toward the pointer (fractional, 0 when reduced motion).

Sprite player: a state's frames come from `ManifestSpriteState.source` — `strip` (one PNG, one row; cell width is
`texture.width / frames`, **not** the manifest `frame`) or `sequence` (one PNG per frame). Sequences are what
rendered art uses, and are the only form that can be mipmapped, since strip neighbours bleed at low mip levels.
`frame` is the LOGICAL footprint in grid px; the sprite is scaled by `frame.w / textureCellWidth` so art resolution
never changes the drawn size. Mirror via `scale.x` with anchor 0.5; a facing change tweens `scale.x` through zero as
`turnFrom * cos(pi * t)` over `turnMs` (the scene passes its tick length), which is what a half-turn about the
fish's vertical axis projects to under an ortho camera. The behaviour's one-tick `turning` flag is accepted and
ignored — several rendered frames share one tick, so the tween is keyed off the facing CHANGE. Positions are
fractional. A transform fallback (bob/squash) covers states with no art.

`src/species/fish/behavior.ts`: `createFishBehavior(): FishBehavior` (see `FishInput`/`FishOutput`): slow
figure-eight wander inside `bounds`; 2-tick turn; darts to the nearest flake and reports `biteFlakeIndex` within 6 px;
`hungry`: half speed, top third; `starving`: near the floor, barely moving; `asleep`: still near the floor;
dead: `anim 'dead'`, clamped as close to `surfaceY` as the body box fits. Positions are integers — the smoothing
lives in the renderer, which is why every behaviour test still reasons in whole grid px.

`src/species/fish/lines.ts`: `export const FISH_LINES: Record<Personality, Record<'idle' | 'fed' | 'hungry' |
'starving' | 'wake', readonly string[]>>`, at least 8 lines per pool. `mountSpeech` picks from `fed` on `bite`, from
`hungry`/`starving` on label change, from `idle` on a 60–180 s timer, from `wake` after a montage.

## UI API (`src/ui/index.ts`)

```ts
mountHud(root, deps): HudHandle
mountDevPanel(root, deps): DevPanelHandle
mountSpeech(root, deps): SpeechHandle & { relayout(): void }   // max 1 per 15 s, silent when dead; relayout() re-anchors a visible bubble after a scale change
mountFeederDialog(root, deps): { open(): void }   // the holiday feeder: days of food, a free FILL IT UP, "It feeds <name> while you're away."
mountMontage(root, deps): { play(events: SimEvent[], name: string): Promise<void> }
mountMemorial(root, deps): { setDead(pet: PetState | null): void }   // DOM card only (name, id, age, meals, "New pet"); dismiss → actions.acknowledgeDeath()
wireTray(deps): () => void                        // TrayAction → actions; chip repaint on hunger/label/alive change; setMenuState on settings change; tooltip "<name> · <label> · <pct>%"
initAudio(): AudioApi                             // Howler; every file optional; 404 → log once, no-op
computeHitRegions(scene, hud, devPanel): Rect[]   // habitat hit rect + visible HUD rects + dev panel rect
```

Caption: `FEEDER · 3 DAYS` where days = `floor(pantryDays)`; under a day `FEEDER · 1 MEAL`; with less than a meal
`FEEDER EMPTY`. FEED button label `FEED` (title "Feed"), disabled only when dead. Tray item "Holiday feeder…" (action
`pantry`) opens the feeder dialog. Modal cards (feeder dialog, memorial) are `max(120, min(240, habitatHitRect.w - 8))` px wide,
centred in `habitatHitRect`; `.modal .line` rows wrap (`white-space: normal; overflow-wrap: anywhere`) because
names are unbounded and the text is proportional. The feeder dialog's figure (`3 DAYS OF FOOD`, `1 MEAL LEFT`,
`EMPTY`) fits one line at M/L; its hint `It feeds <name> while you're away.` takes at most two. HUD hunger ring colors: full green, peckish yellow, hungry orange, starving red.
Dev panel (⌥⌘D): +1h / +12h / +3d, set hunger / pantry (any amount, even past `PANTRY_CAPACITY`), force state, day/night, species/habitat (disabled
except fish/bowl), FPS meter (`scene.fps()`), "Simulate 10-day absence with 1000 in pantry" (dry run, prints events),
"Skip 3d on next launch" (`dev.skipOnNextLaunch`), reset clock.

## Boot sequence (`src/main.ts`)

1. `platform = createPlatform()`; `store = createAppStore(platform)`; `await store.getState().actions.boot()`.
2. `manifest = await loadManifest()`; `scene = createScene(manifest)`; `await scene.mount(#app, settings.scale)`
   (creates the canvas; main creates `#ui` after it). `audio = initAudio()`.
3. Mount HUD, dev panel, speech, feeder dialog, montage, memorial; `wireTray`; subscribe `toSceneView` → `scene.setView`,
   `lastFeedEvent` → `scene.feed()` + `audio.play('feed')`, `settings.scale` → `scene.setScale`, `hud.relayout()`,
   `speech.relayout()`, `refreshHitRegions()`; `platform.window.onMoved(g => scene.setResolution(g.scaleFactor))`; pointer wiring per the
   rules above; keyboard; `contextmenu`; drag.
4. `await platform.window.setScale(settings.scale)` (restores position), `refreshHitRegions()`, then
   `await platform.window.show()` unless hidden. Start the scheduler. Night refresh every 60 s.
5. If `recentEvents.length > 0`, `await montage.play(recentEvents, pet.name)` then a `wake` speech line.
6. Boot is wrapped in try/catch that renders the error into `#app` and still shows the window.

## Acceptance script notes (Blueprint §11)

- "Skip until dead": from a fresh pet, hungry at 16.8 h, starving at 24 h, dead at 36 h. The dev panel only
  offers +1H / +12H / +3D, so the walk into the hungry band is +12H then +1H ×5 (17 h); then +12H (29 h,
  starving); then +3D (dead).
- "Holiday feeder": open it from the tray, FILL IT UP (free) shows 3 DAYS OF FOOD and the caption `FEEDER · 3 DAYS`.
- "Load 1000, skip 10 days" (dev panel PANTRY): assert pantry 525 and 19 `auto-fed` events. 500 also survives the
  ten days but ends on its last meal, which makes the assertion about arithmetic rather than behaviour.
- "Quit, fake the clock, relaunch → montage": use "Skip 3d on next launch", quit, relaunch (browser: reload).
