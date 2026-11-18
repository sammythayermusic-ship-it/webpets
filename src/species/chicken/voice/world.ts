// What the chicken says about your teams' games and the news (PHASE-NEXT Step 5; the types are in
// src/brain/types.ts). Data only; src/brain picks, and fills every token from data the app fetched.
//
// The same chicken as lines.ts and chat.ts, in the same four characters, for kids and adults alike:
//   sarcastic — the deadpan inspector, pretends not to care, plainly does.
//   anxious   — sweet, a worrier who keeps checking the sky, relieved every time you show up.
//   zen       — calm, grateful, finds the poetry in a scratch of ground.
//   hyper     — everything is the best thing that has ever happened, again.
// The chicken is on your team ("we won!"). A win is a strut, a victory flap, an announcement to the
// run and a celebratory dust bath. A loss is a short sulk in the straw that is over by dawn. Never
// bitter, never unkind about the other team or anyone on it. Its comedy is its own, not the fish's or
// the hamster's: verdicts and notices, patrols, the record, the pecking order, specks, the alarm
// (there is a happy one), being up since dawn. Everything is true of a chick and of a hen alike.
//
// Tokens, and only where they are named (`{name}`, the chicken's own name, is allowed anywhere):
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

export const CHICKEN_WORLD: Record<Personality, Record<WorldMoment, readonly string[]>> = {
  sarcastic: {
    'game-day': [
      'Notice to the run: the {team} play the {opponent} at {time}.',
      'The {team} are on at {time}. I have moved my dust bath forward.',
      'Today the {team} face the {opponent}. I expect good posture.',
      'A game day for the {team}. I was up at dawn anyway. Now it counts.',
      'The {team} at {time}. I will pretend to inspect things until then.',
      'Go {team}. I have said it once. That is the daily allowance.',
    ],
    live: [
      'Interim report: {team} {score} {opponent}. More when I have it.',
      'As it stands, {score}, {team} first. I have one eye on a speck.',
      'The {team} have it at {score} for now. I am not pacing. I patrol.',
      'Unofficial so far: {team} {score}. Nothing is final till I say.',
      '{score} at present, {team} first. The speck can wait. Imagine.',
      'Mid-inspection update: {team} {score} {opponent}. Carry on.',
    ],
    won: [
      'Verdict: the {team} won, {score}. I allowed myself one flap.',
      'It is official. {team}, {score}. The run has been informed.',
      'We won, {score}. I am strutting. Go {team}. Do not look at me.',
      'The {team} took it, {score}. Entered in the record. In capitals.',
      '{score} to the good. Go {team}. A dust bath has been authorised.',
      'The {team} beat the {opponent}, {score}. I approve. Loudly, once.',
      'Result: {team}, {score}. Top of the pecking order. Like me.',
      'A win, {score}. I told the {team} to do that. From here. Quietly.',
    ],
    lost: [
      'Verdict: the {team} lost, {score}. I do not accept the verdict.',
      'We lost, {score}. I am inspecting a corner. Closely. Go {team}.',
      '{score}. The {team} have my support and my worst mood.',
      'A loss, {score}. I have filed it at the back. Go {team}.',
      'The {opponent} had the day, {score}. The {team} have the dawn.',
      'Result: {team} {score}. I am pecking the ground quite hard.',
      'The {team} came second, {score}. Strutting is off till dusk.',
      'Not our day, {score}. I shall sulk on schedule. Go {team}.',
    ],
    tied: [
      'A draw, {score}. I have ruled it adequate. Go {team}.',
      'Level, {score}. Nobody is top of anything. Unsettling. Go {team}.',
      'The {team} and the {opponent} finished {score}. Tidy. Too tidy.',
      'Tied at {score}. I fluffed up for nothing. Go {team}.',
      'Even, {score}. The record will show a shrug. Go {team}.',
      'A tie, {score}. I counted it twice. Still a tie. Go {team}.',
    ],
    'still-happy': [
      'The {team} won and I am still strutting. It is a long strut.',
      'The {team} are in my daily report again. Top of the page.',
      'Good mood, still. The {team}. Kindly do not mention it.',
      'My patrol had extra bounce today. The {team} are to blame.',
      'The {team} won. I am walking taller. It is noticeable. Good.',
      'I keep pecking in a pleased sort of way. That is the {team}.',
    ],
    mope: [
      'Strut levels are low. The {team}. Normal service by dawn.',
      'I am not over the {team} game. I am under some straw.',
      'The {team} result is on my mind. So is that speck. Mostly it.',
      'Patrols are slow today. The {team}. I am walking it off.',
      'I scratched a small hole about the {team}. No help so far.',
      'Do not ask about the {team}. Ask about grain. I will perk up.',
    ],
    'no-game': [
      'No {team} game today. The run will have to entertain me.',
      'The {team} have the day off. I have never had one. Not bitter.',
      'Nothing from the {team} today. I checked the sky too. Clear.',
      'No {team} today. More time for the specks, who never rest.',
      'A blank day for the {team}. I shall inspect things at leisure.',
      'The {team} are not playing. I am still up at dawn. Somebody is.',
    ],
    news: [
      'Bulletin from the straw. It is a good one: {headline}',
      'I do not hand out good news lightly. Here: {headline}',
      'This passed inspection on the first try: {headline}',
      'By order of the top of the pecking order: {headline}',
      'Put the speck down. This is nicer: {headline}',
      'Daily report, pleasant section: {headline}',
    ],
    'news-interest': [
      'I keep a file on {interest}. New entry: {headline}',
      'Since you like {interest}, I looked into this: {headline}',
      'One eye was on {interest} all day. It found this: {headline}',
      'Your department is {interest}, I believe. Delivery: {headline}',
      'Spotted on patrol, in the {interest} area: {headline}',
      'I do not follow {interest}. I follow you. So: {headline}',
    ],
  },
  anxious: {
    'game-day': [
      'The {team} play the {opponent} at {time}. I checked the sky twice.',
      'It is game day for the {team}. I had my dust bath early, for nerves.',
      'Oh, the {team} play at {time}. I will be in the warm spot. Mostly.',
      'Today is the {team} and the {opponent}. I hope it is all gentle.',
      'Not {time} yet. I keep checking. Go {team}. I am fluffed already.',
      'The {team} play today. Everyone be careful. Especially the {team}.',
    ],
    live: [
      'It is {score}, {team} first. I am watching through my fluff.',
      '{team} {score} {opponent} so far. I have forgotten how to peck.',
      'Still {score}, {team} first. I looked away. I looked back. Same.',
      'The {team} are at {score}. The sky is holding. So am I. Just.',
      'Right now it is {team} {score}. Nobody move. Sorry. Carry on.',
      '{score} at the moment, {team} first. Is that good? I think so.',
    ],
    won: [
      'The {team} won, {score}! I can come out from behind myself!',
      'We won, {score}! All clear! All clear! Go {team}!',
      '{score}! The {team} did it! That was the happy alarm. Sorry.',
      'A win for the {team}, {score}. My legs have stopped shaking.',
      'Oh, {score}, to us! Go {team}! I looked up and the sky smiled.',
      'They beat the {opponent}, {score}! I worried so well! Go {team}!',
      'The {team}, {score}! I need to stand in the warm spot and beam.',
      'We won, {score}. I checked. It is still true. Go {team}!',
    ],
    lost: [
      'The {team} lost, {score}. The sky is still up, though. I looked.',
      'We lost, {score}. I have gone very small and round. Go {team}.',
      'Oh, {team}. {score}. I hope somebody gives them something warm.',
      '{score}, the wrong way round. The {team} are still lovely.',
      'A loss, {score}. I went flat. I am fluffing back up. Go {team}.',
      'The {opponent} played well, {score}. The {team} were brave.',
      'We lost, {score}. I looked up. Nothing else fell. Go {team}.',
      'Not the {team} today, {score}. My best grain is theirs anyway.',
    ],
    tied: [
      'A draw, {score}. I had two alarms ready and need neither. Go {team}.',
      'It finished {score}, all even. My favourite kind. Go {team}.',
      '{team} {score} {opponent}. Level. I can put my fluff down.',
      'Tied, {score}. No alarm of either kind. Go {team}.',
      'Even at {score}. The {team} are fine. Everyone is fine. Phew.',
      'A tie for the {team}, {score}. I was ready for worse. I always am.',
    ],
    'still-happy': [
      'The {team} won and I have hardly looked up all day.',
      'I keep doing a small flap about the {team}. Then checking round.',
      'Still glad about the {team}. Even the corners look friendly.',
      'The {team} won today. I keep checking that it happened. It did.',
      'Nothing fell, there is grain, and the {team} won. What a day.',
      'My fluff keeps going up about the {team}. The good kind of up.',
    ],
    mope: [
      'A bit low about the {team}. I am standing where it is warmest.',
      'I keep thinking of the {team}. Then of grain. Then the {team}.',
      'It is alright about the {team}. I have told myself. Nearly sure.',
      'Flat fluff today, for the {team}. It will lift by dusk.',
      'I had a little worry about the {team}. A dust bath is next.',
      'Still tender about the {team}. Please stand near me for a bit.',
    ],
    'no-game': [
      'No {team} game today. One less thing to look up about.',
      'The {team} are resting. Resting is the safest thing there is.',
      'Nothing on for the {team}. I checked. I checked again. Nothing.',
      'No {team} today, so I will just worry about the usual things.',
      'A quiet day for the {team}. I do love a quiet day.',
      'No game. I hope the {team} are somewhere warm with snacks.',
    ],
    news: [
      'I was braced for bad news. It was this instead: {headline}',
      'All clear. In fact, better than all clear: {headline}',
      'A soft one. I heard it without flinching: {headline}',
      'The world did something kind. I double-checked: {headline}',
      'You can relax your fluff for this one: {headline}',
      'Found while keeping watch, and it is lovely: {headline}',
    ],
    'news-interest': [
      'This sounded like {interest}, so I held on to it tight: {headline}',
      'Is this {interest}? I think so. I kept it just in case: {headline}',
      'I listened out for {interest} all day. Here: {headline}',
      'Some {interest} news. I did not drop it once: {headline}',
      'I heard {interest} and looked up. In a good way: {headline}',
      'It said {interest}, so I thought of you at once: {headline}',
    ],
  },
  zen: {
    'game-day': [
      'At {time} the {team} and the {opponent} meet, and share a day.',
      'Game day. I rose with the light. Go {team}, at {time}.',
      'Today the {team} play. May both sides find firm ground.',
      'At {time}, the {team}. Until then, I scratch, and wish them well.',
      'The {opponent} come to play the {team}. A good game is a gift.',
      'I smoothed my fluff for the {team} today. Small rites matter.',
    ],
    live: [
      'For now, {team} {score} {opponent}. Now is all there is.',
      'It stands at {score}, {team} first. I peck, look up, and peck.',
      '{score}, the {team} first. The number will change. I will not.',
      'The {team}, {score}, midway. I keep to the warm spot and watch.',
      'Still playing: {team} {score}. The ending is in no hurry.',
      'One eye on the ground, one on the {team}. It is {score}.',
    ],
    won: [
      'The {team} won, {score}. I dip my head to the ground in thanks.',
      'We won, {score}. The gladness is quiet and wide. Go {team}.',
      '{score}, and the {team} have it. The warm spot is warmer.',
      'A win, {score}. The {team} played, the {opponent} played. Good.',
      'The {team}, {score}. I open one wing to the sun.',
      'Won, {score}. Small bird, large heart today. Go {team}.',
      'A bright day for the {team}, {score}. I greet it wing first.',
      'The {team} beat the {opponent}, {score}. I am glad, plainly.',
    ],
    lost: [
      'The {team} lost, {score}. The dawn will not hold it against them.',
      'We lost, {score}. I let it settle, as dust does. Go {team}.',
      '{score}. Not this one, {team}. The ground is the same as ever.',
      'A loss, {score}. To play at all is to risk it. Go {team}.',
      'The {opponent} played well, {score}. The {team} will rise early.',
      'Lost, {score}. I scratch slowly, and the sting thins. Go {team}.',
      'The {team}, {score}. A grey one. I keep them under my wing.',
      'We fell short, {score}. Short is still close. Go {team}.',
    ],
    tied: [
      'A draw, {score}. Both sides go home whole. Go {team}.',
      'Level, {score}. One grain each, fairly scattered. Go {team}.',
      '{team} {score} {opponent}. Smooth as straw after raking.',
      'It ended {score}, and nothing was lost. Go {team}.',
      'A tie, {score}. The {team} and the day are in balance.',
      'Shared, {score}. I stand where the two halves meet. Go {team}.',
    ],
    'still-happy': [
      'The {team} won, and it rests on me like sun on my back.',
      'Gladness keeps well. I still have some from the {team}.',
      'I step lightly today. The ground knows it is the {team}.',
      'I carry the {team} under one wing, and the day under the other.',
      'The day is in no hurry to end. Nor am I. Thank you, {team}.',
      'I scratch with a soft heart. The {team} did that.',
    ],
    mope: [
      'A small sorrow for the {team}. I give it a corner of the straw.',
      'The {team} game is still with me. I dust bathe, and it loosens.',
      'This {team} cloud is thinning. Clouds do.',
      'Low wings today, for the {team}. Dawn lifts most things.',
      'I think of the {team} and stay close to the warm spot.',
      'A lost game was still a game. I am here, {team}.',
    ],
    'no-game': [
      'The {team} are still today. So is the dust. Both will stir again.',
      'The {team} rest. I scratch a little more softly for them.',
      'A plain day, without the {team}. Plain days are underrated.',
      'Nothing from the {team} today. The ground and I will manage.',
      'No {team} today. The dawn got my applause. It earned it.',
      'Rest is part of the work. Rest well, {team}.',
    ],
    news: [
      'The morning brought this, and it is a good one: {headline}',
      'Found among the small things, a good one: {headline}',
      'Stand in this for a moment, like sun: {headline}',
      'Kindness came by today. It left this: {headline}',
      'Something to hold up to the light: {headline}',
      'Worth pausing a scratch for: {headline}',
    ],
    'news-interest': [
      'You hold {interest} dear. So I held on to this: {headline}',
      'I do not know {interest}, but I know whose it is: {headline}',
      'While scratching, I turned up some {interest}: {headline}',
      'Set down where you would find it, a word on {interest}: {headline}',
      'Word of {interest} drifted in with the morning: {headline}',
      'You care for {interest}, so I kept this warm: {headline}',
    ],
  },
  hyper: {
    'game-day': [
      'GAME DAY! The {team}! The {opponent}! {time}! I am ALL fluff!',
      'The {team} play at {time}! I have been ready since DAWN!',
      'TODAY is for the {team}! I did extra patrols to warm up!',
      'The {team} against the {opponent}! I cannot keep my feet down!',
      'Is it {time}?! Not yet?! I will scratch faster! GO {team}!',
      'I had a lucky dust bath for the {team}! It was VERY lucky!',
      'GO {team}! I flapped so hard the straw moved! That is a sign!',
    ],
    live: [
      'It is {team} {score} {opponent}! I am running in circles!',
      '{score}! Us first! GO {team}! I keep flapping by accident!',
      'The {team} are at {score}! I am pecking at NOTHING! So fast!',
      'LIVE from the straw! {team} {score}! Every bit of fluff is UP!',
      'Still going! {score}, {team} first! I forgot to blink! Ow!',
      'Right NOW! {team} {score} {opponent}! This is the good alarm!',
    ],
    won: [
      'WE WON! {score}! GO {team}! Ten victory flaps! ELEVEN!',
      'The {team} WON, {score}! I announced it to the WHOLE run! Twice!',
      '{score}! {score}! The {team}! I ran SO many circles!',
      'YES! The {team}! {score}! I kicked straw EVERYWHERE!',
      'Dust bath PARTY! {score}! The {team} are the guests of honour!',
      'The {team}! {score}! I have fluffed up past my own size!',
      '{score} and it is OURS! GO {team}! I nearly took off!',
      'The {team} did it, {score}! Sound the alarm! The HAPPY one!',
    ],
    lost: [
      'We lost, {score}. I flopped in the straw! I am up again! Go {team}!',
      'The {team} lost, {score}. My fluff went flat! It is refluffing!',
      'Oh, {score}. Boo! I ran it off! I love the {team} anyway!',
      'Lost, {score}. My sad flap turned into a normal flap! Go {team}!',
      'Not today, {score}. Both wings around the {team}! Squeeze!',
      '{team} {score} {opponent}. Oof! Straight to the dust bath! Better.',
      'We lost, {score}, and I am STILL cheering! Go {team}! See?!',
      'Well played, {opponent}! Shame about {score}! Next dawn, {team}!',
    ],
    tied: [
      'A TIE! {score}! One wing up, one wing down! Go {team}!',
      'Tied {score}! Grain for BOTH sides! I will scatter it! Go {team}!',
      '{team} {score} {opponent}! EVEN! Like my two feet! Look!',
      'A draw, {score}! Which flap is that?! I did ALL of them! Go {team}!',
      '{score}! Level! I am calling it a tiny win, {team}!',
      'Nobody lost! {score}! Everybody patrol! Go {team}!',
    ],
    'still-happy': [
      'The {team} WON and I have not stopped flapping since!',
      'Every patrol today ends with GO {team}! Every single one!',
      'I keep remembering the {team} and running a circle about it!',
      'Too happy to stand still! That is the {team}! And also me!',
      'GO {team}! I am saying it to every speck I meet!',
      'A victory dust bath for the {team}! Then ANOTHER one!',
    ],
    mope: [
      'I am sad about the {team} for as long as I can stand still! Done!',
      'I tried to sulk about the {team} and a flap came out instead!',
      'One slow patrol for the {team}. It sped up. I cannot help it!',
      'I owe the {team} some flaps! I am storing them up! So many!',
      'I was moping about the {team}. Then, ooh, a speck! Go {team}!',
      'Sad about the {team} until I remembered dust baths exist!',
    ],
    'no-game': [
      'No {team} game?! Okay! Extra patrols! SO many patrols!',
      'No {team} today! I will practise my flap! FLAP! Got it!',
      'The {team} are resting! Not ME! I have ground to cover!',
      'The {team} are off today! I will fluff up for them ANYWAY!',
      'No game! More time for specks! The {team} would understand!',
      'I checked! No {team}! Dust bath, then! ALL afternoon!',
    ],
    news: [
      'ANNOUNCEMENT! The good kind! Feet still, everyone! {headline}',
      'A happy one! It was just lying there! I grabbed it! {headline}',
      'Out there, past the run, a GOOD thing happened! {headline}',
      'Happy alarm! This is the happy alarm! {headline}',
      'I flapped when I heard this: {headline}',
      'I ran all the way over to tell you! {headline}',
    ],
    'news-interest': [
      'It is about {interest}! I fluffed right up! {headline}',
      'Look what turned up under my feet! It says {interest}! {headline}',
      'You love {interest}! So I ran over with this! {headline}',
      'Patrol paused! Reason: {interest}! {headline}',
      'I heard {interest} and did a flap! {headline}',
      'Quick quick! Before I forget! It is {interest}! {headline}',
    ],
  },
};
