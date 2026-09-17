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
| `tools/gen_placeholders.py`, `assets/manifest.json`, `assets/habitats/**`, `assets/sprites/fish/**` | render | Placeholder PNGs stamped PLACEHOLDER. |
| `src/ui/**`, `src/audio/**` | ui | DOM HUD, dev panel, speech bubbles, pantry dialog, montage, memorial card, tray wiring, audio hooks. |
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
Never name an asset with an `@2x`/`@Nx` suffix: Pixi's resolver would halve its logical size.

```
assets/
  manifest.json                     habitats + sprites index (schema = Manifest in src/render/types.ts)
  habitats/fish/bowl/<layer>.png    160x120 layers: medium decor_back pantry pantry_fill decor_front glass night memorial
  habitats-160x120/fish-bowl.png    concept art, used as the `bg` layer for the bowl until layered art exists
  sprites/fish/<state>.png          80x80 strips: idle eat hungry sleep dead (frames left to right); the PH stamp
                                    stays inside the centred `body` box (src/render/spriteStrips.test.ts checks it)
  sprites/strips-80/*.png           reference strips (gus-*, doink-idle) for validating the player
  fonts/PressStart2P-Regular.ttf    HUD font (OFL)
  audio/fish/{ambient,feed,alert,death}.ogg   optional; missing files are silently skipped
```

`manifest.json` for the bowl (values are the contract; the render builder may refine `waterShape`/`pantryRect` by
looking at the art, and must keep the manifest and `src/species/fish/layout.ts` in sync):

```json
{
  "version": 1,
  "habitats": {
    "fish/bowl": {
      "grid": [160, 120],
      "layers": [
        { "name": "bg",          "file": "habitats-160x120/fish-bowl.png", "z": 0 },
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
      "water": { "x": 41, "y": 23, "w": 80, "h": 74 },
      "waterShape": { "cx": 81, "cy": 60, "rx": 40, "ry": 37, "surfaceY": 23, "floorY": 96 },
      "pantryRect": { "x": 100, "y": 6, "w": 22, "h": 22 },
      "petAnchor": [80, 60],
      "opaqueRect": { "x": 40, "y": 4, "w": 84, "h": 115 }
    }
  },
  "sprites": {
    "fish": {
      "frame": [80, 80],
      "body": { "w": 28, "h": 14 },
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

Measured from the concept art: the bowl's opaque pixels span x 40..123, y 4..118; the water spans y 23..96
with rows about x 41..121 at the widest (y 47..65) narrowing to x 59..92 at the surface (y 23) and x 56..106
near the gravel (y 90). `waterShape` is the ellipse approximation of that; behavior keeps the body box inside it.

Layer semantics: `layers[].name` must be one of the 13 names in `LayerName`; the draw order is the fixed slot order
(shadow, bg/memorial, medium, decor_back, pantry, pantry_fill, pet, food, decor_front, glass, fx, night) with `z`
only ordering entries that share a slot. `memorial` is a `bg` variant shown instead of `bg` when `phase === 'memorial'`.
`pantry_fill` is a full 160×120 PNG whose non-transparent pixels lie inside `pantryRect`; the visible rows are
`top = pantryRect.y + round(pantryRect.h * (1 - pantryFraction))` to the rect bottom, implemented as one Sprite whose
`Texture` has a dynamic `frame` (`texture.frame = ...; texture.updateUvs()`), positioned at `(pantryRect.x, top)`.
`pantryLow` blink = alpha stepped 1.0/0.6 every 500 ms, never tweened. Layers without `file` are procedural.

## Layout and window geometry

- Habitat grid 160×120, integer scale `s ∈ {2,3,4}`. Habitat CSS size = `160s × 120s`.
- `WINDOW_PAD = 24` CSS px on every side. Window size = `(160s + 48) × (120s + 48)`: S 368×288, M 528×408, L 688×528.
  `tauri.conf.json` is 528×408 (the M fallback before TS boots).
- Habitat origin inside the window = `(24, 24)`. HUD pill is centered horizontally above the habitat inside the top pad
  (its bottom edge 4 px above the habitat, sliding up 8 px on appear). Caption sits in the bottom pad.
- **Pixel grid guarantee (structural, not roundPixels):** every layer except `shadow` is drawn into a 160×120
  `RenderTexture` (nearest, resolution 1) in grid units; the scene draws that one texture at `(24, 24)` with
  `scale = s`. FX may use float positions inside the RenderTexture and automatically become big pixels. The shadow is
  drawn under the habitat sprite in CSS px (a stepped 2-tone offset rect, no blur).
- Pixi init is exactly: `app.init({ width: 160s+48, height: 120s+48, resolution: devicePixelRatio, autoDensity: true,
  roundPixels: true, backgroundAlpha: 0, antialias: false, preference: 'webgl' })`. No `resizeTo`.
  `scene.setScale(s)` calls `renderer.resize(160s+48, 120s+48)`; `scene.setResolution(dpr)` calls
  `renderer.resize(w, h, dpr)`. `TextureStyle.defaultOptions.scaleMode = 'nearest'` is set before any load and every
  `Assets.load` passes `{ src, data: { scaleMode: 'nearest' } }`. Phase 0 uses no filters at all; the starving water tint
  is `medium.tint`; the night layer uses `blendMode = 'multiply'` (native). Any future filter is created with
  `{ resolution: 'inherit', antialias: 'off' }`.
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

Events (Rust → TS, on the main window):

| Event | Payload |
|---|---|
| `tray-action` | `TrayAction` string (menu item ids equal the action strings) |
| `toggle-visibility` | none: global shortcut `Cmd+Shift+P` on `ShortcutState::Pressed` only, or tray `Click { Left, Up }` (config `showMenuOnLeftClick: false`; right-click opens the menu) |
| `pointer` | `PointerState` |
| `window-moved` | `WindowGeometry` after snap/clamp/persist |
| `wake` | none: a thread samples wall and monotonic every 5 s; emitted when wall delta − mono delta > 5 s |

Moved handling: Rust records the time of each `WindowEvent::Moved`; a helper waits until 150 ms pass with no new
Moved, then snaps, clamps, calls `set_position` only if it differs from `outer_position`, persists, and emits
`window-moved`. Moved events at a position Rust itself just set are ignored (re-entrancy guard).

Plugin order in `lib.rs`: single-instance first (callback shows the main window, no focus), then store,
notification, autostart, global-shortcut, positioner.

Notifications from `tauri dev` are posted under the Terminal identity (allow notifications for Terminal); only the
bundled `.app` uses `com.sammythayer.webpets`. Document this in the README.

Store files (Tauri store plugin, app-data dir): `pet.json`, `settings.json`, `graveyard.json`. TS reads/writes them
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
projectedDeathAt(state, now, c): number               // dead: diedAt; alive: simulate auto-feeds from now until pantry < FEED_COST, then zeroAt + 24 h
reconcile(state, now, c): ReconcileResult             // see rules below; no-op (unchanged state, []) when now <= lastReconciledAt or the pet is dead
feed(state, now, ledger, c): FeedResult               // reconcile first; validate; burn; t = max(now, lastReconciledAt); hungerAtLastFed = min(MAX, hungerAt(t) + gain); lastFedAt = lastReconciledAt = t; meals++; feedBurned += cost
depositPantry(state, n, now, ledger, c): PantryResult // reconcile first; dead → moved 0, ledger untouched; moved = min(floor(n), balance) (0 for n <= 0 / NaN); ledger.debit(moved); reconcile again at max(now, lastReconciledAt) (may auto-feed there)
withdrawPantry(state, now, ledger, c): PantryResult   // reconcile first (alive only); moved = pantry; allowed on dead pets; ledger.credit(moved)
pantryDays(pantry, c): number                         // (pantry / FEED_COST) * (FEED_GAIN / DECAY_PER_HOUR) / 24
ageMs(state, now): number                             // (diedAt ?? now) - bornAt
formatAge(ms): string                                 // "3d 4h" (floor), minimum "0d 0h"
newPet(now, rng, opts?: { species?; name? }): PetState // id "#0001".."#9999" from rng; name from a species pool; rarity 70/20/8/2; personality uniform; lastReconciledAt = lastFedAt = bornAt = now; hunger 100; pantry 0; no diedAt key
toGraveRecord(state, now): GraveRecord
class LocalLedger implements Ledger { constructor(balance: number); toJSON(): number }
```

Invariants: `lastReconciledAt >= lastFedAt` always. Every mutator first reconciles to `now`, performs all validation
on the reconciled state, calls exactly one Ledger method as its last side effect, then builds the new state; if the
ledger throws, the mutator rethrows. Mutators never move the pet's clock backwards: when `now < lastReconciledAt`
(dev `resetClock` after a skip, or a system clock correction) reconcile is a no-op and `feed` / `depositPantry` act at
`max(now, lastReconciledAt)`, so a manual feed raises the hunger the pet has already reached (the store shows hunger
at that same time) instead of burning $FEED for a gain that decays away before real time catches up. `balance + pantry + feedBurned` is conserved across all operations (the store's
`newPet` withdraws the pantry before replacing the pet). `pantry`, `balance`, `meals`, `feedBurned` are non-negative
integers; hunger is the only float. Dead states are built by setting `alive: false` and adding `diedAt`; alive states
never carry a `diedAt` key. `LocalLedger.burn/debit/credit` throw `RangeError` unless `Number.isInteger(n) && n >= 0`,
and burn/debit additionally when `n > balance()`; a throw leaves the balance unchanged.

Auto-feed rule: walking forward from `from = lastReconciledAt`, the next auto-feed time is
`t* = max(from, lastFedAt + (hungerAtLastFed - PANTRY_TRIGGER) / DECAY_PER_HOUR * HOUR_MS)`, applied only if
`t* <= now`, the pet is alive at `t*` (i.e. `t* < zeroAt + 24 h`), and `pantry >= FEED_COST`. The trigger is inclusive
(`hunger <= 30`, deliberate: identical instant with continuous decay; a pet exactly at 30 is fed). Each auto-feed sets
`lastFedAt = t*`, `hungerAtLastFed = min(MAX, hungerAt(t*) + FEED_GAIN)`, `pantry -= FEED_COST`, `meals++`,
`feedBurned += FEED_COST`, emits `auto-fed`. Repeat until no feed fits. Auto-feeds are applied for
`from <= t* <= now` (inclusive at `from`, so a deposit feeds at `now`; a feed at `from` cannot repeat because it moves
the next crossing into the future). `hungry` (crossing 30 with no auto-feed there), `starving` (zero), `dying-soon`
(zero + 18 h) and `died` (zero + 24 h, sets `alive = false`, `diedAt`) are emitted only for event times `e` with
`from < e <= now` (half-open). Result sets `lastReconciledAt = now`. `reconcile(reconcile(s, t).state, t)` returns a
deep-equal state and `[]` for every `t`, including event times. Timestamps for the default constants are integer ms;
round emitted timestamps with overridden constants.

Reference numbers: fresh pet at 100 with 500 in the pantry, 10 days away → auto-feeds at 42 h then every 27 h
(75 → 30): 8 feeds, pantry 300, hunger 60 at 240 h, alive. Full to empty is 60 h; death at 84 h with an empty pantry.
The Blueprint's "~250 or less" is only reached when the pet is starving at deposit time (10 feeds → 250).

The sim builder implements the test list in `docs/SIM-TESTS.md` first.

## App store (`src/app/store.ts`, Zustand vanilla, no React)

`createAppStore(platform: Platform): AppStore` implementing `AppState`/`AppActions` from `src/app/types.ts`.
- `boot()`: load docs (defaults on first run: new pet, `STARTING_BALANCE`), consume `pendingSkipMs`, reconcile at
  `now()`; if the covered span (`now − pet.lastReconciledAt` before the reconcile) exceeds 60 s set `recentEvents`.
- `tick()`: reconcile; route events to `notifications.decide` and to `lastFeedEvent` (every `auto-fed` event with
  `at > previous lastReconciledAt` and within the last 60 s becomes `{ at, kind: 'auto', seq }`; older ones are only
  listed in `recentEvents`). Manual `feed()` sets `{ at: now, kind: 'manual', seq }`.
- `feed()`, `depositPantry`, `withdrawPantry` route their returned `events` exactly like `tick()` events.
- `acknowledgeDeath()` sets `latches.deathAcknowledgedFor = pet.id`. `newPet()`: withdraw pantry → bury (if dead and
  not yet in the graveyard) → mint → clear latches.
- `setScale` → `platform.window.setScale` then persist. `setHidden(b)` → hide/show, runtime only.
- `quit()` → flush all pending saves → `platform.quit()`.
- `dev.*` per the doc comments in `DevActions`.
- Persistence: `store.set('doc')` immediately, disk save throttled 500 ms per file, `flush()` on `beforeunload`, hide and quit.

`src/app/view.ts`: `toSceneView(s: AppState, prefersReducedMotion: boolean): SceneView` with
`phase = alive ? 'alive' : latches.deathAcknowledgedFor === pet.id ? 'memorial' : 'dead'`,
`pantryFraction = clamp(pantry / PANTRY_VISUAL_MAX, 0, 1)`, `pantryLow = pantry > 0 && pantryDays(pantry) < PANTRY_LOW_DAYS`,
`asleep = night && alive`; and `toHudModel(s): { name, id, hungerPct, label, pantry, pantryDays, balance, alive, age, canFeed }`.
`src/app/daynight.ts`: `isNightAt(now): boolean` = local hour < 7 or >= 19 (no location); `night = dayNight === 'night'
|| (dayNight === 'auto' && isNightAt(now))`, overridden by `nightOverride`.

`src/app/notifications.ts`: pure `decide(prev: PetState, next: PetState, events: SimEvent[], now: number,
latches: NotificationLatches, c = DEFAULT_CONSTANTS): { toasts: { title; body }[]; latches: NotificationLatches }`.
Copy: "<name> is hungry." (event `hungry`), "<name> is starving. 24h to live." (`starving`), "<name> has 6 hours."
(`dying-soon`), "<name> has died." (`died`), "Pantry is almost empty." (when `pantry > 0 && pantryDays < 2 &&
hunger < 60` and `latches.pantryLowFiredForPantry !== pantry`; the latch resets to null when pantry rises to >= 2 days).
The scheduler calls `platform.notify` for each toast unless `settings.notificationsMuted`.

## Render API (`src/render/index.ts`)

`createScene(manifest: Manifest): HabitatScene`, `loadManifest(): Promise<Manifest>`,
`paintTrayChip(view: SceneView, size: TrayChipSize): Uint8Array` (RGBA, mini fish + hunger ring colored by label;
no Pixi dependency; works with a manual pixel buffer so it runs in tests).

Scene rules: layer slots as above inside the 160×120 RenderTexture; pet motion and the sprite player step at
`PET_FPS = 8` via a `deltaMS` accumulator on the ticker; FX (bubbles) at ticker rate. `phase === 'dead'`: pet plays
`dead` at `surfaceY + 6`, bubbles stop, a programmatic white fog (alpha 0.5; the `waterShape` ellipse masked to
`surfaceY..floorY`, i.e. `makeWaterBounds(waterShape).rect`) is added to the `glass` slot.
`phase === 'memorial'`: pet hidden, `memorial` drawn instead of `bg`, fog off. Starving: `medium.tint` shifted 10 %
toward green. `asleep`: fish still near the floor, `sleep` anim. Reduced motion: no idle bob, no parallax; state
changes still animate. Glass sheen follows the pointer on the `glass` slot; `glass` and `decor_front` get a +2 px
parallax offset toward the pointer (integer, 0 when reduced motion).

Sprite player: strip → per-frame `Texture({ source, frame })`; sequences, loop, play-once-then-`returnTo`, mirror via
`scale.x = facing` with anchor 0.5; when `turning` the current frame is drawn with `scale.x = 0.5 * previousFacing`
(nearest, integer edges); integer per-frame offsets; a transform fallback (bob/squash) for states without a strip.

`src/species/fish/behavior.ts`: `createFishBehavior(): FishBehavior` (see `FishInput`/`FishOutput`): slow
figure-eight wander inside `bounds`; 2-tick turn; darts to the nearest flake and reports `biteFlakeIndex` within 6 px;
`hungry`: half speed, top third; `starving`: near the floor, barely moving; `asleep`: still near the floor;
dead: `anim 'dead'`, `y = surfaceY + 6`. Positions are integers.

`src/species/fish/lines.ts`: `export const FISH_LINES: Record<Personality, Record<'idle' | 'fed' | 'hungry' |
'starving' | 'wake', readonly string[]>>`, at least 8 lines per pool. `mountSpeech` picks from `fed` on `bite`, from
`hungry`/`starving` on label change, from `idle` on a 60–180 s timer, from `wake` after a montage.

## UI API (`src/ui/index.ts`)

```ts
mountHud(root, deps): HudHandle
mountDevPanel(root, deps): DevPanelHandle
mountSpeech(root, deps): SpeechHandle             // max 1 per 15 s, silent when dead
mountPantryDialog(root, deps): { open(): void }
mountMontage(root, deps): { play(events: SimEvent[], name: string): Promise<void> }
mountMemorial(root, deps): { setDead(pet: PetState | null): void }   // DOM card only (name, id, age, meals, "New pet"); dismiss → actions.acknowledgeDeath()
wireTray(deps): () => void                        // TrayAction → actions; chip repaint on hunger/label/alive change; setMenuState on settings change; tooltip "<name> · <label> · <pct>%"
initAudio(): AudioApi                             // Howler; every file optional; 404 → log once, no-op
computeHitRegions(scene, hud, devPanel): Rect[]   // habitat hit rect + visible HUD rects + dev panel rect
```

Caption: `PANTRY 475 $FEED · 21 DAYS` where days = `floor(pantryDays)`. FEED button label `FEED 25`, disabled when
dead or balance < 25. HUD hunger ring colors: full green, peckish yellow, hungry orange, starving red.
Dev panel (⌥⌘D): +1h / +12h / +3d, set hunger / pantry / balance, force state, day/night, species/habitat (disabled
except fish/bowl), FPS meter (`scene.fps()`), "Simulate 10-day absence with 500 in pantry" (dry run, prints events),
"Skip 3d on next launch" (`dev.skipOnNextLaunch`), reset clock.

## Boot sequence (`src/main.ts`)

1. `platform = createPlatform()`; `store = createAppStore(platform)`; `await store.getState().actions.boot()`.
2. `manifest = await loadManifest()`; `scene = createScene(manifest)`; `await scene.mount(#app, settings.scale)`
   (creates the canvas; main creates `#ui` after it). `audio = initAudio()`.
3. Mount HUD, dev panel, speech, pantry dialog, montage, memorial; `wireTray`; subscribe `toSceneView` → `scene.setView`,
   `lastFeedEvent` → `scene.feed()` + `audio.play('feed')`, `settings.scale` → `scene.setScale`, `hud.relayout()`,
   `refreshHitRegions()`; `platform.window.onMoved(g => scene.setResolution(g.scaleFactor))`; pointer wiring per the
   rules above; keyboard; `contextmenu`; drag.
4. `await platform.window.setScale(settings.scale)` (restores position), `refreshHitRegions()`, then
   `await platform.window.show()` unless hidden. Start the scheduler. Night refresh every 60 s.
5. If `recentEvents.length > 0`, `await montage.play(recentEvents, pet.name)` then a `wake` speech line.
6. Boot is wrapped in try/catch that renders the error into `#app` and still shows the window.

## Acceptance script notes (Blueprint §11)

- "Skip 3 days → hungry, starving, dead": from a fresh pet, hungry at 42 h, starving at 60 h, dead at 84 h, so the
  script presses +3d then +12h (or +1h ×… as needed) and asserts each state.
- "Load 500, skip 10 days": assert pantry 300 and 8 `auto-fed` events (the Blueprint's "~250" is an estimate).
- "Quit, fake the clock, relaunch → montage": use "Skip 3d on next launch", quit, relaunch (browser: reload).
