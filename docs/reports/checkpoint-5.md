# Checkpoint 5 — the frog and the chicken

Date: 2026-11-18. Brief: `docs/PHASE-NEXT.md`, Step 5.

All four pets are built. The acceptance walk passes for all four in the installed app: 35 of 35
checks. Two things need a decision from you; both are in `NEEDS-SAMMY.md` and summarised below.

## What to look at
Everything is in `checkpoint-5/`.
- **`clip-frog.mp4`** (82 s), six parts:
  - *On its lily pad:* it blinks, and croaks with its throat blown out when the pointer comes close.
  - *A tap on the glass:* it hops to the rock.
  - *Feeding:* three crickets are let loose on the bank. It turns to one, waits for it to sit still,
    and takes it with its tongue.
  - *Evening, then night:* the fireflies come out one by one; it sleeps where it sits.
  - *The jar:* its second home. Same frog, same hunt.
- **`clip-chicken.mp4`** (103 s), nine parts:
  - *The brooder:* a chick under a heat lamp, pottering, running for dropped feed, asleep in the
    lamp's warm spot at night with a moth at the light.
  - *The coop:* the hen scratching, running down a bug, taking a dust bath.
  - *Eggs:* four appear in the nesting box, one at a time.
  - *Night:* she walks home and roosts in the lit doorway.
- **`installed-app.jpg`:** twelve pictures taken by the installed app itself during the walk. All
  four pets alive, the frog and the hen in their special moments, and all four dead.
- **`acceptance-walk.md`:** the walk, check by check, with what was seen.
- **`frog-states.jpg`, `chicken-states.jpg`:** every frame of every pose.

## What's built
- **The frog.**
  - It sits. Its world is two perches, the lily pad and the rock, and it hops between them now and
    then, or at once if you tap the glass.
  - It croaks when you come to look, when it knows you, and sometimes for no reason.
  - **It hunts.** A feed lets three crickets loose. They hop along the bank by themselves. The frog
    strikes only at one that has sat still, and the tongue takes a moment to land, so a cricket that
    hops in that moment is missed and runs for it. One nobody caught in 20 seconds leaves too. Over
    20 test feeds it catches most and loses some.
  - The meal counts when you feed, as for every pet. The hunt is the show. Catches are counted.
  - Hungry, it sinks low. At night there are fireflies over the water.
- **The chicken.**
  - A new chicken is a chick in a brooder. It pecks, drinks, eats at the feeder and naps under the
    heat lamp.
  - **At seven days old it becomes a hen and moves to the coop.** This is worked out from
    timestamps, so it happens whether or not the app was open.
  - The hen pecks, scratches the litter, takes dust baths in the hollow and chases a bug across the
    run. At night she roosts in the doorway, which glows.
  - **One egg for each day she was alive and never ran out of food.** They collect in the nesting
    box (it shows up to seven). A day she starved gets no egg. Each egg and the move to the coop
    post a notification.
- **The whole brain for both.** Each has its own voice in four personalities: 300 lines, 612 chat
  lines, about 256 lines for your teams and the news, 112 milestone lines, and 184 facts with a
  checked source each. No line is shared with the fish or the hamster. Two writer agents wrote them
  to the hamster's tests.
- **"New pet" asks which.** The menu's New pet and the memorial card's button open a small card with
  the four choices. Before this a new pet was always a fish.
- **The homes.** Each has all four lights (dawn, day, dusk, night) and its own life: fireflies on the
  pond and in the jar, the lamp's glow and a moth in the brooder, the glowing doorway and the eggs
  in the coop, dust in the air everywhere. Each new pet stands on a soft shadow.

## Numbers
- **Acceptance walk, installed app: 35 of 35.** For each pet: comes up, feeds, goes hungry then
  starving then dead, a new pet comes up, the holiday feeder carries it two and a half days, three
  sizes, hide and show. For the chicken as well: moved to the coop after seven fed days, three eggs
  in three more, no egg on a starved day, roosting at night, and all of it still there after
  quitting and reopening.
- **Tests:** 847 unit tests (168 new), 9 browser tests (3 new), 33 Rust tests. All pass, and the
  type check is clean.
- **Art:** 194 Blender renders: 32 plates and 162 pet frames. 30 MB added (22 MB homes, 8 MB pets).
- **Voices:** each pet's facts come from 30 pages. The frog's are mostly Wikipedia, San Diego Zoo,
  the Burke Museum and National Geographic. The chicken's are Wikipedia, a university poultry
  site, the RSPCA, Scientific American and Guinness.

## Found and fixed on the way
- **A notification could freeze the app.** Sending one waited on the app's main thread until macOS
  took it. Notifications are now sent in the background.
- **The picker's buttons moved away from the pointer.** Its one line of text changed when you
  pointed at a choice and pushed the buttons down. The line now sits under the buttons.
- **A new pet of another species could come back as the old one.** The app reloaded to show the new
  home before it had saved the new pet. It now saves first.
- **The jar had a pale smear across the frog at dusk and night.** The day glass was still being
  drawn under the night glass. Glass now fades from one light to the next.
- **The dead frog hung in the air** above its lily pad. It now lies on it.
- **The chick could not be seen on its bedding.** Yellow on gold. The bedding is now tan wood
  shavings and the chick a deeper yellow.

## Two things for you to decide
1. **A pet hidden behind a full-screen app cannot tell you it is hungry.** When its window is not
   on the screen you are looking at, macOS puts its page to sleep for minutes at a time. Hunger is
   safe (it comes from timestamps), but the "hungry" notification is decided in that page, so it
   waits until the pet is on screen again. I found this in the test app, which stopped answering
   for four minutes mid-walk; I have not measured it on your own pet app, which is the same code.
   My recommendation: have the Mac schedule each notification ahead of time. The quick alternative
   is one setting that keeps the page awake, at a cost in battery.
2. **Some chicken facts link to pages not written for children.** The facts are clean. But
   Wikipedia's Chicken page and two RSPCA farming pages discuss slaughter, and a Scientific
   American article has a swear word in it. That is 72 of the 184 facts. Keep the links, have me
   find gentler sources, or show chicken facts without a link.

## What I'm unsure about
- **The move to the coop is a blink, not a moment.** The app reloads into the coop. The Blueprint's
  lid-opening animation is not built.
- **The hen roosts in the doorway, not inside.** So there is still a pet to look at by night. Say
  if you would rather she went in and the doorway glowed alone.
- **Small things are small at the default size.** The crickets, the bug and the eggs read at the
  size in the clips. In the default window they are a few pixels.
- **The chick is dim at night.** It sleeps in the lamp's shadow rather than its glow.
- **A change to the hamster.** When a pet was happy or curious and had no drawing for it, it froze
  on one frame for as long as the mood lasted. It now keeps its living idle. That changes the
  hamster, which you had already passed.
- **Two fixes not applied to the older homes.** At dawn and dusk the bowl's, cage's and
  terrarium's long shadows are still cut off in a straight line at the frame's edge (the new homes
  fade them out). And the terrarium's glass still has the smear fault the jar had, more faintly.
- **The menu-bar icon is still a small fish** whichever pet you have.
- **The frog's dusk and night are dark.** The fireflies carry the scene. The frog itself is a
  shape.
- **The clips were recorded in a headless browser,** so nothing took your screen. The installed
  app's own pictures are in `installed-app.jpg`.
- **Your pet app was replaced and reopened three times tonight** by the installs, in the
  background. Gill's memorial card is still there; its NEW PET button now asks which pet.

## What's next
Your notes. Then the proposed Step H: the tank on the desktop.
