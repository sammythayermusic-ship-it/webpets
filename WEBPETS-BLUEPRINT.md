# WebPets — Build Blueprint for Claude Code

You are building **WebPets**: a desktop pet that is an NFT. The pet lives inside a small pixel-art habitat (fish bowl, hamster cage, frog pond, chicken coop) that floats in the corner of the user's screen. It gets hungry on a clock that never pauses, it eats when fed, and it dies if neglected. Feeding costs a memecoin ($FEED). The user can pre-load $FEED into the habitat's food store (the "pantry") so the pet keeps eating while they're away.

This document is the whole spec. Build it in phases, in order. **Stop at the end of each phase, summarize what works, and wait for review before starting the next one.**

---

## 0. Non-negotiables

1. **The clock never pauses.** Hunger is computed from timestamps, never from a running timer. Closing the app, sleeping the laptop, or killing the process does not save the pet. On launch, the sim catches up from the last saved state.
2. **The habitat is the widget.** No window chrome. A transparent, frameless, always-on-top window whose only visible content is the habitat scene. Everything else (feed, pantry, stats) appears on hover or in the tray menu.
3. **Pixel-perfect.** Habitats are authored on a 160×120 pixel grid and drawn at integer scales only (2×, 3×, 4×). Nearest-neighbor everywhere. Pet motion steps at 8 fps (stop-motion feel). Ambient effects (bubbles, light, particles) run at 60 fps.
4. **Phase 0 has no blockchain.** $FEED is a local number. Get the pet, the habitat, the clock, and the feelings right first. Chain comes in Phase 2 and must slot in behind the same interfaces.
5. **Never touch a seed phrase.** When wallets arrive (Phase 2), use a wallet adapter / deep-link signing flow. The app never stores private keys.
6. **Swappable art.** All sprites and habitat layers are PNGs in `/assets` with a manifest. Until real art is dropped in, generate clearly-labeled programmatic placeholders. Never block on art.

---

## 1. Stack

- **Shell:** Tauri 2 (Rust). Plugins: `window` (transparent/frameless/always-on-top), `tray-icon`, `notification`, `autostart`, `store` (persisted JSON), `positioner`, `global-shortcut`, `single-instance`.
- **UI/renderer:** Vite + TypeScript (strict). **PixiJS 8** for the habitat (WebGL, nearest-neighbor textures, particle containers, filters for water refraction / bloom / vignette). Plain DOM for the hover HUD and dev panel.
- **State:** a small store (Zustand or hand-rolled) with a single serializable `PetState`; persisted through the Tauri store plugin to app-data. Autosave on every mutation, throttled.
- **Audio:** Howler.js. Ambient loop per habitat + one-shots. Mute in tray. Respect system volume. Sammy is an audio engineer, so leave clean hooks for real assets: `assets/audio/<habitat>/ambient.ogg`, `feed.ogg`, `alert.ogg`, `death.ogg`.
- **Tests:** Vitest for the simulation (pure functions). Playwright for smoke-testing the window.
- **Target:** macOS first (Apple Silicon + Intel). Keep Windows/Linux buildable but don't polish them yet.

Rust does: window management, tray, notifications, autostart, file persistence, an `Instant`-based monotonic clock, and (Phase 2) RPC calls. TypeScript does: simulation, rendering, UI. Communicate over Tauri commands/events; keep the boundary small.

---

## 2. Repo layout

```
webpets/
  src-tauri/            Rust shell (window, tray, persistence, clock, later: chain)
  src/
    sim/                pure simulation: types, tick(), feed(), pantry, death (no DOM)
    species/            one module per species: behavior state machine + habitat layout
      fish/  hamster/  frog/  chicken/
    render/             PixiJS scene: layers, sprite player, FX, day/night, scaling
    ui/                 hover HUD, tray menu wiring, dev panel, notifications glue
    audio/              ambient + sfx
    assets/
      habitats/<species>/<habitat>/   layered PNGs (see §6)
      sprites/<species>/              sprite strips (see §7)
      audio/
      manifest.json
  docs/                 this file, decisions log, asset spec
  tests/
```

---

## 3. Phases

### Phase 0 — Local pet that can die (target: 1 sitting)
- Tauri window: transparent, frameless, always-on-top, draggable by grabbing the habitat, remembers position per display, S/M/L sizes (2×/3×/4×), minimize to tray chip.
- One species end to end: **fish in a bowl.**
- Simulation with the real rules (§5) plus a **dev panel** with time skipping.
- Hover HUD: name, hunger ring, FEED button, pantry line.
- Feed animation, hungry state, starving state, death → memorial, "New pet".
- Local $FEED balance (starts at 1,000). Pantry load/withdraw.
- Notifications: hungry, starving, 6h-to-death, pantry < 2 days.
- Persist to disk; catch-up on launch. Tests for the sim.

### Phase 1 — The other three, polish, and "high tech"
- Hamster (cage), frog (pond), chicken (brooder → coop).
- Ambient FX: water refraction shader in the bowl, caustic light on the gravel, bubbles; hood/lamp bloom; dust motes in the cage; fireflies on the pond at night; lamp glow in the brooder.
- Day/night synced to the system clock (sunset/sunrise approximated from local time; no location permission).
- Parallax: a 2–3 px layer offset when the mouse moves across the habitat, so glass and bars feel in front of the pet.
- Hover glass sheen that follows the cursor.
- Audio pass.
- Multi-pet: the app can host up to 3 habitats side by side (one window each).
- Launch at login, single-instance, global hotkey to show/hide.

### Phase 2 — Devnet chain (behind the same interfaces)
- Replace `LocalLedger` with `ChainLedger` (Solana devnet): the feed token as an SPL test mint; pet as a **Metaplex Core** asset with the Attributes plugin; an Anchor **feeder program** with `feed` (burn `FEED_COST`, stamp `last_fed`), `pantry_deposit`, `pantry_withdraw`, and a permissionless `crank` that auto-feeds from pantry and flips `alive=false` after `DEATH_AFTER_ZERO_HOURS` at zero. Read the timings from the constants rather than restating them here; they have moved once already.
- **The token is `$PETS`, and feeding burns it.** The mechanic — pay tokens to survive longer unattended, and those tokens are destroyed — is already the shape of the Phase 0 pantry: deposit, it auto-feeds while you are away, `feedBurned` accumulates. So this phase is largely renaming the in-app `$FEED` and moving the burn on-chain, not designing a new system. Nothing about it belongs in Phase 0, which stays fully local with no blockchain dependency.
- Wallet connect via Solana wallet-adapter in an embedded webview, or a deep-link to Phantom/Backpack. Signing only. No keys in the app.
- App reads chain state on launch and every 60 s, reconciles with the local sim (chain wins), and animates the difference.
- A tiny keeper service (Node) that runs the crank on a schedule, so death happens even if nobody opens the app.

### Phase 3 — Mainnet + launch
- Mint via Magic Eden Launchpad or a self-hosted Core Candy Machine. $FEED on pump.fun. Weekly care-rewards distributor. Signed/notarized Mac builds. Open-source repo. Not in scope for now; keep the code shaped for it.

---

## 4. Window & UX spec

- **Window:** `transparent: true`, `decorations: false`, `alwaysOnTop: true`, `skipTaskbar: true`, `resizable: false`, shadow off (we draw our own drop shadow in the scene so it stays pixel-crisp). Size = habitat grid × scale + 24 px padding for the HUD and shadow.
- **Hit testing:** only the habitat's opaque pixels and the HUD receive clicks; transparent padding is click-through (Tauri `set_ignore_cursor_events` toggled from a hit-test on mousemove).
- **Drag:** press-and-drag anywhere on the habitat. Snap to screen edges within 16 px. Clamp to visible displays. Save position per display id.
- **Sizes:** S = 2× (320×240), M = 3× (480×360), L = 4× (640×480). Change from tray menu or ⌘+/⌘−. Resizing keeps the habitat's bottom-right corner anchored.
- **Minimize:** to a tray chip: 22 px mini sprite of the pet (current state) + hunger ring color. Clicking restores. When hidden, the sim keeps running (it always does).
- **Hover HUD:** a pill above the habitat: hunger ring with %, pet name + `#id`, `FEED 25` button, `MIN` button. Appears on hover, slides up 8 px. Below the habitat a small pixel-font caption: `PANTRY 475 $FEED · 19 DAYS`.
- **Right-click / tray menu:** Feed · Pantry… · Size (S/M/L) · Mute · Day/Night (auto/day/night) · Launch at login · Dev panel · New pet · Quit.
- **Speech bubbles:** occasional one-liners in a pixel font (Press Start 2P) with a hard black border and 3px offset shadow. Personality-flavored lines (Sarcastic / Anxious / Zen / Degen). Max one every 15 s. Silent when dead.
- **Reduced motion:** honor `prefers-reduced-motion`: no parallax, no idle bob; state changes still animate.

---

## 5. Simulation (the heart of it)

All of this is pure TypeScript in `src/sim`, fully unit-tested, no DOM.

```ts
type Species = 'fish' | 'hamster' | 'frog' | 'chicken';
type Habitat = 'bowl' | 'tank' | 'cage' | 'terrarium' | 'pond' | 'jar' | 'brooder' | 'coop';

interface PetState {
  id: string;            // "#0421"
  name: string;
  species: Species;
  habitat: Habitat;
  personality: 'sarcastic' | 'anxious' | 'zen' | 'degen';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  bornAt: number;        // ms epoch
  lastFedAt: number;     // ms epoch
  hungerAtLastFed: number; // 0..100, hunger value right after the last feed
  pantry: number;        // $FEED locked in the habitat feeder
  meals: number;
  feedBurned: number;
  alive: boolean;
  diedAt?: number;
  speciesData: Record<string, number>; // wheelKm, cricketsCaught, eggs, etc.
}

interface Ledger { balance(): number; burn(n: number): void; } // Phase 0: local. Phase 2: chain.
```

**Constants** (put them in one file; the dev panel can override them). **The pet is fed twice a day** —
everything here is that sentence expressed as numbers, and a meal is deliberately *exactly* half the bar:
- `DECAY_PER_HOUR = 100 / 24` (full → empty in 24 h)
- `FEED_COST = 25`, `FEED_GAIN = 50` (half the bar, so one meal buys 12 h), `MAX_HUNGER = 100`
- `PANTRY_TRIGGER = 30` (auto-feed when hunger drops below this; 30 → 80 is also half a bar, so the
  auto-feed cycle is the same 12 h)
- `DEATH_AFTER_ZERO_HOURS = 12` — starving by morning if you skip the evening meal, gone by that evening
  if you skip the day
- Hunger labels: `>60 full`, `31–60 peckish`, `1–30 hungry`, `0 starving`
- Landmarks from a full pet: peckish 9.6 h, hungry 16.8 h, starving 24 h, dead 36 h

Changing these retroactively re-simulates every saved pet, because hunger is derived from an anchor and
never stored. A change to the rate therefore needs a `PetDoc` version bump and a migration that re-anchors
the pet at its *currently displayed* hunger — see `migratePetDoc`. This was originally `100 / 60` with a
45-point meal (a 27 h cycle, death at 84 h).

**Derived hunger at time `t`:**
`hunger(t) = clamp(hungerAtLastFed − DECAY_PER_HOUR × hoursSince(lastFedAt), 0, 100)`

**Catch-up algorithm** (`reconcile(state, now)`), run on launch, on wake-from-sleep, and every 30 s:
1. Walk forward from `lastFedAt` to `now`. Each time hunger would cross below `PANTRY_TRIGGER` and `pantry >= FEED_COST`, apply an auto-feed at that exact timestamp (subtract cost from pantry, add gain, update `lastFedAt`/`hungerAtLastFed`, `meals++`). Repeat until no more auto-feeds fit.
2. If hunger reached 0 and has stayed at 0 for `DEATH_AFTER_ZERO_HOURS`, set `alive=false`, `diedAt = timeZeroReached + DEATH_AFTER_ZERO_HOURS`.
3. Return the list of events that happened while away (auto-fed ×N, got hungry, died) so the UI can replay them as a short montage on launch ("While you were gone…").

**Manual feed:** if alive and `ledger.balance() >= FEED_COST`: burn, `hunger = min(100, hunger + FEED_GAIN)`, update timestamps, `meals++`, `feedBurned += FEED_COST`. Overfeeding is allowed but wasteful (cap at 100).

**Pantry:** `deposit(n)` moves n from ledger balance into `pantry`; `withdraw()` moves all back. Pantry days estimate = `(pantry / FEED_COST) × (FEED_GAIN / DECAY_PER_HOUR) / 24`.

**Death:** `alive=false`. Feed and pantry are disabled. The habitat shows the memorial state. "New pet" mints a fresh state (new id, random rarity/personality). Keep the dead pet's record in a local `graveyard.json` (Phase 2: it becomes the memorial NFT).

**Age** = `now − bornAt`. Shown as `3d 4h`.

**Tests to write first:** decay math, feed cap, pantry auto-feed timing over a 10-day gap with 500 $FEED, death exactly at 24h-at-zero, catch-up event list, no negative balances, reconcile is idempotent.

---

## 6. Habitat renderer

Scene = a PixiJS `Container` scaled by an integer, with layers bottom to top:

1. `bg` — habitat body (bowl glass back, cage base, pond dirt, coop wood)
2. `medium` — water / bedding / grass; animated subtly (water shimmer, bedding static)
3. `decor_back` — plant, castle, hideout, nesting box
4. `pantry` — the feeder object with a **fill sprite** whose visible height = pantry fraction (0–100%). This is the away-mode gauge. When pantry < 2 days, it blinks softly.
5. `pet` — the sprite player (8 fps stepped)
6. `food` — particles: flakes falling, seeds dropping, crickets hopping, grain scatter
7. `decor_front` — front plant, wheel front half, cattails
8. `glass` — glass/bars overlay with a specular sheen that tracks the cursor (parallax +2 px)
9. `fx` — bubbles, caustics, dust, fireflies, lamp bloom (filters only on this layer so the pixels below stay crisp)
10. `night` — a multiply tint that fades in after local sunset; hood/lamp lights stay lit
11. `shadow` — a soft pixel-drop shadow under the whole habitat (drawn, not CSS)

Authoring: each layer is a PNG at 160×120 in `assets/habitats/<species>/<habitat>/<layer>.png`, listed in `manifest.json` with anchor and z. Placeholders: draw simple colored shapes with the layer name stamped on them.

Rendering rules: `TextureStyle.scaleMode = 'nearest'`, integer scale, `roundPixels = true`. All positions are integers in grid space. FX may use sub-pixel motion but must render into the scaled canvas so they look like big pixels, not smooth overlays.

---

## 7. Sprites & the sprite player

- Pet sprites are **80×80 px strips** (frames left to right), one PNG per state: `idle.png`, `eat.png`, `hungry.png`, `sleep.png`, `dead.png`, plus species extras (`wheel.png`, `hunt.png`, `lay.png`, `chick-idle.png`).
- `manifest.json` lists frame counts and per-state sequences, e.g. `idle: [0,0,0,0,1,1,0,0,2,0,0,3,3,0]` at 8 fps.
- The player supports: loop, play-once-then-return, mirror (flip X for direction), integer offset per frame, and a `transform` fallback (squash/stretch/bob) for species that don't have a state strip yet.
- Behavior state machine per species (§8) chooses what the player plays and where the pet is in grid space.

---

## 8. Species specs

Each species module exports: habitat layouts, a behavior state machine, pantry visual mapping, and speech line pools.

### Fish · bowl (Phase 0), tank (upgrade)
- Moves in water bounds; slow figure-eight wander; turns with a 2-frame flip. Darts to the surface when flakes fall and eats them one by one (flakes are entities; each eaten flake = a bite animation).
- Hungry: speed ×0.5, hangs near the top. Starving: near the bottom, barely moving, water tint shifts 10% green.
- Sleep (night): hovers still near the bottom, hood light off.
- Dead: floats belly-up at the surface, bubbles stop, glass fogs (a semi-opaque layer). Memorial: empty bowl with a tiny flag.
- Pantry = clip-on feeder; fill sprite = flake level. Auto-feed drops flakes with the same animation as manual feed.
- Reward hook: alive+fed 7 days → a second plant appears (decor_back variant).

### Hamster · cage (Phase 1), terrarium (upgrade)
- Behaviors: wander on bedding, run wheel (wheel spins; RPM scales with hunger fullness, 0 when hungry), drink from bottle, stuff cheeks at hopper, nap in a bedding pile.
- Hungry: wheel stops; sits by hopper facing the camera. Starving: lies flat. Dead: on its side; memorial = still wheel, empty cage.
- Pantry = seed hopper; fill sprite = seed level.
- `speciesData.wheelKm` accumulates while running (for a later leaderboard).

### Frog · pond (Phase 1), jar (upgrade)
- Feeding releases N crickets (N = 3 per feed) that hop along the bank; the frog turns, waits, tongue-snaps (2-frame) when one is in range. Hunger only rises as crickets are actually caught (feeding is a show; a missed cricket escapes after 20 s and is refunded to the pantry as a partial).
- Idle: still on the pad, blink, occasional hop to the rock; throat-bubble croak on hover.
- Hungry: stops hunting, sinks lower. Dead: on its back on the pad, cattails droop.
- Night: fireflies FX, frog eyes as slits.
- `speciesData.cricketsCaught`.

### Chicken · brooder (day 0–7) → coop (day 7+)
- A new chicken is a **chick under a heat lamp** in the brooder. At `age ≥ 7 days && alive` it migrates to the coop as a hen (one-time transition animation: box lid opens, hen walks into the run).
- Hen behaviors: peck, scratch, dust-bathe, chase a bug, roost inside at night (doorway glows).
- **Egg rule:** one egg per real day if alive and hunger never hit 0 that day. Eggs stack in the nesting box (max 7 visible). `speciesData.eggs`. Collecting eggs (click the box) is a no-op in Phase 0 that logs a "claim" event — Phase 2 turns it into a rewards claim.
- Hungry: stops laying, feathers ruffle, stands at the empty feeder. Dead: feathers in the run, door shut; memorial = empty box with the last egg.
- Pantry = hanging grain feeder; fill sprite = grain line.

---

## 9. Notifications (macOS native via Tauri)
- Hunger crosses 30%: "Bubbles is hungry." (once per hunger cycle)
- Hunger hits 0: "Bubbles is starving. 24h to live."
- 6h before death: "Bubbles has 6 hours."
- Pantry < 2 days while hunger < 60: "Pantry is almost empty."
- Death: "Bubbles has died." (and the memorial montage on next open)
- Egg laid: "Waffle laid an egg."
Quiet hours: none by default; a tray toggle to mute notifications.

---

## 10. Dev panel (⌥⌘D)
A DOM overlay, off by default: skip +1h / +12h / +3d; set hunger; set pantry; set balance; force state (fed/hungry/starving/dead/asleep); toggle day/night; species/habitat switch; FPS meter; "simulate 10-day absence with 500 in pantry" button that runs reconcile and prints the event list. This is how Sammy will test.

---

## 11. Acceptance for Phase 0
- App launches into a transparent corner window with the bowl, fish swimming, HUD on hover.
- Feed → 25 deducted, flakes fall, fish eats, ring goes up, speech line.
- Skip ~1.5 days → hungry, then starving, then dead with memorial; New pet works.
- Load 1000 into pantry, skip 10 days → fish alive, pantry 525, event list shows 19 auto-feeds. (500 also
  survives ten days, but finishes on its last 25, which tests the arithmetic rather than the behaviour.)
- Quit the app, wait (or fake the clock), relaunch → hunger reflects elapsed real time and a "while you were gone" montage plays.
- Drag, S/M/L, minimize to tray chip and back, position remembered after relaunch.
- Notifications fire.
- `npm test` green; `npm run tauri build` produces a .app.

---

## 12. Working agreements for Claude Code
- TypeScript strict; small modules; no `any`. Sim has zero imports from render/ui.
- Commit after each working step with a clear message. Keep a `docs/DECISIONS.md` log.
- When art is missing, generate placeholder PNGs programmatically at the right size and mark them `PLACEHOLDER` visibly. Don't ask for art to proceed.
- If a Tauri capability is flaky on macOS (transparent + always-on-top + click-through), document the workaround; don't silently drop the requirement.
- Do not add blockchain dependencies in Phase 0.
- At the end of Phase 0, produce: a 60-second screen recording script (Playwright) that exercises the acceptance list, and a short README for running on a Mac.

**Start with Phase 0. Begin by scaffolding the Tauri 2 + Vite + PixiJS project, then write `src/sim` with tests, then the window, then the bowl.**
