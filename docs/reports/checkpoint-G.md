# Checkpoint G — every pet gets the brain

Date: 2026-11-03. Brief: `docs/AFTER-BAKEOFF.md`, Step G.

> **DRAFT (2026-11-04).** The code is done and committed (`9b659ea`, `c90b5c6`), every test passes and
> both apps are installed. The four clips are NOT recorded yet: two nights of trying met a locked Mac
> and then Sammy coming back mid-clip, and the one usable take caught the terrarium bug fixed in
> `c90b5c6`. To finish: `bash tools/mac/record_hamster.sh <out>` while the Mac is unlocked and idle,
> `stills_to_clip.py` each part into `checkpoint-G/`, check the stills, delete this note.

## What to look at
Everything is in `checkpoint-G/`, recorded in the installed harness app. The pet is a fresh hamster in
the glass terrarium, close to you, following the Celtics.
- **`clip-talk.mp4`:** a thought in its own voice, a knock on the glass, and a fact with its source.
- **`clip-chat.mp4`:** typing to the hamster. A click on it opens the chat; "hi!", "what are you
  doing?", "tell me a joke", "I had a rough day"; Esc gives the keyboard back.
- **`clip-win.mp4`:** a test win for your team. The result line, then victory sprints on the wheel,
  and a happy line later.
- **`clip-loss.mp4`:** a test loss. The result line, then it keeps to its house, slowly, and a mopey
  line later.
- **The lines:** `src/species/hamster/voice/` (lines, facts, chat, world, milestones).

## What's built
- **The hamster has the whole brain.** Everything the fish learned in Steps D to F2 now works for the
  hamster, through the same code: thoughts and facts, hello and goodnight, talking with you and
  getting to know you, the bond, your teams and the news, birthdays and milestones with Share this,
  the pet card. Nothing in the brain changed; the hamster brought a voice.
- **Its own character.** The fish's comedy is boredom and the round bowl. The hamster's is appetite,
  hoarding and the wheel: cheek pouches, the stash in the corner, digging, being nocturnal, running
  very hard toward nowhere. Same four personalities, none of the same jokes. The lines name the
  glass, the house and the bedding, so they hold in the terrarium and the cage alike.
  - 300 lines, 75 per personality, every moment covered;
  - 614 chat lines;
  - 258 lines about your teams and the news;
  - 112 milestone lines;
  - 188 facts, each checked against its source page (27 pages: Wikipedia, Guinness World Records,
    National Geographic Kids, the RSPCA, the PDSA, the Merck Veterinary Manual, a Hartpury
    University study).
- **Body language from the same feelings.** A win sends it to the wheel: it wants the wheel three times
  as much, runs it half again as hard, and takes a victory sprint every 25 seconds. A loss keeps it to
  its house, slower, the way a hiding hamster does. Hunger still outranks a mood.
- **A rule for every species to come.** A new test (`voiceContract.test.ts`) fails any species that
  ships without the full voice: lines for every moment, 100 facts, chat, teams and news, milestones,
  and no line borrowed from another species. The frog and the chicken will have to talk before they
  can ship.
- **A bug the recording caught.** The first win clip showed the hamster celebrating under its house
  and the loss clip showed it sulking beside the wheel: the behaviour had used the cage's positions
  in the terrarium since the terrarium arrived, and no test had noticed because the tests used the
  cage. The behaviour now takes the positions of whichever habitat it is mounted in, with a test for
  the terrarium. The clips below are from the rebuilt app.
- **Small fixes on the way:** the Claude prompt now sends a rude conversation back to "your
  terrarium" rather than "your bowl" for a hamster, and describes the terrarium it lives in; the
  browser test for the hamster now checks TALK appears and opens the chat.

## Numbers
- Tests: 650 unit tests (41 new), 33 Rust tests and 6 browser tests pass; the type check is clean.
  Both apps are rebuilt and installed.
- The hamster's voice is 2,220 lines of TypeScript; the fish's is 2,157.

## What I'm unsure about
- **Taste.** The writers flagged a few lines for you: the sarcastic "You do know what a schedule is."
  (the sharpest line in the file), an anxious knock-knock joke in the same format as the fish's,
  and British spelling throughout ("favourite", "cosy") to match the fish. All pass the kindness
  rules; say the word and any of them go.
- **Two recordings went wrong before this one.** The first caught a sleeping hamster: the harness
  pet had been driven all day and its energy was at zero, so it slept through everything, and the
  bubble stopped painting while WebKit held the page as hidden. The second started on a locked
  screen: idle, but every window off-screen behind the lock, and the page hidden again. The driver
  now starts from a fresh pet, refuses a locked screen, and brings the pointer in first. Worth
  remembering for every recording: check `state` for `visibility` and `energy` before trusting the
  stills.
- **No new art.** The hamster's sprites are the Phase 0 set; a sprint on the wheel is the hamster at
  the wheel with the wheel's own spin, not a new running pose. PHASE-NEXT Step 4 (animation quality)
  is where that belongs.
- **The README** still describes the app as of 2026-10-28: nothing about talking, the card, teams,
  news or sharing. It needs a refresh before anyone else installs the app; I'd do it with Step 5 of
  PHASE-NEXT or sooner if you want.

## What's next
PHASE-NEXT Steps 3 to 5 on C, with the brain included for every new species: environments, animation
quality, then the frog and the chicken. Step H (the tank on the desktop) is proposed after those, or
earlier if you'd rather see it first.
