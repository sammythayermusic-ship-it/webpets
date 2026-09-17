# WebPets

A pixel-art desktop pet for macOS. A fish bowl floats in the corner of your screen, always on
top and transparent around the glass. The fish gets hungry on a clock that never pauses, eats when
you feed it, and dies if it is neglected long enough. Built with Tauri 2, Vite, TypeScript and PixiJS 8.

## Prerequisites

- macOS 12 or newer
- Node 22 (`node -v`)
- Rust stable via [rustup](https://rustup.rs) (`rustc --version`)
- Xcode Command Line Tools (`xcode-select --install`)
- Python 3 with Pillow, only if you want to regenerate placeholder art (`pip3 install pillow`)

## Running

```sh
npm install
npm run tauri dev        # builds the Rust shell, starts Vite, opens the floating window
```

The first `tauri dev` compiles the Rust side and takes a few minutes; later runs are quick. There is no
Dock icon: the app lives in the menu bar tray.

`npm run dev` on its own serves the frontend in a normal browser against a mock platform (no Tauri).
Useful for UI work; the tray becomes a small canvas in the corner of the page.

## Building the .app

```sh
npm run tauri build
```

The bundle lands under `src-tauri/target/release/bundle/macos/WebPets.app` (a `.dmg` is written next to
it under `bundle/dmg/`). It is unsigned, so the first launch may need a right-click, Open.

## Tests

```sh
npm test                 # Vitest: pure sim tests plus app/ui unit tests
npm run test:watch       # same, watch mode
npm run typecheck        # tsc --noEmit
npm run test:e2e         # Playwright, browser mode against the mock platform
```

The e2e suite runs the frontend in a browser with the mock platform (`src/platform/browser.ts`), so no
Tauri build is needed. Recorded videos and traces are written under `test-results/`.

## Using the pet

- Hover the bowl for the HUD (name, hunger, pantry). Click Feed to spend $FEED from the pantry.
- Drag the bowl to move it; it snaps to the nearest corner and remembers its spot per monitor.
- Tray icon: left-click toggles the window, right-click opens the menu (feed, pantry, size,
  mute, notifications, day/night, launch at login, dev panel, new pet, show/hide, quit).
- `⌘=` / `⌘−` change the window size (2x / 3x / 4x pixel scale) while the window has focus.
- `⌥⌘D` opens the dev panel: advance time (+1h / +12h / +3d), set hunger, pantry and balance,
  force a state, toggle day/night, simulate a long absence, reset the clock.
- `Cmd+Shift+P` is a global shortcut that shows or hides the pet from any app.

## Where data lives

```
~/Library/Application Support/com.sammythayer.webpets/
  pet.json         the living pet (hunger, pantry, last-fed times)
  settings.json    scale, mute, notifications, day/night, window positions
  graveyard.json   pets that have died
```

To reset everything, quit the app and delete that folder. To start a fresh pet but keep settings and the
graveyard, delete only `pet.json`, or use New pet from the tray menu. In browser mode the same three files
are `localStorage` keys named `webpets:<file>`.

## Art

Real fish, hamster, frog and chicken sprites are still to come. Until then the bowl uses the concept
render in `assets/habitats-160x120/fish-bowl.png` as the `bg` layer and generated placeholders for
everything else:

```sh
npm run gen:placeholders   # writes assets/habitats/fish/bowl/*.png and assets/sprites/fish/*.png
```

Every placeholder is stamped PLACEHOLDER. To drop in real art, replace the PNG files listed in
`assets/manifest.json` at the same sizes (habitat layers are 160x120; sprite strips are 80x80 per
frame, frames side by side) and keep the manifest's frame counts and layer names in sync. Layer
geometry (`water`, `pantryRect`, `petAnchor`) must also match `src/species/fish/layout.ts`.

## Notifications during `tauri dev`

While running from `npm run tauri dev`, macOS attributes notifications to the process that launched
them, so they are posted under the Terminal identity. If you do not see hunger or death alerts, open
System Settings, Notifications and allow notifications for Terminal (or your terminal app). Only the
bundled `.app` posts as `com.sammythayer.webpets`.

## Phase 0 scope

Everything is local. `$FEED` is a number in `pet.json`, not a token; there is no wallet, no chain and no
network access. Blockchain integration is a later phase and is deliberately absent from this build.
See `WEBPETS-BLUEPRINT.md` for the full spec and `docs/DECISIONS.md` for the decision log.
