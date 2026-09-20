# The 3D source

`wp_scene.blend` is the scene the shipped fish and bowl art is rendered from: the fish
(body, tail, dorsal / anal / two pectoral fins, eyes, glints, mouth, a two-bone rig) and
the bowl (glass, water) with a delivery camera for each — `CAM_fish` and `CAM_bowl`.

## Why this is here now, and was not before

It nearly wasn't. The rendered PNGs under `assets/sprites/fish/` and `assets/habitats/`
have always been in the repo, but the *editable* source was not: it lived in a live
Blender session and then, when that closed, in one copy inside a session scratchpad under
`/private/tmp`, which is temporary storage that gets cleared. The original build commands
did not survive in the session transcript either — they were compacted away — so when the
fish needed two small geometry fixes there was, for a while, nothing to fix.

The file was recovered from that scratchpad before it was lost. **Anything that can only
be rebuilt by hand belongs in the repo**, and a render is not a source.

## The pipeline, under `scripts/`

| script | what it does |
|---|---|
| `wp_build.py` | geometry helpers: lathes, the tapered lofted body, ribbon and fan fins, the toy material, belly gradient, render + alpha stats |
| `wp_render2.py` | renders the layered bowl and all eight fish states — `blender -b wp_scene.blend -P wp_render2.py -- <out> <jobs> <samples>` |
| `wp_render.py` | the earlier single-pass renderer, kept because it is the simpler thing to read first |
| `geom.py` | projects real mesh vertices through the delivery cameras. Every number in `geometry.json` comes from geometry, never from measuring rendered pixels |
| `merge_geom.py` | merges those projections with the pixel-measured body boxes into the delivered `geometry.json` |
| `finish.py`, `finish2.py` | post: isolates the contact shadow and re-lays it with an elliptical falloff, then verifies the eight states |
| `resave.py` | `blender -b <in> -P resave.py -- <out>` — save a copy without touching the original |

## Known flaws, still to fix

Both are geometry, both need Blender open with the plugin connected:

- **The tail's swallowtail notch** is rounded away by the subdivision surface — the fork
  reads as a paddle. Needs supporting loops or edge creases either side of the notch.
- **The pectoral fins** (`HERO_fish_fin_pec_l` / `_r`) read as a nub in profile. They need
  to be broader and angled so they have a silhouette side-on.

After either change: re-render all 62 frames across the 8 states, re-derive the per-state
anchors, and update `assets/manifest.json`. The two registration tests in
`src/render/habitatArt.test.ts` measure the body box across every frame and will catch an
anchor that moved.

## Rules for working in here

- **Never save over a `.blend` in place.** `resave.py` writes a copy; checkpoints are
  timestamped.
- **No paid generation.** Nothing from `bl_generate_*` or `bl_image_to_3d`. The whole scene
  is built from primitives and code, at zero credits, and stays that way.
- Writes stay under `assets/`.
