# Checkpoint A — C is locked in

Date: 2026-10-30. Brief: `docs/AFTER-BAKEOFF.md`, Step A.

## What was merged
- **`main` is now the base** for everything after the bake-off. Most of the merging had already
  happened on Oct 28: the phase branch had taken in C (the hybrid) on top of the health check,
  the test harness, the needs model (energy, curiosity, comfort, stress), the attention events
  (you arriving, a tap on the glass, a meal) and the motion primitives (arcs, darts, turns with
  weight). It had also started the next two steps: a fish that picks where to swim from its needs,
  a hamster driven the same way, and dawn and dusk versions of the bowl's lighting. `main` had
  nothing newer, so it simply moves forward to include all of it. Nothing was rebased and no
  history was rewritten.
- Checked that nothing from Oct 28 was lost: all of C is in, and the only conflict on Oct 28 was
  the decision log, with both sides kept.
- Two small fixes on the way in. The newest commit did not pass the type check (the tray icon's
  drawing code had not been told about the new time-of-day lighting). And the Blender source files
  (about 4 MB) were being copied into every app build for no reason; they are left out now.
- Your two brief files are in the repo. `PHASE-NEXT.md` existed in a shorter Oct 28 version; your
  longer one replaces it. The two things only the short one said still stand: the "looks like Apple
  made it" bar and the iPhone step.
- The test harness gained one command, `newPet`. Its fish had died in an Oct 28 test, and the
  first clips came out with a belly-up fish.

## What was kept as reference
In `assets/reference/` (not shipped in the app; a README explains each file):
- **From A:** the Blender script that gave its fish real scales, fins with rays that let light
  through, a soft glow at the thin edges, a wet coat and an eye with a gold ring. The scene file it
  produced is there too, with two of A's rendered fish frames to match or beat. This is the
  starting point for Step B.
- **From B:** the code for its moving water surface, its see-through glass and back wall, and its
  food flakes and bubbles drawn as real objects inside the water.
- All three bake-off branches are still on GitHub, untouched.

## Disk
- The A, B and C build folders (~5 GB) had already been deleted on Oct 29.
- This step retired the A and B worktrees (the copies of the project used during the bake-off).
  Permanent deletes are blocked for me, so I moved them **to the Trash: 710 MB, freed when you
  empty it**.
- The disk is still at **97%, about 13 GB free**. Building here needed one fresh copy of the build
  cache. `docs/NEEDS-SAMMY.md` lists what else you can free, the biggest being 5.4 GB of
  September build files in your own `~/Desktop/webpets` folder.
- `WebPets A.app`, `WebPets B.app` and `WebPets C.app` are still installed, as asked.

## Checked in the installed app
All tests pass: 422 unit tests, the Rust tests and the 5 end-to-end runs. The app was built and
installed as `/Applications/WebPets.app`, and it boots on screen at 60 frames a second.

The evidence comes from the harness build, which is the same app with remote control added, on
your desktop at Medium size:
- `still-window-on-desktop.png`: the real window, captured on your desktop.
- `still-day.png`, `still-feeding.png`, `still-night.png`.
- `clip-bakeoff-script-20s.mp4`: the same 20-second script as the bake-off (idle, you arrive, feed,
  hungry, night). Put it next to `docs/reports/bakeoff/c/bakeoff-20s.mp4`.
- `clip-fish-day-30s.mp4`: the step-2 fish (a calm, "zen" one) greets you after an absence,
  startles at a tap, eats, and is left alone.
- `stats-medium.json`: 60 updates a second, about 1 ms of drawing per frame.

What it looks like now is C, as you picked it. The fish is still the toy fish; Step B replaces it.

## Things you should know
- **Your own pet, Bubbles, died** on Oct 29 while `WebPets.app` was not running. The clock never
  stops, and Bubbles ran out of food. The new build opened on the "While you were gone" card.
  I have not touched it: dismissing it, and adopting a new pet, are yours to do.
- Google Drive's window showed it trying to upload build files from this project (`lib-thiserror`,
  `invoked.timestamp`), with 264 errors. If Drive backs up your Desktop, it is trying to back up the
  build cache too. Logged in `NEEDS-SAMMY.md`.
- I switch to your desktop Space to capture the pet, and only when the Mac has been idle for a
  couple of minutes. Once today, Spaces had been reordered and the switch landed on your Gmail
  Space for about a minute. It is fixed: the script now checks that the pet is on screen before
  capturing, and afterwards puts back whatever app was in front.

## Next: Step B, a real goldfish
The live fish gets rebuilt from A's materials, baked into maps: scales, fins with rays, glow at
the edges, a real eye, and more body detail. Then C's own gaps: ripples you can see moving, glass
you can see through, flakes and bubbles inside the water, a tap ripple, and less even caustics.
The bowl stays colourful.
