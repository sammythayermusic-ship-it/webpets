# Decisions log

## 2026-09-17 — Art direction (from the Cowork session)
- Rejected: glossy 3D "Pixar" pets (too mainstream), gummy/vinyl/chrome/voxel/clay/shadow directions, felt-on-low-poly.
- Chosen: cozy pixel art. Habitats on a 160×120 grid, pets as 80×80 sprite strips, 8 fps stepped motion, ambient FX at 60 fps.
- Gen 1 species: fish (bowl → tank), hamster (cage → terrarium), frog (pond → jar), chicken (brooder day 0–7 → coop).
- The habitat IS the widget: transparent frameless always-on-top window, resizable S/M/L, minimizes to a tray chip.
- The pantry (feeder object in each habitat) is the visible away-mode gauge. Feed = burn 25 $FEED. Decay 100/60h. Death after 24h at zero.
- Phase 0 local only; Phase 2 moves authority to Solana (Metaplex Core + Anchor feeder program + keeper crank).
