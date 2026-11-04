// What the hamster says on a day worth remembering (AFTER-BAKEOFF Step G; the types are in
// src/brain/types.ts). Data only; src/brain picks, and the bubble offers to share the moment.
//
// The same hamster as lines.ts, chat.ts and world.ts, in the same four characters, for kids and adults:
//   sarcastic — deadpan, pretends not to care, plainly does.
//   anxious   — sweet, a worrier, relieved every time you show up.
//   zen       — calm, grateful, finds the poetry in a seed.
//   hyper     — everything is the best thing that has ever happened, again.
// Each line is a small celebration: proud, funny, warm, short, the kind of thing you send a friend.
// The button under the bubble speaks for itself, so lines never mention sharing, pictures or apps.
// The jokes are the hamster's own (pouches, the stash, the wheel, the house), never the fish's.
//
// Tokens, and only where they are named (`{name}`, the hamster's own name, is allowed anywhere):
//   birthday  `{age}`: "one week", "one month", "two months", "one year". Lower case, so never at the
//             start of a sentence; "I am {age} old" and "for {age}" read right, "{age}s" does not.
//   meals     `{count}`: a number of meals, "10", "100", "1,000". "Meal number {count}" or
//             "{count} meals", never "{count}th".
//   bond      `{bond}`: "getting comfy", "good friends", "best friends". A label, so "New status:
//             {bond}." works for all three; "We are {bond}!" does not.
//   big-win   `{team}` and `{score}` ("117-112", your team first, so never "by {score}"). "the
//             {team}" is fine, "a {team}" is not. No predictions, no facts beyond the tokens.
// No numbers of their own. Every line is at most 90 characters with the longest test values and
// appears once in the whole voice.

import type { Personality } from '../../../sim/types';
import type { MilestoneMoment } from '../../../brain/types';

export const HAMSTER_MILESTONES: Record<Personality, Record<MilestoneMoment, readonly string[]>> = {
  sarcastic: {
    birthday: [
      'I am {age} old today. No fuss. A small amount of fuss. Seed fuss.',
      '{name} is {age} old today. The wheel got me nothing. Typical.',
      'Birthday report: {age} old, cheeks intact, wheel still going nowhere.',
      'I have been your hamster for {age}. You may bring seeds.',
      'Today I turn {age} old. I celebrated by digging. So, a normal day.',
      'Happy birthday to me, {age} old. I would like a sunflower seed. Several.',
      'Another birthday. I am {age} old and I have hidden my own cake. Seeds.',
    ],
    meals: [
      'Meal number {count}. Yes, I counted. With my cheeks.',
      'That makes {count} meals. Most of them are still in the corner.',
      '{count} meals and the stash grows. Do not look in the corner.',
      'Meal {count}, done. My compliments to the hopper operator. You.',
      '{count} meals so far. Roughly half eaten, half buried. Good system.',
      'Count it: {count} meals. The hopper and I have history now.',
      'Seed milestone: {count} meals. I remain small. On purpose.',
    ],
    bond: [
      'New status: {bond}. The stash stays mine, though.',
      'Us: {bond}. You may have one seed. A small one. Not the good one.',
      'Friendship update: {bond}. I did not run from you. That is huge.',
      'Level unlocked: {bond}. I stopped hiding when you come in. Mostly.',
      'Official record: {bond}, you and me. I put a seed in your corner.',
      'Status: {bond}. Fine. I came out of the house for you. Twice.',
      'Glass news: you and me, {bond}. Do not make it weird.',
    ],
    'big-win': [
      'Big win. {team} {score}. One seed goes in the trophy corner.',
      'The {team} won, {score}, and I ran until the wheel got dizzy.',
      'Mark the night. {team} {score}. Three victory sprints. Fine, nine.',
      '{score}! The {team}! Okay, I squeaked. Pretend you heard nothing.',
      'History in the glass: {team} {score}. I was here. I was eating.',
      'Go {team}! {score}! Fine, I am squeaking. Bedding everywhere.',
      'Remember this one: {team} win, {score}. It is going in the stash.',
    ],
  },
  anxious: {
    birthday: [
      'I am {age} old today! I made it! Thank you for every seed!',
      'It is my birthday! I am {age} old! Is a tiny party okay? Very tiny?',
      'We have had {age} together! I hope I have been a good hamster.',
      'Today I am {age} old, and I only hid once today. Well, twice.',
      'My birthday! I am {age} old, and you kept the hopper full the whole time.',
      '{name} is {age} old! Birthdays make my whiskers shake. Happy shaking!',
      'I am {age} old! I saved a seed for the occasion. I ate it. Sorry!',
    ],
    meals: [
      'Meal number {count}! The hopper was never empty for long! Thank you!',
      '{count} meals! Every one from you! My cheeks say thank you!',
      'That was meal {count}! I still check the hopper. But it is always full!',
      '{count} meals together! I am the luckiest hamster behind any glass!',
      'I kept count in seeds. Meal {count}! That is a lot of seeds!',
      'We reached {count} meals! My whiskers are wobbling with joy!',
      'Meal count: {count}! I pouched a little of every single one!',
    ],
    bond: [
      'New status: {bond}! Oh, I hoped so much!',
      'Us: {bond}! Is that right? I think it is lovely!',
      'Friendship level: {bond}! I feel safe enough to nap out in the open!',
      'Our new friendship level: {bond}! I need a moment in the house. Happy moment!',
      'We made it to {bond}! You and me! My whiskers do not know what to do!',
      'Update: you and me, {bond}! I promise to squeak less at night.',
      'Status: {bond}. I was nervous you would not like a nocturnal friend. You do!',
    ],
    'big-win': [
      'We won, {score}! The {team} did it! I am so happy I could dig to the moon!',
      'Oh my whiskers! {team} {score}! This is the best night!',
      'A big win for the {team}, {score}! I can come out of the house now!',
      '{score}! Go {team}! My paws are shaking, the happy way!',
      'The {team} won {score}! I want to keep this moment in my cheeks forever.',
      'We did it, {team}! {score}! I ran a lap and did not check for shadows once!',
      'Big, big win! {team} {score}! I squeaked so loud I scared myself!',
    ],
  },
  zen: {
    birthday: [
      'Today I am {age} old. Each seed along the way was enough.',
      'For {age}, this glass has been home. I am grateful for every night of it.',
      'A birthday. I am {age} old, and the house still fits.',
      '{name} is {age} old today. I mark it with one slow turn of the wheel.',
      'I am {age} old. Small still, and somehow more than I was.',
      'My birthday, and I am {age} old. Grateful for the hand that fills the hopper.',
      'I am {age} old today. A little hamster, a whole life, one seed at a time.',
    ],
    meals: [
      'Meal number {count}. I ate some, I kept some, I was thankful for all.',
      '{count} meals, chewed slowly. The cheeks remember every one.',
      'This was meal {count}. Full pouches, quiet heart.',
      '{count} meals from your hand. The stash has never been empty.',
      'Meal {count}. One slow turn of the wheel, in thanks.',
      'We have reached {count} meals together. Enough, every time.',
      'Meal count: {count}. Plenty, and then a little more to keep.',
    ],
    bond: [
      'You and I: {bond}. Like a seed and the soft ground.',
      'New status: {bond}. Trust grows the way tunnels do, slowly.',
      'Our friendship, today: {bond}. I rest easy in the open.',
      'A new turn of the wheel: {bond}. I am glad of you.',
      'Friendship level: {bond}. Earned one seed at a time.',
      'Us, now: {bond}. The house has room for that.',
      'Our bond: {bond}. I sit by the glass to honour it.',
    ],
    'big-win': [
      'A big win, {score}. The {team} shine. I bury a seed to remember.',
      '{team} {score}. I will carry this one in my cheeks a long while.',
      'Joy, {score}. Well done, {team}. Even the wheel turns lighter.',
      'The {team} won, {score}. A bright night, and a still heart.',
      'Go {team}. {score}. I tuck this moment in with the best seeds.',
      'A great win, {score}. One slow, glad turn of the wheel for the {team}.',
      '{score}, and the {team} rise. The bedding has never felt softer.',
    ],
  },
  hyper: {
    birthday: [
      'MY BIRTHDAY! I am {age} old! I ran a lap for every day! Probably!',
      'I am {age} old today! SO grown up! My pouches are HUGE now!',
      'Birthday digging! Birthday wheel! Birthday ME! I am {age} old!',
      '{name} is {age} old! Party in the bedding! The wheel is invited!',
      'Guess who is {age} old?! THIS HAMSTER! Seeds for EVERYONE!',
      'I have been your hamster for {age}! Every night was the BEST night!',
      'Happy birthday to me! I am {age} old and I am NOT sleepy! Okay, a bit!',
    ],
    meals: [
      'MEAL NUMBER {count}! Straight into the cheeks! BOTH cheeks!',
      '{count} meals! That is SO many seeds! I stashed MOST of them!',
      'We did it! Meal {count}! Victory wheel! Then a nap! Then MORE wheel!',
      'Meal {count}! The hopper is my favourite place in the WORLD!',
      '{count} meals and my cheeks STILL get excited every time!',
      'Crunch crunch! That was meal {count}! Best hopper! Best person!',
      'Meal count: {count}! Crunch! Stash! Crunch! Stash! FOREVER!',
    ],
    bond: [
      'NEW STATUS: {bond}! I did a flip off the house!',
      'Us: {bond}! You and me! WHEEL for joy!',
      'Friendship level up! Now: {bond}! SQUEAK!',
      'It is official! You and me: {bond}! I am ZOOMING in circles!',
      'Bond update: {bond}! I buried a seed in your honour! The BEST seed!',
      'Look at us! Now: {bond}! Cheeks full of HAPPY!',
      'Status: {bond}! I love this SO much I forgot to run!',
    ],
    'big-win': [
      'WE WON! {team} {score}! I threw ALL the bedding in the air!',
      'The {team} WON, {score}! I ran so fast I lapped MYSELF!',
      'GO {team}! {score}! I squeaked so loud the water bottle rattled!',
      'Big win! HUGE win! {team} {score}! Seeds for the whole glass!',
      '{team} {score}! I am so happy I will dig a tunnel to the moon!',
      'This is the BEST win! {team}, {score}! Both cheeks FULL of joy!',
      'Victory wheel! {score}! GO GO GO {team}! Faster! FASTER!',
    ],
  },
};
