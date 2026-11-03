# Checkpoint F — the world comes into the bowl

Date: 2026-11-02. Brief: `docs/AFTER-BAKEOFF.md`, Step F, with your notes after checkpoint C (happy
or sad when your team wins or loses, updates, happy news).

## What to look at
Everything is in `checkpoint-F/`, recorded in the installed harness app. The fish is Pebble, an
anxious one, following the Celtics.
- **`clip-win-day.mp4` (50 s):** a test win, made the way the brief asks, from the dev panel ("TEST
  WIN"). It says "The Celtics won, 112-104! I was so worried, and now I am so happy!", swims excited
  laps all over the bowl, and later says "Still glowing about the Celtics."
- **`clip-loss-day.mp4` (43 s):** a test loss. It says "98-107. Oh, Celtics. A hard one. I am still
  proud of them.", then keeps low in the bowl, slow, fins folded. Later: "I had a little sulk about
  the Celtics. I feel better now. Mostly."
- **`clip-news-morning.mp4` (33 s):** real headlines it fetched tonight, taking turns between
  feel-good stories and your interests:
  - Sardinian restaurants banning phones at family meals;
  - a giant space sunshade (for "space");
  - California's balcony solar;
  - the 115-million-year-old dinosaur blood find (for "dinosaurs").
- **Stills:** `still-won.png`, `still-still-happy.png`, `still-lost.png`, `still-mope.png`,
  `still-news.png` (with its "Where's that from?" link), `still-news-interest.png`.
- **The lines:** `src/species/fish/voice/world.ts`, 258 of them.

## Your teams
- **Where the scores come from:** ESPN's public scoreboards, for the teams on your "Get to know me"
  card. No account and no cost. It checks every 10 minutes, every 3 while one of your games is on,
  and never if you follow no team.
- **Game day:** in the morning, or a few hours before the start, it hypes the game: who you're
  playing and when.
- **The result**, said once, as soon as the fish is awake and you're not busy:
  - **A win:** happy for the rest of the day. An excited lap of the bowl every half minute or so,
    and a happy line now and then.
  - **A loss:** sad until noon the next day. It keeps to the lower half of the bowl, swims slower,
    folds its fins, and mopes now and then. Then it bounces back.
- **Ask it:** "How are the Celtics doing?" in the chat gets the score from a scoreboard no more than
  two minutes old. With no game today, it says so.
- **Tonight, for real:** with the Celtics, Bruins and Patriots on the test profile, it said "We lost,
  93-109. That is okay. It is okay. Go Celtics." and "A win, 3-2! I hoped and hoped, and the Bruins
  did it!" Both came straight off ESPN's scoreboard.

## Happy news
- **Feel-good stories** from Good News Network, The Optimist Daily and Positive News, plus
  wow-science from ScienceDaily.
- **Headlines about the things you like,** from a Google News search ("dinosaurs" tonight brought
  an ancient-blood fossil find).
- **Each one is a single line in the fish's voice,** and tapping it opens the real story.
- **When:** it shares one in place of a passing thought now and then, more often in the morning.
- **Light only:** every headline goes through a filter.
  - Never harm, crime, violence, death, disaster, illness or anything adult, whatever the setting.
  - Politics and conflict stay out unless you turn on serious news; for now that's a switch in the
    dev panel.
  - Tonight about four in five headlines passed. The war, abuse, cancer and theft ones didn't.

## Never made up
- Every score, opponent, start time and headline comes from a scoreboard or feed the app fetched
  that day. The fish's lines are frames around those facts, and a test checks they state none of
  their own.
- A headline is shown as published; one too long for the bubble is skipped, not cut.
- If a fetch fails, the fish says nothing about it.

## Numbers
Tests: 595 unit tests, 32 Rust tests and 6 browser tests pass, and the type check is clean. Both apps
are rebuilt and installed.

## What I'm unsure about
- **ESPN's scoreboards are public but unofficial.** No key or account, and widely used, but ESPN could
  change or block them. If that happens the fish just goes quiet about sports; nothing breaks.
- **Three unsuitable headlines got through in testing, before the fixes.**
  - The first runs let through "Sinclair dinosaurs stolen for Halloween wedding", "Hell
    Chicken" and a "Terrifying" game. Theft, scary words and "hell" are now on the never list.
  - A word filter will always miss something. The safest options would be the feel-good feeds only,
    no interest searches, for kids; that's your call.
- **Several of your teams playing on one day:** the latest result sets the mood. A Bruins win and a
  Celtics loss on the same night leave it moping if the Celtics finished later.
- **Scores and time zones:** the scoreboards go by ESPN's date (US Eastern), so a late game might count
  toward the wrong day if you live far away.
- **Serious news is a dev panel switch for now.** It needs a proper home in a settings screen.
- **The missed click:** in the news clip I cut five seconds where my click on "Where's that from?"
  missed and knocked on the glass instead. The link works; the stills show it.

## What's next
Step F2, show it off: one click saves the last few seconds of your pet as a clip (bubble included)
ready to send, a shareable pet card, and milestones worth sharing.
