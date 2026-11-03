# Checkpoint D — the pet talks

Date: 2026-11-02. Brief: `docs/AFTER-BAKEOFF.md`, Step D, plus your notes after checkpoint C.

## What to look at
Everything is in `checkpoint-D/`, recorded in the installed harness app (the same build as the
installed WebPets.app, plus the remote control the recordings need). The fish is Pebble, an anxious
one. The cursor, the food and the taps on the bubble are real clicks; the knocks are sent by the
harness, which does exactly what a click on the glass does (the first knock in the knock clip is a
real click).
- `clip-hour.mp4` (2 min): an hour sped up. You sit down at the bowl, leave for forty minutes, come
  back. The fish's clock runs 10 times faster while you're there and 120 times faster while you're
  away; the bubbles stay up for their normal few seconds so you can read them. Ten bubbles in the
  hour: two hellos, four lines in your first visit, one while you're away and three when you're
  back. That's the hourly cap of eight, so it goes quiet.
- `clip-moments.mp4` (1.5 min): hello when you come back, a thank-you for food, a fact of its own,
  a fact you tap for its source, then "a bit hungry" and "thank you" when you feed it.
- `clip-knock.mp4` (20 s): two knocks on the glass that it answers. In the moments clip it happened
  not to answer any of the three knocks.
- `transcript.txt`: everything it said in the clips, in order.
- Stills: `still-hello.png`, `still-thank-you.png`, `still-fact.png`, `still-fact-source.png`,
  `still-hungry.png`, `still-fed-after-hungry.png`, `still-while-away.png` (no bar along the top
  when you're not there, so the bubble sits on the bowl).
- The line files: `src/species/fish/voice/lines.ts` (what it says) and
  `src/species/fish/voice/facts.ts` (what it knows, each with its source).

## What changed for everyone
- **No more $FEED.** Food is free. The pantry is now a **holiday feeder**: one button fills it with
  three days of food, and it feeds the pet while you're away. There's no balance and nothing to buy
  anywhere in the app. Saved pets carried over: your fish Finn is fine.
- **The "degen" personality is now "hyper"**: same energy, no crypto slang. Nothing the pet says
  mentions money, coins or trading.

## How the fish talks
- **Four characters, not one voice with filters.** Sarcastic (deadpan, plainly cares), anxious
  (sweet, a worrier, relieved when you show up), zen (calm, grateful) and hyper (everything is the
  best thing ever). 296 lines in all: 74 each, across thoughts, being fed, finishing a meal, hungry,
  starving, a knock on the glass, you arriving, you back after hours, being left alone, good
  morning, goodnight and the holiday feeder.
- **181 true facts**, about goldfish and about fish in general, each checked against the page it
  came from. Most are from Wikipedia (121), the rest from NOAA, Monterey Bay Aquarium, National
  Geographic and Guinness World Records. Each personality introduces a fact its own way ("Um, did you
  know?..."). It tells every fact once before it repeats any.
- **It never repeats itself soon**: it remembers its last 80 lines, across restarts.
- **Written for kids and adults**: teasing is fine, mean is not. A test checks every line for
  unkind words and crypto slang.

## When it talks (charm, not nag)
- While you're at the bowl: a hello if you'd been away a few minutes ("welcome back" after two hours,
  "good morning" the first time each morning), then a thought or a fact every minute or two, at most
  four per visit.
- While you're not: something now and then, every 15 to 35 minutes. After three hours alone it says
  it's quiet in there. It says goodnight once when it settles down for the night.
- It answers what you do: food, a knock (about 6 times in 10), getting hungry.
- **Never more than 8 bubbles an hour**, and never two within 20 seconds (6 seconds for a reply to
  something you just did).
- **Quiet while you're busy**: nothing volunteered while you're typing (it reads how long since your
  last key press, never what you typed), or while nobody can see the pet: a full-screen app or
  video in front, another Space, or the pet hidden. A hunger line waits until you can see it.
- **A mute**: "Pet talks" in the tray menu.
- **Tap for more**: a fact's bubble says "Where's that from?"; tap it to see the source, tap the
  source to open it in your browser. The bubble lets clicks through everywhere else, so it never
  gets in the way of the bowl, the resize handle or the buttons.

## Claude-written lines
When you add your Anthropic API key (one Terminal command, in `NEEDS-SAMMY.md`), about 4 in 10 of
its thoughts are written fresh by Claude, in its personality, knowing the time of day, how hungry it
is and whether you're watching. The key lives in your Keychain; only the app's Mac side reads it. It
stops for the day at $0.25 (a setting), and falls back to its own lines when offline, over the cap
or without a key. Anything Claude writes is checked before it's shown: no links, emoji, hashtags or
talk of being an AI, and nothing too long for the bubble.

## What the recordings caught (all fixed, with tests)
Recording in the real app found five things the tests had not:
- **The bubble sat on top of the bar along the top of the window** while you hover. It now drops
  just below it.
- **"I'm hungry" swallowed the "thank you" for the food that followed**, because of the 20-second
  gap. Replies to what you just did now need only 6 seconds.
- **"I'm hungry" itself could be lost for good** if the fish had just said something else. It's the
  line that tells you to feed it, so now it waits and is said a few seconds later, if the fish is
  still hungry.
- **It talked to an empty room behind full-screen apps.** On a MacBook with a notch, a full-screen
  app doesn't cover the strip beside the notch, so my "is something full screen?" check never fired.
  It now asks the simpler question, "can anyone see the pet?", and stays quiet when not: another
  Space, a full-screen app, or the pet hidden. Checked in the installed app with Chrome full screen.
- **A clock that went backwards silenced it.** The first recording ran the fish's talk clock an
  hour ahead; after a relaunch it believed it had last spoken an hour from now and said nothing
  until real time caught up. A time zone change would do the same to a real pet. Times in the
  future are no longer believed.

## Numbers
Tests: 492 unit tests, 31 Rust tests and the 5 browser tests pass; the type check is clean. Both
apps are rebuilt and installed with everything above.

## What I'm unsure about
- **Claude-written lines haven't made a real call yet.** There's no API key on this Mac, and adding
  one is yours to do (`NEEDS-SAMMY.md`). Everything up to the network is tested: the request, the
  check on what comes back, falling back to its own lines, and the daily cap.
- **How chatty is right.** Four lines in a visit, then quiet; eight an hour. In the hour clip three
  facts in a row at the end feels a little like a fact machine. Facts are 35% of what it
  volunteers; that and the per-visit four are the two numbers to turn.
- **Opening a source can whisk you away.** If your browser is full screen, macOS switches to it
  when the fish opens a link, which is how the first recording ended up behind Chrome. That's
  normal Mac behaviour, but it's a bigger jump than "tap for more" suggests.
- **The hourly cap counts against the evening.** If you sit with it for a long stretch it goes
  quiet once it has said eight things in the hour, even while you're there. Good for "charm, not
  nag", but someone who wants a chatty pet may read it as the fish running out of things to say.
- **Kids.** The lines and facts are written for all ages and checked for unkind words, but if
  children use it, Anthropic's rules for products minors use and COPPA apply to Claude-written lines
  and to Step E's chat (`NEEDS-SAMMY.md`).

## Things that happened on the way
- The first recording's capture scripts were in a scratch folder that was cleared when a session
  restarted. They're in the repo now (`tools/mac/window_stills.py`, `stills_to_clip.py`,
  `record_talk.sh`), so the clips can be made again.
- The first recording also opened a browser tab (a Monterey Bay Aquarium page about sea otters, a
  fact's source) in your Chrome. That was the real click proving "open the source" works; it's still
  open, close it whenever.

## What's next
Step E, getting to know you: a "get to know me" card (your name, your teams, your interests), typing
to the fish and it answering in its voice, a bond that grows with care and visits and changes how it
behaves, and everything it learns about you staying on the Mac with a "forget me" button. Your notes
about shared interests and being happy or sad when your team wins or loses land in E and F.
