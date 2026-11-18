// What the frog says about your teams' games and the news (the types are in src/brain/types.ts).
// Data only; src/brain picks, and fills every token from data the app fetched.
//
// The same frog as lines.ts and chat.ts, in the same four characters, for kids and adults alike:
//   sarcastic — deadpan, pretends not to care, plainly does. Stillness as a flex.
//   anxious   — sweet, a worrier, relieved every time you show up. Stillness as a safety plan.
//   zen       — calm, grateful, finds the poetry in a ripple. Stillness as the whole point.
//   hyper     — everything is the best thing that has ever happened, again. Stillness is a dare.
// The frog is on your team ("we won!"). It watches a game the way it watches everything: without
// blinking. A win is the one thing that makes it move: a croak, a leap to the rock, a splash. A loss
// is a quiet sit under the pad, up to its eyes in the water, that lifts quickly. Never bitter, never
// unkind about the other team or anyone on it. Its comedy is its own, not the fish's or the
// hamster's: patience, the stare, the croak, the damp. The water, the pad, the rock and the glass are
// true of the pond and of a jar, so lines name those.
//
// Tokens, and only where they are named (`{name}`, the frog's own name, is allowed anywhere):
//   game-day             `{team}`; may add `{opponent}`, `{time}` ("7:10 pm", so "at {time}").
//   live, won, lost,     `{team}` and `{score}` ("5-3", your team's number first, so it reads right
//   tied                 for a win, a loss or a draw: "We lost, {score}.", never "by {score}");
//                        may add `{opponent}`.
//   still-happy, mope,   `{team}` only.
//   no-game
//   news                 `{headline}` only, once, at the very end: "<frame>: {headline}". The headline
//                        is a real one, inserted as published.
//   news-interest        `{interest}` (lower case, never starting a sentence) and `{headline}`, last.
// Team names are nicknames ("Red Sox", "Lakers", "Arsenal"): "the {team}" is fine, "a {team}" is not.
// Lines state no fact about the world themselves: no players, records, standings, numbers or
// predictions. Hoping and cheering are fine. Every frame is at most 70 characters without its
// headline, fits the bubble (100 characters) with the longest test values, and appears once.

import type { Personality } from '../../../sim/types';
import type { WorldMoment } from '../../../brain/types';

export const FROG_WORLD: Record<Personality, Record<WorldMoment, readonly string[]>> = {
  sarcastic: {
    'game-day': [
      '{team} against the {opponent}, {time}. I picked my spot. This one.',
      'The {team} play at {time}. I shall be free. I am always free.',
      'Game at {time}. Go {team}. I am already not moving, in support.',
      'The {team} play the {opponent} today. I shall stare harder.',
      'Game day. Go {team}. I will give it one eye. The good one.',
      'Today, the {team}. I have a croak in reserve. Not that I care.',
    ],
    live: [
      '{team} {score} {opponent}. I have not blinked since it started.',
      'It is {score}, {team} first. I am calm. I am always calm.',
      'Live from the pad: {team} {score}. Tense. For a frog.',
      '{team} {score} {opponent}, for now. My toes are clenched.',
      'Currently {score}, the {team} first. My throat has puffed up.',
      'The {team}, {score}. I am holding still. More than usual.',
    ],
    won: [
      'The {team} won, {score}. Fine. One croak. A loud one.',
      'Go {team}. {score}, final. I moved. Do not make it a thing.',
      '{team} win, {score}. I hopped to the rock. Voluntarily.',
      'We won, {score}. Go {team}. I blinked twice. That is a party.',
      '{score}, and it is ours. Go {team}. This is my delighted face.',
      'A win for the {team}, {score}. I croaked. The water heard.',
      'Go {team}. {score}. That splash was me. It was deliberate.',
      'Won it, {score}. Go {team}. Patience pays. I keep saying.',
    ],
    lost: [
      'The {team} lost, {score}. I have gone under the pad. On business.',
      'We lost, {score}. I will sit with it. That, I can do. Go {team}.',
      '{score}. Hm. I will be on the rock, {team}, saying nothing.',
      'A loss for the {team}, {score}. I have sunk to my eyes. Briefly.',
      'Fair play, {opponent}. {score}. My stare stays with the {team}.',
      'Well. {team} {score}. I am not sulking. This is my normal face.',
      'Short of it, {score}. The {team} get my croak another night.',
      'Ouch, {score}. I will out-stare the feeling. Go {team}.',
    ],
    tied: [
      'A draw, {score}. I croaked, then took half back. Go {team}.',
      'Tied, {score}. Nobody moved. I respect that. Go {team}.',
      '{team} {score} {opponent}. A tie. I blinked once. Seems fair.',
      'Level, {score}. Like still water. I approve. Go {team}.',
      'All square, {score}. A long wait for that. Go {team}.',
      'A tie for the {team}, {score}. I can sit with that. Literally.',
    ],
    'still-happy': [
      'The {team} win is still with me. I croaked at the rock about it.',
      'The {team} won today. I have been insufferable to the rock.',
      'This is my happy face. The {team} did this. Look closely.',
      'I have croaked more than usual. The {team}. You understand.',
      'Go {team}. Still. I say it between blinks.',
      'Still smug about the {team}. On me it just looks damp.',
    ],
    mope: [
      'Under the pad, about the {team}. Visiting hours are later.',
      'Not over the {team} game. I am sitting lower in the water.',
      'I am staring at nothing over the {team}. More than usual.',
      'No croak today. The {team} game. I will be fine by dusk.',
      'About the {team}: I am facing the rock now. Read into it.',
      'I have not moved since the {team} game. Hard to tell, I know.',
    ],
    'no-game': [
      'No {team} game today. I will wait. I was going to anyway.',
      'Rest day for the {team}. I have been on one since I hatched.',
      'The {team} are off today. I shall ambush nothing in their honour.',
      'A blank day for the {team}. I had one of those planned too.',
      'No {team} today. Fine. I had a full day of nothing booked.',
      'I checked. No {team} game. I checked by not moving.',
    ],
    news: [
      'Do not move. Good news is easily startled: {headline}',
      'I heard this and nearly blinked: {headline}',
      'Good news. I sat on it until you got here: {headline}',
      'Overheard at the edge of the water: {headline}',
      'Pleasant news. I stared at it a while to be sure: {headline}',
      'One for the good pile. It is a small pile. Here: {headline}',
    ],
    'news-interest': [
      'You like {interest}, so I caught this one for you: {headline}',
      'Something about {interest}. I let it come to me: {headline}',
      'From the pad, an item concerning {interest}: {headline}',
      'I was not looking for {interest} news. It found me: {headline}',
      'This hopped past and it looked like {interest}: {headline}',
      'It is about {interest}. I did not move, but I was thrilled: {headline}',
    ],
  },
  anxious: {
    'game-day': [
      '{team} and {opponent} at {time}! I have gone very still about it.',
      'We play at {time}! Go {team}! I am staying extra damp for luck.',
      'The {team} play today. I hope everyone has had enough water.',
      'It is the {opponent} today. I am being brave about it. Go {team}.',
      'I keep looking at the sky to see if it is {time}. Go {team}!',
      'Today the {team} play. My lucky spot on the rock is ready.',
    ],
    live: [
      'It is {team} {score} {opponent}. I can only watch with one eye.',
      'At the moment it is {score}, {team} first. I dare not croak.',
      'It is {score} so far! Go {team}! I have forgotten how to blink.',
      'Still going! {team} {score}. Every toe is gripping the pad.',
      '{team} {score} {opponent}, and still going. I have gone rigid.',
      'So far: {score}, {team} first. I am on my lucky spot. Not moving.',
    ],
    won: [
      'We won! {score}! I can blink again! Go {team}!',
      'The {team} won, {score}! All that worrying worked!',
      '{score}, ours! I croaked before I could stop myself! Go {team}!',
      'A win, {score}! I croaked so loud I startled myself! Go {team}!',
      '{team} win {score}! I jumped in the water. A happy jump!',
      'They did it! {team} {score} {opponent}! My throat is so puffed!',
      'We beat the {opponent}, {score}! My toes have uncurled! Go {team}!',
      '{score}! The {team} did it! I have gone all wobbly. Good wobbly.',
    ],
    lost: [
      'The {team} lost, {score}. I hope someone is being kind to them.',
      'We lost, {score}. I am being sad under the pad, safely. Go {team}.',
      '{score}. Oh, {team}. A hard one. I will stay close to the water.',
      'It was not to be, {score}. I am glad they are ours. Go {team}.',
      'A loss, {score}. My croak came out tiny. Go {team}, always.',
      '{team} {score} {opponent}. Oh. I had hoped so carefully, too.',
      'We lost, {score}. A little while under the pad. Go {team}.',
      'A sad one, {score}. I will croak for the {team} anyway. Softly.',
    ],
    tied: [
      'A draw, {score}. Nobody is upset. Oh, what a relief. Go {team}!',
      'It is a tie, {score}. The calmest kind of ending! Go {team}!',
      'It finished {score}, all even. I can live with even. Go {team}.',
      '{team} {score} {opponent}. A tie. I feel calm. Is that right?',
      'A tie for the {team}, {score}. I can breathe. Through my skin, even.',
      'Level at {score}! I worried for nothing! Sort of! Go {team}!',
    ],
    'still-happy': [
      'The {team} won and I have un-worried. Mostly. Nearly all the way.',
      'I told my reflection the {team} won. It looked relieved too.',
      'Nothing went wrong today. The {team} won. I feel damp and safe.',
      'A happy day for the {team}. Even the ripples look friendly.',
      'Still smiling about the {team}. Frogs always are. I mean it.',
      'I have not checked the edge once today. The {team} won.',
    ],
    mope: [
      'A little sad about the {team}. The pad is being very understanding.',
      'Wobbly about the {team} still. I am staying near the water.',
      'I sat lower for the {team} today. Up to my eyes. It helps.',
      'I keep thinking about the {team}. Sorry. I will stop. I will not.',
      'Small croaks only today. The {team}. I will be louder by dusk.',
      'Still sad for the {team}. The rock is being very solid about it.',
    ],
    'no-game': [
      'No {team} game today. I may unclench my toes. One at a time.',
      'No game for the {team} today. The water and I can settle.',
      'A free day for the {team}. I will use it to top up my courage.',
      'The {team} are off today. I hope they are somewhere nice and damp.',
      'No {team} today. I looked under the pad to be sure.',
      'No game for the {team}. Oh. I had braced myself for nothing.',
    ],
    news: [
      'This made my throat go soft, in the good way: {headline}',
      'Nothing to worry about in this one. I looked: {headline}',
      'A ripple worried me, and then I heard this: {headline}',
      'A gentle one. I kept it safe for you: {headline}',
      'Good news, I think. No, I am sure. Good news: {headline}',
      'Phew. Nice news. My throat has un-puffed: {headline}',
    ],
    'news-interest': [
      'I heard {interest} and thought of you at once: {headline}',
      'I kept this safe on the pad. It is about {interest}: {headline}',
      'I was very still, and then, {interest}! I sat up: {headline}',
      'I watched for {interest} news from the rock. Here: {headline}',
      'A little {interest} news. I did not drop it once: {headline}',
      'It is about {interest}. I hope it is the good kind: {headline}',
    ],
  },
  zen: {
    'game-day': [
      'The {team} meet the {opponent} at {time}. I will be here, as ever.',
      'Game day. I hold one croak back, for later. Go {team}.',
      'The {team} play at {time}. Until then, the water and I wait.',
      'Today, the {opponent}. May both sides leap well. Go {team}.',
      'A game today. I cheer the {team} as I do everything: sitting.',
      'Game day comes like rain. Expected, and welcome. Go {team}.',
    ],
    live: [
      'Now: {team} {score} {opponent}. I breathe through it. Literally.',
      'The score is {score}, {team} first. The water stays level.',
      'At this moment, {team} {score}. This moment is the only one.',
      '{team} {score} {opponent}, so far. A ripple, still travelling.',
      'It stands at {score}, the {team} first. I sit with it.',
      'For now, {score}. Go {team}. I watch without blinking, as ever.',
    ],
    won: [
      'The {team} won, {score}. A croak rises. I let it.',
      'A win, {score}. Go {team}. Joy lands like rain on still water.',
      '{team} {score} {opponent}. Victory. I leap once, and mean it.',
      'We won, {score}. The water is bright tonight. Go {team}.',
      'Final, {score}, and ours. I am grateful. Go {team}.',
      'The {team} prevail, {score}. I honour it from the rock.',
      'Go {team}. {score}. A good ending is a quiet thing.',
      'A win for the {team}, {score}. I add it to the still water.',
    ],
    lost: [
      'The {team} lost, {score}. I sit with it. It will pass.',
      'A loss, {score}. The water is no shallower for it. Go {team}.',
      '{team} {score} {opponent}. Not today. The water settles again.',
      'We lost, {score}. I sink a little, then float. Go {team}.',
      'It ended {score}. Well played, {opponent}. The {team} remain mine.',
      'A hard result, {score}. Rain falls on every pond. Go {team}.',
      'The {team} fell short, {score}. I keep my croak for another day.',
      'Lost, {score}. I let it go downstream. Go {team}, always.',
    ],
    tied: [
      'A draw, {score}. Still water. Go {team}.',
      'Tied at {score}. Neither side above the other. Go {team}.',
      '{team} {score} {opponent}. Balance. The water approves.',
      'It ended level, {score}. A calm sort of ending. Go {team}.',
      'Neither ahead, {score}. The {team} and the water are both level.',
      'All square, {score}. The ripple met itself. Go {team}.',
    ],
    'still-happy': [
      'The {team} won today. The gladness has not rippled away.',
      'Still warm from the {team} win. Like the rock at dusk.',
      'I think of the {team}, and the water seems brighter.',
      'A good day keeps. The {team} gave us one.',
      'Go {team}. I say it again, slowly, to enjoy it.',
      'Joy for the {team}, still floating. I do not disturb it.',
    ],
    mope: [
      'A little heaviness for the {team}. I let it sit beside me.',
      'The {team} are on my mind. The water is a shade greyer.',
      'I am quiet for the {team} today. Quieter, I mean.',
      'Sadness for the {team}, like mist. It lifts by midday.',
      'I sit low in the water for the {team}. I will rise.',
      'Still thinking of the {team}. Tomorrow the water is new.',
    ],
    'no-game': [
      'No {team} game today. The water is enough.',
      'The {team} do not play today. I know that kind of day well.',
      'A day without the {team}. I return to my ripple.',
      'Nothing for the {team} today. Stillness needs no fixture.',
      'No {team} today. I am practised at days when nothing comes.',
      'The {team} are quiet today. So am I. We match.',
    ],
    news: [
      'A warm ripple from the world: {headline}',
      'Something good has come up for air: {headline}',
      'Sit with this one. It is kind: {headline}',
      'It reached me here, on the pad, and I was glad: {headline}',
      'The world, being good for a moment: {headline}',
      'Like rain after a dry week: {headline}',
    ],
    'news-interest': [
      'This drifted by, and it carried {interest}: {headline}',
      'For you, who love {interest}, a small gift: {headline}',
      'Word of {interest} reached the pad today: {headline}',
      'The water was quiet, and then, {interest}: {headline}',
      'Something of {interest}, floating past the pad: {headline}',
      'I held this still for you. It concerns {interest}: {headline}',
    ],
  },
  hyper: {
    'game-day': [
      '{team}! {opponent}! {time}! TODAY! I have worn a groove in the pad!',
      'We play at {time}! GO {team}! Warm-up hops! Hop! Hop!',
      'The {team} play TODAY! I have been croaking since dawn!',
      '{team} against the {opponent}! At {time}! Is it {time} yet?',
      'Game day! Game day! I am SO damp with excitement! Go {team}!',
      'Today! The {team}! I practised my victory leap! Just in case!',
    ],
    live: [
      '{team} {score} {opponent}! LIVE! I am bouncing on the pad!',
      '{score}! Us first! That is the score NOW! RIBBIT for the {team}!',
      'It is {team} {score}! I keep falling in the water!',
      'My throat is HUGE! That means {score}! {team} first! Still going!',
      'Nobody blink! It is {score}! The {team} are STILL playing!',
      '{score}! So far! The {team}! I cannot sit still! I never can!',
    ],
    won: [
      'WE WON! {score}! GO {team}! I leapt clean over the rock!',
      'The {team} WON, {score}! Loudest croak of my LIFE!',
      '{score}! The {team}! I am so happy I forgot to land!',
      'YES! {team} win {score}! SPLASH! That one was for them!',
      'The {team} did it! {score}! Sorry, {opponent}! RIBBIT!',
      '{team} {score}! WINNERS! I did two laps round the rock!',
      'Final! {score}! OURS! Go {team}! Somebody count my hops!',
      'Tell everyone! {team} {score}! I have told the rock already!',
    ],
    lost: [
      'We lost, {score}. I went still. Not the good still. Go {team}.',
      'The {team} lost, {score}. Small croak. ribbit. I still love them!',
      'Oh no, {score}. Ouch! Quick swim! Okay! Go {team}!',
      'We lost, {score}. I went quiet! ME! Back now! Go {team}!',
      'It was {score}. The {team} get my dampest hug anyway!',
      'Boo, {score}. I hopped backwards about it. Forwards now! GO {team}!',
      '{team} {score} {opponent}. Oof! Good game! I need a splash!',
      'We lost, {score}, BUT I am still croaking! Go {team}!',
    ],
    tied: [
      'A TIE! {score}! I leapt halfway! It is hard to do! Go {team}!',
      'Level, {score}! Both sides get a ribbit! RIB! BIT! Go {team}!',
      '{team} {score} {opponent}! EVEN! Like my two back legs!',
      'A draw, {score}! I am half thrilled! The top half! Go {team}!',
      'It ended {score}! Level! Like a pad! Pads are great! Go {team}!',
      'All square at {score}! I will hop for both halves! Go {team}!',
    ],
    'still-happy': [
      'The {team} won and I STILL cannot sit still! Not that I could!',
      'Have I mentioned the {team}? I have! I am mentioning them AGAIN!',
      'I keep leaping for the {team}! The pad is all wobbly now!',
      'Every croak today is for the {team}! This one too! RIBBIT!',
      'RIBBIT for the {team}! Still going! I have loads left!',
      'What a day for the {team}! I am vibrating! Frogs can vibrate!',
    ],
    mope: [
      'A tiny bit sad about the {team}. I am hopping it off! Hop!',
      'Quiet croak for the {team}. ribbit. Getting louder. RIBBIT!',
      'One sad splash for the {team}. Then a normal splash! Better!',
      'Thinking about the {team}! Saving my loudest croak for next game!',
      'Moping under the pad. Any second now. And OUT! Go {team}!',
      'Low for the {team}. Then I saw a ripple and chased it! Better!',
    ],
    'no-game': [
      'No {team} game today?! Then I will croak at the rain! If it rains!',
      'No game for the {team}! I will do a practice leap! Hup! Nailed it!',
      'The {team} are resting! I am NOT! Pad! Rock! Pad! Rock!',
      'Nothing on for the {team} today! More time to stare at you! Hi!',
      'No {team} today! I will count hops until there is! One! Two!',
      'I checked! No {team} game! Time to try sitting still! Ha! No!',
    ],
    news: [
      'GOOD NEWS! Everybody hold still! {headline}',
      'I caught some news! With my tongue! Not really! {headline}',
      'Ribbit ribbit! That means good news! {headline}',
      'Happy news! I croaked about it already! {headline}',
      'This made me jump right off the pad: {headline}',
      'Stop everything! Even the sitting! {headline}',
    ],
    'news-interest': [
      'It is about {interest}! I leapt before I finished it! {headline}',
      'You know what hopped by? Something about {interest}! {headline}',
      'I heard {interest} and leapt straight up! {headline}',
      'One for you! It has {interest} in it! I checked! {headline}',
      'Ribbit! That is frog for {interest} news! {headline}',
      'Do not blink! You like {interest}! This is that! {headline}',
    ],
  },
};
