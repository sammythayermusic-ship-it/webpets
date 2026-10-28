# Bake-off candidate C — hybrid (plates + live layer)

Branch `claude/bakeoff-c-hybrid`. App `WebPets C.app` (bundle id `com.sammythayer.webpets.bakeoff-c`).

## What it is

Blender plates for what holds still, a live Three.js layer for what moves, both drawn into **one
WebGL2 context on one canvas**:

- **Plates** (`assets/3d/scripts/c_plates.py` + `c_finish.py`): the stand, bowl body with the back half
  of the glass, gravel, pebbles and plants (`bg`), the near halves of the pebbles and plants
  (`decor_front`), and the front glass with its reflections (`glass`) — rendered with the water body
  and the fish absent, Cycles on Metal, 32 samples + denoise, caustics on. Each plate has a `_night`
  variant under a moonlit rig (cool key, violet fill, cyan rim, bounce card). The manifest's `night`
  field on a layer crossfades the two by the night amount; a layer with a night render is never tinted.
  A fourth render, `c_contents.py`, is a mask of where the bowl's *things* are, with the glass hidden.
- **Live layer** (`src/render/live/`): the fish, exported from `wp_scene.blend` as glTF
  (`c_export.py`, the one-subdivision `fish-lite.glb` ships as `assets/live/fish.glb`, 0.5 MB), bent
  by a procedural spine in the vertex shader (`spine.ts` is pure and tested: travelling wave driven by
  the behaviour's speed, body curl and bank through a yaw turn, nose pitch along the travel direction,
  belly-up roll when dead, slow sway asleep/hungry, mouth gape on eat and idle gulps; fins and tail
  flutter with a lag behind the beat). The 2D grid position is placed on a camera ray through the
  bowl camera's orthographic projection (`mapping.ts`, pure and tested against `geometry.json`), at
  a slow depth wander that never moves it on screen. Facing flips are real yaw turns.
- **Water** is one full-canvas fragment pass between the back plates and the front glass. Per pixel
  in grid units it: clips to the inner glass ellipse and the waterline ellipse (both following the
  glass's pointer parallax), applies a mild lens plus animated ripple normals to the bg plate, the
  near decor and the fish render target alike, weights the plate by the contents mask (lit water
  where there is only back wall), absorbs by depth, adds caustic threads on the bed, in-scatter and
  slow light shafts, composites the fish (tinted by its depth), then the near decor over it, then the
  surface band (room reflection, ripple glints), the meniscus and a Fresnel rim. The pointer at the
  glass is a standing dimple in the ripple field. Night interpolates every colour and the Three light
  rig (key, fill, rim, hemisphere, environment) by the same night amount the plates crossfade with.
- **Composition**: Pixi draws the back half of the layer stack (clear) → Three resets its state and
  draws (fish into a 4× MSAA render target, water pass into the canvas) → Pixi resets its state and
  draws the front half (pantry, food flakes, bubbles, glass, fog) without clearing. One canvas, so the
  harness's `record`/`snapshot`, the transparent window and the click-through hit regions are exactly
  as before. The stacked-canvases fallback was not needed.
- **Quality tier**: the scene measures the frame cost and drops the live layer to `lean` (fish target
  at half resolution, shafts and caustics dimmed) above 9 ms averaged, back to `full` under 4 ms.

Behaviour, sim, window geometry, HUD, tray, dev panel and harness are untouched. The fish sprite
player still exists and is simply hidden for a live habitat.

## What it would take to add the hamster, frog and chicken

The pipeline is two scripts per habitat and one live module per species. Plates: `c_plates.py`
generalises to any habitat in `wp_scene.blend` (hide the things that move, five passes, a night
rig); the cage and terrarium already have plates, they would need the night variant (~1 minute of
render each). Live: each species needs a glTF export of its hero mesh and its own small module
with the equivalent of `spine.ts` — a hamster is a spine plus four legs and cheeks (a procedural
gait, not a travelling wave), a frog is a crouch/leap pose blend with a throat, a chicken a neck bob
and wing flaps. None of them needs the water pass; the hamster needs dust in the air and the
frog a pond, which is this water pass with a different clip shape and no front glass. The scene
already routes by `live.kind`, so each is one new case. The behaviour stays 2D for all of them; the
mapping module maps grid positions to a floor plane instead of a water plane.

## Numbers (`stats.json`, taken with the Blender renders finished; the other two candidates were building on the same machine)

| size | advances/s | Pixi fps | draw ms | tier |
|---|---|---|---|---|
| Small (6) | 60 | 56 | 0.6 | full |
| Medium (16) | 60 | 63 | 0.6 | full |
| Large (24) | 60 | 56 | 0.8 | full |

The draw cost is the CPU side of the frame (Pixi back half, Three fish target + water pass, Pixi
front half); the GPU side is not visible to the app, but 60 advances/s at Large says it keeps up.
The `lean` tier (fish target at half resolution) never engaged.

| | CPU, `ps` lifetime average (baseline's method) | CPU, `top` over 2 s intervals | RSS |
|---|---|---|---|
| shown, Medium, idle fish | 22% of a core (3 processes) | 16% | 275 MB (`ps`, three processes) |
| hidden (Cmd+Shift+P) | 2% | 3% | 276 MB |

Baseline (checkpoint 0): 21% shown, 5% hidden, ~200 MB, bundle 23 MB.
Bundle: **26 MB** (`three` adds ~0.7 MB to the JS, the fish glTF 0.5 MB, the night plates and the
mask ~2.2 MB of PNG).
Blender render time for the committed scripts: **about 2 minutes** (`c_plates.py`: three variants ×
four bowl-size passes at 32 samples, ~9 s each; `c_contents.py`: ~20 s). Exploratory renders by the
session that was cut off were not logged.

## Clip

`bakeoff-20s.mp4` is `tools/bakeoff/script.json` at Medium through the harness: idle, pointer at
the glass (3 s), feed (5 s), hungry (10 s), night (14 s), pointer leaves (18 s). Recorded at
1376×1056 H.264 (10.4 MB), re-encoded to 688 px wide at crf 26 as the brief asks.

## Stills

`still-small.png`, `still-medium.png`, `still-large.png` (real window, `screencapture -l`, transparent
background), `still-night.png` (night on, Medium), `still-hover.png` (pointer at the glass, Medium),
`still-feed.png` (1.3 s after feed, with the speech bubble). The Small still happens to catch the fish
nose-first against the glass, the "close to the glass" case: it stays inside the water's lens and
the rim's Fresnel edge, nothing pastes on.

## Shortfalls, last self-review (honest)

1. The water surface is a band with a room reflection and glints, not a surface with visible
   ripples crossing it; from the camera's 9° it reads as a light-blue sheet. A real surface mesh with
   its own normals would fix it; the pass is screen-space by design.
2. The water behind the fish has no view of the desk: the empty-bowl plate is opaque, so the back
   wall is lit water rather than the room seen through two walls of glass. A see-through bowl would
   need the bg plate to carry transparency where the glass is bare, which means re-rendering the
   plate with a transparent-glass film and letting the water pass output alpha there.
3. The fish is one subdivision level and smooth-shaded: a good cartoon goldfish, not a photographed
   one. Scales are a subtle procedural pattern; there is no scale normal map and no subsurface.
4. Fins are translucent and flutter behind the beat, but they are the exported stiff meshes bent by
   a formula: no membrane folds, no fin rays catching light individually.
5. The food flakes and bubbles are still Pixi sprites drawn above the water pass, so they are not
   refracted and not tinted by depth; at Medium this is hard to see, at Large a careful eye catches
   that the flakes are sharper than the fish.
6. The pointer dimple in the ripple field is a standing ring; it does not expand or decay like a
   real tap, and the HUD does not appear in the harness-driven hover still (the HUD follows real
   mouse events, the harness only moves the scene's pointer — true for every candidate).
7. Caustics are a noise web, convincing at Medium, a little regular at Large; and they do not
   respond to the fish's shadow.
8. Two Vitest tests flaked once under the three-way build load (342/342 on every re-run); the
   commit that carried the flake is `712a7e2`.

## Reproducing

```
# plates (never saves the .blend)
Blender -b assets/3d/wp_scene.blend -P assets/3d/scripts/c_plates.py -- /tmp/wp3d-c day,night,memorial 32
python3 assets/3d/scripts/c_finish.py /tmp/wp3d-c assets/habitats/fish/bowl
Blender -b assets/3d/wp_scene.blend -P assets/3d/scripts/c_contents.py -- assets/habitats/fish/bowl/contents.png 16
Blender -b assets/3d/wp_scene.blend -P assets/3d/scripts/c_export.py -- assets/3d/export   # then cp fish-lite.glb assets/live/fish.glb
# app
VITE_WEBPETS_HARNESS=1 npx tauri build --bundles app --features harness --config '{"identifier":"com.sammythayer.webpets.bakeoff-c","productName":"WebPets C"}'
```
