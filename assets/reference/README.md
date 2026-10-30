# Reference only

Nothing in the app reads this folder, and `vite.config.ts` strips it from the build. It holds work
kept to learn from, not to run.

## `habitats-hires/`
The 1024 px concept renders of the eight habitats from the first art round.

## `bakeoff-a/` — candidate A's fish look (reference for Step B)
Candidate A (the rendered ceiling) lost the bake-off for having no life, but its fish materials are
the best of the three and Step B of `docs/AFTER-BAKEOFF.md` bakes them into maps the live fish can
use. Copied from `claude/bakeoff-a-rendered` at `3e86d51`; the branch keeps the full history,
renders and evidence.

- `scripts/a_look.py` — the look pass over `wp_scene.blend`. The fish part is `fish_body_look`
  (Voronoi scale relief, ~4 mm cells, each scale's edge 7% darker, subsurface up, a wet coat),
  `fish_fin_look` (rays as `sin(N * atan2)` in each fin's own space, driving bump and transmission
  so light comes through between the rays) and `fish_eye_look` (dark pupil and gold iris ring from
  the eye's own normal, under a sharp clear coat). The glass, water, caustic gobo and night rig are
  there too.
- `scripts/a_common.py`, `a_render.py`, `a_finish.py`, `a_preview.py`, `a_diag_*.py` — the render
  and measurement scripts that go with it. They expect to sit in `assets/3d/scripts/`; copy one
  back there to run it.
- `wp_scene-a-look.blend` — the scene as `a_look.py` wrote it, so the materials can be opened and
  inspected without re-running the script.
- `fish-idle-frame.png`, `fish-happy-frame.png` — two of A's rendered fish frames (320 px), the look
  to match or beat.

A's stills and clip are in `docs/reports/bakeoff/a/`.

## `bakeoff-b/` — candidate B's water surface and glass (reference for Step B)
Candidate B (all live 3D) lost for a toy-looking bowl, but it had the most life, and two of its
ideas are what C's water pass is missing. Copied from `claude/bakeoff-b-live3d` at `0fe6318`; the
branch keeps everything else. These `.ts` files are outside `src/` on purpose: they do not compile
against the mainline and are not meant to.

- `live/materials.ts` — the water as a `MeshPhysicalMaterial` patched with `onBeforeCompile`:
  `GLSL_WATER_NORMAL` (moving surface normals from drifting sines, so ripples cross the surface),
  `createWaterMaterial` (real transmission in the `full` tier, a tinted reflecting surface in
  `lite`), depth absorption that takes red first, `createGlassBackMaterial` (a far wall that is
  deep teal below the waterline and see-through above it) and the near glass as reflection only.
  The projected caustic web (`glslCaustic*`) and the spine bend are here too.
- `live/scene3d.ts` — how those materials are wired: the quality tier, the day/night water look,
  flakes and bubbles as real objects inside the water (`flakes3d.ts`, `bubbles3d.ts`).
- `live/fish.ts`, `spine.ts`, `camera.ts`, `daynight.ts`, `environment.ts` — the rest of B's live
  scene, for comparison with C's `src/render/live/`.
- `scripts/b_export.py` — the glTF export of the bowl and fish from `wp_scene.blend`.

B's stills and clip are in `docs/reports/bakeoff/b/`.
