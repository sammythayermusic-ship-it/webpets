# Checkpoint B — a real goldfish

Date: 2026-10-30. Brief: `docs/AFTER-BAKEOFF.md`, Step B.

## What to look at first
- `checkpoint-B/compare-day.jpg`, `compare-feeding.jpg`, `compare-night.jpg`: the bake-off's C stills
  on the left and today's on the right, both over the same striped backdrop, so you can see where
  the bowl is see-through.
- `checkpoint-B/clip-bakeoff-script-20s.mp4`: the same 20-second script as the bake-off (idle, you
  arrive, feed, hungry, night, you leave). Put it next to `bakeoff/c/bakeoff-20s.mp4`.
- `checkpoint-B/clip-tap.mp4`: two knocks on the glass.
- `checkpoint-B/goldfish-closeup.jpg` and `goldfish-head.jpg`: the fish up close.
- `checkpoint-B/still-window-large.png`: the installed app's real window at Large, captured on
  your desktop with its transparency.

All of it was recorded in the installed app (the harness build of today's code), at Medium unless
it says Large.

## The fish
It's a new goldfish, built entirely from code. The toy fish with the cartoon eye is gone.
- A common goldfish's shape: deepest about 40% back from the snout, a narrow tail stalk, a
  blunt head, a small mouth at the front of the snout, and a forked tail a little longer than a
  common goldfish's. It has the full fin set: a long dorsal, the tail, the anal fin, and paired
  pelvic fins (new) and pectoral fins. 13,500 points, against 11,700 for the toy, which spent most
  of its points smoothing a simple shape. The detail is now in the shape itself and in the maps.
- **Scales** in rows that follow the body and get smaller toward the tail. Each scale overlaps the
  next, with the free edge toward the tail like a real fish, and the edges are a little darker,
  which gives goldfish their net-like pattern. There's a row of pores along the lateral line, a
  gill cover with a lip, nostrils, and an eye socket.
- **Fins** with rays that fork toward the edge, a thin membrane between them that glows when light
  is behind it, and pale tips. The fins now flutter from where they join the body.
- **A real eye**: black pupil, gold iris, a dark rim, under a clear coat that catches a moving
  highlight.
- **Wet, glossy skin**, scales that glint a little as the fish turns, and a warm glow where the body
  is thin and turns away from you.
- Candidate A's Blender look (the scale relief, fin rays and gold-ringed eye) is now baked into
  maps the live layer can read. The maps take about a second to regenerate, so the look can be
  tuned quickly.

## The water and the bowl
- **You can see through the bowl.** Above the water the desk shows through both walls of glass.
  Through the water it shows faintly where nothing is behind it, tinted blue; the water stays C's
  blue. The gravel, plants, fish and surface stay solid. Clicking still works exactly as before:
  the area that catches clicks didn't move by a pixel.
- **Ripples that travel.** Wave bands cross the surface with glints riding on them, and faint light
  bands move down through the water with them.
- **A tap ring.** Knock on the glass and a ring runs out through the water from that spot and fades
  within about two seconds. The fish still startles.
- **Flakes and bubbles inside the water.** They're drawn where the water bends and tints them like
  the fish. Bubbles rise at different depths, some in front of the fish and some behind it.
- **Caustics that aren't even.** The light web gathers into brighter patches that drift.
- Removed a fine grain that had been sitting over the water since the bake-off. It came from the
  front-glass render.
- Still colourful: same gravel, plants and blue water.

## Numbers (installed app)
| | bake-off C | Step B |
|---|---|---|
| updates per second, Medium / Large | 60 / 60 | 60 / 60 |
| drawing time per frame | 0.6–0.8 ms | 1.7 ms |
| app size | 26 MB | 25 MB |

The fish and water cost about twice as much to draw, still a small fraction of a frame. The app
got smaller because about 4 MB of Blender source files were being packed into it by mistake (fixed
in Step A).

## What I'm unsure about
- **Up close, the head is smoother than the scaled body**, and the gill cover's edge is a firm
  line. At the sizes the app shows it reads as a gill cover; in the close-up it looks a bit
  plastic.
- **The fish looks redder in the bowl than in the close-up**, because the water takes some blue
  and green out of everything behind it. It's still clearly a goldfish; say if you'd like it
  more yellow-orange.
- **How much desk shows through the water** is a judgement call. I kept it modest so the water
  stays blue. It's one number to change.
- In the feeding still the flakes have already sunk behind the near plants. In the clip you can
  see them at the surface just after the feed.
- Speech bubbles aren't in these captures (they sit on top of the canvas the harness records). The
  bake-off's C feeding still had one.
- The fish swims the way it did. Swimming like a real goldfish is Step C.

## Things that happened on the way
- **iCloud kept evicting files mid-step**: first 3,300 build files, later about 200 sources. Tests
  then fail by timing out. I moved the build cache out of iCloud (`~/.cache/webpets/target`) and
  re-downloaded the rest. The real fix is still yours (`NEEDS-SAMMY.md`).
- **The browser test suite was running WebGL in software**, about 1 frame a second, so after the
  new fish every test timed out. It now uses the Mac's GPU, the same path as the app. All 5 pass,
  and the suite takes 39 seconds instead of about 5 minutes.
- **Tests**: 422 unit tests, the Rust tests, and the 5 browser tests all pass.

## Next: Step C, swims like a real goldfish
Hovering with the pectoral fins sculling, slow cruising laps, darts for food, picking at the
gravel and spitting out a pebble, gulping at the surface, turning to look at you and following the
cursor along the glass, resting low and slow at night, fins folded when sad and spread when
excited.
