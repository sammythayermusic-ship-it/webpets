# WebPets architecture contract (Phase 0)

This is the contract between modules so they can be built in parallel. Every path, event name and
function signature here is binding. If a builder needs to change one, they change this file too.

## Directory ownership

| Path | Owner | Notes |
|---|---|---|
| `src/sim/**` | sim | Pure TS. Zero imports from render/ui/platform/app. Vitest tests first. |
| `src/app/**` | sim | Store (Zustand vanilla), persistence, scheduler (30 s reconcile), notification decisions. Imports sim + platform types. |
| `src/platform/**` | shell | `Platform` interface (`types.ts`), `tauri.ts` (real), `browser.ts` (mock), `index.ts` (picks one). |
| `src-tauri/**` | shell | Window, tray, click-through poller, notifications, clock, autostart, shortcut, single-instance. |
| `src/render/**` | render | PixiJS scene, layers, sprite player, FX, scaling. |
| `src/species/fish/**` | render | Pure behavior state machine + bowl layout + speech line pools. No Pixi imports in `behavior.ts`. |
| `tools/gen_placeholders.py`, `assets/manifest.json`, `assets/habitats/**`, `assets/sprites/fish/**` | render | Placeholder PNGs stamped PLACEHOLDER. |
| `src/ui/**`, `src/audio/**` | ui | DOM HUD, dev panel, speech bubbles, pantry dialog, montage, memorial, tray chip painter, audio hooks. |
| `src/main.ts` | integration | Boot sequence. Written last. |
| `tests/**`, `playwright.config.ts`, `README.md` | integration | Playwright smoke + acceptance recording in browser mode. |

Dependency direction: `sim` ← `app` ← (`render`, `ui`) ← `main`. `platform` is imported by `app`, `ui`, `main` only.
`render` and `species` import from `sim` (types, constants) only, never from `app`, `ui` or `platform`.

## Assets and URLs

Vite `publicDir` is the repo `assets/` folder, so `assets/habitats/fish/bowl/bg.png` is served at
`/habitats/fish/bowl/bg.png` in dev and in the Tauri bundle (`tauri://localhost/...`). The build script deletes
`dist/reference` so the 1024 px references never ship.

```
assets/
  manifest.json                     habitats + sprites index (schema below)
  habitats/fish/bowl/<layer>.png    160x120 layers: bg medium decor_back pantry pantry_fill decor_front glass night memorial
  habitats-160x120/fish-bowl.png    concept art, used as the temporary `bg` for the bowl until layered art exists
  sprites/fish/<state>.png          80x80 strips: idle eat hungry sleep dead (frames left to right)
  sprites/strips-80/*.png           reference strips (gus-*, doink-idle) for validating the player
  fonts/PressStart2P-Regular.ttf    HUD font (OFL)
  audio/fish/{ambient,feed,alert,death}.ogg   optional; missing files are silently skipped
```

`manifest.json` schema:

```json
{
  "version": 1,
  "habitats": {
    "fish/bowl": {
      "grid": [160, 120],
      "layers": [
        { "name": "bg", "file": "habitats-160x120/fish-bowl.png", "z": 0 },
        { "name": "pantry_fill", "file": "habitats/fish/bowl/pantry_fill.png", "z": 4, "anchor": [120, 24], "fillDirection": "up" },
        { "name": "pet", "z": 5 }
      ],
      "water": { "x": 41, "y": 23, "w": 80, "h": 74 },
      "pantryRect": { "x": 100, "y": 8, "w": 20, "h": 20 },
      "petAnchor": [80, 60]
    }
  },
  "sprites": {
    "fish": {
      "frame": [80, 80],
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
near the gravel (y 90). Fish behavior must keep the sprite's body inside that ellipse.

## Layout and window geometry

- Habitat grid 160×120, integer scale `s ∈ {2,3,4}`. Habitat CSS size = `160s × 120s`.
- `WINDOW_PAD = 24` CSS px on every side. Window size = `(160s + 48) × (120s + 48)`: S 368×288, M 528×408, L 688×528.
- Habitat origin inside the window = `(24, 24)`. HUD pill is centered horizontally above the habitat inside the top pad
  (its bottom edge 4 px above the habitat, sliding up 8 px on appear). Caption sits in the bottom pad.
- Pixi canvas covers the whole window (`resolution = devicePixelRatio`, `autoDensity`, `roundPixels`, nearest
  scaling). The habitat container is positioned at `(24, 24)` and scaled by `s`. Everything the scene draws is
  in grid units; the shadow layer is drawn under the habitat in grid units too.
- Hit regions sent to Rust: the habitat rect `(24, 24, 160s, 120s)` always; the HUD pill rect and caption rect
  while visible; the dev panel rect while open. Everything else is click-through.
- Rust snaps to screen edges within 16 px, clamps to the monitor work area, and saves the position per monitor
  key in `settings.json` under `positions[monitorKey] = {x, y}`. On launch Rust restores the saved position for the
  current monitor or defaults to the bottom-right corner with a 24 px margin, then shows the window.
- `setScale` keeps the bottom-right corner fixed.
- Window is an accessory app on macOS (no Dock icon, `ActivationPolicy::Accessory`); the tray is the app's home.

## Tauri commands and events (Rust ↔ TS)

Commands (invoke names):

| Command | Args | Returns | Purpose |
|---|---|---|---|
| `clock_now` | – | `{ wallMs, monoMs }` | epoch + monotonic |
| `set_scale` | `{ scale }` | `WindowGeometry` | resize keeping bottom-right anchored |
| `set_hit_regions` | `{ regions: Rect[] }` | – | regions in window-local CSS px |
| `get_geometry` | – | `WindowGeometry` | |
| `tray_set_chip` | `{ rgba: number[], width, height }` | – | raw RGBA |
| `tray_set_tooltip` | `{ text }` | – | |
| `tray_set_menu_state` | `TrayMenuState` | – | updates check/enabled state and labels |
| `notify` | `{ title, body }` | – | uses the notification plugin from Rust |
| `autostart_get` / `autostart_set` | – / `{ on }` | `bool` / – | |
| `quit_app` | – | – | |

Events (Rust → TS, all on the main window):

| Event | Payload |
|---|---|
| `tray-action` | `TrayAction` string |
| `window-moved` | `WindowGeometry` (after snap/clamp/persist) |
| `toggle-visibility` | none (global shortcut Cmd+Shift+P or tray left-click) |
| `wake` | none (monotonic/wall divergence > 5 s detected by the Rust clock thread, polled every 5 s) |

Store files (Tauri store plugin, app-data dir): `pet.json`, `settings.json`, `graveyard.json`. TS reads/writes them
through `platform.store` (`load`/`save` with whole documents under key `"doc"`). Rust only touches
`settings.json` → `positions`. The store plugin serializes access, so both sides can share the file.

The browser mock (`src/platform/browser.ts`) implements the same interface on top of `localStorage` and DOM
custom events, so `npm run dev` in a normal browser and Playwright work with no Tauri. It exposes
`window.__webpetsMock` with `emitTray(action)`, `emitWake()` and `notifications: Array<{title, body}>` for tests.

## Persistence documents

```ts
interface PetDoc { version: 1; pet: PetState; balance: number; latches: NotificationLatches }
interface SettingsDoc {
  version: 1; scale: 2|3|4; muted: boolean; notificationsMuted: boolean;
  dayNight: 'auto'|'day'|'night'; launchAtLogin: boolean; devClockOffsetMs: number; hidden: boolean;
  positions: Record<string, { x: number; y: number }>  // written by Rust
}
interface GraveyardDoc { version: 1; records: GraveRecord[] }
interface NotificationLatches { pantryLowFiredForPantry: number | null }  // pantry value when 'pantry low' last fired
```

Autosave: every mutation schedules a save, throttled to at most one write per 500 ms per file, flushed on
`beforeunload` and on hide.

## Time

`app.now()` = `Date.now() + settings.devClockOffsetMs`. The dev panel's skip buttons add to the offset and persist it
so faking the clock survives a relaunch. The scheduler calls `reconcile(pet, now())` on boot, every 30 s, on
`visibilitychange`, on `focus`, and on the `wake` event. All sim math uses timestamps, never elapsed timers.

## Simulation API (`src/sim/index.ts` re-exports everything)

```ts
hungerAt(state, now, c = DEFAULT_CONSTANTS): number            // clamp(hungerAtLastFed - decay*hours, 0, 100), 0 when dead-and-past
hungerLabel(h): HungerLabel                                    // >60 full, 31–60 peckish, 1–30 hungry, 0 starving
zeroAt(state, c): number | null                                // when hunger reaches 0 with no more feeding (null if pantry auto-feeds will keep it up? no: pure projection ignoring pantry)
projectedDeathAt(state, now, c): number | null                 // accounts for pantry auto-feeds; null if pantry runway is infinite... (pantry is finite so always a number for alive pets)
reconcile(state, now, c): ReconcileResult                      // walks [lastReconciledAt, now]; auto-feeds at exact crossing times; death at zero+24h; sets lastReconciledAt=now; idempotent; no-op for dead pets
feed(state, now, ledger, c): FeedResult                        // burn cost, hunger = min(100, hunger+gain), timestamps, meals++, feedBurned+=cost
depositPantry(state, n, now, ledger, c): { state: PetState; moved: number }   // reconciles to now first; ledger.debit; then reconciles again so an immediate auto-feed applies at `now`
withdrawPantry(state, now, ledger, c): { state: PetState; moved: number }     // moves all pantry back via ledger.credit
pantryDays(pantry, c): number                                  // (pantry / FEED_COST) * (FEED_GAIN / DECAY_PER_HOUR) / 24
ageMs(state, now): number;  formatAge(ms): string              // "3d 4h", "0d 0h" minimum, "12h" is not used
newPet(now, rng, opts?: { species?: Species; name?: string }): PetState   // id "#0001".."#9999" from rng, name from species pool, rarity weighted 70/20/8/2, personality uniform
toGraveRecord(state, now): GraveRecord
class LocalLedger implements Ledger { constructor(balance: number); toJSON() }
```

Auto-feed rule (precise): walking forward from `from = max(lastFedAt, lastReconciledAt)`, the next auto-feed time is
`t* = max(from, lastFedAt + (hungerAtLastFed - PANTRY_TRIGGER) / DECAY_PER_HOUR * HOUR_MS)`, applied only if
`t* <= now`, the pet is alive at `t*`, and `pantry >= FEED_COST`. Trigger is `hunger <= PANTRY_TRIGGER`. Each auto-feed
sets `lastFedAt = t*`, `hungerAtLastFed = min(100, hunger(t*) + FEED_GAIN)`, `pantry -= FEED_COST`,
`meals++`, `feedBurned += FEED_COST`, emits `auto-fed`. Repeat until no feed fits. A `hungry` event is emitted at the
crossing time when hunger passes 30 and no auto-feed happens there. `starving` at the zero time. `dying-soon` at
zero + 18 h. `died` at zero + 24 h with `alive = false`, `diedAt = zeroAt + 24h`. Events before `from` are never
re-emitted.

Reference numbers: fresh pet at 100 with 500 in the pantry, 10 days away → first auto-feed at 42 h, then every 27 h
(75 → 30), so 8 auto-feeds, pantry 300, alive. Full to empty is 60 h; death at 84 h with an empty pantry.

## App store (`src/app/store.ts`, Zustand vanilla, no React)

```ts
interface AppState {
  hydrated: boolean;
  pet: PetState; balance: number; settings: SettingsDoc; latches: NotificationLatches;
  recentEvents: SimEvent[];          // events from the last reconcile with elapsed > 60 s ("while you were gone")
  lastFeedAt: number | null;         // wall time of the last manual feed, for the render/audio one-shots
  hunger: number;                    // derived on every tick for cheap reads
}
interface AppActions {
  boot(): Promise<void>;  tick(): void;  now(): number;
  feed(): FeedResult;  depositPantry(n: number): void;  withdrawPantry(): void;  newPet(): void;
  setScale(s: Scale): Promise<void>;  setMuted(b): void;  setNotificationsMuted(b): void;
  setDayNight(m): void;  setLaunchAtLogin(b): Promise<void>;  setHidden(b): Promise<void>;
  dev: { skip(ms: number): void; setHunger(h: number): void; setPantry(n: number): void; setBalance(n: number): void;
         forceState(s: 'fed'|'hungry'|'starving'|'dead'|'asleep'): void; simulateAbsence(days: number, pantry: number): SimEvent[];
         resetClock(): void; }
}
export const store: StoreApi<AppState & { actions: AppActions }>; // zustand/vanilla createStore
export function subscribe(sel, cb): () => void
```

Notification decisions live in `src/app/notifications.ts`: `decide(prev, next, events, now, latches) → { toasts: {title, body}[], latches }`,
pure and unit-tested; the scheduler calls `platform.notify` for each unless `settings.notificationsMuted`.
Messages: "<name> is hungry." / "<name> is starving. 24h to live." / "<name> has 6 hours." / "Pantry is almost empty." /
"<name> has died."

## Render API (`src/render/index.ts`)

```ts
export interface SceneView {
  species: Species; habitat: Habitat;
  hunger: number; label: HungerLabel; alive: boolean;
  pantryFraction: number;   // pantry / PANTRY_VISUAL_MAX (500) clamped 0..1
  pantryLow: boolean;       // pantryDays < 2
  night: boolean; reducedMotion: boolean;
  asleep: boolean;          // night && alive
}
export interface HabitatScene {
  mount(el: HTMLElement, scale: Scale): Promise<void>;
  setScale(scale: Scale): void;
  setView(view: SceneView): void;          // idempotent; scene diffs and transitions
  feed(): void;                            // drop flakes, fish eats them (visual only)
  setPointer(x: number | null, y: number | null): void;  // window-local CSS px, for sheen/parallax
  on(event: 'bite' | 'flakes-gone', cb: () => void): () => void;  // audio + speech hooks
  destroy(): void;
}
export function createScene(manifest: Manifest): HabitatScene;
export function loadManifest(): Promise<Manifest>;
export function paintTrayChip(view: SceneView, size: 22 | 44): Uint8Array;   // RGBA for the tray chip
```

Layers bottom to top exactly as Blueprint §6: bg, medium, decor_back, pantry, pet, food, decor_front, glass, fx, night,
shadow (shadow is drawn beneath everything visually but listed last; implement it as the first child). Only `fx` may
carry filters. Pet motion steps at 8 fps via an accumulator on the Pixi ticker; FX at ticker rate.

`src/species/fish/behavior.ts`:

```ts
export interface FishInput { hunger: number; alive: boolean; asleep: boolean; flakes: Array<{x:number;y:number}>; water: Rect; rng: Rng }
export interface FishOutput { x: number; y: number; facing: 1 | -1; anim: 'idle'|'eat'|'hungry'|'sleep'|'dead'; biteFlakeIndex: number | null }
export function createFishBehavior(): { step(input: FishInput): FishOutput; reset(): void }  // one call = one 8 fps tick
```

## UI API (`src/ui/index.ts`)

```ts
export function mountHud(root: HTMLElement, deps: UiDeps): { setVisible(b): void; getRects(): Rect[]; destroy(): void }
export function mountDevPanel(root, deps): { toggle(): void; isOpen(): boolean; getRect(): Rect | null }
export function mountSpeech(root, deps): { say(line: string): void; setMuted(b): void }   // max 1 per 15 s, silent when dead
export function mountPantryDialog(root, deps): { open(): void }
export function mountMontage(root, deps): { play(events: SimEvent[], name: string): Promise<void> }
export function mountMemorial(root, deps): { setDead(state: PetState | null): void }
export function wireTray(deps): () => void          // TrayAction → store actions, chip repaint every tick
export function initAudio(): { play(name: 'feed'|'alert'|'death'): void; setAmbient(species, on): void; setMuted(b): void }
```

`UiDeps = { store, platform, scene, audio }`. All UI is plain DOM under `#app > #ui` positioned over the canvas; the
canvas is `#app > canvas`. Fonts: `@font-face` Press Start 2P from `/fonts/PressStart2P-Regular.ttf`, fallback
monospace. Bubbles: hard 1 px black border, 3 px offset shadow, no anti-aliasing (`image-rendering: pixelated`,
font-size a multiple of 8).

Dev panel shortcut: `Alt+Meta+D` (⌥⌘D). Size shortcuts: `Meta+=` / `Meta+-`.

## Boot sequence (`src/main.ts`)

1. `platform = createPlatform()`; `await store.actions.boot()` (loads docs, seeds a new pet on first run, reconciles,
   collects `recentEvents`).
2. `manifest = await loadManifest()`; `scene = createScene(manifest)`; `await scene.mount(#app, settings.scale)`.
3. Mount UI pieces, wire tray, start the scheduler, apply `settings.hidden`, send hit regions, `platform.window.show()`
   is done by Rust after positioning; TS only calls `show()` when un-minimizing.
4. If `recentEvents.length > 0` play the montage.
