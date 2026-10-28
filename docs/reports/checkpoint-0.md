# Checkpoint 0 — health check (2026-10-28)

Build under test: `/Applications/WebPets.app`, v0.0.1, linked 2026-10-28 01:27 from commit d5a5966
plus the docs in this commit. Machine: MacBook with Apple M4, macOS 26.5.2, 1512×982 logical at 2×.

## Suites

| suite | result |
|---|---|
| Vitest (`npm test`) | 308 passed, 35 files, 4.1 s |
| TypeScript (`npm run typecheck`) | clean |
| Rust (`cargo test`) | 22 passed |
| Playwright (`npm run test:e2e`) | 5 passed, 41 s — after `npx playwright install chromium` (the cache had build 1248, this Playwright wants 1243; the first run failed all 5 on a missing browser, not on the app) |
| Release build (`tauri build --bundles app`) | 90 s; bundle 23 MB |

## Frame rate: is 60 fps reachable?

Yes. The 15 fps in the brief is what the app does when its window is **not on screen** (another Space, or a
fullscreen app in front). On screen it runs at the display rate.

| condition | `document.visibilityState` | scene advances/s | Pixi fps | render ms/frame |
|---|---|---|---|---|
| launched while a fullscreen Space was active | hidden | 14 | 60 (seeded value, meaningless) | 5.7 |
| launched on a desktop Space, window on screen | visible | 61 | 63 | 0.1 |
| dev panel readout, Medium (688×528) | visible | — | 56 | — |
| dev panel readout, Large (1008×768) | visible | — | 59 | — |
| dev panel readout, Small (288×228) | visible | — | not readable: the panel is taller than the window and its FPS row is clipped | — |
| harness `stats`, 5 s, Small (scale 6) | visible | 60 | 53 | 0.2 |
| harness `stats`, 5 s, Medium (scale 16) | visible | 60 | 56 | 0.3 |
| harness `stats`, 5 s, Large (scale 24) | visible | 60 | 63 | 0.1 |

Cost at Medium, three processes (shell + WebContent + GPU), `ps` averaged over 6 s:

| state | CPU (share of one core) | RSS |
|---|---|---|
| shown, idle fish | ~21% | ~200 MB |
| hidden (Cmd+Shift+P) | ~5% | ~200 MB |

Twenty percent of a core for one fish in a still bowl is the number every bake-off candidate is measured against.

## The four never-verified items

| item | result | how it was proven |
|---|---|---|
| Tray menu and hunger chip | PASS | Real right-click on the status item opens a 164×331 menu (Feed, Pantry…, Size ▸, Mute, ✓Notifications, Day/Night ▸, Visible on ▸, Launch at login, Dev panel, New pet, Minimize, Quit). Chip in the menu bar: fish inside a green hunger ring at 92%. `tray-menu.png`, `tray-chip-4x.png`. |
| Notifications firing | PASS | Dev panel +12H twice. App stdout: `notify: Bubbles is hungry.` then `… is starving. 12h to live.`; Notification Center's database gained two records for `com.sammythayer.webpets` delivered 01:34:22. No permission prompt. |
| Click-through onto the desktop | PASS | CGEvent click on the bowl: Blender stays frontmost (the pet never takes focus). Click on the transparent pad: Finder becomes frontmost, i.e. the desktop behind received it. |
| Cmd+Shift+P | PASS | Sent via System Events: the window leaves the on-screen window list, a second press brings it back. |

Everything was driven from the shell with no human: `tools/mac/winlist.swift` (window list, no permission
needed), `tools/mac/clickat.swift` (real clicks), `osascript` for keys and the tray's accessibility tree, and
`screencapture`. See DECISIONS for the details.

## Surprises

- **Screen capture works** from this session now. The September note said it returned black; Screen Recording is
  granted. macOS put up a consent dialog for the Claude app mid-run; left for Sammy (`docs/NEEDS-SAMMY.md`).
- **Off-Space is the 15 fps case, not the normal case.** The previous diagnosis ("an unactivated window is always
  hidden to WebKit") does not hold on this macOS: on a visible Space the document is `visible` and
  `requestAnimationFrame` drives the scene at 60.
- **Clicks can be lost to the cursor poller.** A synthetic click that arrives less than ~50 ms after the cursor
  moves onto a hit region is routed as if the window were still click-through, because Rust flips
  `ignoresMouseEvents` on a 50 ms poll. Humans are slower than that; scripts are not. `clickat` now waits 150 ms.
- **Reset clock after a skip past zero keeps the pet at 0%** (by design: hunger is evaluated at
  `max(now, lastReconciledAt)`). For a dev tool that is a trap — the pet reads starving for a day. Restored the
  pet with Force ▸ fed. Worth a "reset clock AND re-anchor" option later.
- **The dev panel does not fit the Small window.**
- **The tray chip is still pixel art** (jagged ring, 6-px fish) beside a soft-3D bowl.
- **The user's Day/Night is set to "night"**, so every capture here is the night tint; the daytime look is in
  the September evidence.

## The harness, proven in the packaged app
`docs/HARNESS.md`. Built as `WebPets Harness.app` under its own bundle id (`--config` override) so it runs beside
the real app. `state`, `scale`, `stats`, `feed`, `force`, `night`, `pointer` and `script` all answered;
`record` produced H.264 (`video/mp4; codecs=avc1.42000a`) at the canvas size, 1376×1056, 20 s, 6.2 MB, 1082
frames. `baseline-20s.mp4` here is that clip re-encoded at half size (250 KB); it is the shared bake-off
script `tools/bakeoff/script.json`: idle, pointer at the glass, feed, eat, hungry, night.

## Files
`docs/reports/checkpoint-0/`: `baseline-20s.mp4`, `pet-small-idle.png`, `pet-medium-idle.png`, `pet-large-idle.png` (window-only
captures, transparent background), `pet-2x-hover-hud.png`, `dev-panel-after-skip.png`, `tray-menu.png`,
`tray-chip-4x.png`.

## State at the end of the step
All green. CLAUDE.md rewritten for the repo as it is. A file-driven harness build (`docs/HARNESS.md`) added so the
bake-off and every later self-review loop can be scripted against the installed app. Next: the bake-off.
