// What the goldfish says on a day worth remembering (AFTER-BAKEOFF Step F2; the types are in
// src/brain/types.ts). Data only; src/brain picks, and the bubble offers to share the moment.
//
// The same fish as lines.ts, chat.ts and world.ts, in the same four characters, for kids and adults:
//   sarcastic — deadpan, pretends not to care, plainly does.
//   anxious   — sweet, a worrier, relieved every time you show up.
//   zen       — calm, grateful, finds the poetry in a pebble.
//   hyper     — everything is the best thing that has ever happened, again.
// Each line is a small celebration: proud, funny, warm, short, the kind of thing you send a friend.
// The button under the bubble speaks for itself, so lines never mention sharing, pictures or apps.
//
// Tokens, and only where they are named (`{name}`, the fish's own name, is allowed anywhere):
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

export const FISH_MILESTONES: Record<Personality, Record<MilestoneMoment, readonly string[]>> = {
  sarcastic: {
    birthday: [
      'I am {age} old today. No fuss, please. Okay, a little fuss.',
      'Happy birthday to me. I am {age} old. Flakes make lovely gifts.',
      '{name} is {age} old today. I did not plan a party. The plant did.',
      'Today I turn {age} old. I feel wiser. I look exactly the same.',
      'It has been {age} of laps. Not one wrong turn. Birthday fish here.',
      'Birthday update: I am {age} old. Still the best fish in this bowl.',
      'I have been your fish for {age} now. I suppose that is nice. It is.',
    ],
    meals: [
      'Meal number {count}. Not that I was counting. I was counting.',
      'That makes {count} meals. You are getting quite good at this.',
      '{count} meals and not one complaint. Fine, a few. Small ones.',
      'Meal {count}, done. My compliments to the person with the flakes.',
      '{count} meals so far. I would like to thank my chef. That is you.',
      'Count it: {count} meals. I am basically a food critic now.',
      'Flake milestone: {count} meals. I remain hard to impress. Mostly.',
    ],
    bond: [
      'New status: {bond}. Do not let it go to your head.',
      'Us: {bond}. Official. I suppose I like you. A bit. A lot.',
      'Friendship update: {bond}. I was not trying. It just happened.',
      'Level unlocked: {bond}. I will deny everything.',
      'Official record: {bond}, you and me. Tell no one. Tell everyone.',
      'Status changed to {bond}. I am acting cool. I am not cool.',
      'Bowl news: you and me, {bond}. Try to act normal.',
    ],
    'big-win': [
      'Big win. {team} {score}. I am framing this moment. Mentally.',
      'The {team} won, {score}, and I am being very cool about it. Very.',
      'Mark the date. {team} {score}. I did three laps. Victory laps.',
      '{score}! The {team}! Okay, I am excited. You saw nothing.',
      'History in the bowl: {team} {score}. I was here. I saw it all.',
      'Go {team}! {score}! Fine, I am yelling. Bubbles everywhere.',
      'Remember this one: {team} win, {score}. I will. Forever.',
    ],
  },
  anxious: {
    birthday: [
      'I am {age} old today! I made it! We made it! Thank you!',
      'It is my birthday! I am {age} old! Is it okay if I feel special?',
      'We have had {age} together! I hope you know how happy you make me.',
      'Today I am {age} old, and I was not worried once today. Well, once.',
      'My birthday! I am {age} old, and you looked after me the whole time.',
      '{name} is {age} old! Birthdays make me nervous. This one is lovely.',
      'I am {age} old! Thank you for every flake and every hello.',
    ],
    meals: [
      'Meal number {count}! You never forgot me. Thank you so much!',
      '{count} meals! Every single one from you. I feel so looked after.',
      'That was meal {count}! I used to worry about food. Not anymore!',
      '{count} meals together! Oh, I am so lucky you are my person.',
      'I counted every one, just to be sure. Meal {count}! Thank you!',
      'We reached {count} meals! I am so happy, my fins are fluttering.',
      'Meal count: {count}! Every one was yummy. And so kind of you.',
    ],
    bond: [
      'New status: {bond}! Oh, I hoped this would happen!',
      'Us: {bond}! Is that okay? I think it is wonderful.',
      'Friendship level: {bond}! I feel so safe with you.',
      'Our new friendship level: {bond}! I am a little teary. Happy teary.',
      'It says {bond} now! You and me! I was so hoping.',
      'Update: you and me, {bond}! I promise to be a very good fish.',
      'Status: {bond}. I was nervous you might not like me. You do!',
    ],
    'big-win': [
      'We won, {score}! The {team} did it! I am so happy I could float!',
      'Oh my fins! {team} {score}! This is the best day!',
      'A big win for the {team}, {score}! I was worried for nothing!',
      '{score}! Go {team}! I am shaking, but the happy kind!',
      'The {team} won {score}! I want to remember this forever and ever.',
      'We did it, {team}! {score}! I need a little sit on my pebble.',
      'Big, big win! {team} {score}! All my worry turned into wiggles!',
    ],
  },
  zen: {
    birthday: [
      'Today I am {age} old. Every lap has been a gift.',
      'I have known {age} of water and light. Thank you for all of it.',
      'A birthday. I am {age} old, and the bowl feels like home.',
      '{name} is {age} old today. I celebrate with one slow, happy circle.',
      'I am {age} old. The pebbles are the same. I have grown. Gently.',
      'My birthday, and I am {age} old. Grateful for you, every day of it.',
      'I am {age} old today. A small life, and a very full one.',
    ],
    meals: [
      'Meal number {count}. Each one a small kindness from you.',
      '{count} meals, eaten slowly. I am grateful for every flake.',
      'This was meal {count}. Full belly, full heart.',
      '{count} meals from your hand. The bowl has never felt hungry.',
      'Meal {count}. I take a slow, thankful lap.',
      'We have reached {count} meals together. Simple things are the best.',
      'Meal count: {count}. A quiet number, full of care.',
    ],
    bond: [
      'You and I: {bond}. Like water and light.',
      'New status: {bond}. Some things grow quietly.',
      'Our friendship, today: {bond}. I am grateful.',
      'A new chapter: {bond}. Thank you for every visit.',
      'Friendship level: {bond}. It came slowly, like all good things.',
      'Us, now: {bond}. The bowl feels warmer for it.',
      'Our bond: {bond}. I take a slow lap to honour it.',
    ],
    'big-win': [
      'A big win, {score}. The {team} glow, and so do I.',
      '{team} {score}. A day to remember, gently and for a long time.',
      'Joy, {score}. Well done, {team}. I am rippling with it.',
      'The {team} won, {score}. Some days shine. This one does.',
      'Go {team}. {score}. I keep this moment like a smooth pebble.',
      'A great win, {score}. I bow my fins to the {team}.',
      '{score}, and the {team} rise. My bubbles rise with them.',
    ],
  },
  hyper: {
    birthday: [
      'IT IS MY BIRTHDAY! I am {age} old! Best birthday EVER!',
      'I am {age} old today! So grown up! Look at my fins!',
      'Birthday laps! Birthday bubbles! I am {age} old!',
      '{name} is {age} old! Party in the bowl! The plant is invited too!',
      'Guess who is {age} old?! ME! Happy birthday to ME!',
      'I have been your fish for {age}! Best time of my whole life!',
      'Happy birthday to me! I am {age} old and I feel AMAZING!',
    ],
    meals: [
      'MEAL NUMBER {count}! Best meal yet! They are ALL the best!',
      '{count} meals! That is SO many meals! I love every one!',
      'We did it! Meal {count}! Happy laps for everyone!',
      'Meal {count}! Can we have a party? With flakes? FLAKE PARTY!',
      '{count} meals and I am still SO excited every single time!',
      'Ding ding! That was meal {count}! What a chef! YOU are the chef!',
      'Meal count: {count}! Nom! Nom! Nom! Forever!',
    ],
    bond: [
      'NEW STATUS: {bond}! BEST NEWS EVER!',
      'Us: {bond}! You and me! Happy laps!',
      'Friendship level up! Now: {bond}! WOOHOO!',
      'It is official! You and me: {bond}! I am zooming!',
      'Bond update: {bond}! I have to do ten flips! Okay, three!',
      'Look at us! Now: {bond}! THAT IS US!',
      'Status: {bond}! I love this! I love you! I love the plant!',
    ],
    'big-win': [
      'WE WON! {team} {score}! BEST! DAY! EVER!',
      'The {team} WON, {score}! I am doing ALL the laps!',
      'GO {team}! {score}! I just did a flip! And another one!',
      'Big win! Huge win! {team} {score}! Party in the bowl!',
      '{team} {score}! I am so happy I will zoom in circles all night!',
      'This is the BEST win! {team}, {score}! Happy bubbles everywhere!',
      'Victory bubbles! {score}! GO GO GO {team}!',
    ],
  },
};
