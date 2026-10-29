# Bake-off — three renderings of the fish bowl (2026-10-28)

Same simulation, same window, same harness, same 20-second script (`tools/bakeoff/script.json`:
idle, pointer at the glass, feed, eat, hungry, night, pointer leaves). Each candidate was built on
its own branch by its own agent, installed under its own bundle id, and measured with the harness.
The branches are kept: `claude/bakeoff-a-rendered`, `claude/bakeoff-b-live3d`, `claude/bakeoff-c-hybrid`.
Each candidate's own report, stills, clip and `stats.json` are under `docs/reports/bakeoff/<a|b|c>/`
(A and B: a compact copy; the full sets are on their branches).

## The three

- **A, rendered ceiling.** Everything canned from Blender: Cycles plates with real glass and a baked
  caustic web, day and night plate sets, the fish re-rendered at 24 fps, and a 96-frame water loop
  shipped as HEVC-with-alpha video. New runtime: an animated-layer kind in the manifest.
- **B, live 3D.** The bowl and the fish exported to glTF and drawn by three.js: physical
  transmission water with a rippling surface, a see-through glass with Fresnel, projected caustics, a
  day/night light rig, a procedural spine, camera lean toward the cursor, a quality tier switch.
- **C, hybrid.** Cycles plates for what holds still (stand, bowl body, gravel, plants, the front
  glass, each with a night variant), a live three.js layer for what moves (fish with a procedural
  spine, a water pass with depth tint, ripple refraction and caustics), both drawn into one WebGL2
  context on one canvas.

## Scorecard (by eye, 1–5) and numbers

| | looks alive | water looks like water | fish looks like a fish | reacts to me | I would show this | advances/s S/M/L | CPU shown (idle, Medium) | hidden | RSS | bundle | render min |
|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline (checkpoint 0) | 2 | 2 | 2 | 2 | 2 | 60/60/60 | 21% | 5% | 200 MB | 23 MB | — |
| **A** rendered | 2 | 4 | 4 | 2 | 3 | 60/60/60 | 20% | 2% | 373 MB | 35 MB | 57 |
| **B** live 3D | 4 | 3 | 2 | 3 | 3 | 60/60/60 | 14% | 3% | 308 MB | 36 MB | 8 (bakes) |
| **C** hybrid | 4 | 3 | 3 | 3 | 4 | 60/60/60 | 22% (16% by `top`) | 2–3% | 275 MB | 26 MB | 2 |

CPU is the three processes (shell, WebContent, GPU) as a share of one core; the builders used
slightly different sampling, all noted in their reports. Every candidate held 60 advances/s at every
size at its full quality tier.

What decided each score:

- **A** has the best stills: the glass refracts, the fish has rayed fins and a coated eye, the
  caustic loop never seams. But it is canned to the bone: the fish still flips by mirroring, cannot
  bend or look up, and the water surface is a plate; the clip reads as a very good screensaver. The
  upper bowl is a hazy grey rather than clear glass. Cost is at the baseline, memory doubled.
- **B** is the most reactive and the only one whose bowl is actually see-through (the desk shows
  through the empty top half) with a surface that visibly ripples. Its fish is a smooth toy, the
  waterline is a thick white ring, caustics are a regular lattice. Cheapest CPU.
- **C** reads as inside-a-real-bowl at every size, the fish yaws through real turns and the bed is
  lit by moving caustics; night is a different light, not a tint. Its water surface is a flat band
  and the back wall is lit water, not the room. Lightest memory and bundle.

## Decision

**C wins, and the mainline continues on it.** It is the only candidate that is both alive and
believable, it costs the least in memory and bundle, and — the deciding point — its shape can absorb
the two things the others do better without changing architecture: A's plate quality (the plates are
already Cycles renders) and B's live water surface and see-through glass (the water pass and the
glass plate are the two places that change). A cannot get motion without becoming C; B cannot get
A's material quality without hours of real-time shader work per material.

What C takes from the others first, in step 3 (environments) and step 4 (animation):
1. B's water surface: a real rippling surface with its own normals in the live pass, and the front
   glass plate re-rendered with a transparent film so the room shows through the empty bowl.
2. A's plate look: the caustic web from Cycles as a baked, looping texture on the gravel plate rather
   than a noise web, and A's rim/thickness glass settings for the plates.
3. B's fish spine parameters (bank through a turn, mouth over a bite) merged with C's, and a real
   fish asset (scale normal map, fin rays, subsurface) for both: every candidate's largest shortfall
   is the same toy fish, which is an asset problem no renderer solves.

## What it would take to add the hamster, frog and chicken (C's pipeline)
Two Blender scripts per habitat (plates with a night variant; the cage and terrarium already have
plates) and one live module per species: a glTF of the hero mesh and a small procedural rig — a gait
for the hamster, a crouch/leap blend for the frog, a neck bob and wing flap for the chicken — plus
habitat effects in the live layer (dust in the cage's air, a pond surface for the frog that is this
water pass with a different clip, a warm lamp for the coop). The behaviour stays 2D for all of them.

## Process notes
All three builders were cut off by usage limits three times and resumed from their branches; nothing
was lost because every step was committed. The repo lives in iCloud Drive and macOS evicted files
during the builds (see `docs/NEEDS-SAMMY.md`), which cost the builders hours of stalls.
