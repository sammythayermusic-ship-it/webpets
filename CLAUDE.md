# WebPets — CLAUDE.md

## What this repo is
A premium desktop tech pet for macOS: Tauri 2 + Vite + TypeScript (strict) + PixiJS 8 + Three.js. A habitat floats in the
corner of the screen, transparent around the art, always on top, no Dock icon (the tray is its home). The pet
gets hungry on a clock that never pauses, eats when fed, and dies if neglected. Built today: **fish in a bowl**
and **hamster in a cage or a glass terrarium**. **Frog and chicken are not built** (declared in `Species` in
`src/sim/types.ts`, absent from `src/species/index.ts`). Art is soft 3D rendered from `assets/3d/wp_scene.blend`
(primitives and code, no paid generation). The renderer is the bake-off winner, C, the hybrid: Blender plates for
what holds still, a live Three.js pass between them for what moves (the fish, the water, light), sharing Pixi's
WebGL context. Quality bar: "it has to look like Apple made it"; realistic yet cyber; something you would leave
open just to watch.

**No crypto, no NFTs, no blockchain, no coin, no currency — at any phase.** Food is free: you feed the pet
regularly, and a free holiday feeder (`pantry` in code; one button fills it to three days) feeds it while you are
away. There is no balance and nothing to buy. Blueprint Phases 2 and 3 are shelved. Open questions, keep the code
able to go either way: how the app makes money, whether a pet can die for good.

## Read first
1. `docs/AFTER-BAKEOFF.md` — the current brief: C won, a real goldfish, and the pets get a brain (talk, get to know
   you, sports and news). Steps A to G, a checkpoint after each. Wins over PHASE-NEXT wherever they disagree.
   `docs/PHASE-NEXT.md` — the brief it sits on; its Steps 3 to 5 come after AFTER-BAKEOFF's Step G. Both override the Blueprint.
2. `docs/ARCHITECTURE.md` — the binding module contract (ownership, layers, window geometry, Rust commands and events, sim API). Written for Phase 0: where a later DECISIONS entry changed something, DECISIONS wins; update the contract when you change it.
3. `docs/DECISIONS.md` — the decision log. Append under your own dated heading (`## YYYY-MM-DD — topic`).
4. `docs/HARNESS.md` — the packaged-app verification harness (file-driven; compiled in only by `npm run build:harness`).
5. `docs/reports/` — checkpoint reports (numbers, screenshots, recordings).
6. `docs/NEEDS-SAMMY.md` — things only the user can do. Add to it, do not wait on it.
7. `assets/3d/README.md` — the Blender source and its rules.
8. `WEBPETS-BLUEPRINT.md` — the original spec. Superseded where PHASE-NEXT disagrees; its chain phases are shelved.
`docs/SIM-TESTS.md` is the sim test list; `README.md` is the user-facing guide (refreshed 2026-10-28).

## Rules of the road
- TypeScript strict, no `any`. `src/sim` is pure: zero imports from outside `src/sim` (`purity.test.ts` enforces it). Write its tests first.
- Dependency direction: `sim` ← `brain` ← `app` ← (`render`, `ui`) ← `main`. `src/brain` is pure like `src/sim` and imports only `sim` types (`brain/purity.test.ts`). `render` and `species` import from `sim` and from each other's types/helpers, never from `app`, `ui` or `platform`. `platform` is imported by `app`, `ui`, `dev`, `main` only.
- The 320×240 habitat grid is LOGICAL coordinates, not pixels: it defines behaviour, water bounds and hit regions at any art resolution. Art is pre-rendered 3D at an integer multiple of it, filtered linearly with mipmaps, and the multiple is derived from the texture, never declared. Never name an asset with an `@2x` style suffix.
- The window scale is continuous, counted in EIGHTHS of the grid (4 to 32, i.e. 0.5×–4×; 8 is 1×; fresh installs start at 6) so every size is whole pixels in TypeScript and Rust. `src/sim/constants.ts` is the one place the formula lives; `src-tauri/src/window.rs` mirrors it and `contract_sync` (Rust) plus `tests/unit/contract-sync.test.ts` pin them together.
- The simulation ticks at 8 Hz (`PET_FPS`); animation runs at the art's own rate and the drawn position is interpolated between ticks. Sim math uses timestamps, never elapsed timers.
- Never handle seed phrases or private keys. No blockchain dependencies, ever.
- When art is missing, generate labelled placeholder PNGs at the correct size and keep going (`tools/gen_placeholders.py`). Do not ask for art.
- Verify in the BUILT, INSTALLED `.app`, not just `tauri dev` or a browser. Packaged-only failures are the history of this repo (blank habitat, 1 fps, stale copy running).
- No paid generation in Blender (`bl_generate_*`, `bl_image_to_3d`). Never save over a `.blend` in place; write a copy (`resave.py`, timestamped checkpoints).
- Everything that can only be rebuilt by hand lives in the repo (sources, scripts, geometry), not in a scratchpad or a live Blender session. A render is not a source.
- Commit after each working step. Log decisions in `docs/DECISIONS.md`. Reports are short and plain, with no time estimates.
- Only stop for things only Sammy can do (Apple developer account, signing, App Store, testing on his iPhone), the open questions above, spending money, or anything that cannot be undone. Put those in `docs/NEEDS-SAMMY.md` and keep working on everything else.

## Commands
```sh
npm install
npm test                  # Vitest: sim, app, ui, render, species, tests/unit
npm run typecheck         # tsc --noEmit
cd src-tauri && cargo test   # Rust: includes contract_sync
npm run test:e2e          # builds, then Playwright (browser mode, mock platform)
npm run dev               # frontend in a browser against src/platform/browser.ts
npm run tauri dev         # real shell; notifications post as Terminal here
npm run tauri build       # unsigned bundle at src-tauri/target/release/bundle/macos/WebPets.app
npm run install:app       # build + install (see below)
npm run build:harness     # verification build with the harness compiled in (docs/HARNESS.md); never ship it
```
**Keep build output and dependencies outside iCloud.** `node_modules` is a symlink to `~/.cache/webpets/nm-<worktree>/node_modules`
(install there with `npm ci` beside a copy of package.json and package-lock.json, then `ln -s`). And
`export CARGO_TARGET_DIR=$HOME/.cache/webpets/target` before any `tauri build`
or `cargo` command. The repo is on the iCloud Desktop with the disk near full, and macOS evicts `src-tauri/target`
(thousands of files) to the cloud between builds, which turns a one-minute build into a stall. The bundle then lands
in `$CARGO_TARGET_DIR/release/bundle/macos/`; `scripts/install-app.sh` still expects `src-tauri/target`, so copy by
hand (quit only `/Applications/WebPets.app`; the bake-off apps share the executable name). If `tsc` or `vitest` hang,
`find . -flags +dataless -not -path './src-tauri/target/*'` lists evicted sources; `brctl download <file>` brings each back.
```sh
npm run dev               # then /fish-preview.html: the live goldfish close up (?view=side|three|front, ?zoom=, ?night=)
```
**Install only with `npm run install:app`.** Every build shares the bundle id `com.sammythayer.webpets`, so macOS
routes a launch to whichever copy is already running; a freshly built copy opened by double-click can silently
be the OLD one. The script quits the running process (matched on the executable name `webpets`), replaces the one
canonical `/Applications/WebPets.app`, and launches it. Never keep extra copies ("WebPets 2.app").

Generators and tools:
- `python3 tools/gen_placeholders.py <species> <habitat>` — stamped PLACEHOLDER layers plus the manifest fragment (needs Pillow). `tools/gen_app_icon.py` — placeholder app and tray icons.
- `tools/mac/clickat.swift`, `tools/mac/winlist.swift` — `swiftc -O <file> -o /tmp/<name>`; post a real click / list windows (level, bounds, on-screen) without screen-recording permission.
- `tools/mac/mousepos.swift` (cursor position), `window_stills.py` + `stills_to_clip.py` (window stills to a captioned clip: the only way to record the speech bubble and HUD, which are DOM), `record_talk.sh` and `record_getting_to_know.sh` (the checkpoint D and E recordings; they move the real cursor and type, so only while the Mac is idle).
- `tools/vite-diag-plugin.ts` with `src/dev/diag.ts` — dev-only snapshot bridge (`curl 'http://localhost:1420/__webpets/snap?name=x'` writes `.diag/`).
- Blender (`/Applications/Blender.app/Contents/MacOS/Blender`, background mode, scripts in `assets/3d/scripts/`):
  `Blender -b assets/3d/wp_scene.blend -P assets/3d/scripts/wp_render2.py -- <out_root> <jobs> <samples>`
  (jobs: `bowl`, `fish`, or a state name). `wp_cage.py` and `wp_terrarium.py` take `-- <out.blend>`; `resave.py` writes a copy. Read the docstring at the top of each script before running it.
- The live goldfish (Step B): `gf_shape.py` (proportions, fins), `python3 gf_maps.py assets/live/goldfish` (maps),
  `Blender -b --factory-startup -P gf_build.py -- assets/live/goldfish [preview.png]` (meshes, glTF, a Cycles preview).
  Never touches `wp_scene.blend`. The bowl plates: `Blender -b assets/3d/wp_scene.blend -P c_plates.py -- <stage> day,night,dawn,dusk,memorial 32`,
  then `python3 c_finish.py <stage> assets/habitats/fish/bowl`.

## Layout
- `src/sim/` — pure rules: hunger, reconcile, feed (and `fillPantry`, the free holiday feeder), mood, pet, constants, types. `src/sim/constants.ts` holds every tunable (feeding twice a day: 50-point meal, 24 h bar, death 12 h after zero).
- `src/app/` — Zustand vanilla store, persistence (store plugin), 30 s scheduler, notification decisions, `view.ts` (state to scene view), day/night.
- `src/platform/` — `types.ts` interface; `tauri.ts` (real), `browser.ts` (mock for dev and Playwright), `geometry.ts`.
- `src/render/` — PixiJS scene, layers, sprite player, sequencer, water bounds, food, fx, expression, tray chip, asset and manifest loading, `pacer.ts`; `live/` is the hybrid's Three.js layer (`bowlLayer.ts`: the fish, the water pass; `spine.ts`, `mapping.ts`, `shaders.ts`), loading `assets/live/fish.glb`.
- `src/brain/` — the pets' shared brain (AFTER-BAKEOFF Steps D–G): `say.ts` (what to say, never repeating), `talk.ts` (when: chatty while you visit, quiet while you type or can't see it), `writer.ts` (the request for a Claude-written line or chat reply, its filter, the daily cap), `types.ts` (`Voice`, `Moment`, `Fact`, the chat moments). Step E: `profile.ts` (what the pets know about you), `bond.ts` (how close a pet is, and what each level unlocks), `understand.ts` (what you typed, offline), `chat.ts` (the conversation: asks before keeping anything), `teams.ts` and `interests.ts` (types) with `data/` (205 teams from ESPN, generated by `tools/gen_teams.mjs`; 60 interests). `src/ui/talk.ts` glues it to the bubble (`src/ui/speech.ts`), `src/ui/chatInput.ts` is the field you type in, `src/ui/card.ts` the "Get to know me" card (its own window: `card.html`, `src/card.ts`), `src/app/profile.ts` the profile file shared by both windows.
- `src/species/` — `index.ts` registry (fish, hamster); `fish/` and `hamster/` each have `behavior.ts` (pure state machine), `layout.ts`, `module.ts`, and a `voice` (`fish/voice/`: `lines.ts` in four personalities, `facts.ts` with a source each, `chat.ts` for talking with you; the hamster still adapts its Phase 0 `lines.ts` and cannot be typed to yet); hamster adds `terrarium.ts`.
- `src/ui/` — DOM HUD, tray wiring, speech bubbles, holiday-feeder dialog (`feederDialog.ts`), montage, memorial, resize grip, dev panel, hit regions, keys, `styles.css`.
- `src/audio/` — audio hooks only (Howler; missing files are skipped). Sound is deliberately out of scope beyond hooks.
- `src/dev/` — dev-only diagnostics (`diag.ts`, `harness.ts`). `src/main.ts` — boot and all cross-module wiring, and the boot report.
- `src-tauri/src/` — Rust shell: `window.rs` (size, snap, layering), `tray.rs`, `hittest.rs` (click-through poller), `commands.rs`, `clock.rs`, `identity.rs` (which binary is running), `state.rs`, `lib.rs`, `voice.rs` (Claude-written lines; the API key is a Keychain item only Rust reads), `idle.rs` (seconds since the last key press; whether anyone can see the pet), `links.rs` (opens https links only), `focus.rs` (takes the keyboard while you type to the pet or use the card, and gives it back; opens the card window), `harness.rs` (cargo feature `harness` only).
- `assets/3d/` — `wp_scene.blend` (source), `scripts/` (build and render pipeline), `checkpoints/` (timestamped .blend copies), `evidence/` (reference renders).
- `assets/live/goldfish/` — the shipped live fish: `goldfish.glb` plus its maps, all generated by the `gf_*.py` scripts; `src/render/live/fishModel.ts` loads it.
- `assets/habitats/{fish/bowl,hamster/cage,hamster/terrarium}/` — rendered layers (`bg`, `decor_front`, `glass`, `memorial`, ...); `assets/sprites/{fish,hamster}/<state>/` — one PNG per frame; `assets/manifest.json` indexes both (habitats `fish/bowl`, `hamster/cage`, `hamster/terrarium`; sprites `fish`, `hamster`). Vite serves `assets/` as `publicDir`.
- Reference only, nothing reads them: `assets/habitats-160x120/`, `assets/sprites/pets-80/`, `assets/sprites/strips-80/` (Phase 0 concept art and earlier-round sprites), `assets/reference/` (stripped from the build): `habitats-hires/` (1024 px concept renders) and `bakeoff-a/`, `bakeoff-b/` (the losing candidates' fish materials, water surface and glass, kept for Step B; see its README). `assets/fonts/PressStart2P` is unused.
- `tools/` — generators, Mac helpers and `harness.mjs` (the harness driver; see `docs/HARNESS.md`). `scripts/install-app.sh` — behind `npm run install:app`.
- `tests/unit/` (contract sync), `tests/e2e/` (Playwright: smoke, acceptance, hamster, resize). Unit tests sit beside the code as `*.test.ts`.
- `docs/` — see Read first.

## Where runtime data lives
`~/Library/Application Support/com.sammythayer.webpets/`: `pet.json` (the living pet), `settings.json` (scale, mute,
layering, day/night, per-monitor window positions), `graveyard.json`, `brain.json` (what the pet said, the bond, chat),
`profile.json` (about you: name, teams, interests), `boot-report.json` (written at every boot:
layering read back off the live window, measured advance rate, visibility). **Read `build.bundle` first** to know
which binary wrote it. To reset, quit the app and delete the folder. In browser mode these are `localStorage` keys
`webpets:<file>`.

## macOS facts worth not rediscovering
- The packaged window is never activated (Accessory policy, no `set_focus`), so WebKit can report `document.visibilityState === 'hidden'` and clamp timers to 1 Hz and stop rAF. `src/render/pacer.ts` (a Worker interval, unthrottled) keeps the scene alive. On screen it runs at the display rate (~61 advances/s measured, `docs/reports/checkpoint-0.md`); when the window is not on screen (another Space, a fullscreen app in front) it falls to ~15. Trust the newest `docs/reports/` number over this line.
- Pixi's `fps` is seeded to 60 and lies when nothing runs; measure the scene's own advance counter (the boot report does).
- `Alt+Cmd+D` collides with the system "Turn Dock Hiding On/Off" shortcut; use the tray's Dev panel item (or Shift+Alt+Cmd+D).
- A fullscreen app covers the pet by design (known limitation, decided; do not call `setAlwaysOnTop` from JS, it would drop the window from level 25 to 5).
- Notifications from `tauri dev` post under the Terminal identity; only the bundled `.app` posts as `com.sammythayer.webpets`.
- `screencapture -x` from a Claude session returns real screenshots (Screen Recording is granted), but `-l<windowId>` captures a window only if it is on the CURRENT Space (off-Space it returns a transparent PNG). Find ids with `tools/mac/winlist.swift`; the diag bridge, Playwright video and AX also work. While the screen is locked macOS scales reported window rects by 0.9 about the display center.
- Global shortcut `Cmd+Shift+P` shows or hides the pet; the tray left-click toggles, right-click opens the menu.
