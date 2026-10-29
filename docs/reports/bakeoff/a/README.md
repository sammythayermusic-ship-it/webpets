# Bake-off candidate A — rendered ceiling

Everything canned. Blender pushed as far as its primitives go; the runtime gains one thing, an
animated layer, and otherwise stays what it was.

## What was built

**Scene** (`assets/3d/scripts/a_look.py` → `assets/3d/wp_scene-a-look.blend`, regenerated from the
untouched `wp_scene.blend` every time, never saved in place):

- Glass: Principled transmission, IOR 1.5, the solidified shell the scene already had, roughness rising
  from 0.012 on the face to 0.11 at the rim (Fresnel-driven), dispersion off.
- Water: a new mesh with the old lathe's silhouette and a dense top disc, displaced by a Clouds texture
  read through an empty that circles once per loop (±2.1 mm, 4.5 cm wavelength), transmission 1 at IOR
  1.333, an absorption volume that only shows over the full depth, a meniscus lip at the waterline.
- Caustics: a projected web. Glass, water and meniscus pass shadow rays, so the lamps light the inside
  directly; a spot above the front carries two Voronoi distance-to-edge layers that drift on closed
  circles with a sine `W` wobble, so the 96-frame loop closes with no seam. Light-linked to gravel,
  pebbles and plants. Cycles' MNEE was measured first and found at the noise floor for this camera.
- Fish: procedural Voronoi scale relief and tone on the body, subsurface, a wet coat; fin rays
  (a radial sine in each fin's own space) driving bump and transmission so the membrane lets light
  through between the rays; a coated eye with a gold iris ring and a pupil from the eye's own normal.
- Lighting: a 0.45 m key with a soft shadow, a warm rim, a cool fill, a dim bounce under the bowl, the
  bowl's key at 26 W and the fish's at 90 W (the fish is composited into the water; measured per light).
  A night rig in its own collection: a 1.4 m cool moon from behind-left, a warm desk lamp hidden from
  glossy and transmission rays (its mirror image hung in the water as a disc), a dim blue fill, a dim
  cool caustic web, a dark cool world. Rendered as its own bg / decor_front / glass plates.

**Renders** (`a_render.py` → stage, `a_finish.py` → `assets/`): the five-pass bowl (shadow, clean,
glass, near/far matte, full) by day and the three night plates, the memorial, every fish state at
24 fps (each 12 fps key plus the half-frame between, 124 frames), and the water loop: 96 frames at
24 fps by day and 96 by night, rendered only inside the glass (a border), un-composited against the
glass pass, cropped to the inside of the glass (166×164 grid px at 4x) and built three ways for measurement
(a PNG sequence, an opaque H.264 mp4 masked at runtime, an HEVC-with-alpha mov). The mov is what
ships: `water_day.mov` (1.0 MB) and `water_night.mov` (0.6 MB), decoded by VideoToolbox, alpha in
the file, still clipped by the runtime ellipse.

**Runtime** (`src/render/types.ts`, `manifest.ts`, `layers.ts`, `assets.ts`, `frameClock.ts`):
a manifest layer may be a still (`file`), a frame sequence (`frames` + `fps`, `loop`) or a `video`
(`loop`); any may carry a `region` (the grid rect a cropped layer covers; the art must still be a
whole multiple of it, derived from the texture exactly as for a full-grid layer), an ellipse `mask`
(a Graphics stencil, no intermediate target), and a `night` plate of the same kind that the scene
crossfades in by the existing night amount. A sequence plays on its own wall clock (`frameClock.ts`:
a stall lands on the frame the clock says, never replays the gap); a video is a Pixi `VideoSource`
fed from a blob URL (the packaged `tauri://` scheme does not answer the byte-range requests WebKit's
media loader wants) that re-uploads on `requestVideoFrameCallback`, and the night twin is paused
and resynced to its day twin's time whenever it is fully faded out, so only one clip decodes at a
time. Layers with a night plate skip the old blue tint (they have a real night); the pet, food and
bubbles get a mild dim so a day-lit fish does not glow in a moonlit bowl. The pet's behaviour,
the grid, the window scale, hit regions and click-through are untouched.

## How it looks, honestly (self-review at the end)

Seen in the installed app at all three sizes and in the clip (`bakeoff-20s.mp4`, frames pulled at
1, 4, 6, 8, 11, 13, 15, 17, 19 s and 0.1 s apart around 7 s):

- The bowl reads as a glass bowl on a stand: a Fresnel rim, the waterline as a bright meniscus
  ring, the stand and its contact shadow, pebbles with a wet coat, veined blades. At Large (2x
  display, 2016 px) it holds up; at Small it is a clean thumbnail.
- The water moves. The surface band and the light on the gravel drift on a 4 s loop with no
  visible seam (frame 96 → 1 differs from its neighbours by exactly as much as any adjacent pair,
  measured on the raw renders: 0.79 vs 0.84 mean |diff|). It is gentle, as a still bowl's should be.
- Night is a different light, not a tint: a cool moon from behind, the desk lamp on the stand, the
  caustic web gone blue, the fish dimmed with it. The 2 s crossfade is clean.
- The fish is lit as part of the bowl and passes behind the front plants; at 24 fps the swim loop
  no longer steps. Turns are the old mirror-flip tween.
- The first packaged build showed a solid grey ring inside the glass: Cycles keeps transmissive
  surfaces rougher than `film_transparent_roughness` (0.1) opaque under `film_transparent_glass`,
  and the rim roughness ramp reaches 0.11. Threshold lifted, glass passes re-rendered, fixed.

Where it falls short of the bar, and why it was left (see Shortfalls).

## Numbers

From `stats.json` (harness `stats` over 5 s, page visible; `top` over the three processes):

| | Small (6) | Medium (16) | Large (24) |
|---|---|---|---|
| scene advances / s | 60 | 60 | 60 |
| Pixi fps | 56 | 63 | 63 |
| render ms / frame | 0.2 | 0.0 | 0.1 |

| | CPU (share of one core) | RSS |
|---|---|---|
| shown, idle, loop playing (shipped mov) | 20.2% | 373 MB |
| hidden (Cmd+Shift+P), loop paused | 1.8% | 398 MB |
| baseline checkpoint 0 (still bowl, 12 fps fish) | ~21% | ~200 MB |

The three loop containers, same build otherwise, shown and idle at Medium:

| container | CPU shown | RSS | bundle | art |
|---|---|---|---|---|
| HEVC with alpha `.mov` (shipped) | 20.2% | 373 MB | 35 MB | 1.6 MB |
| H.264 `.mp4`, opaque, masked at runtime | 24.6% | 384 MB | 36 MB | 2.0 MB |
| PNG sequence, 2×96 frames | 17.9% | 1161 MB | 132 MB | 97 MB |

The sequence is the cheapest to draw (no decoder; one texture swap per frame) and the only one
the GPU process keeps nothing warm for, but it costs 200 textures resident and 97 MB on disk,
which is the bundle budget three times over. The mov decodes in hardware with its alpha, and is
cheaper than the mp4 whose every frame is masked through a stencil over a full-alpha quad. Shown
CPU is at the baseline, not under it: the loop is paid for by the fish at 24 fps and the decoder.
Hidden is a third of the baseline because the videos now pause with the document. RSS is up by
the 24 fps fish (124 frames at 320 px) and three night plates; the bundle is 35 MB against 23.

## Shortfalls (the list that was left when I stopped)

1. The fish is still a smooth toy: a lathe body with a procedural scale relief, rayed fins and a
   coated eye. It does not have the silhouette, the translucent fin edges or the eye of a real
   fish, and no shader change gets it there; it is geometry and a rig.
2. The caustic light on the gravel is a projected Voronoi web. It drifts and loops cleanly, but at
   Large it reads as bright lines laid on the gravel rather than light refracted through water.
   Real caustics through this bowl were measured at the noise floor at 32 samples (MNEE), and a
   softer web is another two hours of loop renders.
3. The upper half of the bowl, above the waterline, is a hazy grey: the back glass reflecting the
   bright world, with two soft blobs where the key reflects. It should be clear glass showing the
   desktop through it. The static plates would take minutes to re-render; the loop frames behind
   them, an hour each by day and night.
4. Gravel is a crazy-paving lathe and the pebbles are smarties; the plants are veined blades with
   no sway. Same answer: geometry, then an hour of loop.
5. Reaction is canned. The fish turns toward the pointer with the behaviour's attention and the
   glass sheen follows it, but it cannot bend, dart or look up: every state is a rendered loop.
   This is the ceiling of the approach, not a bug in it.
6. The mov variant was measured in the installed app but the final 20 s clip and the six stills
   were captured on the H.264 build minutes earlier (same art, same frames); when the mov build
   was up the user's screen was in use and the window reported hidden, so the re-captures came
   back empty and were discarded.

## Render minutes

57 minutes of Cycles on the M4 GPU in the two logged stages (plates, night plates, memorial and
the 124 fish frames: 32 min; the two 96-frame loops and the glass passes: 24 min; the glass redo:
under a minute), with two other candidates rendering on the same GPU at the time. The look-dev
previews of the first builder (nine rounds) were not logged; about ten minutes more.

## Rebuilding the art

```
Blender -b assets/3d/wp_scene.blend -P assets/3d/scripts/a_look.py        # -> wp_scene-a-look.blend
Blender -b assets/3d/wp_scene-a-look.blend -P assets/3d/scripts/a_render.py -- <stage> plates,night,memorial,fish,glass,loop,nloop
python3 assets/3d/scripts/a_finish.py <stage> assets --loop mov
```
`measure.sh <label>` prints the CPU/RSS sample used in `stats.json`.

## What it would take to add the hamster, frog and chicken on this pipeline

Each habitat is the same recipe with different geometry: a `a_look`-style script that gives the
existing primitives real materials and a night rig, `a_render` passes for its plates (the cage and
terrarium already have the shadow/clean/front split from `wp_render2.py`), and one ambient loop per
habitat (dust in the cage light, the pond surface and its caustic web for the frog, straw and a
light shaft for the coop) through the same animated-layer kind, so the runtime needs nothing new.
The pet itself is the expensive part: every state at 24 fps is 2x the frames of today, and a species
with more states (the hamster's errands, the frog's hunt, the chicken's egg) multiplies that, at
~3–4 s a 320 px frame; a new body is geometry work in Blender, not a shader change. The frog and the
chicken do not exist in the scene yet, so for them the cost is the model and rig first, then the
rest is the recipe. What does not scale on this pipeline is reaction: anything the pet does that is
not a canned state (looking at the cursor, a bend through a turn) needs a rendered state for it, or
a runtime trick on top of the frames.
