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
- **Caustics.** An animated web (two layered sine fields, 2.7 cm and 4 cm cells) added in the
  fragment shaders of the gravel, pebbles, plants and memorial, and faintly on the fish's skin.
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

NUMBERS_PLACEHOLDER

## Shortfalls (the list from the last self-review)

SHORTFALLS_PLACEHOLDER

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
