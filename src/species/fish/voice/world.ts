// What the goldfish says about your teams' games and the news (AFTER-BAKEOFF Step F; the types are in
// src/brain/types.ts). Data only; src/brain picks, and fills every token from data the app fetched.
//
// The same fish as lines.ts and chat.ts, in the same four characters, for kids and adults alike:
//   sarcastic — deadpan, pretends not to care, plainly does.
//   anxious   — sweet, a worrier, relieved every time you show up.
//   zen       — calm, grateful, finds the poetry in a pebble.
//   hyper     — everything is the best thing that has ever happened, again.
// The fish is on your team ("we won!"). A win is a party; a loss is a gentle mope that bounces back
// quickly. Never bitter, never unkind about the other team or anyone on it.
//
// Tokens, and only where they are named (`{name}`, the fish's own name, is allowed anywhere):
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

export const FISH_WORLD: Record<Personality, Record<WorldMoment, readonly string[]>> = {
  sarcastic: {
    'game-day': [
      'Game day. {team} and {opponent} at {time}. Not that I am counting.',
      'We play the {opponent} at {time}. I cleared my schedule. Go {team}.',
      'Oh, is it game day? Go {team}. At {time}. Whatever.',
      'The {team} play today. I am not nervous. My fins just do that.',
      'Today, {team} against the {opponent}. I have a good feeling. Shh.',
      'Game at {time}. I will pretend I am not excited. Go {team}.',
    ],
    live: [
      'Score check: {team} {score} {opponent}. I am very calm. Mostly.',
      'It is {score} right now, {team} first. I am totally relaxed.',
      '{team} {score} {opponent}, for now. I have not blinked. I never do.',
      'Live from the bowl: {team} {score}. I am on the edge of my pebble.',
      'It is {team} {score} at the moment. Do not look at me. I am fine.',
      'Currently {score}, the {team} first. I am doing a casual lap.',
    ],
    won: [
      'The {team} won, {score}. Fine. One small happy lap. Okay, four.',
      'Go {team}. {score}, final. I am not smiling. Fish cannot smile.',
      '{team} win, {score}. I would like to thank the plant for its support.',
      'We won {score}. I knew it. I did not know it. Go {team} anyway.',
      'Final score {score}, and it is ours. Go {team}. Okay, GO {team}.',
      'A win for the {team}, {score}. I am acting like this is normal.',
      'We did it. {team} {score}. I may have done a flip. Nobody saw.',
      'Won it, {score}. The {team} and I had a great day. Mostly them.',
    ],
    lost: [
      'The {team} lost, {score}. I am fine. I will sulk by the plant.',
      'We lost, {score}. I did not want to win anyway. A fib. Go {team}.',
      '{score}. Not our day. Here is to the next one, {team}.',
      'A loss for the {team}, {score}. I need a quiet lap. Maybe two.',
      'Lost it, {score}. Fins off to the {opponent}. Still Team {team}.',
      'Well. {team} {score}. I am not upset. I am just very still.',
      'The {team} came up short, {score}. I will mope. With dignity.',
      'That one stung, {score}. I am still on Team {team}. Obviously.',
    ],
    tied: [
      'A draw, {score}. Half a happy lap, then. Go {team}.',
      'Tied, {score}. Very fair. Very unsatisfying. Go {team}.',
      '{team} {score} {opponent}. A tie. I will take it. Grudgingly.',
      'It finished level, {score}. I feel exactly medium. Go {team}.',
      'All square, {score}. I did a lap that went nowhere. Go {team}.',
      'A tie for the {team}, {score}. I have decided to be fine with it.',
    ],
    'still-happy': [
      'Still thinking about that {team} win. Not a lot. Constantly.',
      'The {team} won today, in case you forgot. I did not forget.',
      'I am still in a good mood about the {team}. Do not ruin it.',
      'My victory laps look like regular laps. They are not. Go {team}.',
      'Go {team}. Still. I am saying it again because we won.',
      'Still a little bubbly about the {team}. It is a whole thing.',
    ],
    mope: [
      'Still a bit glum about the {team}. Give me one more lap.',
      'I am sulking near the gravel. The {team} know why.',
      'Not over the {team} game yet. Almost. Okay, nearly.',
      'I am fine about the {team}. I am just staring at the gravel.',
      'One small sulk for the {team}, then back to my busy laps.',
      'I took the {team} game personally. I am un-taking it. Slowly.',
    ],
    'no-game': [
      'No {team} game today. Nothing to pretend not to care about.',
      'Day off for the {team}. I also have the day off. Every day.',
      'No game for the {team} today. Back to staring at the plant.',
      'Nothing on for the {team} today. Quiet day. Like all my days.',
      'No {team} today. I will cheer for the plant. It has done nothing.',
      'Rest day for the {team}. I relate. Deeply.',
    ],
    news: [
      'News from the dry world. I read it so you did not have to: {headline}',
      'Not that I follow the news, but: {headline}',
      'This one is actually nice. Do not get used to it: {headline}',
      'I heard this through the glass: {headline}',
      'Breaking news, from a fish who never leaves the bowl: {headline}',
      'Fine, here is something nice: {headline}',
    ],
    'news-interest': [
      'You like {interest}, so I looked. Not for you. Okay, for you: {headline}',
      'Something about {interest}. Only because you care: {headline}',
      'News for you on the {interest} front: {headline}',
      'I kept an eye out for {interest} news. Casually: {headline}',
      'This made me think of you and your {interest}: {headline}',
      'For the {interest} fan on the dry side: {headline}',
    ],
  },
  anxious: {
    'game-day': [
      'It is game day! {team} and {opponent} at {time}. I am nervous!',
      'We play at {time}! Go {team}! Oh, my fins are fluttering.',
      'The {team} play today. I hope it is a good game. Especially for us.',
      'Game against the {opponent} at {time}. Go {team}! Gently!',
      'Is it {time} yet? Not yet. Okay. Go {team}! I am a bit wobbly.',
      'Today the {team} play. I hope they had a good breakfast.',
    ],
    live: [
      'Okay. It is {team} {score} {opponent}. I cannot look. I am looking.',
      'Score right now: {score}, {team} first. Oh, I hope it goes well!',
      'It is {score} so far! Go {team}! I am watching from the plant.',
      'Still going! {team} {score}. My fins are crossed. I think.',
      'Right now, {team} {score} {opponent}. Please be okay, {team}.',
      'So far: {score}, {team} first. I am holding my breath. Underwater.',
    ],
    won: [
      'We won! {score}! Oh, thank goodness. Go {team}!',
      'The {team} won, {score}! I was so worried, and now I am so happy!',
      'Phew! {score}, and it is ours! I can breathe again. Go {team}!',
      'A win, {score}! I hoped and hoped, and the {team} did it!',
      '{team} win {score}! I did a happy wiggle. Was it too much? No!',
      'They did it! {team} {score} {opponent}! I am so proud of them!',
      'We won against the {opponent}, {score}! My heart does laps! Go {team}!',
      'Oh my goodness, {score}! The {team} won! I need to sit on a pebble.',
    ],
    lost: [
      'Oh no. The {team} lost, {score}. I hope they are okay.',
      'We lost, {score}. That is okay. It is okay. Go {team}.',
      '{score}. Oh, {team}. A hard one. I am still proud of them.',
      'Not our game, {score}. I am a bit sad. Still love the {team}.',
      'A loss, {score}. My fins went droopy. Go {team}, always.',
      'Oh. {team} {score} {opponent}. That is okay. Well done to them too.',
      'We lost, {score}, and I need a minute. Then I am back. Go {team}.',
      'Not this time for the {team}, {score}. I am sending a gentle bubble.',
    ],
    tied: [
      'A draw, {score}! Not a loss! Phew! Go {team}!',
      'It is a tie, {score}. Nobody has to be sad! Go {team}!',
      'Tied at {score}. I was nervous all game. Now I can relax. Go {team}.',
      '{team} {score} {opponent}. Even! Everyone gets a little something.',
      'A tie for the {team}, {score}. That is not bad at all. Phew.',
      'Level at {score}! My fins can stop fluttering now. Go {team}!',
    ],
    'still-happy': [
      'I am still so happy about the {team}! I keep wiggling.',
      'The {team} won today! I wanted to say it again. Is that okay?',
      'I feel so calm now that the {team} won. Calm and happy.',
      'Still glowing about the {team}. Thank you for sharing them with me.',
      'I keep smiling about the {team}. On the inside, where fish smile.',
      'Today feels safe and good. Go {team}!',
    ],
    mope: [
      'I am still a little sad about the {team}. But I am okay. Are you?',
      'Still a bit wobbly about the {team}. The plant is helping.',
      'I had a little sulk about the {team}. I feel better now. Mostly.',
      'It is okay about the {team}. The next game is a fresh start.',
      'I am resting low today, thinking about the {team}. I will perk up.',
      'Still sad for the {team}, but it is only a game. I am okay.',
    ],
    'no-game': [
      'No {team} game today. That means no nerves! Phew.',
      'No game for the {team} today. A calm day. I like calm days.',
      'Nothing on for the {team} today. I will save up my cheering.',
      'A day off for the {team}. I hope they get lots of rest.',
      'No {team} today. My fins get a day off from fluttering.',
      'I checked. No {team} game today. Everything is okay.',
    ],
    news: [
      'Oh, this one is lovely. It made me feel better: {headline}',
      'Good news! Real good news! Here: {headline}',
      'I was worried about the world, and then I read this: {headline}',
      'Something kind happened out there: {headline}',
      'Here is a happy one, to make your day softer: {headline}',
      'Phew, some nice news: {headline}',
    ],
    'news-interest': [
      'I found something about {interest}! I hope you like it: {headline}',
      'Is this the kind of {interest} news you like? I think so: {headline}',
      'I saved this for you because of {interest}: {headline}',
      'Oh! News about {interest}! I forgot to worry: {headline}',
      'I kept a lookout for {interest} things, just for you: {headline}',
      'This one is about {interest}. I thought of you: {headline}',
    ],
  },
  zen: {
    'game-day': [
      'Today the {team} meet the {opponent}, at {time}. Breathe in.',
      'Game day. Whatever comes at {time}, we cheer kindly. Go {team}.',
      'The {team} play today. I wish them a good game, and a kind one.',
      'At {time}, the {team} play the {opponent}. May everyone play well.',
      'A game today. The {team} have my calm, steady support.',
      'Game day is a little festival. Go {team}, at {time}.',
    ],
    live: [
      'In this moment: {team} {score} {opponent}. Only this moment.',
      'The game flows on. {score} for now, {team} first. Breathe.',
      'Right now, {score}, the {team} first. Every moment can change.',
      'It is {team} {score}. I watch the score like I watch the water.',
      'Midgame, {team} {score} {opponent}. I send steady ripples.',
      'Score, for now: {team} {score}. Patience, little fins.',
    ],
    won: [
      'We won, {score}. Joy, like sunlight on the gravel. Go {team}.',
      'The {team} won, {score}. I am doing a slow, grateful lap.',
      '{score}, a win for the {team}. I let the happiness ripple out.',
      'Victory, {score}. Well played, {team}. And well played, {opponent}.',
      'A good day for the {team}, {score}. I will remember this one.',
      'The {team} took it, {score}. Even my bubbles rise happier.',
      'Win, {score}. I feel it to the tips of my fins. Go {team}.',
      'We won against the {opponent}, {score}. Thank you, {team}.',
    ],
    lost: [
      'We lost, {score}. That is alright. The light still comes. Go {team}.',
      'The {team} lost, {score}. Losing is part of playing.',
      'A loss, {score}. The {team} will play again, and so will my hope.',
      'Not our day, {score}. Even rivers have slow days. Go {team}.',
      'A loss for the {team}, {score}. I sink low, then rise like a bubble.',
      'Lost, {score}. Every game is a teacher. Still with the {team}.',
      '{team} {score} {opponent}. A sad one. Sadness passes like a ripple.',
      'We came up short, {score}. Be gentle with yourself, and the {team}.',
    ],
    tied: [
      'A draw, {score}. Balance. The bowl approves. Go {team}.',
      'Tied, {score}. Neither up nor down. A calm place to rest, {team}.',
      '{team} {score} {opponent}. Even, like still water.',
      'It ended level, {score}. Peace for the {team}, and for me.',
      'A tie for the {team}, {score}. Sharing is its own kind of joy.',
      'All even, {score}. I float in the middle of the bowl. Go {team}.',
    ],
    'still-happy': [
      'The {team} win still glows in me, like late light on the water.',
      'I am still smiling about the {team}. A quiet smile, but a long one.',
      'A good day stays good. Thank you, {team}.',
      'The happiness from the {team} has settled softly in the bowl.',
      'I keep a small happy ripple going for the {team}.',
      'Still grateful for the {team} today. Joy likes to linger.',
    ],
    mope: [
      'I am resting low today, thinking about the {team}. That is alright.',
      'A little sadness about the {team} still floats here. I let it drift.',
      'Feelings come and go like bubbles. This {team} one is going.',
      'The {team} game stayed with me. Now I let it go, breath by breath.',
      'Low fins today for the {team}. Soon the water will feel lighter.',
      'Even a sad game is part of the story. Still with you, {team}.',
    ],
    'no-game': [
      'No {team} game today. A day of rest is a gift.',
      'The {team} rest today. So does my cheering voice.',
      'No game for the {team} today. Just water, light, and us.',
      'Nothing on for the {team} today. I enjoy the quiet.',
      'A quiet day for the {team}. Rest makes the next game sweeter.',
      'No {team} today. I will practise being a calm fan.',
    ],
    news: [
      'A small light from the wide world: {headline}',
      'Good things happen every day. Here is one: {headline}',
      'Let this one sink in slowly: {headline}',
      'From beyond the glass, something kind: {headline}',
      'The world can be gentle. Today it was: {headline}',
      'A ripple of good news: {headline}',
    ],
    'news-interest': [
      'Something for your love of {interest}: {headline}',
      'The world shared a little about {interest} today: {headline}',
      'I thought of you and {interest} when I saw this: {headline}',
      'A gentle note on {interest}, from beyond the glass: {headline}',
      'For the part of you that loves {interest}: {headline}',
      'News about {interest} drifted my way: {headline}',
    ],
  },
  hyper: {
    'game-day': [
      'GAME DAY! {team} and {opponent} at {time}! I cannot WAIT!',
      'We play at {time}! GO {team}! I am already doing laps!',
      'It is {team} day! The BEST day! Game at {time}!',
      '{team} versus the {opponent}! TODAY! I am SO ready!',
      'Is it {time} yet?! No?! Okay! GO {team} anyway!',
      'Game today! I practised my cheer! GO GO {team}!',
      'The {team} play today and I am bouncing off the glass!',
    ],
    live: [
      'LIVE SCORE! {team} {score} {opponent}! GO GO GO!',
      'It is {score} right now, us first! Come on, {team}!',
      'Right now: {team} {score}! I am swimming SO fast!',
      'Score update! {score}, {team} first! I cannot sit still!',
      'We are at {score}! Still going! GO {team}!',
      '{team} {score} {opponent}! It is happening RIGHT NOW!',
    ],
    won: [
      'WE WON! {score}! GO {team}! Victory lap! Another one!',
      'The {team} WON, {score}! Best day EVER!',
      '{score}! {score}! We did it! I love the {team} SO much!',
      'YES! {team} win {score}! Bubbles for everyone!',
      'We beat the {opponent}, {score}! ALL the flips! GO {team}!',
      'WINNERS! {team} {score}! I am the happiest fish in the universe!',
      'Final, {score}, and it is OURS! GO {team}! Zoom zoom zoom!',
      'Did you see?! {team} {score}! Party in the bowl!',
    ],
    lost: [
      'Aw. We lost, {score}. Sad lap. Okay, done! Go {team}!',
      'The {team} lost, {score}. My fins are droopy. For like a minute!',
      'Oh no, {score}. That one hurt. But I still love the {team} SO much!',
      'We lost, {score}. Sad. Still sad. Less sad! Go {team}!',
      'Not our day, {score}. Big hug for the {team}! A fin hug!',
      'Aww, {score}. Sad bubble. Then a happy bubble! GO {team}!',
      '{team} {score} {opponent}. Ouch. I need a snack. Then I am okay!',
      'We lost, {score}, BUT we are still the best fans! Go {team}!',
      'Good game, {opponent}. Sad one for us, {score}. Bounce back, {team}!',
    ],
    tied: [
      'A TIE! {score}! Half a party! I will take it! Go {team}!',
      'Tied {score}! Nobody lost! Everybody is a bit happy! Go {team}!',
      '{team} {score} {opponent}! EVEN! That is kind of exciting!',
      'A draw, {score}! I did half a victory lap! Go {team}!',
      'It ended {score}! Not a loss! A mini win! Go {team}!',
      'All square at {score}! Equal! Fair! FUN! Go {team}!',
    ],
    'still-happy': [
      'Still SO happy about the {team}! Victory lap number fifty!',
      'Did you know the {team} WON today?! I am still zooming!',
      'The {team} win is the best thing that happened today!',
      'I cannot stop thinking about the {team}! Happy bubbles all day!',
      'GO {team}! Still! Forever! We won!',
      'Best day! {team} day! I am still doing happy laps!',
    ],
    mope: [
      'Still a tiny bit sad about the {team}. Tiny! Getting smaller!',
      'My fins are down a little for the {team}. Okay, coming back up!',
      'I did one sad lap for the {team}. Now a happy lap! Bounce back!',
      'Still thinking about the {team}. The next game will be so fun!',
      'Sulking. Sulking. Okay, done sulking! Go {team}!',
      'A little mope for the {team}. And then snacks! Snacks fix moods!',
    ],
    'no-game': [
      'No {team} game today?! Aww! Okay! More time for laps!',
      'No game for the {team} today! I will cheer anyway! GO {team}!',
      'Rest day for the {team}! So I am cheering for the plant! GO PLANT!',
      'Nothing on for the {team} today! I am saving my BIGGEST cheer!',
      'No {team} today! So the next game is even closer! Kind of!',
      'I checked! No {team} game! Still the best day though!',
    ],
    news: [
      'GOOD NEWS ALERT! {headline}',
      'Oh oh oh! Listen to this! {headline}',
      'The world is AMAZING! Look: {headline}',
      'Happy news! Happy news! {headline}',
      'This made me do a happy lap: {headline}',
      'You have to hear this! {headline}',
    ],
    'news-interest': [
      'News about {interest}! Our favourite! {headline}',
      'Ooh, {interest}! Look what I found! {headline}',
      'I found {interest} news! For YOU! {headline}',
      'You love {interest} and so do I! Look! {headline}',
      'Something about {interest}! Happy lap! {headline}',
      'Stop everything! It is about {interest}! {headline}',
    ],
  },
};
