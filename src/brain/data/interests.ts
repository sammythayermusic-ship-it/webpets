// The hobbies and interests on the "Get to know me" card (AFTER-BAKEOFF Step E.1), for kids and
// adults alike. Hand-written 2026-11-02. `words` are whole words or phrases that clearly mean the
// interest when typed; each maps to one interest only (data.test.ts). Left out on purpose: words
// that turn up in ordinary sentences ("play", "game", "run", "draw", "read", "train", "code",
// "dog" as in "hot dog", "a's" as in grades), words that are also a team's nickname ("rockets",
// "sharks", "dolphins", "raptors", "stars", "magic") and words a fish hears about itself ("fish",
// "fins", "aquarium", "bowl"). Leagues and teams live in ./teams.ts, not here.
import type { Interest } from '../interests';

export const INTERESTS: readonly Interest[] = [
  // Games and play
  { id: 'video-games', label: 'video games', words: ['video game', 'videogames', 'gaming', 'gamer', 'minecraft', 'fortnite', 'roblox', 'pokemon', 'super mario', 'mario kart', 'zelda', 'nintendo', 'playstation', 'xbox', 'animal crossing', 'kirby'] },
  { id: 'board-games', label: 'board games', words: ['board game', 'boardgames', 'card games', 'game night', 'monopoly', 'scrabble', 'catan', 'checkers', 'dungeons and dragons', 'd&d', 'dnd'] },
  { id: 'puzzles', label: 'puzzles', words: ['puzzle', 'jigsaw', 'jigsaw puzzle', 'crossword', 'crosswords', 'sudoku', 'wordle', "rubik's cube", 'rubiks cube', 'riddles'] },
  { id: 'chess', label: 'chess', words: ['chess club', 'checkmate', 'chessboard'] },
  { id: 'lego', label: 'lego', words: ['legos', 'lego sets', 'duplo'] },
  { id: 'magic-tricks', label: 'magic tricks', words: ['magic trick', 'magician', 'magicians', 'card tricks', 'sleight of hand'] },

  // Sports and moving
  { id: 'soccer', label: 'soccer', words: ['futbol', 'world cup', 'goalkeeper'] },
  { id: 'basketball', label: 'basketball', words: ['hoops', 'slam dunk'] },
  { id: 'baseball', label: 'baseball', words: ['softball', 't-ball', 'tee ball', 'little league'] },
  { id: 'football', label: 'football', words: ['american football', 'flag football', 'touchdown', 'quarterback'] },
  { id: 'hockey', label: 'hockey', words: ['ice hockey', 'field hockey', 'street hockey'] },
  { id: 'tennis', label: 'tennis', words: ['tennis racket', 'wimbledon'] },
  { id: 'golf', label: 'golf', words: ['golfing', 'golf course', 'mini golf', 'minigolf', 'putt putt'] },
  { id: 'running', label: 'running', words: ['jogging', 'track and field', '5k', '10k', 'half marathon'] },
  { id: 'cycling', label: 'cycling', words: ['biking', 'bike riding', 'bmx', 'mountain biking', 'bicycle'] },
  { id: 'swimming', label: 'swimming', words: ['swim team', 'swim lessons'] },
  { id: 'skateboarding', label: 'skateboarding', words: ['skateboard', 'skateboards', 'skate park', 'skatepark', 'kickflip'] },
  { id: 'gymnastics', label: 'gymnastics', words: ['gymnast', 'cartwheels', 'tumbling', 'backflips'] },
  { id: 'martial-arts', label: 'martial arts', words: ['karate', 'taekwondo', 'tae kwon do', 'judo', 'jiu jitsu', 'jiu-jitsu', 'kung fu', 'black belt'] },
  { id: 'yoga', label: 'yoga', words: ['pilates', 'meditation', 'meditating'] },
  { id: 'dance', label: 'dance', words: ['dancing', 'dancer', 'ballet', 'ballerina', 'tap dancing', 'breakdancing', 'hip hop dancing'] },

  // Outdoors
  { id: 'hiking', label: 'hiking', words: ['hiking trail', 'hiking boots', 'nature walks'] },
  { id: 'camping', label: 'camping', words: ['camping trip', 'campfire', 'campfires', "s'mores", 'smores'] },
  { id: 'fishing', label: 'fishing', words: ['fly fishing', 'angling', 'fishing rod', 'fishing pole', 'tackle box'] },
  { id: 'gardening', label: 'gardening', words: ['garden', 'planting', 'houseplants'] },
  { id: 'travel', label: 'travel', words: ['traveling', 'travelling', 'road trip', 'road trips', 'backpacking', 'sightseeing'] },

  // Making things
  { id: 'drawing', label: 'drawing', words: ['sketching', 'sketchbook', 'doodling', 'doodles', 'cartooning'] },
  { id: 'art', label: 'art', words: ['artist', 'artwork', 'art class', 'art museum', 'painting', 'watercolor', 'watercolors', 'watercolour'] },
  { id: 'crafts', label: 'crafts', words: ['crafting', 'knitting', 'crochet', 'sewing', 'embroidery', 'origami', 'scrapbooking', 'pottery', 'making slime', 'friendship bracelets'] },
  { id: 'photography', label: 'photography', words: ['photographer', 'taking pictures', 'taking photos', 'my camera'] },
  { id: 'writing', label: 'writing', words: ['creative writing', 'poetry', 'poems', 'journaling', 'fan fiction', 'fanfic'] },
  { id: 'fashion', label: 'fashion', words: ['fashion design', 'clothes', 'outfits', 'sneakers', 'jewelry'] },
  { id: 'cooking', label: 'cooking', words: ['recipes', 'recipe', 'chef'] },
  { id: 'baking', label: 'baking', words: ['bake', 'sourdough', 'cake decorating', 'bread making'] },

  // Music and stage
  { id: 'music', label: 'music', words: ['songs', 'concert', 'concerts', 'playlist', 'playlists', 'orchestra', 'violin', 'cello'] },
  { id: 'singing', label: 'singing', words: ['choir', 'karaoke', 'vocals'] },
  { id: 'guitar', label: 'guitar', words: ['guitars', 'electric guitar', 'acoustic guitar', 'bass guitar', 'ukulele'] },
  { id: 'piano', label: 'piano', words: ['pianist', 'piano lessons'] },
  { id: 'drums', label: 'drums', words: ['drummer', 'drumming', 'drum kit', 'drum set'] },
  { id: 'theater', label: 'theater', words: ['theatre', 'musicals', 'musical theater', 'broadway', 'drama club', 'school play'] },

  // Stories and screens
  { id: 'reading', label: 'reading', words: ['books', 'novels', 'bookworm', 'library'] },
  { id: 'comics', label: 'comics', words: ['comic book', 'comic books', 'graphic novel', 'graphic novels', 'superhero', 'superheroes', 'batman', 'spider-man', 'spiderman'] },
  { id: 'movies', label: 'movies', words: ['movie', 'film', 'films', 'cinema', 'disney', 'pixar', 'marvel', 'star wars'] },
  { id: 'anime', label: 'anime', words: ['manga', 'ghibli', 'studio ghibli', 'naruto', 'dragon ball', 'demon slayer', 'my hero academia', 'cosplay'] },

  // Knowing things
  { id: 'science', label: 'science', words: ['scientist', 'chemistry', 'physics', 'biology', 'science experiments', 'science fair'] },
  { id: 'space', label: 'space', words: ['astronomy', 'astronaut', 'astronauts', 'planets', 'solar system', 'black holes', 'galaxies', 'telescope', 'nasa'] },
  { id: 'math', label: 'math', words: ['maths', 'mathematics', 'algebra', 'geometry', 'calculus'] },
  { id: 'coding', label: 'coding', words: ['programming', 'programmer', 'computer science', 'javascript', 'web development', 'game development'] },
  { id: 'robots', label: 'robots', words: ['robot', 'robotics'] },
  { id: 'history', label: 'history', words: ['historian', 'ancient egypt', 'ancient rome', 'ancient greece', 'pyramids', 'mummies', 'medieval', 'castles'] },
  { id: 'dinosaurs', label: 'dinosaurs', words: ['dinosaur', 'dino', 'dinos', 't-rex', 't rex', 'triceratops', 'velociraptor', 'fossils', 'paleontology', 'jurassic park'] },
  { id: 'cars', label: 'cars', words: ['race cars', 'racecars', 'sports cars', 'classic cars', 'car shows', 'hot wheels', 'monster trucks', 'formula 1', 'formula one', 'f1', 'nascar'] },
  { id: 'trains', label: 'trains', words: ['railroad', 'railroads', 'railway', 'model trains', 'steam trains', 'locomotive', 'locomotives'] },

  // Living things
  { id: 'animals', label: 'animals', words: ['wildlife', 'wild animals', 'zoo', 'zoos', 'safari', 'pets'] },
  { id: 'dogs', label: 'dogs', words: ['my dog', 'puppy', 'puppies', 'doggo', 'doggy'] },
  { id: 'cats', label: 'cats', words: ['my cat', 'kitten', 'kittens', 'kitty', 'kitties'] },
  { id: 'horses', label: 'horses', words: ['horse', 'pony', 'ponies', 'horseback riding', 'horse riding', 'equestrian'] },
  { id: 'birds', label: 'birds', words: ['birdwatching', 'bird watching', 'birding', 'bird feeder', 'owls', 'parrots'] },
  { id: 'bugs', label: 'bugs', words: ['insects', 'butterflies', 'beetles', 'ladybugs', 'caterpillars', 'spiders', 'entomology'] },
  { id: 'ocean', label: 'ocean', words: ['sea', 'sea life', 'sea creatures', 'marine biology', 'coral reef', 'coral reefs', 'whales', 'octopus', 'jellyfish', 'scuba', 'scuba diving', 'snorkeling'] },
];
