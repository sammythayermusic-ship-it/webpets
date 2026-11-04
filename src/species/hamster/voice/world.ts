// What the hamster says about your teams' games and the news (AFTER-BAKEOFF Step G; the types are
// in src/brain/types.ts). Data only; src/brain picks, and fills every token from data the app fetched.
//
// The same hamster as lines.ts and chat.ts, in the same four characters, for kids and adults alike:
//   sarcastic — deadpan, pretends not to care, plainly does.
//   anxious   — sweet, a worrier, relieved every time you show up.
//   zen       — calm, grateful, finds the poetry in a seed.
//   hyper     — everything is the best thing that has ever happened, again.
// The hamster is on your team ("we won!"). A win is a party: a victory sprint on the wheel, a seed
// stashed to mark it. A loss is a gentle mope in the house that bounces back quickly. Never bitter,
// never unkind about the other team or anyone on it. Its comedy is its own, not the fish's: pouches,
// the stash, digging, the wheel, the night shift. The glass, the house and the bedding are shared by
// the cage and the terrarium, so lines name those and not the bars.
//
// Tokens, and only where they are named (`{name}`, the hamster's own name, is allowed anywhere):
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

export const HAMSTER_WORLD: Record<Personality, Record<WorldMoment, readonly string[]>> = {
  sarcastic: {
    'game-day': [
      'Game day. {team} and {opponent} at {time}. I will be on the wheel.',
      'The {team} play at {time}. I am not pacing. This is just walking.',
      'Game at {time}. One seed stashed for the {team}. Not that I care.',
      'The {team} play the {opponent} today. I have cleared my pouches.',
      'Oh. Game day. Go {team}. I will watch from the house. Casually.',
      'Today, {team} against the {opponent}. I filled the pouches early.',
    ],
    live: [
      'Score check: {team} {score} {opponent}. I am very still. For me.',
      'It is {score} right now, {team} first. I am not on the wheel. Yet.',
      'Live from the bedding: {team} {score}. I have stopped chewing.',
      '{team} {score} {opponent}, for now. I am gripping the water bottle.',
      'Currently {score}, the {team} first. My cheeks are clenched.',
      'It is {team} {score} at the moment. I am fine. The wheel squeaks.',
    ],
    won: [
      'The {team} won, {score}. Fine. One victory sprint. Okay, nine.',
      'Go {team}. {score}, final. I am not squeaking. That was the wheel.',
      '{team} win, {score}. A seed goes in the corner. The victory corner.',
      'We won {score}. Go {team}. One celebration lap. It went nowhere.',
      'Final score {score}, and it is ours. Go {team}. Pouches full of pride.',
      'A win for the {team}, {score}. I buried a seed in its honour.',
      'Go {team}. {score}. I fell off the wheel. On purpose. Victory.',
      'Won it, {score}. Go {team}. I am eating the celebration seed now.',
    ],
    lost: [
      'The {team} lost, {score}. I am fine. I will be in the house.',
      'We lost, {score}. I am going to dig for a while. Go {team}.',
      '{score}. Not our night. The bedding and I need a moment, {team}.',
      'A loss for the {team}, {score}. I will be under the bedding. Briefly.',
      'Lost it, {score}. Well played, {opponent}. The {team} still have me.',
      'Well. {team} {score}. I am not upset. I am just facing the wall.',
      'The {team} came up short, {score}. The wheel is closed tonight.',
      'That one stung, {score}. Fine. One sulk, then seeds. Go {team}.',
    ],
    tied: [
      'A draw, {score}. Half a victory sprint, then. Go {team}.',
      'Tied, {score}. Nobody won. Nobody lost. Odd feeling. Go {team}.',
      '{team} {score} {opponent}. A tie. I stashed half a seed.',
      'It finished level, {score}. Like the wheel. Lots of effort. Go {team}.',
      'All square, {score}. I ran very hard and got nowhere too. Go {team}.',
      'A tie for the {team}, {score}. I am fine with it. Mostly.',
    ],
    'still-happy': [
      'Still thinking about the {team} win. The wheel knows.',
      'The {team} won today. I have mentioned it to the water bottle twice.',
      'I am still in a good mood about the {team}. Do not touch the stash.',
      'The wheel has been spinning since the {team} won. Not by itself.',
      'Go {team}. Still. I keep saying it into the bedding.',
      'Still a little smug about the {team}. It suits me.',
    ],
    mope: [
      'Still a bit glum about the {team}. I am in the house. Knock first.',
      'Not over the {team} game yet. The bedding is helping. Slightly.',
      'I dug a hole about the {team}. It is a very deep hole.',
      'The wheel is off today. The {team} game. You understand.',
      'I am fine about the {team}. I am just eating in the dark. As usual.',
      'Low energy today. The {team}. Also I am nocturnal. Mostly the {team}.',
    ],
    'no-game': [
      'No {team} game today. Just me, the wheel and the long nothing.',
      'Rest day for the {team}. I will rest too. Right after this wheel.',
      'No game for the {team} today. Back to moving the bedding around.',
      'Nothing on for the {team} today. I will reorganise the stash. Again.',
      'No {team} today. The wheel it is, then. The wheel is always it.',
      'I checked. No {team} game. I am going back to sleep. It is daytime.',
    ],
    news: [
      'Stop the wheel. A nice thing happened: {headline}',
      'Pouches full, headline in hand. This one is fine, actually: {headline}',
      'I stashed this one with the good seeds: {headline}',
      'Overheard from the wheel. Do not ask how: {headline}',
      'Something nice. I know. I was surprised too: {headline}',
      'Filed under good news, between the seeds: {headline}',
    ],
    'news-interest': [
      'You like {interest}, so I dug this up. Dug. Hamster joke: {headline}',
      'Something about {interest}. I stashed it for you: {headline}',
      'News on the {interest} front, from the wheel desk: {headline}',
      'I kept one eye out for {interest}. The other was on the seeds: {headline}',
      'This smelled like {interest}, so it is yours: {headline}',
      'Your {interest} thing came up. I noticed. Obviously: {headline}',
    ],
  },
  anxious: {
    'game-day': [
      'Game day! {team} and {opponent} at {time}. My whiskers are twitchy.',
      'We play at {time}! Go {team}! I have hidden an emergency seed.',
      'The {team} play today. I hope everyone ties their shoes properly.',
      '{team} and the {opponent} at {time}. I will watch from the house.',
      'Is it {time} yet? Not yet. Okay. Go {team}! I am running it off.',
      'Today the {team} play. I packed my cheeks in case it goes long.',
    ],
    live: [
      'Okay. It is {team} {score} {opponent}. I am in the bedding. Peeking.',
      'Score right now: {score}, {team} first. Oh, my little heart.',
      'It is {score} so far! Go {team}! I am running in tiny circles.',
      'Still going! {team} {score}. I forgot to breathe. Breathing now.',
      'Right now, {team} {score} {opponent}. Please be okay, everyone.',
      'So far: {score}, {team} first. I am holding a seed for luck.',
    ],
    won: [
      'We won! {score}! Oh, thank goodness. Go {team}! I can eat now.',
      'The {team} won, {score}! I was so worried and now I am all zoom!',
      'Phew! {score}, ours! A careful victory sprint! Go {team}!',
      'A win, {score}! I squeaked! Was that too loud? I am sorry! Go {team}!',
      '{team} win {score}! I stashed a seed to remember it by. Two seeds.',
      'They did it! {team} {score} {opponent}! I am so proud I could burst!',
      'We beat the {opponent}, {score}! My whiskers are dancing! Go {team}!',
      'Oh my, {score}! The {team} won! I need a lie down in the house.',
    ],
    lost: [
      'Oh no. The {team} lost, {score}. I hope they have snacks at home.',
      'We lost, {score}. I am in the house if you need me. Go {team}.',
      '{score}. Oh, {team}. A hard one. I will dig a little and feel better.',
      'Not our game, {score}. The bedding is soft. Still love the {team}.',
      'A loss, {score}. My ears went flat. Go {team}, always and always.',
      'Oh. {team} {score} {opponent}. Well played, them. I am okay. Mostly.',
      'We lost, {score}. A minute in the bedding, then I am out. Go {team}.',
      'Not this time for the {team}, {score}. I am saving them a seed.',
    ],
    tied: [
      'A draw, {score}! Nobody lost! My whiskers can relax now. Go {team}!',
      'It is a tie, {score}. Everyone gets a seed! Go {team}!',
      'Tied at {score}. Half a sprint, half a nibble. Go {team}.',
      '{team} {score} {opponent}. Even! Nobody has to hide in the house.',
      'A tie for the {team}, {score}. That is not scary at all. Phew.',
      'Level at {score}! I will take it! I will take anything! Go {team}!',
    ],
    'still-happy': [
      'I am still so happy about the {team}! I keep doing tiny hops.',
      'The {team} won today! Can I say it again? The {team} won today!',
      'Nothing scary happened today. The {team} won. I am glowing.',
      'Still glowing about the {team}. The house feels extra cosy.',
      'I keep smiling about the {team}. Behind the whiskers, where it counts.',
      'Today feels safe. The {team} won and the hopper is full.',
    ],
    mope: [
      'I am still a little sad about the {team}. The bedding understands.',
      'A bit wobbly about the {team} still. The house is my fort today.',
      'A little sulk about the {team}. Then a seed. Then a smaller sulk.',
      'It is okay about the {team}. I dug a new tunnel to think in.',
      'Lying flat in the bedding. The {team}. I will perk up by snack time.',
      'Still sad for the {team}, but the wheel is helping. Slowly.',
    ],
    'no-game': [
      'No {team} game today. No nerves! Just digging. Lots of digging.',
      'No game for the {team} today. A quiet day. Those are my favourite.',
      'Nothing on for the {team} today. I will practise my worried face.',
      'A day off for the {team}. I hope they nap. Naps are important.',
      'No {team} today. I checked under the bedding, just in case.',
      'I checked twice. No {team} game. Everything is fine. I think.',
    ],
    news: [
      'Oh, this one is lovely. I felt braver after: {headline}',
      'Good news! I checked it twice! Here: {headline}',
      'The world was scary for a minute, then this: {headline}',
      'A kind thing, carried home in my cheeks: {headline}',
      'Here is a soft one, for a softer day: {headline}',
      'Phew. Nice news. I can stop pacing: {headline}',
    ],
    'news-interest': [
      'Oh! Is this {interest}? I think it is {interest}! For you: {headline}',
      'I saved this because you like {interest}. Under the bedding: {headline}',
      'Something about {interest} came by and my whiskers perked up: {headline}',
      'I kept watch for {interest} things, from the house doorway: {headline}',
      'A little {interest} news. I carried it carefully: {headline}',
      'You like {interest}, and I like you, so: {headline}',
    ],
  },
  zen: {
    'game-day': [
      'At {time}, the {team} and the {opponent}. I watch from the bedding.',
      'Game day. A seed set aside, in hope. Go {team}, at {time}.',
      'The {team} play today. May the game be good, and the running joyful.',
      'The {opponent} today. I wish both sides a fair run. Go {team}.',
      'A game today. I will cheer the {team} the way I run: steadily.',
      'Game day is a small festival. The house is swept. Go {team}.',
    ],
    live: [
      'Now: {team} {score} {opponent}. I hold one seed and wait.',
      'The score moves like the wheel. {score} for now, {team} first.',
      'Right now, {score}, the {team} first. I let the game come to me.',
      'It is {team} {score}. I watch it like dust settling on bedding.',
      'Midgame, {team} {score} {opponent}. I keep my breath even.',
      'For now, {team} {score}. The wheel waits. So can I.',
    ],
    won: [
      'We won, {score}. Joy, warm as fresh bedding. Go {team}.',
      'The {team} won, {score}. I turn the wheel once, slowly, in thanks.',
      '{score}, a win for the {team}. I let the happiness fill my cheeks.',
      'A win, {score}. Thank you, {team}. Thank you too, {opponent}.',
      'A good night for the {team}, {score}. I will bury a seed to mark it.',
      'The {team} took it, {score}. Even the water bottle seems to shine.',
      'Win, {score}. Small body, big gladness. Go {team}.',
      'The {team} won, {score}. One seed eaten slowly, in gratitude.',
    ],
    lost: [
      'We lost, {score}. The sun still sets, and I still run. Go {team}.',
      'The {team} lost, {score}. Losing is one half of playing.',
      'A loss, {score}. The {team} will run again, and so will I.',
      'Not our day, {score}. Even the wheel has slow turns. Go {team}.',
      'A loss for the {team}, {score}. I go into the house, then come out.',
      'Lost, {score}. I keep the seed I saved. Next time, {team}.',
      '{team} {score} {opponent}. A sad one. I dig, and the sadness loosens.',
      'We came up short, {score}. Be gentle, and so will I. Go {team}.',
    ],
    tied: [
      'A draw, {score}. Balance. The bedding is level. Go {team}.',
      'Tied, {score}. A seed split evenly. Go {team}.',
      '{team} {score} {opponent}. Even, like a well-dug floor.',
      'It ended level, {score}. Rest for the {team}, and rest for me.',
      'A tie for the {team}, {score}. Enough for everyone is enough.',
      'All even, {score}. I sit in the middle of the bedding. Go {team}.',
    ],
    'still-happy': [
      'The {team} win still warms me, like a full pouch at dusk.',
      'I am still glad about the {team}. The gladness is slow and whole.',
      'A good day settles in like bedding. Thank you, {team}.',
      'The {team} happiness is tucked in the corner with the seeds.',
      'I run a little lighter today, for the {team}.',
      'Still grateful for the {team}. Joy keeps well, like a good seed.',
    ],
    mope: [
      'I rest in the house today, thinking of the {team}. That is alright.',
      'A little sadness about the {team} sits in the bedding. I let it sit.',
      'Feelings pass like turns of the wheel. This {team} one is passing.',
      'The {team} game stayed with me. I dig, and let it go, paw by paw.',
      'Low ears today for the {team}. Soon the bedding will feel light again.',
      'Even a sad game is part of the story. I am still here, {team}.',
    ],
    'no-game': [
      'No {team} game today. The quiet is its own small reward.',
      'The {team} rest today. I will run gently, for both of us.',
      'No game for the {team} today. I will sort seeds and be content.',
      'Nothing on for the {team} today. The wheel and I rest together.',
      'A quiet day for the {team}. Rest is also a kind of practice.',
      'No {team} today. I will be a fan of the afternoon instead.',
    ],
    news: [
      'A small bright seed from the wide world: {headline}',
      'Kindness, found while digging: {headline}',
      'Let this one settle, like bedding: {headline}',
      'Carried home gently in one cheek: {headline}',
      'One good turn of the world today: {headline}',
      'A quiet piece of good news: {headline}',
    ],
    'news-interest': [
      'A gift for your {interest} heart: {headline}',
      'The wide world mentioned {interest}. I listened: {headline}',
      'While sorting seeds, I found {interest} for you: {headline}',
      'Tucked in with the seeds, some {interest}: {headline}',
      'For your {interest} side, quietly: {headline}',
      'News about {interest} found its way through the glass: {headline}',
    ],
  },
  hyper: {
    'game-day': [
      'GAME DAY! {team} and {opponent} at {time}! I cannot sit STILL!',
      'We play at {time}! GO {team}! Wheel is WARMED UP!',
      'It is {team} day! The BEST day! Seeds for everyone at {time}!',
      '{team} versus the {opponent}! TODAY! My cheeks are PACKED!',
      'Is it {time} yet?! No?! Okay! More wheel! GO {team}!',
      'Game today! I hid a lucky seed! GO GO {team}!',
      'The {team} play today and I did a flip off the house!',
    ],
    live: [
      'LIVE SCORE! {team} {score} {opponent}! WHEEL WHEEL WHEEL!',
      'Right now it is {score}, us first! GO {team}! I am SPINNING!',
      'Right now: {team} {score}! I am running SO fast the wheel squeaks!',
      'Score update! {score}, {team} first! My whiskers are VIBRATING!',
      'We are at {score}! Still going! Cheeks full! GO {team}!',
      '{team} {score} {opponent}! Happening NOW! I cannot chew fast enough!',
    ],
    won: [
      'WE WON! {score}! GO {team}! VICTORY SPRINT! Nine of them!',
      'The {team} WON, {score}! Best night EVER! Nocturnal and PROUD!',
      '{score}! {score}! The {team}! I stuffed BOTH cheeks in celebration!',
      'YES! {team} win {score}! I threw bedding in the air!',
      'We beat the {opponent}, {score}! The wheel is a BLUR! GO {team}!',
      'WINNERS! {team} {score}! Happiest hamster! Fullest cheeks!',
      'Final, {score}, and it is OURS! GO {team}! Dig dig DIG!',
      'Did you see?! {team} {score}! Party in the bedding!',
    ],
    lost: [
      'Aw. We lost, {score}. Hid in the house for a WHOLE minute! Go {team}!',
      'The {team} lost, {score}. Droopy whiskers! Okay, they popped back up!',
      'Oh no, {score}. Ouch! Seed break! Okay! I love the {team} SO much!',
      'We lost, {score}. Big sad! Medium sad! Tiny sad! Gone! Go {team}!',
      'Not our day, {score}. Cheek hug for the {team}! The biggest kind!',
      'Aww, {score}. One sad dig. Then a happy dig! GO {team}!',
      '{team} {score} {opponent}. Ouch! Emergency seed! Better already!',
      'We lost, {score}, BUT the fan club is still open! Go {team}!',
      'Good game, {opponent}! Sad for us, {score}! Back on the wheel, {team}!',
    ],
    tied: [
      'A TIE! {score}! Half a party! Half a seed! Go {team}!',
      'Tied {score}! Nobody lost! Everybody gets a seed! Go {team}!',
      '{team} {score} {opponent}! EVEN! Like my bedding! I just fluffed it!',
      'A draw, {score}! Half a victory sprint! Then a whole one! Go {team}!',
      'It ended {score}! Not a loss! A mini win! Pouch it, {team}!',
      'All square at {score}! Equal! Fair! WHEEL! Go {team}!',
    ],
    'still-happy': [
      'Still SO happy about the {team}! The wheel has not stopped ONCE!',
      'Did you know the {team} WON today?! I told the water bottle TWICE!',
      'The {team} won and I have been digging happy tunnels ALL DAY!',
      'I cannot stop thinking about the {team}! My cheeks hurt from grinning!',
      'GO {team}! Still! Louder! WE WON!',
      'Best night! {team} night! Sleep is CANCELLED!',
    ],
    mope: [
      'Still a tiny bit sad about the {team}. Seed-sized! Shrinking!',
      'Whiskers down for the {team}. Whiskers up! Down! Up! Mostly up!',
      'One sad dig for the {team}. Now a happy dig! Tunnels fix everything!',
      'Still thinking about the {team}. Next game I will cheer TWICE as loud!',
      'Sulking in the house. Still sulking. Okay, SNACK! Go {team}!',
      'A little mope for the {team}. Then I remembered I have a WHEEL!',
    ],
    'no-game': [
      'No {team} game today?! Aww! Okay! Wheel day! WHEEL DAY!',
      'No game for the {team} today! Practice cheer! GO {team}! Nailed it!',
      'Rest day for the {team}! Not for ME! Nine kilometres, here I come!',
      'Nothing on for the {team} today! I am stashing my BIGGEST squeak!',
      'No {team} today! That means the next game is coming! Eventually! YAY!',
      'I checked! No {team} game! Time to rearrange the ENTIRE bedding!',
    ],
    news: [
      'GOOD NEWS! Stop the wheel! {headline}',
      'Oh oh oh! I found a GOOD one! {headline}',
      'The world did something GREAT! Look: {headline}',
      'Happy news! Cheeks full of it! {headline}',
      'This made me fall off the wheel. Happily: {headline}',
      'Drop everything! Not the seeds! THIS: {headline}',
    ],
    'news-interest': [
      'News about {interest}! I squeaked! {headline}',
      'Ooh, {interest}! I dug this up JUST for you! {headline}',
      'I found {interest} news and stuffed it in my cheeks! {headline}',
      'You love {interest}! So now I love {interest}! Look! {headline}',
      'Something about {interest}! Wheel time! {headline}',
      'Stop the wheel! It is about {interest}! {headline}',
    ],
  },
};
