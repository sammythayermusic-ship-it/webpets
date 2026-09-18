# WebPets — CLAUDE.md

Read `WEBPETS-BLUEPRINT.md` first. It is the full spec. Follow it in phase order and stop for review at the end of each phase.

## What this repo is
A Tauri 2 + Vite + TypeScript + PixiJS desktop pet. A pixel-art habitat (fish bowl, hamster cage, frog pond, chicken coop) floats in the corner of the screen. The pet gets hungry on a clock that never pauses, eats when fed with $FEED, and dies if neglected. Phase 0 is fully local (no blockchain).

## Rules of the road
- TypeScript strict, no `any`. `src/sim` is pure and has zero imports from render/ui. Write its tests first.
- The 320×240 habitat grid is LOGICAL coordinates, not pixels: it defines behaviour, water bounds and hit regions
  at any art resolution. Art is pre-rendered 3D at an integer multiple of it, filtered linearly with mipmaps, and
  the multiple is derived from the texture. The window scale is continuous, counted in eighths of the grid
  (0.75×–4×), so every size lands on whole pixels in both TypeScript and Rust. The simulation ticks at 8 fps; the
  animation runs at the art's own rate and the drawn position is interpolated between ticks.
- Never add blockchain dependencies in Phase 0.
- Never handle seed phrases, ever.
- When art is missing, generate labeled placeholder PNGs at the correct size and keep going. Do not ask for art.
- Commit after each working step. Log decisions in `docs/DECISIONS.md`.

## Assets already in this repo
- `assets/habitats-160x120/` — the 8 habitat concept renders snapped to the 160×120 grid (bowl, tank, cage, terrarium, pond, jar, coop, brooder). These are single-layer concept art; use them as the visual target and as a temporary `bg` layer until the layered set exists.
- `assets/reference/habitats-hires/` — the same habitats at 1024px for reference only. Do not ship these.
- `assets/sprites/pets-80/` — 80×80 single-frame pixel sprites (blob, stilt, pompom, fox, shroom, slug). These are from an earlier art round with different species; use them only to validate the sprite player and the strip format. The real fish/hamster/frog/chicken sprites will be added later.
- `assets/sprites/strips-80/` — example 4-frame 80×80 strips (`gus-idle`, `gus-eat`, `gus-die`, `doink-idle`) showing the exact strip layout the sprite player should read.

## Start here
1. Scaffold Tauri 2 + Vite + TS + PixiJS 8 (macOS target).
2. `src/sim` with Vitest tests per Blueprint §5.
3. The transparent, frameless, always-on-top window per §4.
4. Fish in a bowl per §6–§8, using `assets/habitats-160x120/fish-bowl.png` as the temporary background and a placeholder fish strip.
5. Hover HUD, feed, pantry, death, tray chip, notifications, dev panel.
6. Stop and report against the Phase 0 acceptance list (§11).
