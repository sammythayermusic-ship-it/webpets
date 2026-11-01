# WebPets

A desktop pet for macOS. A small habitat floats in the corner of your screen, always on top and
transparent around the glass: a fish in a bowl, or a hamster in a cage or a glass terrarium. The pet
gets hungry on a clock that never pauses, eats when you feed it, and dies if it is neglected long
enough. Built with Tauri 2, Vite, TypeScript and PixiJS 8; the art is soft 3D rendered from a Blender
scene that lives in the repo.

There is no cryptocurrency, token, coin or blockchain in WebPets, and there will not be one. Food is
free: feed the pet regularly, and fill its holiday feeder before you go away.

## Prerequisites

- macOS 12 or newer (built and tested on Apple Silicon)
- Node 22 (`node -v`)
- Rust stable via [rustup](https://rustup.rs) (`rustc --version`)
- Xcode Command Line Tools (`xcode-select --install`)
- Blender 5.x at `/Applications/Blender.app`, only to re-render the art
- Python 3 with Pillow, only to regenerate placeholder art

## Running

```sh
npm install
npm run tauri dev        # builds the Rust shell, starts Vite, opens the floating window
```

The first `tauri dev` compiles the Rust side and takes a few minutes; later runs are quick. There is
no Dock icon: the app lives in the menu bar.

`npm run dev` on its own serves the frontend in a normal browser against a mock platform (no Tauri).
Useful for UI work; the tray becomes a small canvas in the corner of the page.

## Building and installing the .app

```sh
npm run install:app
```

This builds the bundle, quits any running copy, replaces the one canonical `/Applications/WebPets.app`
and launches it. Use it rather than copying the bundle around: every build shares the bundle id, so
macOS routes a double-click of a new copy to whichever copy is already running, and you would be
looking at the old build without knowing it. `npm run tauri build` alone leaves the bundle under
`src-tauri/target/release/bundle/macos/`. The app is unsigned; the first launch may need a
right-click, Open.

## Tests

```sh
npm test                 # Vitest: the pure simulation plus app, render, species and ui units
npm run typecheck        # tsc --noEmit
cd src-tauri && cargo test
npm run test:e2e         # builds, then Playwright in a browser against the mock platform
```

To drive the installed app from a script (screenshots, a 20-second clip, state dumps) build it with
`npm run build:harness` and use `tools/harness.mjs`; see `docs/HARNESS.md`. That build is for
verification only.

## Using the pet

- Hover the habitat for the bar: hunger ring, name, Feed, size buttons, minimize. Feeding is free.
  The caption below shows the holiday feeder (food stored in the habitat that feeds the pet on its own
  while you are away) and how many days it covers, for example `FEEDER · 3 DAYS` or `FEEDER EMPTY`.
- Holiday feeder… in the menu opens the feeder: "Fill it up" fills it to three days of food, for free.
  The pet eats from it whenever it gets hungry, and you get a notification when it is almost empty.
- Drag the habitat to move it; it snaps to screen edges and remembers its spot per monitor. Resize from
  the handle at its top-left corner, the `+`/`−` buttons, the tray's Size menu, or `⌘=` / `⌘−`.
  The size is continuous between 0.5× and 4× of the habitat's logical 320×240 grid; Small, Medium and
  Large in the menu are 0.75×, 2× and 3×.
- Menu bar icon: the pet with its hunger ring. Left-click shows or hides the window; right-click opens
  the menu (Feed, Holiday feeder, Size, Mute, Notifications, Day/Night, Visible on, Launch at login, Dev panel,
  New pet, Minimize, Quit). `⌘⇧P` shows or hides the pet from any app.
- Day and night follow the clock (night from 19:00 to 07:00) unless you pin one in the menu.
- The dev panel (tray menu, or `⌥⌘D` when the window has focus; `⇧⌥⌘D` if macOS claims the first):
  skip time, set hunger and the feeder's contents, force a state, switch species and habitat, see the frame
  rate and the pet's needs, simulate a ten-day absence, reset the clock.

## Where data lives

```
~/Library/Application Support/com.sammythayer.webpets/
  pet.json           the living pet (hunger anchor, feeder, needs, last-fed times)
  settings.json      size, mute, notifications, day/night, layering, window positions
  graveyard.json     pets that have died
  boot-report.json   what the last launch measured: build, layering, frame rate, visibility
```

To reset everything, quit the app and delete that folder. To start a fresh pet but keep settings and
the graveyard, delete only `pet.json`, or use New pet from the menu. In browser mode the same files
are `localStorage` keys named `webpets:<file>`.

## Art and the Blender source

Every layer and sprite the app loads is rendered from `assets/3d/wp_scene.blend` by the scripts under
`assets/3d/scripts/` (see `assets/3d/README.md`). The scene is built from primitives and code; nothing
in it comes from paid generation. Habitat layers are integer multiples of the 320×240 logical grid
(currently 4×) and sprites one PNG per frame, indexed by `assets/manifest.json`. The 160×120 concept
art and the earlier sprite rounds are kept under `assets/` for reference and are not shipped.

## Documents

- `docs/PHASE-NEXT.md` — the current brief and the quality bar.
- `docs/ARCHITECTURE.md` — the module contract.
- `docs/DECISIONS.md` — the decision log, newest at the bottom.
- `docs/reports/` — checkpoint reports with numbers, screenshots and recordings.
- `docs/HARNESS.md` — scripting the installed app.
- `WEBPETS-BLUEPRINT.md` — the original spec, superseded where the brief disagrees.

## Notifications during `tauri dev`

While running from `npm run tauri dev`, macOS attributes notifications to the process that launched
them, so they are posted under the Terminal identity. If you do not see hunger or death alerts, allow
notifications for Terminal (or your terminal app) in System Settings. Only the bundled `.app` posts as
`com.sammythayer.webpets`.
