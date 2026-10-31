# Checkpoint B, after your notes

Date: 2026-10-31. Your notes: a smaller fish with more room to swim, feeding that is more
interactive and exciting, and cuter while staying realistic.

## What to look at
- `checkpoint-B-notes/clip-feeding-by-click.mp4`: two pinches of food dropped by clicking over the
  water, first left, then right.
- `checkpoint-B-notes/compare-fish.jpg`: yesterday's goldfish next to today's, close up.
- `checkpoint-B-notes/compare-size.jpg`: the same bowl at the same window size, before and after.
- `checkpoint-B-notes/goldfish-face.jpg`: the new face.
- `checkpoint-B-notes/still-feeding-large.png`: snapping a flake at the surface, at Large. It's in
  the evening light because the app follows your clock.
- `checkpoint-B-notes/clip-bakeoff-script-20s.mp4`: the usual 20-second script, for continuity.

## Cuter, still a real goldfish
The scales, wet skin and real eye are unchanged. What changed is the proportions, which is most of
what "cute" is:
- a rounder, egg-shaped body, more like a fantail goldfish than a common one
- a bigger head with a short, blunt snout
- a larger eye with a big black pupil
- a broad, flowing tail with rounded lobes
- a tall, rounded fin on its back
- a mouth line that turns up a little at the corner, which real goldfish have
- warmer orange over a cream belly
- softer scale edges, and the gill cover no longer reads as a separate helmet

## Smaller, with more room
The fish is about three quarters of its old length. The space it keeps to grew to match: it has 14 px
more room to swim across the bowl and 14 px more top to bottom (7 px closer to each side, the
surface and the gravel).

## Feeding
- **Click over the open water at the top of the bowl to drop a pinch of food right there.** The
  cursor turns into a hand over that area. A click anywhere else on the bowl is still a knock on
  the glass. A double click only spends one meal.
- The Feed button and the tray menu still work, and now drop the pinch just in front of the fish.
- **The food** comes in five colours. It lands with a ring across the surface and a fizz of tiny
  bubbles, floats for a second or two, then tumbles slowly down.
- **The fish** turns toward the food and darts for it, then snaps each flake with its mouth, puffing
  a few bubbles from its gills each time. Before, it ate anything that touched its side.
- **When it's finished**, it does a quick, excited lap of the bowl. If it didn't eat anything, it
  doesn't celebrate.

## Checked
Installed app: 60 frames a second at Medium and Large, about 1.1 ms of drawing per frame. Tests: 428
unit tests, the Rust tests and the 5 browser tests all pass.

## Worth knowing
- The old bitmap fish (only shown if the 3D layer ever fails to start) is now drawn at the new size
  too. It's still the old toy look.
- iCloud evicted about 5,500 files again overnight, mostly the project's downloaded libraries. I
  reinstalled them in seconds; it's the same open item in `NEEDS-SAMMY.md`.
