// Speech line pools for the hamster, keyed by personality then situation. Data only; ui picks from
// them: `fed` on a bite, `hungry`/`starving` on label change, `idle` on a 60-180 s timer, `wake` after
// a montage.
//
// The same four personalities as the fish, and deliberately not the same jokes. A fish's comedy is
// confinement and boredom — it goes in circles in a glass ball and can see you. A hamster's is
// appetite, hoarding and the wheel: it is busy, it is nocturnal, it has pouches, and it is running
// extremely hard toward nowhere. Reusing the fish's lines with the nouns swapped would have read as
// exactly what it was.

import type { Personality } from '../../sim/types';
import type { LinePool } from '../types';

export const HAMSTER_LINES: Record<Personality, Record<LinePool, readonly string[]>> = {
  sarcastic: {
    idle: [
      'Ran four kilometres. Same cage.',
      'The wheel and I have an understanding.',
      'I moved the bedding. It is art.',
      'Nocturnal. That is a lifestyle, not a flaw.',
      'Two exits in this cage. Both are lies.',
      'I have seen the outside. It was a sock drawer.',
      'Cardio. For what, exactly.',
      'Everything here is mine. It is not much.',
      'Ah yes. The bars. My old friends.',
    ],
    fed: [
      'Straight in the cheeks. No questions.',
      'Finally. Some infrastructure.',
      'I will bury most of this. Do not look.',
      'Adequate seed. Barely.',
      'You do know what a schedule is.',
      'This goes in the corner. The good corner.',
      'Noted. Logged. Pouched.',
    ],
    hungry: [
      'The hopper is a suggestion at this point.',
      'I am rationing. It is going poorly.',
      'Wheel is closed. Management decision.',
      'Checked the corner stash. Past me lied.',
      'You are aware I am small and fast, yes.',
    ],
    starving: [
      'Even the bedding looks edible now.',
      'No running. No pouches. Nothing.',
      'I am doing my flat impression.',
      'This is where the bit stops being funny.',
    ],
    wake: [
      'You were gone. The wheel was not.',
      'I did laps for both of us.',
      'Oh, you again. The hopper first.',
    ],
  },
  anxious: {
    idle: [
      'Is that a shadow? That was a shadow.',
      'I should move the bedding. Somewhere safer.',
      'The wheel squeaks. Everyone can hear it.',
      'I counted my seeds. Twice. Different numbers.',
      'Something is above us. Something is always above us.',
      'I do not like how open the middle is.',
      'What if the hopper is the last hopper.',
      'I will just be under here.',
    ],
    fed: [
      'Okay. Okay. Pouches. Now.',
      'I am hiding most of this immediately.',
      'Thank you. Please do that again tomorrow.',
      'Is this all of it? Is there more?',
      'I feel better. Briefly.',
      'Do not watch where I put it.',
    ],
    hungry: [
      'The hopper is empty and I checked four times.',
      'I knew this would happen. I said so.',
      'My stash is gone. I ate my stash.',
      'Not running. Saving everything. Everything.',
    ],
    starving: [
      'I cannot feel my feet.',
      'I am so small. I was always so small.',
      'Please. The hopper. Anything.',
      'I am lying down now. Just for a moment.',
    ],
    wake: [
      'You came back. You came back.',
      'I was very brave. Mostly.',
      'Everything is where I left it. I checked.',
    ],
  },
  zen: {
    idle: [
      'The wheel turns. I turn. Neither of us arrives.',
      'The bedding is soft. That is enough.',
      'Night is simply the quiet half.',
      'I keep what I need. I bury the rest.',
      'One seed at a time.',
      'The bars are not a cage if you do not lean on them.',
      'Small room. Whole world.',
      'Stillness, then running, then stillness.',
    ],
    fed: [
      'Received. Thank you.',
      'Enough is a complete amount.',
      'I will eat some now and keep some for later.',
      'Good seed. Good hour.',
      'This is plenty.',
    ],
    hungry: [
      'The hopper is empty. This too is information.',
      'I will rest instead of run.',
      'Hunger is only loud if you listen closely.',
      'I am waiting. I am good at waiting.',
    ],
    starving: [
      'I am very still now.',
      'The wheel will keep without me.',
      'I am not afraid. I am only tired.',
    ],
    wake: [
      'You returned. The bedding kept its shape.',
      'Time passed. I was here for it.',
      'Welcome back. There is room.',
    ],
  },
  hyper: {
    idle: [
      'Nine kilometres on the wheel! Going nowhere! Best day!',
      'Wheel! Wheel! WHEEL!',
      'I hid a seed. Then I forgot where. Then I found it! Amazing!',
      'I fluffed the bedding! It is SO fluffy now!',
      'Sleep is for later! Zoomies are for now!',
      'New personal best on the wheel! Did you see? Nobody saw.',
      'I am the fastest hamster in this cage! The only one! Still counts!',
      'Spin spin spin spin spin!',
    ],
    fed: [
      'SEEDS! Straight into the cheeks!',
      'I will take ALL of them, thank you!',
      'Cheeks full! Heart full!',
      'This is the best snack in the history of snacks!',
      'Nom nom nom! Stash stash stash!',
      'Best delivery ever!',
    ],
    hungry: [
      'My stash is gone! Where did it go? Oh. I ate it.',
      'Wheel paused for a snack break. Snack please!',
      'Hungry hamster! Very hungry hamster!',
      'Seeds? Any seeds? Tiny seeds? Please!',
    ],
    starving: [
      'So hungry I cannot even spin. Help!',
      'Empty cheeks. Empty hopper. Big sad. Food please!',
      'Emergency snack needed! Right now!',
    ],
    wake: [
      'You are back! I ran the whole time! Ask the wheel!',
      'Hi hi hi! I saved you a seed! Okay, I ate it.',
      'Refill the hopper and let us go!',
    ],
  },
};
