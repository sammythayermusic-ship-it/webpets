// What the chicken says on a day worth remembering (PHASE-NEXT Step 5; the types are in
// src/brain/types.ts). Data only; src/brain picks, and the bubble offers to share the moment.
//
// The same chicken as lines.ts, chat.ts and world.ts, in the same four characters, for kids and adults:
//   sarcastic — the deadpan inspector, pretends not to care, plainly does.
//   anxious   — sweet, a worrier who keeps checking the sky, relieved every time you show up.
//   zen       — calm, grateful, finds the poetry in a scratch of ground.
//   hyper     — everything is the best thing that has ever happened, again.
// Each line is a small celebration: proud, funny, warm, short, the kind of thing you pass to a friend.
// The control under the bubble speaks for itself, so lines never mention it, or pictures, or apps.
// The jokes are the chicken's own (inspections, the record, the pecking order, dust baths, dawn), and
// every line is true of a chick and of a hen alike.
//
// Tokens, and only where they are named (`{name}`, the chicken's own name, is allowed anywhere):
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

export const CHICKEN_MILESTONES: Record<Personality, Record<MilestoneMoment, readonly string[]>> = {
  sarcastic: {
    birthday: [
      'I am {age} old today. I expect grain, and a short speech. From you.',
      'Notice: {name} is {age} old. Top of the pecking order throughout.',
      'Birthday inspection complete. I am {age} old. No faults found.',
      'I have run this place for {age}. You are welcome.',
      'Today I turn {age} old. I was up at dawn for it. As ever.',
      'I am {age} old. A dust bath in my honour would be appropriate.',
      'I am {age} old and have never missed a dawn. Can you say the same?',
    ],
    meals: [
      'Meal number {count}. Every one inspected before pecking.',
      'That makes {count} meals. I have notes on each.',
      '{count} meals, and not one grain left behind. Standards.',
      'Meal {count}, complete. Your scattering has improved. Slightly.',
      '{count} meals to date. Ratings range from adequate to very good.',
      'Let the record show {count} meals. The record is thorough.',
      '{count} meals. I remain modest about it. Visibly modest.',
    ],
    bond: [
      'New status: {bond}. I have adjusted the pecking order.',
      'Ruling: {bond}. You may stand a little closer to my grain.',
      'Official finding: {bond}, you and me. It passed inspection.',
      'Status report: {bond}. I did not see it coming. I see everything.',
      'Now in the record: {bond}. In my neatest scratching.',
      'Level reached: {bond}. It has gone straight to my head.',
      'You and me: {bond}. I announced it to the run. The run approved.',
    ],
    'big-win': [
      'Big win. {team} {score}. I strutted. I am not sorry.',
      'The {team} won, {score}. I have declared a victory dust bath.',
      'Mark it down. {team} {score}. One flap. Then eleven more.',
      '{score}! The {team}! Fine, I made a noise. A dignified noise.',
      'Witnessed from the straw: {team} {score}. I was on duty.',
      'Go {team}. {score}. Top of the pecking order today. Like me.',
      'For the record, underlined twice: {team} win, {score}.',
    ],
  },
  anxious: {
    birthday: [
      'I am {age} old today! Nothing bad happened the whole time!',
      'It is my birthday. I am {age} old. Could the fuss be a quiet one?',
      'You have kept me safe for {age}. I noticed every day of it.',
      'Today I am {age} old, and I only looked up a few times. Often.',
      '{name} is {age} old! I checked. Then I checked again. True!',
      'I am {age} old! I think I am a tiny bit braver than before.',
      'I am {age} old, and the sky has stayed up the entire time!',
    ],
    meals: [
      'Meal number {count}! I worried before every one. Every one came!',
      '{count} meals! You never forgot. I did keep checking. Sorry.',
      'That was meal {count}. I can nearly relax at mealtimes. Nearly.',
      '{count} meals. Thank you for every single grain. I mean every one.',
      'I counted on my toes, lots of times. Meal {count}! Imagine!',
      'Meal {count}! My fluff has gone all soft with thanks.',
      'After {count} meals I only sound the alarm at some of them.',
    ],
    bond: [
      'New status: {bond}! I was hoping. I did not like to ask.',
      'Us: {bond}! Is that really us? It is! Oh!',
      'It says {bond}! About you and me! I need the warm spot a minute.',
      'We got to {bond}! I flinched a lot less on the way!',
      'Our status: {bond}. I feel safe enough to shut both eyes.',
      'You and me, {bond}! I will try to raise fewer alarms.',
      'Status: {bond}. I thought I might be too jumpy for you. I am not!',
    ],
    'big-win': [
      'We won, {score}! The {team} did it! I am fluffed up with joy!',
      'Oh my goodness! {team} {score}! And nothing fell!',
      'I held my breath for the {team} and it worked! {score}!',
      '{score}! Go {team}! My legs are wobbly, the good wobbly!',
      'The {team} won {score}! I am keeping today under my wing.',
      'We did it, {team}! {score}! I flapped without looking up first!',
      '{team} {score}! I raised the alarm! The happy alarm! All clear!',
    ],
  },
  zen: {
    birthday: [
      'I have met the dawn for {age} now. It has never once been late.',
      'For {age} I have walked this small ground. It has been enough.',
      'I am {age} old, and the warm spot is as warm as the first day.',
      '{name} is {age} old today. One wing, stretched slowly, to mark it.',
      'I am {age} old. A little taller in the fluff, a little quieter within.',
      'I am {age} old today, and thankful for the hand that scatters.',
      'One bird, {age} old, and many mornings, each one met.',
    ],
    meals: [
      'Meal number {count}. Each grain was welcomed in its turn.',
      '{count} meals, pecked up slowly. None taken for granted.',
      'This was meal {count}. The ground gave, and I received.',
      '{count} meals from your hand. I have wanted for nothing.',
      'Meal {count}. I pause over the last grain, in thanks.',
      'We have come to {count} meals. Plenty, every time.',
      'Meal count: {count}. A long row of small kindnesses.',
    ],
    bond: [
      'The morning has a name for us now: {bond}.',
      'It came the way fluff dries, slowly and then all at once: {bond}.',
      'What we have, today: {bond}. I stand easy beside you.',
      'Another dawn, another step: {bond}. I am glad.',
      'Friendship level: {bond}. It grew while neither of us was looking.',
      'There is room under this wing for one more thing: {bond}.',
      'I bow my head once, for this: {bond}.',
    ],
    'big-win': [
      'A great win, {score}. The {team} shine. I stand a little taller.',
      '{team} {score}. I will keep this day warm under one wing.',
      'The dust is dancing in the light. {score}. Well done, {team}.',
      'The {team} won, {score}. A bright day, quietly kept.',
      'I will remember where I stood today. {team}, {score}.',
      'One glad flap for the {team}, {score}. Then stillness.',
      '{score}, and the {team} rise. The morning was right to come.',
    ],
  },
  hyper: {
    birthday: [
      'MY BIRTHDAY! I am {age} old! I got up EXTRA early for it!',
      'I am {age} old! Look how big I can fluff now! LOOK!',
      'I am {age} old! Birthday patrol first! Then birthday dust bath!',
      '{name} is {age} old! That is ME! I am {name}! Flap flap!',
      'I am {age} old and I have seen EVERY dawn! All of them! Mine!',
      'Your chicken is {age} old today! That is me! I am the chicken!',
      'I am {age} old and NOT slowing down! Watch! See?! Not slowing!',
    ],
    meals: [
      'MEAL NUMBER {count}! I found every single grain! AGAIN!',
      '{count} meals! That is SO much pecking! My beak is a CHAMPION!',
      'Meal {count}! You threw it and I FOUND it! Every time!',
      'That was meal {count}! Scattered grain is the best invention!',
      '{count} meals and I STILL run over like it is the first one!',
      'Peck peck! Meal {count}! Best ground! Best person!',
      'Meal count: {count}! Scatter! Chase! Peck! Again! AGAIN!',
    ],
    bond: [
      'NEW STATUS: {bond}! I flapped so hard I moved!',
      'Us: {bond}! Happy circle! I am running it right NOW!',
      'It reads {bond}! That is US! I cannot keep my feet down!',
      'You and me: {bond}! Maximum fluff! This is maximum!',
      'Bond update: {bond}! I found you the BEST speck to celebrate!',
      'Look at us! Now: {bond}! Wings out! This is my happy shape!',
      'Status: {bond}! I announced it at dawn! And noon! And JUST NOW!',
    ],
    'big-win': [
      'WE WON! {team} {score}! I kicked straw over EVERYTHING!',
      'The {team}! {score}! I have run out of circles! I need more circles!',
      'GO {team}! {score}! Both my feet left the ground! BOTH!',
      '{team} {score}! Grain for the whole run! That is just me! MORE!',
      '{team} {score}! I am so happy I could fly! A little! Briefly!',
      'The BEST win! {team}, {score}! Every bit of fluff is UP!',
      'One flap for every point! {score}! GO {team}! My wings! Worth it!',
    ],
  },
};
