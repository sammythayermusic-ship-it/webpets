# Checkpoint F2 — show it off

Date: 2026-11-03. Brief: `docs/AFTER-BAKEOFF.md`, Step F2, from your notes after checkpoint C ("trendy,
viral").

## What to look at
Everything is in `checkpoint-F2/`. It was made in the installed harness app with Pebble, an anxious
goldfish, following the Celtics.
- **`groupchat.png`:** the report the brief asks for. The shared clip and the pet card as they would
  land in a group chat. The thread is made up; the clip and the card are the real files the app
  saved. `tools/mac/groupchat_mockup.py` builds it.
- **`shared-clip.mp4` (6.5 s, 640×490):** exactly what one click saved to Downloads. The fish's
  happy laps after a Celtics win, with its line ("The Celtics won 112-104! I want to remember this
  forever and ever.") drawn in, and a small WebPets mark in the corner.
- **`pet-card.png` (1080×1350):** the card the app saved (the same code as the tray's "Pet card…").
  It shows:
  - name and number, and a portrait from the habitat;
  - Goldfish · Anxious · born today · best friends with Sam;
  - the last thing it said.
- **`clip-share-button.mp4` (20 s):** how you get there. The win comes in as a milestone with a
  **Share this** button. The pointer goes to the button and clicks it. "Saving the last few
  seconds…" shows, then "Saved to Downloads". Finder also opens with the file selected; it is not in
  the clip, which captures only the pet's window.
- **`still-share-button.png`:** the bubble with its button.

## What's built
- **Share a moment.** There are three ways to save the last six seconds as a video in Downloads:
  - **CLIP** on the bar;
  - "Save the last few seconds" in the tray;
  - **Share this** on a milestone.

  Finder opens with the file selected, ready to drag into a chat. The bubble is part of the clip;
  the buttons and the bar are not. The app keeps the last six seconds in memory all the time, so
  the moment you just saw is the one you get. Nothing is uploaded, and the app never posts
  anything itself.
- **The pet card.** Tray, "Pet card…". It shows:
  - name and a portrait;
  - species, personality and age in words;
  - how close you are, in words, with your name;
  - the last thing it said that wasn't a question.

  It is tinted by personality: peach for anxious, teal for zen, orange for hyper, navy for
  sarcastic. It is a PNG in Downloads.
- **Milestones.** The pet marks each one once, when it is free to talk. It says a line with a
  **Share this** button and swims a minute of excited laps:
  - **Birthdays:** a day, a week, one, two, three and six months, then one, two and three years.
  - **Meals:** 10, 50, 100, 250, 500, 1,000 and 2,000.
  - **The bond:** each level.
  - **Your team's wins:** every win gets the button. Half the time it's announced with a
    milestone line.

  A pet that already passed some milestones when this arrived starts with those marked, so nobody
  gets a flood of old birthdays. The fish has 112 milestone lines across its four personalities.
- **Ideas for later, logged, not built** (`docs/DECISIONS.md`):
  - friends' pets visiting;
  - seasonal decorations;
  - rare looks;
  - a share sheet (AirDrop, Messages) instead of Finder;
  - a GIF option and a vertical clip for stories;
  - a milestone gallery.

## Numbers
- Saving a clip takes about seven seconds: the video is made by playing the frames back in real
  time. The "Saving…" note shows meanwhile.
- The clip is about 400 KB; the card is about 1.2 MB. Keeping the six seconds in memory costs
  about 2 MB.
- Tests: 609 unit tests, 33 Rust tests and 6 browser tests pass, and the type check is clean.
- One browser test failed tonight for a reason outside the app: in browser mode the app fetched
  ESPN's real scoreboard, and ESPN answered without its usual CORS header. The browser tests now
  answer every outside request themselves with "nothing today", so they no longer depend on ESPN
  or the news feeds.

## What I'm unsure about
- **The bubble jumps when the pointer comes in.** When the pointer enters the window, the bar
  appears along the top and the bubble drops below it. Pointing at Share this as you come in can
  therefore miss: my first recording run clicked where the button had been and knocked on the
  glass instead (the same cause as the missed link click at checkpoint F). Keeping the bubble
  still while it has buttons would mean letting the bar cover it. Your call; it is a one-line
  change either way.
- **The saved clip shows that jump without the bar,** because the bar is left out of clips. The
  bubble simply moves down a little partway through.
- **MP4, not GIF.** A GIF of a goldfish in clear water is large and banded, and every chat app
  takes MP4. I left GIF for later rather than ship a poor one.
- **Finder, not a share sheet.** Saving to Downloads and selecting the file is the simplest thing
  that works everywhere. A proper macOS share sheet (AirDrop, Messages) needs native code; it is
  on the ideas list.
- **"born today"** on the card is honest for this test pet, which was made yesterday evening. A
  real pet's card says "4 days old", "3 weeks old" and so on.

## What's next
Step G, every pet gets the brain: the hamster gets its own voice, chat, world lines and milestones
through the same shared brain the fish uses. Then PHASE-NEXT Steps 3 to 5.
