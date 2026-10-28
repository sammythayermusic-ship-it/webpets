# WebPets Next Phase

WebPets is a premium desktop + iPhone tech pet. No crypto, no NFTs, no wallets, no blockchain, no $FEED coin — ever. Treat any remaining $FEED references as plain in-app food. Blueprint Phases 2 and 3 are shelved. Keep the clock-never-stops rule, pantry, moods, personalities, speech bubbles, habitats, and all four species. Open questions (decide later, keep the code able to go either way): how the app makes money, whether food costs anything, whether a pet can die for good.

Quality bar (every candidate, every step, every self-review): it has to look like Apple made it. The coolest tech pet ever. Insanely clear, realistic yet cyber — a real-looking animal with real-looking water, glass, and light, plus a clean, precise technology layer that makes it feel like premium hardware, not a toy. “It works” is not done. “Someone would leave it open just to watch it, and ask what it is” is done. Aim for something innovative that has not been done: a true tech pet kids, adults, and everyone will love and want, with viral potential as the next everyday obsession.

Current state: repo at ~60 commits, last d5a5966. Fish in bowl (8 rendered states + mood/cursor/death), hamster in cage and terrarium (idle/walk/eat/hungry/sleep/dead + errands). Hunger clock, pantry, notifications, tray, window sizing, dev panel, tests. Art is soft 3D rendered from assets/3d/wp_scene.blend (primitives, no paid generation) — that is the baseline. Packaged app at 15 fps via src/render/pacer.ts. Frog and chicken not built. Four original acceptance items never human-checked: tray menu and hunger chip, notifications firing, click-through onto the desktop, Cmd+Shift+P.

Weak points: habitats still and flat (only the pet moves), water has no light, fish and hamster read as smooth toys, motion is position sliding between canned loops, 15 fps.

## Bake-off (one habitat: fish bowl)
Same simulation and window for all three. Deliver for each: installed .app, screenshots at the three window sizes, one 20-second recording of the same script (idle, feed, eat, hungry, night), measured fps/CPU/memory/bundle size, and a note on what it would take to add the other three animals.

- A. Rendered ceiling — push Blender as far as it goes (real glass, water with caustics, fish with translucent fins/scales, 24 fps frames, looping ambient water layer). Best stills, lightest CPU, fits current code. Everything canned.
- B. Live 3D — export bowl and fish into real-time Three.js. Real water, glass, time-of-day lights, camera lean toward cursor, procedural spine. Most alive and reactive. Heaviest; must prove packaged app can hold smooth motion.
- C. Hybrid — Blender plates for what holds still (bowl, gravel, plant, front glass) at A quality; live 3D layer for what moves (fish, water surface, caustics, bubbles, light). Realism where stillness is fine, life where it matters.

Score by eye: looks alive, water looks like water, the fish looks like a fish, reacts to me, I would show this to someone. Numbers in the same table. Pick the winner against the quality bar; keep the other branches.

## Steps (in order)
Each step: write plan into docs/DECISIONS.md (dated heading), build, verify in the built .app (not just tauri dev), self-review loop (record in installed .app, compare to quality bar, list shortfalls, fix, re-record until the list is empty), write report + screenshots + recordings to docs/reports/, commit, then continue. Do not wait.

0. Health check. Run every test suite, build and install the .app, measure real frame rate of the installed app (is 60 fps reachable?), hand-check the four never-verified items, refresh CLAUDE.md so it describes the repo as it is today. Fix anything red. Commit docs/PHASE-NEXT.md as part of the first commit. Write the checkpoint 0 report (numbers, four pass/fail, surprises) to docs/reports/ and keep going.

1. Bake-off. Build all three candidates on their own worktree branches. Pick the winner yourself against the quality bar and scorecard; log why in DECISIONS.md; keep the other branches; continue on the winner.

2. Pet behaviour. Needs beyond hunger (energy, curiosity, comfort). Attention model (cursor appears, tap the glass, gone a while). Personality that shows in how the pet moves, not only speech. Species-true motion (fish arcs/darts/surface gulps; hamster sniffs/grooms/stuffs cheeks/runs the wheel for real). No visible loops. Prove on fish and hamster first.

3. Environments. Time of day that changes the light, not just a tint. Water that moves and catches light. Dust in the air of the cage. One small background creature per habitat that cannot die (snail on glass, moth at lamp). Decor that reacts when the pet passes. Hooks for sound.

4. Animation. Real frames for every state, transitions instead of cuts, blends between states, secondary motion (fins, ears, cheeks), weight when a pet stops or turns.

5. Frog and chicken. On the winning pipeline only after 2–4 prove out on fish and hamster, with the hunting and egg rules from the original blueprint.

6. iPhone (after all four species pass on desktop). Full iPhone app: watch the pet live, feed it, see its stats. Reuse desktop code where the winning look allows. Home screen widget (pet in current mood, hunger ring, pantry left; tap opens app). Lock screen widget (small hunger ring). Starving countdown as Live Activity (lock screen + Dynamic Island). One pet on both screens: plan how Mac and iPhone share the pet (iCloud or small sync service), log the choice before building. Widget is Swift; port the hunger math and test that it matches src/sim exactly.

Sound is deliberately not in this stretch beyond the hooks.

Parked (not in scope, keep the code ready): interests (favorite sports team or bitcoin; mood follows real results; speech mentions them; separate module fetches results and hands the sim simple events); more fun, short speech-bubble lines per personality like the early prototypes.

Rules the whole way: commit after each working step; log decisions in docs/DECISIONS.md under your own dated heading; verify in the built .app; no paid generation in Blender; never save over a .blend in place; sim stays pure and tested; no blockchain; everything that can only be rebuilt by hand lives in the repo; reports short and plain, no time estimates. Only stop for things only the user can do (Apple developer account, signing, App Store, testing on the user’s iPhone), the open questions above, spending money, or anything that cannot be undone — put those in docs/NEEDS-SAMMY.md and keep working on everything else.
