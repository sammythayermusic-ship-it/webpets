# Checkpoint 4 — animation quality

Date: 2026-11-17. Brief: `docs/PHASE-NEXT.md`, Step 4.

## What to look at
Everything is in `checkpoint-4/`. Each clip is the Step 3 build on the left and this one on the
right, doing the same things in the same order.
- **`clip-hamster.mp4`** (76 s), seven parts:
  - *Pottering about:* a turn is a real turn now, through facing you, and it gives a little under
    its own weight when it stops.
  - *A tap on the glass:* it flinches on the spot (crouch, jump, land), then runs.
  - *Food:* it fetches it and chews.
  - *Bedtime:* it walks to its house, digs its bed over and lies down with a yawn. Before, it slid
    there already in its sleeping pose.
  - *Morning:* it gets up with a stretch instead of cutting to standing.
  - *The wheel:* a running gait instead of a standing pose.
  - *Death:* it wobbles and falls onto its side, instead of cutting to the pose.
- **`clip-fish.mp4`** (56 s), five parts. The one to watch is the tap: the fish bolts with its whole
  body curled and its tail beating hard, then brakes with its fins flared and settles.
- **`hamster-states.png`:** every frame of the nine new or redone hamster states.

## What's built
- **Full state coverage for the hamster.** Nine states rendered from the same model as the old six:
  a turn, lying down, waking, dying, a startle, digging, drinking, running, and eating again. `dead`
  was one frame with a cut into it; it now has an eight-frame fall that ends exactly on that frame.
- **Blends, not cuts.** Every change of state dissolves the old frame into the new one over 150 ms.
  Sleep is entered by lying down and left by waking; death is entered by the fall. A pet that is
  already dead when the app starts is shown lying there, not falling again.
- **A real turn.** The hamster used to turn by squashing flat and unsquashing mirrored. It now turns
  through seven drawn frames, so you see its face come round.
- **The habitat's acts have their own art.** Digging, drinking, running the wheel and the startle
  each used a borrowed pose before.
- **Weight.**
  - The hamster squashes slightly and settles when it stops, lands or finishes a turn.
  - The goldfish brakes when it stops: pectoral fins forward, fins fanned, nose dipped, then a small
    rock back.
  - The goldfish bolts from a standstill with a C-shaped curl and hard tail beats. Gentle swimming
    triggers neither: both were measured at zero over 8 seconds of wandering, and above 0.75 on a tap
    and on a feed.
- **A bug found on the way.** At bedtime the hamster was drawn asleep while still travelling to its
  bed. Tracing the drawn states ten times a second showed it; it was easy to miss by eye.

## Numbers
- Tests: 679 unit tests (10 new) and 6 browser tests pass; the type check is clean.
- Art: 62 hamster frames rendered (54 new, 8 redone); the hamster's sprites grew from 4.3 MB to
  10 MB. Every new state is registered against the standing pose, and the
  art tests that hold the old states to that now cover the new ones.
- Both apps are rebuilt and installed. Checked in the installed test app, in the background: it ran
  the wheel, then walked to bed, dug, lay down and slept, woke, and on a forced death fell and lay
  dead, each as its own drawn state. The startle was not caught there (the tap arrived while it was
  heading to bed); it is in the clip and the unit tests.

## What I'm unsure about
- **Some of the new art is subtle.** The cheek pouches and the running gait are hard to see at
  window size; the turn, the flinch, the lie-down and the fall read clearly. Say if you want the
  subtle ones pushed further.
- **The hamster still runs in front of the wheel, not inside it.** Putting it inside needs the wheel
  split into a back and a front layer. I left it for your call, since it changes the Step 3 art.
- **No secondary motion on fur.** Ears lag the body and the cheeks follow the jaw in the new frames,
  but the old states (idle, walk, hungry, sleep) were not re-rendered.
- **The clips were recorded in a headless browser, not the installed app,** so that nothing took
  your screen. The browser draws the same frames (measured in October: 1.1% of pixels differ, all
  inside the moving fish).
- **Testing no longer takes your screen.** The test app used to float above everything, full-screen
  apps included, and stopped answering when it was hidden. It now answers while hidden, and its
  window is set to desktop level, behind all your windows. Your own pet app is untouched and still
  floats. The older recording scripts that click and type still need the Mac to themselves.
- **Your pet Gill died on November 12,** a day after its last feed. The new build shows it lying
  there, and the "While you were gone" card is yours to dismiss.
- **Your Desktop copy of `main`** still lags GitHub: iCloud evicted its git files (see
  `NEEDS-SAMMY.md`).

## What's next
Step 5: the frog (pond, then jar) and the chicken (brooder, then coop), each with the full brain,
its own voice, its habitat's ambient life and animation to this bar. Then the proposed Step H (the
tank on the desktop).
