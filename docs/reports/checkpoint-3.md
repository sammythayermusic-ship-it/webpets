# Checkpoint 3 — environments and ambient life

Date: 2026-11-05. Brief: `docs/PHASE-NEXT.md`, Step 3 (after `docs/AFTER-BAKEOFF.md` Step G).

## What to look at
Everything is in `checkpoint-3/`, recorded from the installed harness app's own canvas.
- **`clip-bowl.mp4`, `clip-terr.mp4`, `clip-cage.mp4`** (32 s each): each home at 7:00, 12:00, 18:00
  and 22:00 with the pet asleep, 8 s each. The light changes direction and colour through the day:
  a low warm light from the right in the morning, flat at noon, a low orange light from the left in
  the evening with long shadows, moonlight at night. At night the hamster homes are lit by a light bar
  under the back rail, and a moth comes to it. The snail sits on the bowl's glass.
- **`hours-bowl.png`, `hours-terr.png`, `hours-cage.png`:** the same four hours as one still each.
- **`clip-life.mp4`** (84 s): the life up close.
  - *The wheel:* the hamster runs it after a test win; it spins up, then coasts down after the
    hamster hops off (still turning at 5.4 radians a second when the next part began).
  - *Bedtime:* the light bar comes on, the hamster walks to its house and digs its bed over before it
    settles, and the moth arrives.
  - *Dirty water:* a starving fish's bowl clouds green-brown over about 20 seconds.
  - *Clearing:* after a feed it clears over the next half minute.
- **`snail.png`, `moth.png`:** close-ups of the two background creatures.

## What's built
- **Time of day that does something.** The app already worked out how much of dawn, day, dusk and
  night it is, but three separate faults kept that from the screen. The manifest reader dropped the
  dawn and dusk plates. The layers only knew day and night. And the scene was only told about the
  light when night flipped. So the bowl's dawn and dusk renders from October had never been shown.
  All four light sets now crossfade by the hour, and the live water and the goldfish's lights swing
  round with them.
- **Dawn, dusk and night for the hamster homes,** rendered from the same lights as the bowl, so all
  three share one sky. Each home has a slim light bar under the back rail (under the roof in the
  cage). It is the only light at night and is visible, unlit, by day. The hamster takes the room's
  light too, so it no longer looks pasted on at dusk.
- **Water that is alive** (the bowl). The surface, caustics and bubbles were already there from
  Step B. New: the plants sway, and bend away from the fish as it swims past. The water clouds while
  the fish is starving and clears after a feed.
- **Air that is alive** (the hamster homes):
  - The wheel is its own layer, rendered turning. It spins up when the hamster runs and coasts down
    after, with a slight wobble.
  - Dust drifts and shows only where a beam of light crosses it: the window light by day, the bar's
    light at night.
  - A bubble rises in the bottle with each swallow, and a drop forms at the spout and falls now and
    then.
  - Bedding flies when the hamster digs its bed before sleeping. That dig is new and tested: once
    per sleep, two seconds, at the bed.
  - The house doorway darkens while the hamster sleeps by it.
- **Background life.** A snail on the bowl's glass, placed by the wall clock at about an inch an hour,
  crawling 18 minutes and resting 12 of every half hour. It is somewhere else each time you look,
  including after a night away. A moth flutters round the light bar at night in both hamster homes.
  Both are made from primitives in Blender, can't die, and never call for attention.
- **Sound hooks.** Every ambient event has a name the audio module will play from
  `assets/audio/<species>/<name>.ogg`: the wheel spinning up and coasting, a drink, a drip, a dig,
  the moth, the snail setting off, the water clouding and clearing, the light bar on and off. No
  sound files exist yet, so all of them are silent.
- **Pin the hour.** The dev panel's light menu and a new harness `hour` command show any time of day
  on demand.

## Numbers
- Tests: 669 unit tests (19 new), 6 browser tests. All pass, and the type check is clean.
- Art: 239 Blender renders. The hamster homes gained 8 plates each plus wheel frames: 8 for the
  terrarium, 44 for the cage, whose spokes only repeat every half turn.
- The habitat art grew from 13 MB to 34 MB, almost all of it the new hamster-home plates.

## What I'm unsure about
- **The light bar changes how the homes look by day:** a dark bar along the back. It is the "hood
  or lamp" the brief asked for. Say if you'd rather it go, and night falls back to moonlight only.
- **The wheel uses its day frames in every light,** tinted by colours measured from the renders.
  Four light sets of the cage wheel's 44 frames would have cost about 90 MB of graphics memory for
  one prop. The catch: at dawn and dusk it reads as a dark navy disc rather than showing which side
  the light is on.
- **Some of it is subtle at the default size:** the dust, the doorway shading and the plant sway.
  They read at the size in the clips. At the small default window they are close to invisible, which
  may be right for things that should never call for attention.
- **The hamster sits in front of the wheel, not in it.** It needs a running pose and layering,
  which belongs to Step 4 (animation quality).
- **Recording note:** a fish naps by day only after five quiet minutes, so the bowl clips were
  recorded after a five-minute wait.
- **Housekeeping:** iCloud evicted most of the working folder and even git's own files overnight.
  This step was built in a copy outside iCloud and pushed to the same branch. It's in `NEEDS-SAMMY.md`.

## What's next
Step 4, animation quality: every state with real frames, blends instead of cuts, secondary motion
and weight, the hamster's run on the wheel among them. Then Step 5 (the frog and the chicken) and
the proposed Step H (the tank on the desktop).
