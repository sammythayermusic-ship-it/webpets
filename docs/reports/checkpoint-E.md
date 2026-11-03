# Checkpoint E — getting to know you

Date: 2026-11-02. Brief: `docs/AFTER-BAKEOFF.md`, Step E, with your notes after checkpoint C (bond
over time, share your interests).

## What to look at
Everything is in `checkpoint-E/`, recorded in the installed harness app (the same build as your
WebPets, plus the remote control the recordings need). The fish is Pebble, an anxious one.
- `clip-card.mp4` (25 s): the "Get to know me" card being filled in: a name, two teams, three
  interests and one in your own words, then the privacy part, with "Forget me" asking first.
- `clip-chat.mp4` (55 s): typing to the fish. The click on the fish, the typing and the button
  presses are real (keystrokes and clicks sent to the Mac, the way you would). It says hello,
  already knows the Red Sox from the card, asks which Giants, asks before keeping "guitar", tells a
  joke, and answers "I am a bit tired today". Esc hands the keyboard back to the app you were in.
- `clip-bond.mp4` (35 s): coming back to the bowl twice.
  - As people who just met: it looks up and says hello.
  - As best friends, four hours after you said you were tired: it swims to the glass on your side,
    asks "Are you okay today? A little better?", then brings up your Red Sox.
- Stills:
  - `still-card.png`, `still-card-privacy.png`: the card;
  - `still-which-team.png`, `still-asks-first.png`, `still-tired.png`: the chat;
  - `still-best-friends-asks.png`, `still-best-friends-team.png`: the bond.
- The lines: `src/species/fish/voice/chat.ts`.

## The card
- **"Get to know me…"** is a new item in the tray menu. It also opens by itself once, the first time
  the app starts. Your WebPets did that when the new build first started tonight, around 10 pm;
  rebuilding the app twice after that closed it. It won't open by itself again, so for you it's in
  the tray menu.
- **What it asks:**
  - what Finn should call you;
  - the teams you follow: pick a league, then the team;
  - the things you like: tap the chips (60 of them, from video games and Lego to baking, space and
    dinosaurs), or type your own.
- **Leagues:** NFL, NBA, WNBA, MLB, NHL, MLS, NWSL and the Premier League, 205 teams in all, taken
  from ESPN's public lists tonight. They use the same team ids Step F will use to fetch results.
- **What happens to it**, said on the card:
  - It all stays on this Mac.
  - If you add an API key, Claude is told only your name and the one thing a line is about.
  - "Forget me" clears it after asking. The bond stays; it's the pet's.
- **Saving:** everything saves as you go, and the pet knows straight away.

## Talking to the fish
- **Starting:** click the fish itself (or TALK on the bar along the top) and a small field opens at
  the bottom of the bowl. Type, press Enter, and it answers in its bubble.
- **Finishing:** Esc, a minute of nothing, or clicking into another app closes the field. Your
  keyboard goes back to the app you were in.
- **It asks before it keeps anything:**
  - "You cheer for the Red Sox? Want me to keep an eye on them?" comes with Yes / No buttons.
  - When two teams share a name ("go giants"), it asks which one, with a button for each.
  - It asks before using a name ("So you are Alex? Can I call you that?").
- **Without a key** it answers everything from its own lines:
  - 614 new ones in the four personalities: hellos, how-are-yous, jokes (28 of them), "I'm sad",
    "I'm tired", "what are you doing", compliments, goodbyes.
  - "Tell me a fact" gets a real fact with its source.
  - Understanding what you typed happens on the Mac; nothing you type is sent anywhere to be
    understood.
- **With a key**, Claude writes the open-ended replies in the fish's voice. It runs under stricter
  rules than the pet's passing thoughts:
  - something unkind gets a gentle change of subject;
  - "I'm hurt" or "I'm in danger" gets "tell a grown-up you trust";
  - it never asks for personal details.

## The bond
Feeding, visiting, chatting and telling it things grow the bond a little each day, and it starts to
fade after a day with none of that. It shows on the card in words only ("getting comfy", "good
friends", "best friends"), never as a score. With daily care:
- **Day 2, getting comfy:** it sometimes uses your name.
- **About day 5, good friends:**
  - it swims to the glass to meet you when you come back after a few minutes;
  - it greets you by name;
  - it brings up your hobbies and your team;
  - if you said you were sad or tired, it asks next time whether today is better.
- **About day 10, best friends:** inside jokes, about all your knocking on the glass or a hobby you
  keep mentioning.

## Fixed on the way
- **Pressing one of the fish's answer buttons took the keyboard away from the chat field.** The
  recording caught it: everything typed after choosing a team went nowhere, and Esc did nothing.
  Now the field keeps the keyboard, and Esc closes it from anywhere.
- **"Forget me" showed its confirmation from the start**, because of a styling slip. Now it only
  appears when you press it.
- **A close friend now checks in at a "good morning" too**, not only at a plain hello.
- **The tray's "Pet talks" switch had never worked in the app.** The Mac side sent the click, but
  the app's list of tray actions didn't include it. It's fixed, and a missing action now fails to
  build.
- **The new HUD button** asked "can this pet talk?" before the bubble existed, and the page failed to
  start. The browser preview caught it before any build.

## Numbers
Tests: 557 unit tests, 31 Rust tests and 6 browser tests pass (the new one walks the card and a
chat), and the type check is clean. Both apps are rebuilt and installed with everything above.

## What I'm unsure about
- **Claude-written chat replies haven't made a real call yet.** There's still no API key on this Mac;
  adding one is yours to do (`NEEDS-SAMMY.md`). The request, the check on what comes back and the
  fallback to the fish's own lines are tested.
- **Understanding is simple on purpose.** It matches phrases; it doesn't really understand.
  - Unusual wording gets a general reply.
  - A hobby mentioned in passing is only asked about when you sound like you like it.
  - 92 team nicknames are everyday words (Giants, Heat, Bills). "I love the Giants" counts, but "the
    heat today" doesn't, and some sentences will still fool it.
  - With a key, Claude makes the replies far more natural; saving things still only happens after
    the pet asks.
- **Clicking the fish is fiddly at Small size.** It's small and it moves. TALK on the bar always
  works.
- **The bond's pace is a guess.** Best friends in about ten days of daily care, fading after a day
  away; these are easy numbers to change.
- **Premier League clubs read a little oddly** in a few lines written for US teams ("the Arsenal").
- **The swim to the glass is subtle at Small.** It shows best at Medium and up.
- **Kids and chat:** with a key, should kids get Claude's replies or only the fish's own lines? It's
  in `NEEDS-SAMMY.md`, still open from checkpoint D.

## What's next
Step F, the world comes into the bowl:
- **Sports:** game-day hype, scores if you ask, and the result. A win makes the fish happy; a loss
  makes it mope until the next morning.
- **News:** happy, funny and viral stories, and headlines that match your interests, each one tap
  away from the real story.
- **Only real data:** nothing made up; if a fetch fails, the fish says nothing about it.
