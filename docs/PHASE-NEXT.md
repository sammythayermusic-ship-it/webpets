# WebPets — Phase Next: make them alive

This is the brief for the next stretch of work. Read `CLAUDE.md` and the tail of `docs/DECISIONS.md` first; this file sits on top of them. `WEBPETS-BLUEPRINT.md` still holds the rules of the simulation and the window, but its art direction (pixel art) is out of date: the art moved to soft 3D rendered from Blender in September, at Sammy's direction, and that is the baseline here.

Goal, in one line: the pets should look alive, behave like the animal they are, and live in habitats good enough that someone leaves the widget open just to watch it.

Work in the order below. Stop at each checkpoint, write a short plain-English report (what works, what to look at, what you are unsure of), and wait for Sammy's review before continuing.

---

## Where the repo stands (Oct 2026)

- Fish in the bowl is complete: 8 rendered states (idle, eat, hungry, sleep, dead, happy, excited, curious), figure-eight wander, cursor interest, mood system (`src/sim/mood.ts` + `src/render/expression.ts`), death, memorial.
- Hamster in the cage and in the glass terrarium: idle, walk, eat, hungry, sleep, dead (one still frame), errands (wheel, drink, hopper, bed), `wheelKm`.
- Frog and chicken exist only as names in the `Species` union.
- Art is pre-rendered from `assets/3d/wp_scene.blend` with the scripts in `assets/3d/scripts/`, at 4× the 320×240 logical grid (habitat layers 1280×960, pet frames 320×320 at 12 fps). Blender 5.2.1 LTS is installed at `/Applications/Blender.app`; run it headless with `/Applications/Blender.app/Contents/MacOS/Blender -b ...`.
- The packaged `.app` runs its animation at 15 fps because of the worker pacer workaround (`src/render/pacer.ts`), not 60.
- Four Blueprint §11 acceptance items were never confirmed by a human: tray menu and hunger chip, notifications firing, click-through onto the desktop behind, and `Cmd+Shift+P`.
- Last commit: `d5a5966 Build the glass terrarium, and let a species own more than one habitat` (Sept 20). Tree is clean.

What is wrong with the current look, honestly: the habitats are clean but still and flat (nothing moves in them but the pet), the water has no light in it, the fish and hamster read as smooth toys rather than animals, and the pet's motion is a position moving between canned loops. Every stream below attacks one of those.

---

## Rules that do not change

These come from `CLAUDE.md`, `docs/ARCHITECTURE.md` and `docs/DECISIONS.md`. Re-read those if any of this is unclear.

1. The 320×240 grid is logical coordinates. Behaviour, water bounds, hit regions and manifest numbers live there. Art resolution is derived from the texture (`layerArtScale`), never declared.
2. `src/sim` stays pure, tested first, zero imports from render/ui. No blockchain in this phase. Never touch seed phrases.
3. Three clocks: simulation at 8 Hz, animation at the art's own rate, drawn position interpolated every rendered frame from the same accumulator. Keep that split even if the renderer changes.
4. `opaqueRect` must equal the habitat's alpha bounding box exactly; the click-through guard in `src/render/habitatArt.test.ts` protects it. If a candidate renderer draws the habitat differently, it must still publish a correct `opaqueRect`.
5. Never call `setAlwaysOnTop` from JS (it downgrades the window level Rust set).
6. Blender: build from primitives and code. No paid generation (`bl_generate_*`, `bl_image_to_3d`, or any credits-spending tool). Never save over a `.blend` in place; `resave.py` writes copies, checkpoints are timestamped. Everything that can only be rebuilt by hand lives in the repo under `assets/`.
7. Every checkpoint is verified in a built `.app` (`npm run tauri build`, then `npm run install:app`), not only under `tauri dev`. Screenshots and recordings come from the real desktop.
8. Commit after each working step. Log decisions under your own heading in `docs/DECISIONS.md`. Keep `npm test`, `npm run typecheck` and the e2e suite green.
9. If a CSP is ever added, it needs `worker-src blob:`.

---

## Step 0 — Health check (checkpoint 0)

Before building anything new:

1. `npm install`, `npm test`, `npm run typecheck`, `npm run test:e2e`, `npm run tauri build`, `npm run install:app`. Fix anything red.
2. Measure the real frame rate of the installed `.app` on the desktop (the dev panel FPS meter plus Activity Monitor CPU%). Write the numbers down in `docs/DECISIONS.md`. Then find out whether 60 fps is reachable in the packaged app: the pacer exists because WebKit batches hidden-document worker messages, so test `requestAnimationFrame` directly in the packaged build, a `setTimeout` chain, and the pacer with a smaller interval, and keep whichever gives the smoothest motion at the lowest CPU. Nothing in the bake-off can be judged at 15 fps.
3. Walk the four unverified acceptance items by hand in the installed `.app` and record pass/fail for each. Fix what fails.
4. Refresh `CLAUDE.md` so it describes the repo as it is (soft 3D art, logical grid, the three clocks, this file as the current brief). Keep it short.

Report: the numbers from 2, the four results from 3, and anything that surprised you.

---

## Step 1 — The look bake-off (checkpoint 1)

Sammy wants to see the options before locking the art direction. Build the **fish bowl** three ways, each on its own worktree branch, each driven by the exact same simulation, behaviour and window code. He will pick one in the installed `.app`, on his own desktop.

The three candidates:

**A. Rendered ceiling** (`bakeoff/rendered`). Keep the current pipeline and push it as far as pre-rendering goes. In Blender: real glass with refraction, a water volume, a light source placed like a window off to one side, caustics on the gravel, a goldfish with translucent fins, a visible scale pattern and some subsurface softness, a plant with individual leaves. Render every existing state at 24 fps instead of 12. Add one new layer kind to the manifest: a looping **ambient sequence** (caustic light and surface shimmer, 48 frames) drawn in the `fx` slot, so the water moves even when the fish does not. Everything stays PNG, mipmapped, in the current PixiJS scene.

**B. Live 3D** (`bakeoff/live`). Replace the Pixi habitat scene for the bowl with a real-time Three.js scene inside the same Tauri window. Export the bowl and fish from `wp_scene.blend` to glTF with a headless Blender script committed under `assets/3d/scripts/`. Real-time: a transmissive glass material, a water surface with moving normals, a caustic light projected on the gravel, lights that change with time of day, the camera leaning a few degrees toward the cursor for parallax, and the fish body as a bone chain driven procedurally (a wave travels down the spine with speed and amplitude from the behaviour's velocity; tail and pectorals lag behind as secondary motion). The behaviour still comes from `src/species/fish/behavior.ts` in grid coordinates; the scene maps grid to bowl space. The HUD, dev panel, hit regions and `opaqueRect` must all still work.

**C. Hybrid** (`bakeoff/hybrid`). Blender-rendered plates for everything that holds still (the bowl body, gravel, plant, front glass), at candidate A's quality. A live Three.js layer sandwiched between those plates for everything that moves: the fish (as in B), the water surface, caustics, bubbles, light. Two stacked transparent canvases is fine if sharing one WebGL context is awkward; measure the cost. Time of day changes the live lights and tints the plates.

What every candidate must deliver before the checkpoint:

- A built, installed `.app` from its branch (name the bundle so three can sit side by side, e.g. `WebPets Rendered.app`).
- Three screenshots on the real desktop at the small, default and large window sizes, saved under `docs/bakeoff/<candidate>/`.
- One screen recording of about 20 seconds: idle, feed, eat, then forced hungry, then forced night. Same script for all three so they compare.
- Measured numbers in `docs/bakeoff/<candidate>/NUMBERS.md`: frames per second, CPU % at idle and during feed, memory, bundle size, time from launch to first frame.
- A short note (under a page) on what it would take to bring the hamster, frog and chicken onto this path, and what this path cannot do.

Also write `docs/bakeoff/SCORECARD.md` with one row per candidate and these columns for Sammy to fill in by eye: looks alive, water looks like water, the fish looks like a fish, reacts to me, I would show this to someone. Numbers go in the same table from `NUMBERS.md`.

Do not polish past what the comparison needs. The point is to see the three ceilings, not to finish three products. If the live path cannot reach smooth motion in the packaged app after Step 0, say so in its note instead of hiding it.

Report: the scorecard with the numbers filled in, the three recordings, and your own recommendation in three sentences.

**Sammy picks. Everything below runs on the winner.**

---

## Step 2 — Pet behaviour and realism (checkpoint 2)

Start with the fish and hamster, since both exist. The aim is a pet you can watch for a minute without seeing the loop.

1. **Needs beyond hunger**, in `src/sim`: energy (drops while active, restores while asleep; drives when the pet naps and how fast it moves), curiosity (rises with time since the last interaction, spent by investigating), comfort (a slow value fed by being fed on time, drained by starving stints; shows in posture). Pure, tested, timestamp-derived like hunger. The hunger rules do not change.
2. **Attention model**, in the behaviour: the pet knows where the cursor is and whether it has been away. A cursor that arrives after a long gap gets a bigger reaction than one that has been hovering for a minute. A click on the glass is a tap: the fish startles then approaches, the hamster freezes then sniffs. Returning from a notification-worthy absence gets a greeting. The reaction size follows the personality.
3. **Personality in motion, not just lines.** Each of the four personalities gets a small parameter set (reaction delay, wander speed, how far it stays from the glass, how often it does an errand, how long it holds a pose). Sarcastic is slow to come over and leaves early. Anxious startles big and hides. Zen moves slowly and rests often. Degen is fast, erratic, always at the front.
4. **Species-true motion.** Fish: arcs instead of straight lines when turning, a surface gulp now and then, drifting with the tail barely moving when resting, a dart when food lands. Hamster: sniffing before moving, grooming, cheek-stuffing with a visible pouch, the wheel run as a proper run cycle with the wheel spinning in sync, a yawn before sleep.
5. **No visible loops.** Idle variation comes from seeded noise and a weighted random pick of micro-actions, never from a fixed cycle. Write a test that runs 10 minutes of idle and asserts no 30-second window repeats exactly.

Report: a recording of each pet left alone for two minutes, and one of each reacting to the cursor and a tap.

---

## Step 3 — Environments and ambient life (checkpoint 3)

Make the habitat a place, not a backdrop.

1. **Time of day** that does something: light direction and colour follow the local clock (warm low light morning and evening, flat at noon, a hood or lamp as the only light at night). `src/app/daynight.ts` already decides night; extend it to a continuous time-of-day value and let the renderer use it.
2. **Water that is alive** (bowl, later pond): surface movement, caustics on the gravel, bubbles from the gravel that wobble, a slight bend of the plant when the fish passes, a tint when the water is dirty (starving) that clears after a feed.
3. **Air that is alive** (cage, terrarium, later coop): dust motes in the light, bedding that scatters where the hamster digs, the water bottle's bubble when it drinks, the wheel that keeps spinning down after the hamster hops off.
4. **Background life**: one small second creature per habitat that is not a pet and cannot die. A snail on the bowl glass that crawls an inch an hour. A moth that circles the terrarium lamp at night. Later, a cricket in the pond, a sparrow on the coop roof. They never take attention from the pet.
5. **Decor that reacts**: the plant sways, the wheel wobbles, the bottle drips, the hideout entrance darkens when the hamster is inside.
6. **Sound hooks** only (the audio pass is a later stream): every ambient event above emits a named event the audio module can later play, with the existing `assets/audio/<species>/` layout.

Report: a recording of each habitat at morning, noon, evening and night with the pet asleep, so the environment carries the scene on its own.

---

## Step 4 — Animation quality (checkpoint 4)

1. **Full state coverage** for the fish and hamster: every state the behaviour can ask for has real frames (the hamster's `dead` is one frame today; `walk` has no turn). Add transitions where a cut shows: idle→eat, idle→sleep, turn arcs, startle.
2. **Blends, not cuts.** The sprite player (or the live rig, if the winner is B or C) crossfades or overlaps the last and first frames between states so no pop shows at any window size.
3. **Secondary motion** everywhere the pet moves: fins and tail lag the body, ears and fur settle after a stop, cheeks bounce.
4. **Weight.** A pet that lands, stops, or changes direction shows it: a small squash, a settle, a pause. Tune these per species.
5. **Registration tests** stay green: the body-box tests in `src/render/habitatArt.test.ts` must still pass after any re-render, and every new state gets its anchor measured, not guessed.

Report: a side-by-side recording of before and after for the fish and the hamster.

---

## Step 5 — Frog and chicken (checkpoint 5)

Only after steps 2 to 4 prove out on the fish and hamster, build the frog (pond, then jar) and the chicken (brooder, then coop) on the winning pipeline, with the behaviours from Blueprint §8 and the same bar for realism, environment and animation set above. The frog hunts (crickets are entities; a missed cricket escapes). The chicken lays one egg per real day alive and fed, and migrates from brooder to coop at seven days.

Report: the Phase 1 acceptance walk for all four species in the installed `.app`.

---

## How we work this

- Sammy delegates the building and judges the result on his own desktop. He does not want to read code to know whether a step landed; the recordings, screenshots and scorecards are how he checks. Make them every time.
- Describe before you build: at the start of each step, write the step's plan into `docs/DECISIONS.md` under a dated heading, then build it. When you change your mind, log that too.
- Be honest in reports. "Could not reach 60 fps, here is why" is a good report. A hidden workaround is not.
- Keep deliverables plain. No new dashboards, no new dependencies without a line in `DECISIONS.md` saying why, no jargon in the reports.
