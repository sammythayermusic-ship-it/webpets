# WebPets — After the bake-off: C wins, and the pets get a brain

Sammy picked **C (hybrid)**, mainly because it is the most colorful. This file sits on top of
`docs/PHASE-NEXT.md`: the rules there still hold, Steps 3 to 5 there still come later, and the
checkpoint habit (stop, plain-English report with recordings and screenshots, wait for Sammy) is
unchanged. Where this file and PHASE-NEXT disagree, this file wins.

The goal now, in Sammy's words: the fish should move, act and look very realistic and swim
realistically. It should say random things and drop quirky facts. You can tell it your interests,
hobbies and favorite teams, it bonds with you, gives you news updates, and gets happy or sad when
your team wins or loses. It tells funny or feel-good stories and things going viral. Every pet gets
the same. Later: upgrading the pet's home, and an iPhone widget that behaves the same way.

Decisions Sammy already made (do not re-ask):
- **Renderer:** C, the hybrid (Blender plates for what holds still, a live layer for what moves).
- **Fish look:** a real goldfish (real scales, see-through fins with rays, a real eye) in C's
  colorful bowl. Personality comes from how it acts and talks, not from a cartoon face.
- **How pets talk:** both. A built-in library of lines and facts that is free and works offline,
  plus Claude writing fresh lines in the pet's voice for news, sports and chat.
- **How you tell a pet about yourself:** a quick "Get to know me" picker (teams, hobbies,
  interests) plus clicking the pet to type to it anytime.

Work in the order below. Each step ends at a checkpoint.

---

## Step A — Lock in C (checkpoint A)

1. Make `claude/bakeoff-c-hybrid` the base of all further work (merge to `main` or rebase onto it,
   your call, logged in `DECISIONS.md`). Also bring in the needs model, attention events and motion
   primitives from `claude/webpets-next-phase-7a22a3`, and the health-check work, so nothing
   built on Oct 28 is lost.
2. Keep candidate A's fish look work (`a_look.py` and its fish materials: scale relief, fin rays,
   translucency, subsurface, gold eye ring) as the reference for Step B. Keep B's water-surface and
   transmission ideas as reference too. Then retire the A and B worktrees and delete their
   `src-tauri/target` folders to free disk space, as promised in `NEEDS-SAMMY.md`.
3. Leave `WebPets A.app` and `WebPets B.app` installed until Sammy says to remove them.

Report: what was merged, what was kept as reference, how much disk was freed.

## Step B — A real goldfish (checkpoint B)

Look first, then the bowl around it.

1. **The fish.** Rebuild the live fish so a stranger would call it a real goldfish: scale pattern
   with a baked normal map, fins with visible rays that let light through between them, soft
   subsurface glow at the thin edges, a wet glossy coat, a real eye (dark pupil, gold iris ring,
   a highlight). More body detail than the current one-subdivision mesh, as long as the frame
   rate holds. Bake what A did procedurally in Blender into maps the live layer can use.
2. **Fix C's own shortfalls** from its report: water you can see ripples moving across, a bowl
   you can see through to the desk behind, food flakes and bubbles drawn inside the water (bent
   and tinted like the fish), a tap ripple that spreads and fades, caustics that look less even.
3. **Keep it colorful.** C's bright gravel, plants and blue water stay. Realism goes into the
   fish and the light, not into making the bowl grey.

Report: stills at day, night and feeding next to the C stills from the bake-off, and a 20-second
clip with the same script as before.

## Step C — Swims like a real goldfish (checkpoint C)

This is PHASE-NEXT Step 2 (needs, attention, personality in motion, no visible loops), done on C,
with these goldfish behaviours added:

- Hovering in place with the pectoral fins sculling and the tail barely moving.
- Slow cruising laps with gentle arcs, and a burst dart when food lands or something startles it.
- Picking at the gravel, taking a pebble in its mouth and spitting it out.
- Gulping at the surface now and then.
- Turning to look at you when you arrive, following the cursor along the glass.
- Resting low in the bowl at night, moving slowly, colors a little muted in the dark.
- Fins fold when it is sad or unwell and spread wide when it is excited.

Report: two minutes of the fish left alone, and clips of it reacting to the cursor, a tap and
food.

## Step D — The pet talks (checkpoint D)

1. **Built-in lines (offline, free).** Per species and per personality: random thoughts, quirky
   facts, reactions to feeding, hunger, night, being ignored, being visited. Facts must be true;
   keep a source note for each fact in the data file. Start with at least 150 lines and 100 facts
   for the fish.
2. **Claude-written lines.** When online and an API key is set, the pet can ask Claude for a fresh
   line in its own voice (species + personality + what it knows about Sammy + what just happened).
   The key lives in the macOS Keychain, never in the repo. Add a daily spending cap with a setting
   for it, and fall back to the built-in lines when offline, over the cap, or with no key. Adding
   the key is a NEEDS-SAMMY item.
3. **Speech bubbles that charm, not nag.** A limit on how often the pet talks, quiet when you are
   busy typing or in a full-screen app, a mute in the tray menu, and a way to tap a bubble to see
   more (a fact's source, a story's link).

Report: a clip of an hour sped up showing what the fish says, and the line files.

## Step E — Getting to know you (checkpoint E)

1. **"Get to know me" card**, opened from the tray menu and the first time a pet is adopted: what
   to call you, favorite teams (pick a league, then the team), hobbies and interests as tap-to-pick
   chips with a free-text box.
2. **Talk to the pet.** Click the pet, type to it, it answers in its voice. When you mention an
   interest or a team, the pet asks before saving it ("You're a Red Sox fan? Want me to keep an
   eye on them?").
3. **Bond.** A bond level that grows with feeding on time, visits and chats, and slowly fades with
   neglect. Higher bond unlocks behaviour: swims to the glass when you come back, uses your name,
   remembers things you told it, inside jokes. Show it lightly, not as a game score.
4. **Privacy.** The profile and chat memory stay on the Mac. Only what a line needs goes to Claude.
   A "forget me" button clears it.

Report: a walk-through recording of the card, a short chat, and the fish behaving differently at a
higher bond.

## Step F — The world comes into the bowl (checkpoint F)

1. **Sports.** For each team you follow: game-day hype, live score check-ins if you ask, the final
   result. A win makes the pet happy (excited laps, bubbles, a celebration line). A loss makes it
   sad the rest of that day and the next morning (sulks low, fins folded, a mopey line), then it
   bounces back.
2. **News.** Feel-good stories, funny stories, things going viral, and headlines that match your
   interests, told as one line in the pet's voice with a tap to open the real story. Keep it
   light: no tragedies or political fights unless Sammy turns that on.
3. **Never make things up.** Scores, headlines and stories only come from data the app actually
   fetched. If a fetch fails, the pet says nothing about it.
4. **Sources.** Prefer free public sources (scoreboards, news feeds). Log each choice in
   `DECISIONS.md`. Anything that needs an account or costs money goes in `NEEDS-SAMMY.md` first.
5. Room for other interests later, like the bitcoin price moving the pet's mood.

Report: a clip of a win day and a loss day (forced from the dev panel), and a morning of news
lines.

## Step G — Every pet gets the brain

Build Steps D to F as one shared module, not fish code. Each species brings its own voice, facts
and body language (a happy hamster sprints the wheel, a sad one hides in the bed). Then carry on
with PHASE-NEXT Steps 3 to 5 (environments, animation quality, frog and chicken) on C, with the
brain included for every new species.

---

## Later — keep the doors open, do not build yet

- **Bigger and better homes.** A pet can move up to a bigger or nicer habitat (bowl to tank to
  aquarium, cage to bigger cage) and decorate it. The hamster already owns two habitats; make sure
  the habitat system lets any pet move homes and keeps its state. How upgrades are earned or paid
  for is still open.
- **iPhone.** A home and lock screen widget plus the full app, behaving like the Mac version, with
  the same pet, bond and profile on both. Keep the sim and the brain in code that can be shared,
  and make sure everything the pet knows about you can sync later. Needs Sammy's Apple Developer
  account.
- Still open from before: how the app makes money, whether food costs anything, whether a pet can
  die for good.

## Still waiting on Sammy

The iCloud and full-disk problem in `NEEDS-SAMMY.md` is still open and slows every build. Deleting
the A and B build folders in Step A helps, but moving the repo off the iCloud Desktop is the real
fix.
