# Checkpoint C — swims like a real goldfish

Date: 2026-10-31. Brief: `docs/AFTER-BAKEOFF.md`, Step C.

## What to look at
Everything is in `checkpoint-C/`, recorded in the installed app at Medium.
- `clip-alone-2min.mp4`: two minutes of the fish left alone, nobody at the glass.
  `two-minutes-every-4s.jpg` is the same two minutes as one frame every 4 seconds.
- `clip-cursor.mp4`: someone arrives after an absence and moves along the glass.
- `clip-tap.mp4`: two knocks on the glass.
- `clip-food.mp4`: two pinches dropped by clicking over the water.
- `clip-night.mp4`: night.
- `still-look.png`: the fish turned to look at you.
- `still-pebble.png`: carrying a pebble it picked up.
- `still-night.png`: resting low at night.

## What the fish does now
- **Hovers** between swims, held in place by its pectoral fins sculling quickly while the tail
  barely moves.
- **Cruises laps**: every so often it swims four to seven gentle curves round the middle of the bowl.
- **Bursts into a dart** when food lands or something startles it (from earlier; still there).
- **Picks at the gravel**: goes down, tips its nose into the stones two or three times, often comes
  away with a pebble, mouths it while backing off, then spits it out to sink back among the others.
- **Gulps at the surface** now and then: rises to the waterline, tips its nose up and gulps twice,
  leaving a small ring and a bubble. A rested, well-fed fish does this every few minutes, a peckish
  one more often.
- **Looks at you when you arrive**: after a moment (an instant for a "degen" fish, a while for a
  "sarcastic" one) it stops and turns its face toward you, both eyes showing.
- **Follows you along the glass**: while you stay and it wants company, it patrols just in front of
  your pointer, a little to either side, and turns to face you when it pauses.
- **Rests low at night**, drifting slowly along the gravel, fins a little folded, colours slightly
  muted.
- **Fins show how it feels**: folded back when it's hungry, unwell or low, held out when content,
  fanned wide when excited (after a meal, say).
- **Never visibly loops**: a test runs ten minutes of it alone and finds no 30-second stretch
  repeated.

## Numbers
Installed app at Medium: 60 frames a second, about 1.1 ms of drawing per frame. Tests: 441 unit
tests, the Rust tests and the 5 browser tests all pass.

## What I'm unsure about
- **It spends a lot of its time on the gravel.** Real goldfish do forage most of the day, but if
  it feels too much, that's one number to turn down.
- **The bowl's front plant can hide the good moments.** In the final recordings it picked at the
  gravel, and once looked at you, from behind the near leaf. That's realistic, but it hides the
  pebble. The pebble and look stills come from a first recording made earlier the same day, on the same
  build except for one fix: before it, the fish flipped round while holding a pebble.
- **The look is small at Medium.** The fish is about 90 px long on screen, so its turned face is
  charming but not dramatic. At Large it reads better.
- **No surface gulp is on camera.** A content fish's surface drive was too low to ever trigger one,
  which I only found after recording. It's fixed and tested, and the installed app has the fix, but
  gulps are rare by design, so none came up in the clips.

## Things that happened on the way
iCloud evicted about 9,000 files mid-step, mostly the downloaded libraries, and type checks stalled.
The libraries now live outside iCloud too (`~/.cache/webpets`), linked into the project, so that
can't happen to them again. The source files can still be evicted until the repo moves off the
iCloud Desktop (`NEEDS-SAMMY.md`).

## Next: Step D, the pet talks
A built-in library of things to say (at least 150 lines and 100 true facts for the fish, each with
a source), Claude-written lines when online and a key is set (kept in the Keychain, with a daily
spending cap), and speech bubbles that charm rather than nag: rate-limited, quiet while you're
busy, a mute in the tray, and tap a bubble to see more.
