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
glass pass, cropped to the inside of the glass (166×164 grid px at 4x) and delivered three ways for
measurement: a PNG sequence, an opaque H.264 mp4, an HEVC-with-alpha mov.

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

_filled in below after the last recording_

## Numbers

_filled in from stats.json_

## Shortfalls (the list that was left when I stopped)

_filled in below_

## Render minutes

_filled in_

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
