// What the frog says on a day worth remembering (the types are in src/brain/types.ts). Data only;
// src/brain picks, and the bubble offers to share the moment.
//
// The same frog as lines.ts, chat.ts and world.ts, in the same four characters, for kids and adults:
//   sarcastic — deadpan, pretends not to care, plainly does. Stillness as a flex.
//   anxious   — sweet, a worrier, relieved every time you show up. Stillness as a safety plan.
//   zen       — calm, grateful, finds the poetry in a ripple. Stillness as the whole point.
//   hyper     — everything is the best thing that has ever happened, again. Stillness is a dare.
// Each line is a small celebration: proud, funny, warm, short, the kind of thing you pass on to a
// friend. The bubble's own controls speak for themselves, so lines never mention them. The jokes are
// the frog's own (patience, the stare, the croak, the tongue, the damp), never the fish's or the
// hamster's. A meal is a hunt, so a line may count either.
//
// Tokens, and only where they are named (`{name}`, the frog's own name, is allowed anywhere):
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

export const FROG_MILESTONES: Record<Personality, Record<MilestoneMoment, readonly string[]>> = {
  sarcastic: {
    birthday: [
      'I am {age} old today. I marked it by not moving. Tradition.',
      '{name} is {age} old. Hold the fuss. Bring crickets.',
      'Birthday. I am {age} old and I sat through every minute of it.',
      'You have had a frog for {age}. The frog has had you. Fair trade.',
      'I turn {age} old today. I plan to spend it exactly like yesterday.',
      'It is my birthday. I am {age} old. I would like rain. Arrange it.',
      'I am {age} old. Still damp. Still here. Still not blinking.',
    ],
    meals: [
      'Hunt number {count}. I have had the time to count. All of it.',
      'That makes {count} meals. My tongue would like a plaque.',
      '{count} meals, and I did not rush a single one.',
      'Meal {count}. Whoever keeps letting crickets out: carry on. That is you.',
      'After {count} meals, a few crickets still got away. I let them. Obviously.',
      'I have ambushed {count} dinners. Not one of them saw it coming.',
      'It took {count} meals to get this good at sitting. Worth every one.',
    ],
    bond: [
      'New status: {bond}. I looked at you for a long time before agreeing.',
      'You and me: {bond}. I blinked at you slowly. That was the ceremony.',
      'Apparently we have reached: {bond}. I did not move. But I felt it.',
      'Where we stand: {bond}. Where I sit: closer to the glass. Slightly.',
      'I am told it is now: {bond}. I croaked. Once. Do not expect an encore.',
      'Our status: {bond}. Fine. You may watch me ambush. Few are allowed.',
      'It has come to my attention that we are now: {bond}. Noted. Pleased.',
    ],
    'big-win': [
      'A big one. {team} {score}. I moved. Twice. Write it down.',
      'The {team} won, {score}, and my croak rippled all the water.',
      '{team} {score}. I left the pad over this. I do not leave the pad.',
      '{score}. The {team}. Fine, I leapt. Nobody saw. You saw. Keep it quiet.',
      'I sat through all of it without blinking. {team} {score}. Worth it.',
      'Go {team}! {score}! That croak was mine. I am not sorry.',
      'One for the ages: {team} win, {score}. I blinked twice. Big night.',
    ],
  },
  anxious: {
    birthday: [
      'I am {age} old today! Nothing went wrong the whole time! Thanks to you!',
      'Is it all right to croak on a birthday? I am {age} old! I croaked!',
      'You have looked after me for {age}. I noticed every single day.',
      'I am {age} old! I was nervous about getting older. It is fine! It is nice!',
      'My birthday! I am {age} old and I have never once dried out. Thank you.',
      '{name} is {age} old! That is me! I checked, and it is definitely me!',
      'I am {age} old today. I practised a birthday hop. I landed it! Just about!',
    ],
    meals: [
      'Meal number {count}! I was nervous before every one. Every one was fine!',
      '{count} hunts! I shut my eyes for all of them and it still worked!',
      'You have fed me {count} times. I remember being glad every time.',
      'That was meal {count}. I have nearly stopped worrying about the next one.',
      'I kept count on my toes. Meal {count}! I ran out of toes ages ago.',
      'It has been {count} meals! I did not miss as often as I feared!',
      'After {count} meals: sorry to every cricket, and thank you, thank you, to you.',
    ],
    bond: [
      'New status: {bond}! I read it three times to be sure!',
      'It says: {bond}! About us! Is it allowed to be this nice?',
      'You and me: {bond}! I did not even flinch when you came in today!',
      'We got to: {bond}! I am going to sit very still and feel it.',
      'Our friendship now: {bond}! I worried you would mind the damp. You do not!',
      'I asked the rock what we are. It said nothing. The answer is: {bond}!',
      'Guess what we are called now: {bond}! My throat is fluttering. Happily!',
    ],
    'big-win': [
      'The {team} won, {score}! I watched the whole thing through one eye!',
      '{team} {score}! I can stop holding my breath! All my skin was holding it!',
      'We won, {score}! Go {team}! I leapt before I had time to worry about it!',
      '{score}! The {team}! I croaked so loud the water jumped. Then I jumped.',
      'A huge win for the {team}, {score}! I am sitting right in the open!',
      'It really happened! {team} {score}! I checked twice and it is still true!',
      'Go {team}! {score}! All that careful hoping, and it worked!',
    ],
  },
  zen: {
    birthday: [
      'Today I am {age} old. I sat through all of it, and would again.',
      'I have watched this water for {age}. It has never been the same twice.',
      'A birthday. I am {age} old. The rain does not know, and falls anyway.',
      '{name} is {age} old today. One long blink, to mark the day.',
      'I am {age} old. A little rounder. A little stiller. Much the same.',
      'My birthday. I am {age} old, and glad of whoever lets the crickets out.',
      'I am {age} old today. The water has changed many times. I have stayed.',
    ],
    meals: [
      'Hunt number {count}. Each one began with waiting. Each wait was good.',
      '{count} meals. I thank every cricket, caught or free.',
      'This was meal {count}. The tongue is quick. The gratitude is slow.',
      'After {count} meals, I have learned only this: sit, and it comes.',
      'Meal {count}. The water is calm again, and so am I.',
      'You have brought crickets {count} times. I have noticed each time.',
      'The count stands at {count} meals. I do not hurry toward the next.',
    ],
    bond: [
      'New status: {bond}. It arrived the way rain does, without being asked.',
      'You and I, today: {bond}. The water is wide enough for two.',
      'What we have grown into: {bond}. Slowly, like everything good.',
      'A name for this: {bond}. I would have sat here with you anyway.',
      'Between us now: {bond}. I blink once, slowly, in thanks.',
      'The water shows two shapes at the edge. Their name: {bond}.',
      'Where we have arrived: {bond}. No one hurried. That is why.',
    ],
    'big-win': [
      'The {team} won, {score}. I let one croak go, and it carried.',
      '{team} {score}. A night to sit inside for a long while.',
      'A great win, {score}. Even the still water seems to smile. Go {team}.',
      'Go {team}. {score}. I leapt once. It said everything.',
      'Gladness, {score}. The {team} did well, and the water is bright.',
      '{score}, and the {team} have their evening. I watch the ripples spread.',
      'Well done, {team}. {score}. I will keep this one where the rain is kept.',
    ],
  },
  hyper: {
    birthday: [
      'BIRTHDAY! I am {age} old! One hop for every day! I lost count! Still hopping!',
      'I am {age} old today! My legs are SO much longer! Look! LOOK!',
      'RIBBIT! That was a birthday ribbit! I am {age} old! It sounds the same!',
      '{name} is {age} old! Everybody onto the pad! It only fits me! Still!',
      'Who is {age} old today?! The damp one! ME! Is it going to rain? PLEASE!',
      'We have had {age} of hops together! I remember ALL of them! Most of them!',
      'I am {age} old and I sat still for my whole birthday! No I did not! HA!',
    ],
    meals: [
      'HUNT NUMBER {count}! Tongue out! Tongue in! Still the best trick I know!',
      '{count} meals! That is SO many crickets! Some of them even got caught!',
      'Meal {count}! I leapt at every single one! I always leap! I cannot not!',
      'That was meal {count}! Thwip! Thwip! Thwip! That is what it sounded like!',
      'After {count} hunts my tongue is FASTER than ever! You cannot even see it!',
      '{count} meals and I STILL do a happy splash when the crickets come!',
      'You have fed me {count} times! I got excited {count} times! No regrets!',
    ],
    bond: [
      'NEW STATUS: {bond}! I jumped so high I saw over the rock!',
      'You and me: {bond}! RIBBIT! That is the happiest one I have!',
      'Guess what we are now! Go on! It is: {bond}! I could not wait!',
      'We levelled up! To: {bond}! I am doing laps of the pad! Small laps!',
      'Big news on the pad: {bond}! That is US! Splash!',
      'Our friendship just hopped up to: {bond}! Hop! Like that! But BIGGER!',
      'Friend report: {bond}! I am SO happy I sat still! For one second!',
    ],
    'big-win': [
      '{team} {score}! WE WON! I leapt off the pad and missed the water! Worth it!',
      'The {team} WON, {score}! I croaked so loud I surprised the rock!',
      'GO {team}! {score}! Biggest splash of my LIFE! Everything is wet! GOOD!',
      'What a WIN! {team} {score}! I have hopped pad to rock and back! Twice!',
      '{score}! The {team}! I am SO happy my legs will not stop! Do not stop them!',
      'BEST night! {team}, {score}! RIBBIT RIBBIT RIBBIT! One for each cricket!',
      'We did it! {team} {score}! I tried to sit still and I just COULD NOT!',
    ],
  },
};
