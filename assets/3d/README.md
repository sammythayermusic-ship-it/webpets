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

Both need Blender open with the plugin connected.

### The tail fork vanishes in most poses — and it is NOT the subdivision surface

The first diagnosis was that the swallowtail notch was being rounded away by the level-2
subsurf, and that creasing the notch would fix it. **That is wrong, and creasing would have
been wasted work.** Measured off the shipped frames:

| state | fork depth (px) | tail height (px) | reads as |
|---|---|---|---|
| `dead` | 9–11 | 104–112 | a clean swallowtail |
| `idle` | 5–10 | 98–112 | a shallow dimple |
| `hungry` | 3–4 | 87–95 | a rounded paddle |

The `dead` frames prove the notch is real, well-formed geometry — subsurf has not eaten it.
And across all 26 frames measured, **fork depth correlates +0.84 with the tail's projected
height**. The fork dies exactly when the fin foreshortens. Subsurf would smooth the notch in
every pose regardless of angle; it could not produce that correlation.

So the cause is that the tail is a **flat fan in a side-on orthographic view**: when the rig
swings it, the fin plane turns away from `CAM_fish` and the notch collapses along with the
fin's height. Candidate fixes, in the order worth trying:

1. Give the fin curvature or dihedral so it never presents perfectly edge-on — a real
   caudal fin is not a flat card.
2. Deepen the notch in the outline so what survives the foreshortening still reads.
3. Reduce the tail's roll in the rig through the swing.

### The pectoral fins read as a nub

`HERO_fish_fin_pec_l` / `_r` are small in the normal side pose but show as a proper
triangular fin in the belly-up `dead` frames — **the same signature as the tail**, so the
same flat-fan-seen-edge-on cause is the first hypothesis to test, not a separate problem.
Verify against the rig before reshaping.

### The lesson

Both flaws were described from memory as mesh problems. Ten minutes of measuring the frames
already in the repo said otherwise. Measure before opening Blender.

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
