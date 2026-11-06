# Harness: driving the packaged app from a shell

The packaged `.app` has no devtools and no dev-server bridge, and every "verify in the built app"
step wants screenshots, a 20-second clip and a state dump. The harness is a file-driven remote
control compiled into the app **only when asked for**. A normal `npm run build` / `tauri build` does
not contain it: the TypeScript side is behind `import.meta.env.VITE_WEBPETS_HARNESS === '1'` (a
dynamic import, tree-shaken like the diag bridge) and the Rust side is behind the cargo feature
`harness` (`src-tauri/src/harness.rs` and its two commands are not compiled without it).

**The harness build is for verification only. It is never the build a user gets.** It reads commands
from a folder and will do whatever they say, including feeding and killing the pet.

## Build and run

```sh
npm run build:harness     # = VITE_WEBPETS_HARNESS=1 tauri build --bundles app --features harness
```

The Tauri CLI spells it `--features` (also `-f`), space- or comma-separated; checked against
`@tauri-apps/cli` 2.11. The bundle lands where `tauri build` always puts it
(`src-tauri/target/release/bundle/macos/WebPets.app`). Quit any running copy first (every build
shares the bundle id), then open the harness build. The log line `[harness] installed` on stdout
confirms the right one is running.

## Where the files go

Everything is under the app-data dir, `~/Library/Application Support/com.sammythayer.webpets/harness/`
(Tauri's `app_data_dir()`; override with `--app-data DIR` on the driver):

- `inbox/<id>.json` — one command per file. The app reads them in file-name order every 250 ms and
  deletes each after reading.
- `out/<id>.result.json` — `{ "id", "op", "ok": true|false, "error"?, "data"?, "at": ISO }`.
- `out/<name>.png`, `out/<name>.mp4|webm` — large outputs; the result's `data.file` names them.

Files are written to a temporary name and renamed, on both sides, so nothing is read half-written.

## Driver

```sh
node tools/harness.mjs <op> [json-args] [--app-data DIR] [--no-wait] [--timeout S]
node tools/harness.mjs script path/to/steps.json
```

Prints the result JSON. Exit codes: 0 for `ok: true`, 1 for `ok: false` or a timeout, 2 for a usage
error (unknown flag, a `--timeout` that is not a positive number). The wait is 60 s, or `seconds + 10`
for `record` / `stats` / `sleep` / `script` (summing the script's `sleep`/`stats` steps; a `record`
step inside a script is detached, so it is not counted). `--no-wait` queues and returns. A command
that times out while still in the inbox is withdrawn, so it cannot fire the next time a harness
build starts.

## Ops

Commands run one at a time in inbox order, except `record`, which is started and left to finish on
its own so the next command lands inside the clip.

| op | args | does |
|---|---|---|
| `state` | – | `{ visibility, hasFocus, fps, scene: debugState(), hunger, night, hidden, pet, settings, geometry, needs, present, drives }` |
| `feed` | – | `actions.feed()`; data is the `FeedResult` |
| `skip` | `{ ms }` | `dev.skip(ms)`: moves the pet's clock forward |
| `setHunger` | `{ n }` | `dev.setHunger(n)` |
| `setPantry` | `{ n }` | `dev.setPantry(n)` |
| `force` | `{ state }` | `dev.forceState`: `fed` `hungry` `starving` `dead` `asleep` |
| `night` | `{ value: true\|false\|null }` | `dev.setNightOverride`; `null` follows settings again |
| `hour` | `{ value: number\|null }` | pins the local hour the light and the sim's night follow (7 morning, 12 noon, 18 evening, 22 night); `null` follows the clock again. Data `{ hour, night, daylight }` |
| `scale` | `{ steps }` | `actions.setScale(steps)` (eighths of the grid, 6–32) |
| `layering` | `{ alwaysOnTop?, allDesktops?, overFullscreen?, onDesktop? }` | `actions.setLayering(patch)`; data is the level and behaviour read back off the window, and the settings |
| `species` | `{ species, habitat }` | `dev.setSpecies`, scheduled 100 ms after the result is written because the app reloads; poll `state` afterwards |
| `hide` / `show` | – | `actions.setHidden(true / false)` |
| `devPanel` | `{ open }` | opens or closes the dev panel; data has its rect |
| `resetClock` | – | `dev.resetClock()` |
| `newPet` | – | `actions.newPet()`: a fresh fish in the bowl (the old pet goes to the graveyard if it died); data names it. `force` cannot revive a dead pet, this can |
| `pointer` | `{ x, y }` or `{ x: null }` | `scene.setPointer` in window-local CSS px, without moving the real mouse |
| `tap` | `{ x, y }` | what a real click on the glass does: `actions.poke('tap')` and `scene.tap(x, y)` (window-local CSS px), so the fish startles AND the water rings |
| `drop` | `{ x, y }` | what a click over the open water does: a pinch of food dropped at that spot (window-local CSS px); error if the point is not over the water |
| `poke` | `{ kind }` | a needs stimulus: `tap` (a knock on the glass), `bite`, `feed`, `pointer`; data has the needs after |
| `setNeeds` | `{ energy?, curiosity?, comfort?, stress? }` | `dev.setNeeds`: re-anchor any of the four needs (0..1) at now, for scripting a tired, bored, rattled or settled pet |
| `presence` | `{ present }` | `actions.setPresence`: the pointer arrived (a stimulus; a greeting after a long absence) or left |
| `say` | `{ text }` | puts a line in the speech bubble now, bypassing the brain (for stills of the bubble) |
| `talk` | `{ moment }` | `fact` or `thought`: the pet volunteers one now in its own voice, skipping the brain's timing; `personal`: a thought about you, if the bond allows and it knows something; `news`: a fresh headline, if one was fetched; `mood`: how your team's result feels, while it lasts; `fed`, `meal`, `tap`, `hungry`, `starving`, `feeder`, `welcome-back`: tells the brain it happened (it may or may not answer). Data has the last line said |
| `talkSpeed` | `{ k }` | runs the talk clock `k` times faster, so an hour of chatter fits in a recording; 1 is real time |
| `transcript` | – | what the pet has said lately: `{ lines: [{ at, text, kind }], typedAgoS, unseen, linkRect }`, newest last; `linkRect` is the bubble's source link (window-local CSS px) while one shows, else null |
| `chat` | `{ text }` | as if typed into the chat field and sent; data has the reply when the library wrote it (a written reply comes later: read `transcript`) |
| `choose` | `{ value }` | presses a button under the bubble's question (`yes`, `no`, or a team id); error if there is none |
| `bond` | `{ points? }` | the bond `{ points, level, word, knocks }`; with `points` (0-100), sets it first |
| `profile` | `{ set? }` | the profile; with `set` (`{ name?, teams?, interests?, own? }`), replaces it first, through the same checks as a saved file |
| `forget` | – | "Forget me": empty profile, chat memory cleared (the bond stays) |
| `chatField` | `{ open }` | opens or closes the chat field; data has its rect (window-local CSS px) |
| `openCard` | – | opens the "Get to know me" window |
| `cardDo` | `{ action, value? }` | acts on the open card like a person would (`src/dev/cardHarness.ts`): `name` (types it), `league`, `team` (picks and adds), `interest` (presses the chip), `own` (types and adds), `scroll` (px), `forget`, `done` |
| `world` | `{ do?, what?, result?, us?, them? }` | Step F. `do: "refresh"` fetches now (`what`: `sports`, `news` or `all`); `do: "force"` pretends your first team's game just ended (`result`: `won`/`lost`, `us`, `them`; a test, said and felt like a real one); data is the state: mood, cheer, what is due to be said, today's games, stories cached and told |
| `milestone` | `{ moment }` | Step F2: marks a milestone now (`birthday`, `meals`, `bond`, `big-win`), said with its Share this button when the pet is free |
| `share` | `{ what }` | Step F2: `clip` saves the last few seconds, `card` the pet card, into Downloads (and selects it in Finder); data has the path |
| `away` | `{ ms }` | pretends you left the window `ms` ago, for the close-friend greeting at the glass (three minutes away) |
| `snapshot` | `{ name }` | `scene.snapshot()` → `out/<name>.png`; data `{ file, bytes }`. The canvas only: speech bubbles are DOM and are not in it (capture the window for those) |
| `stats` | `{ seconds }` | samples `debugState().advances/.steps` across the window: `{ advancesPerSec, stepsPerSec, fps, visibility, renderMs, elapsedMs }` |
| `record` | `{ name, seconds, fps? }` | `canvas.captureStream(fps ?? 60)` + `MediaRecorder` → `out/<name>.mp4` or `.webm`; data `{ file, mime, bytes, seconds, fps }`. Detached. |
| `sleep` | `{ ms }` | resolves after `ms`, in-app, for sequencing |
| `script` | `{ steps: [...] }` | runs the steps in order, one result file per step (`<id>.<n>-<op>` unless the step has its own `id`) plus one for the script; `ok: false` if any step failed |

Unknown ops and bad arguments come back as `ok: false` with the field named; nothing a command does
can stop the poller. A `harness_poll` that rejects is logged and retried on the next tick; a result
write that fails is logged and the following commands in the same batch still run (the inbox has
already consumed them, so nothing would retry them). Batches never overlap: a tick that lands while a
batch is running is skipped.

## A 20-second recording, scripted

`clip.json`:

```json
[
  { "op": "record", "name": "feed-then-hungry", "seconds": 20 },
  { "op": "sleep", "ms": 4000 },
  { "op": "feed" },
  { "op": "sleep", "ms": 8000 },
  { "op": "force", "state": "hungry" },
  { "op": "sleep", "ms": 4000 },
  { "op": "night", "value": true },
  { "op": "sleep", "ms": 4500 }
]
```

```sh
node tools/harness.mjs script clip.json        # waits ~20.5 s + 10 s grace, prints the script result
ls ~/Library/Application\ Support/com.sammythayer.webpets/harness/out/
#   <id>.result.json  <id>.0-record.result.json ... feed-then-hungry.mp4
node tools/harness.mjs snapshot '{"name":"after"}'
node tools/harness.mjs night '{"value":null}'
```

The `record` step's own result file arrives when the clip is written, a moment after the script's.

## Caveats

- `record` depends on what WKWebView's `MediaRecorder` supports. The code asks for the first of
  `video/mp4;codecs=avc1`, `video/mp4`, `video/webm;codecs=vp9`, `video/webm` that
  `isTypeSupported` accepts and names the file by the mime it actually got; which one that is can
  only be confirmed in the real app. If `MediaRecorder` is missing the result says so and `snapshot`
  still works.
- `canvas.captureStream` records what the canvas renders. The DOM HUD, speech bubbles and dialogs are
  not on the canvas and are not in the clip; `snapshot` has the same scope. To record them, take
  window stills (`tools/mac/window_stills.py`) and join them (`tools/mac/stills_to_clip.py`).
- `species` reloads the page; the harness re-installs on the next boot, but a command dropped during
  the reload is picked up late or not at all. Wait a second, then `state`.
- The harness does nothing about focus or occlusion: a window the compositor considers hidden still
  has its clocks throttled, and `stats` is how to see that.
