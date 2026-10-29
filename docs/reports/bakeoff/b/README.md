# Bake-off candidate B — live 3D (three.js)

Branch `claude/bakeoff-b-live3d`. Installed as `/Applications/WebPets B.app` (bundle id
`com.sammythayer.webpets.bakeoff-b`, harness build).

## What it is

The fish bowl is no longer a stack of rendered PNGs. `assets/3d/scripts/b_export.py` takes
`wp_scene.blend`, freezes the modifiers, keeps only the outer surface of the glass, joins the 134
pebbles / 7 plant blades / stand / memorial into one mesh each with vertex colours, bakes the
gravel's procedural colour, normal and AO to 1024² textures, bakes the fish body's belly gradient to
vertex colours, and writes one GLB (`assets/live/bowl_fish.glb`, 5.1 MB, 216k triangles, no skins, no
clips). `src/render/live/scene3d.ts` loads it with GLTFLoader and draws it with three.js behind the
same `HabitatScene` interface the Pixi scene implements; `createScene` picks the live renderer for
`fish/bowl` and the Pixi layer stack for everything else. `src/sim`, `src/app`, the window, the HUD,
the tray, the dev panel, the harness and the fish behaviour are untouched: the behaviour still
produces 2D grid positions inside the water ellipse, and the renderer maps them through the bowl
camera onto the bowl's mid plane plus a slow, bounded depth wander (`camera.ts`, unit-tested
against `geometry.json`).

What is live:

- **Water.** A `MeshPhysicalMaterial` volume with transmission, ior 1.333, a 3 cm thickness and
  colour attenuation, so the fish, plants and gravel are refracted and tinted by it. Its top face
  gets a sum-of-sines normal field (four waves) that moves all the time, is the only face with a
  full specular, and has a soft-streak roughness floor. The side faces refract sharply. Death,
  starvation and the memorial are blends of the water look (colour, attenuation, roughness: a dead
  bowl fogs).
- **Glass.** Drawn twice from one mesh: the back faces are a deep teal wall below the waterline
  (what makes a transmissive volume read as water) and discarded above it, so the desktop shows
  through the empty glass; the front faces are a clearcoat Fresnel surface with additive blending
  and a Fresnel rim, reflecting a quiet studio environment (`environment.ts`: gradient dome, one
  soft window, two dim panels) built once through PMREM.
- **Caustics and depth.** An animated web (two layered sine fields, 2.7 cm and 4 cm cells) added in
  the fragment shaders of the gravel, pebbles, plants and memorial, and faintly on the fish's skin;
  the same materials absorb their albedo by depth below the waterline (red first), so the bed's
  side reads as seen through water rather than dry.
- **Light.** `daynight.ts` turns the hour and the app's eased night amount into a key / fill /
  rim / hemisphere / environment rig (the three Blender area lights' directions), warmer in the
  morning and evening, cool and dim at night. The key casts a 1024² PCF shadow (fish, plants,
  pebbles, flakes onto the gravel); the stand sits on a soft baked contact shadow.
- **Fish.** The glTF rest pose bent by a procedural spine in the vertex shader (`onBeforeCompile`
  on every fish material and on a matching depth material, so the shadow bends too): a travelling
  sine whose amplitude, frequency and wavelength come from the behaviour's speed, vertical travel,
  turning flag and state (`spine.ts`, pure, tested). The tail lags the body wave, the pectorals
  paddle, the mouth opens twice over a bite, a facing flip is a real 420 ms yaw turn through the
  camera with a bank, a dead fish rolls belly-up and rocks, a hungry one noses down and slows, a
  sleeping one barely moves. The expression gate's mood (excited / happy / curious) drives beat
  rate, fin rate and pitch.
- **Flakes and bubbles.** Instanced meshes inside the water (opaque, so the transmission sees
  them): crumbs that sink, tumble and dissolve on the same grid rules as the Pixi food, and bubbles
  with a Fresnel rim and a highlight.
- **Cursor.** The camera leans up to 2.6° toward the pointer and a small warm light follows it
  onto the glass; the existing attention / interest model still pulls the fish.
- **Quality tier.** `full` (transmission, 1024 PCF shadow) and `lite` (no transmission: the water
  is a 30 % tinted sheet over the teal wall, 512 shadow). Probed every ten seconds of real frames:
  under 45 advances/s drops to lite, a lite window at 58/s or better a minute later tries full
  again. `VITE_WEBPETS_LIVE_TIER=full|lite` pins it at build time. The transmission backbuffer is
  capped at 1000 device px wide.

Tests: `camera.test.ts` (grid ↔ world mapping, depth budget), `spine.test.ts`, `daynight.test.ts`;
the fish behaviour's own tests are unchanged. `npm test` 355 passed, `npm run typecheck` clean,
`cargo test` green.

## Numbers

All taken in the packaged `/Applications/WebPets B.app` (commit `ca526a1`, the build with the
glass-rim and bed-absorption fix), on the current Space with `document.visibilityState` visible, day,
fish fed, full tier, with candidates A and C's apps also running on the machine (A's window on the
same Space) and no Blender render in flight. The raw numbers are in `stats.json`.

| | advances/s | fps | render ms/frame |
|---|---|---|---|
| Small (scale 6, 576×456 device px) | 60 | 60 | 2.0 |
| Medium (scale 16, 1376×1056) | 60 | 60 | 1.3 |
| Large (scale 24, 2016×1536) | 60 | 60 | 1.3 |

Large holds 60 with transmission and the 1024 PCF shadow, so the quality tier stayed `full` for the
whole run; the `lite` tier exists and is probed as described above, but it was not needed on this
machine. (`renderMs` is the scene's own CPU time per frame; the GPU time is not visible to it.)

CPU and memory, Medium, `ps` over three samples 2 s apart, the three processes (webpets shell,
WebKit GPU, WebKit WebContent):

| state | CPU (share of one core) | RSS |
|---|---|---|
| shown, fish idle, 10 s after the last event | 14.3 % (2.0 + 5.9 + 6.4) | 308 MB (99 + 76 + 133) |
| shown, 1 s after a feed (fish eating, flakes falling) | 25.4 % (3.0 + 10.5 + 11.9) | 384 MB |
| hidden (harness `hide`) | 3.2 % (0.5 + 0.7 + 2.0) | 384 MB |

Against checkpoint-0's Pixi baseline (~21 % shown, ~5 % hidden, ~200 MB): about the same CPU for an
idle fish, lower when hidden, and ~110–180 MB more memory (the transmission render target, the
shadow map, the PMREM environment and the GLB's buffers). `ps` on macOS reports a decaying
average, so the shown number depends on what happened in the seconds before it.

- **Bundle:** 36.2 MB installed (`du -sk`), 23 MB for the baseline; the difference is
  `assets/live/bowl_fish.glb` (5.1 MB), three.js in the JS bundle, and the harness build.
- **Render minutes (Blender):** about 8 — two runs of `b_export.py`, each with the 1024² gravel
  colour / normal / AO bake at 32 samples (~4 min a run); nothing is rendered frame by frame in
  this candidate, so adding a habitat costs one bake, not a render.
- **Clip:** `bakeoff-20s.mp4` is the shared script at Medium, re-encoded to 688×528 (the original
  1376×1056 record was 9.3 MB).
- **Stills:** real-window captures (`screencapture -l`) with transparency. Viewers that un-premultiply
  show the glass's additive reflection as a solid white band above the waterline; that is an artefact of
  the capture, not what the compositor draws. `still-medium-on-desk.png` is the same capture composited
  over a desk grey the way macOS does it: the empty glass is a translucent sheen with a thin edge.

## Shortfalls (the list from the last self-review)

Taken from the stills above and nine frames of `bakeoff-20s.mp4` (plus four consecutive frames at
6 s), against "it has to look like Apple made it" and "someone would leave it open just to watch it".

1. **The fish is a toy, not a fish.** The glTF fish is a smooth orange body with flat lozenge fins
   and a glossy eye; there are no fin rays, no scale normal, no translucency in the fins, no
   subsurface. It moves like a fish (spine wave, tail lag, pectoral paddle, real yaw turns, noses
   down when hungry) but it does not look like one at any size. This is the largest gap and it is
   an asset problem (the export has no fin-ray or scale maps to carry) as much as a shader one.
2. **The waterline is a thick white ring.** The water's top face at grazing angle, the clearcoat on
   the glass and the meniscus stack into a bright band the width of a finger at Medium and Large.
   Real water meets glass as a thin bright line.
3. **The caustic web on the bed is still a web.** Softer and darker after the depth absorption, but
   a regular sine lattice reads as a pattern once you look at it; real caustics are sparser and
   less even. The fix is a better caustic function (a noise-warped field) rather than a strength.
4. **The big soft window reflection.** The environment's one large window shows as a blurred white
   rectangle in the water's back half, in the same place in every frame; it reads as a light leak.
5. **The eating fish sinks into the bed.** When a crumb lands near the gravel the behaviour's bite
   position puts the body at pebble height and the belly clips into the bed (frame at 8 s). The 2D
   behaviour has no notion of the bed's height; the 3D mapping needs a floor.
6. **The pointer response is barely visible.** The camera lean is 2.6° and the pointer light is
   small; in `still-hover.png` you cannot tell the cursor is at the glass. The fish's attention
   model still pulls it toward the cursor, which is the reaction a viewer would notice.
7. **Night is a relight, but a flat one.** The key goes cool and dim and the bed darkens, which is
   more than a tint, but there is no warm desk-lamp fill and the glass reflections do not change,
   so the bowl at night looks dimmed rather than lit differently.
8. **Bubbles are few and identical**, and the plants do not sway.
9. **Memory.** ~310 MB resident shown against ~200 MB for the Pixi baseline.
10. **Not verified in this session:** the lite tier's look in the packaged app (the machine held
    60 at Large, so the probe never engaged it) and the death / memorial looks (unchanged since the
    previous session's review).

## What it would take to add the hamster, frog and chicken on this pipeline

Each habitat is one more `b_export`-style script (freeze, join, bake what is procedural, export a
GLB) and one more `createXScene` behind `HabitatScene`; `createScene` already dispatches per
habitat. The hard part is not the bowl, it is the animal: this candidate's fish moves because a
travelling sine along one axis is a fish, and that trick does not extend to legs. A hamster, a frog
and a chicken each need a rig — a bone chain in Blender exported as a glTF skin (the export already
runs with `export_skins`, just off) — and a few authored clips (walk cycle, sniff, groom, stuff
cheeks, hop, peck, scratch) blended at runtime with three's `AnimationMixer`, with procedural
secondary motion (ears, cheeks, wattle) layered on top the way the fins are here. The behaviour
contract stays 2D (`PetOutput` is a grid position, facing, anim and bite), so the hamster's cage
mapping is a floor plane instead of the bowl's mid plane and its wheel is a mesh that turns with
`speciesDelta.wheelKm`. Habitat-specific effects are the same kind of shader work as the water:
dust motes in the cage's air, a pond surface for the frog (the water material as it is), straw and
a warm lamp for the coop. Budget-wise the renderer's cost is per window, not per species, so three
more habitats cost export time and animation authoring, not frame time.
