// True things the frog knows, each with the page that says so. Researched 2026-11-17; every fact
// was checked against the text of its source page. Toads are frogs too (the first fact says so), and
// a fact about a toad names it as one.
import type { Fact } from '../../../brain/types';

const WIKI_FROG = { title: 'Frog — Wikipedia', url: 'https://en.wikipedia.org/wiki/Frog' };
const WIKI_TADPOLE = { title: 'Tadpole — Wikipedia', url: 'https://en.wikipedia.org/wiki/Tadpole' };
const WIKI_TOAD = { title: 'Toad — Wikipedia', url: 'https://en.wikipedia.org/wiki/Toad' };
const WIKI_GOLIATH = { title: 'Goliath frog — Wikipedia', url: 'https://en.wikipedia.org/wiki/Goliath_frog' };
const WIKI_GLASS = { title: 'Glass frog — Wikipedia', url: 'https://en.wikipedia.org/wiki/Glass_frog' };
const WIKI_DART = { title: 'Poison dart frog — Wikipedia', url: 'https://en.wikipedia.org/wiki/Poison_dart_frog' };
const WIKI_PAEDOPHRYNE = { title: 'Paedophryne amauensis — Wikipedia', url: 'https://en.wikipedia.org/wiki/Paedophryne_amauensis' };
const WIKI_WALLACE = { title: "Wallace's flying frog — Wikipedia", url: 'https://en.wikipedia.org/wiki/Wallace%27s_flying_frog' };
const WIKI_TOMATO = { title: 'Tomato frog — Wikipedia', url: 'https://en.wikipedia.org/wiki/Tomato_frog' };
const WIKI_PARADOXICAL = { title: 'Pseudis paradoxa — Wikipedia', url: 'https://en.wikipedia.org/wiki/Pseudis_paradoxa' };
const WIKI_WATER_HOLDING = { title: 'Water-holding frog — Wikipedia', url: 'https://en.wikipedia.org/wiki/Water-holding_frog' };
const WIKI_PEEPER = { title: 'Spring peeper — Wikipedia', url: 'https://en.wikipedia.org/wiki/Spring_peeper' };
const WIKI_GREEN_TREE = { title: 'Australian green tree frog — Wikipedia', url: 'https://en.wikipedia.org/wiki/Australian_green_tree_frog' };
const WIKI_AFRICAN_BULLFROG = { title: 'African bullfrog — Wikipedia', url: 'https://en.wikipedia.org/wiki/African_bullfrog' };
const WIKI_COQUI = { title: 'Common coquí — Wikipedia', url: 'https://en.wikipedia.org/wiki/Common_coqu%C3%AD' };
const WIKI_CULTURE = { title: 'Frogs in culture — Wikipedia', url: 'https://en.wikipedia.org/wiki/Frogs_in_culture' };
const WIKI_SURINAM = { title: 'Common Surinam toad — Wikipedia', url: 'https://en.wikipedia.org/wiki/Common_Surinam_toad' };
const WIKI_DESERT_RAIN = { title: 'Desert rain frog — Wikipedia', url: 'https://en.wikipedia.org/wiki/Desert_rain_frog' };
const WIKI_TURTLE = { title: 'Myobatrachus (the turtle frog) — Wikipedia', url: 'https://en.wikipedia.org/wiki/Myobatrachus' };
const WIKI_LEOPARD = { title: 'Northern leopard frog — Wikipedia', url: 'https://en.wikipedia.org/wiki/Northern_leopard_frog' };
const WIKI_COMMON_FROG = { title: 'Common frog — Wikipedia', url: 'https://en.wikipedia.org/wiki/Common_frog' };
const WIKI_BUDGETT = { title: "Budgett's frog — Wikipedia", url: 'https://en.wikipedia.org/wiki/Budgett%27s_frog' };
const BURKE = { title: 'All About Frogs | Burke Museum', url: 'https://www.burkemuseum.org/collections-and-research/biology/herpetology/all-about-amphibians/all-about-frogs' };
const SD_ZOO = { title: 'Frog and Toad | San Diego Zoo Animals & Plants', url: 'https://animals.sandiegozoo.org/animals/frog-and-toad' };
const NGK_RED_EYED = { title: 'Red-Eyed Tree Frog | National Geographic Kids', url: 'https://kids.nationalgeographic.com/animals/amphibians/facts/red-eyed-tree-frog' };
const NGK_DART = { title: 'Poison Dart Frog | National Geographic Kids', url: 'https://kids.nationalgeographic.com/animals/amphibians/facts/poison-dart-frog' };
const NGK_BULLFROG = { title: 'American Bullfrog | National Geographic Kids', url: 'https://kids.nationalgeographic.com/animals/amphibians/facts/american-bullfrog' };
const NATGEO_DYEING = { title: 'Dyeing poison frog, facts and photos | National Geographic', url: 'https://www.nationalgeographic.com/animals/amphibians/facts/dyeing-poison-frog' };
const SI_GOLDEN = { title: "Panamanian golden frog | Smithsonian's National Zoo and Conservation Biology Institute", url: 'https://nationalzoo.si.edu/animals/panamanian-golden-frog' };
const NWF_WOOD = { title: 'Wood Frog | National Wildlife Federation', url: 'https://www.nwf.org/Educational-Resources/Wildlife-Guide/Amphibians/Wood-Frog' };

export const FROG_FACTS: readonly Fact[] = [
  // What a frog is: names, numbers, where they live.
  { id: 'fr-001', text: 'All toads are frogs: the difference between a frog and a toad is informal, not scientific.', source: WIKI_FROG },
  { id: 'fr-002', text: 'The scientific name for frogs, Anura, comes from the Ancient Greek for without a tail.', source: WIKI_FROG },
  { id: 'fr-003', text: 'Frogs make up around 88 percent of all the kinds of amphibian alive today.', source: WIKI_FROG },
  { id: 'fr-004', text: 'The oldest known frog-like fossil comes from Madagascar and is about 250 million years old.', source: WIKI_FROG },
  { id: 'fr-005', text: 'The word frog may come from a very old word meaning jump.', source: WIKI_FROG },
  { id: 'fr-006', text: 'Frogs live on every continent except Antarctica.', source: WIKI_FROG },
  { id: 'fr-007', text: 'A toad is also known as a hoptoad.', source: WIKI_TOAD },
  { id: 'fr-008', text: 'A horny toad is not a toad or a frog at all: it is a reptile.', source: BURKE },
  { id: 'fr-009', text: 'Toads usually have shorter back legs and rounder, stouter bodies than most frogs.', source: BURKE },
  { id: 'fr-010', text: 'You cannot get warts from holding a toad.', source: SD_ZOO },
  { id: 'fr-011', text: 'Most frogs weigh less than 200 grams.', source: SD_ZOO },

  // The body: legs, toes, skin.
  { id: 'fr-012', text: 'Frogs have no tail, except when they are tadpoles.', source: WIKI_FROG },
  { id: 'fr-013', text: 'An adult frog has four fingers on each hand and five toes on each foot.', source: WIKI_FROG },
  { id: 'fr-014', text: "A frog's main leg muscles make up more than 17 percent of its whole body weight.", source: WIKI_FROG },
  { id: 'fr-015', text: 'Frogs that spend more time in the water generally have more webbing between their toes.', source: WIKI_FROG },
  { id: 'fr-016', text: 'A tree frog toe pad is not a suction cup: it grips with tiny flat-topped cells and a film of mucus.', source: WIKI_FROG },
  { id: 'fr-017', text: 'Tree frog toe pads can grip any wet or dry surface, including glass.', source: WIKI_FROG },
  { id: 'fr-018', text: 'A frog sheds its skin every few weeks, and then eats it.', source: WIKI_FROG },
  { id: 'fr-019', text: 'Frogs eat their shed skin so that the protein in it does not go to waste.', source: BURKE },
  { id: 'fr-020', text: 'Many frogs can take in water and oxygen straight through their skin.', source: WIKI_FROG },
  { id: 'fr-021', text: 'Frogs do not drink with their mouths: they soak up water through a drinking patch on the belly.', source: BURKE },
  { id: 'fr-022', text: 'Glands all over a frog make mucus, which helps to keep its skin moist.', source: WIKI_FROG },
  { id: 'fr-023', text: 'Frog slime keeps the skin moist, and moist skin is what lets a frog breathe through it.', source: BURKE },
  { id: 'fr-024', text: 'Frogs have no fur, feathers or scales, just moist skin that they can breathe through.', source: SD_ZOO },
  { id: 'fr-025', text: 'A frog is cold-blooded, so to warm up it moves into the sun or onto a warm surface.', source: WIKI_FROG },
  { id: 'fr-026', text: 'Some frogs rest in big groups, pressed against their neighbours, so that they lose less water.', source: WIKI_FROG },
  { id: 'fr-027', text: 'Some South American tree frogs coat their skin with a waxy layer to keep from drying out.', source: WIKI_FROG },
  { id: 'fr-028', text: 'Waxy tree frogs do not hop: they walk like a chameleon, gripping branches as they go.', source: SD_ZOO },
  { id: 'fr-029', text: 'Certain frogs change colour between night and day.', source: WIKI_FROG },
  { id: 'fr-030', text: 'Most frogs cannot change colour completely: they turn a lighter or darker shade of their own colour.', source: BURKE },
  { id: 'fr-031', text: 'Frogs have a heart with three chambers.', source: WIKI_FROG },
  { id: 'fr-032', text: 'The Bornean flat-headed frog is the first frog known to have no lungs at all.', source: WIKI_FROG },
  { id: 'fr-033', text: 'The Titicaca water frog has wrinkly skin, which helps it take in more oxygen from the water.', source: WIKI_FROG },
  { id: 'fr-034', text: 'A frog cannot turn its head the way you can, because it has almost no neck.', source: SD_ZOO },

  // The tongue and the hunt.
  { id: 'fr-035', text: "A frog's tongue is attached at the front of its mouth and free at the back.", source: WIKI_FROG },
  { id: 'fr-036', text: 'A frog can shoot its tongue out and pull it back in at great speed.', source: WIKI_FROG },
  { id: 'fr-037', text: 'Frog spit turns runny when the tongue hits a bug, then thick and stretchy again to grip it.', source: WIKI_FROG },
  { id: 'fr-038', text: 'A frog shuts its eyes as its tongue shoots out, so it has to line up its shot first.', source: WIKI_FROG },
  { id: 'fr-039', text: 'A frog swallows its food whole.', source: WIKI_FROG },
  { id: 'fr-040', text: "A frog's eyes can sink down into its head to help push food down its throat.", source: WIKI_FROG },
  { id: 'fr-041', text: 'Frogs have weak little teeth along the upper jaw, used to hold food, not to chew it.', source: WIKI_FROG },
  { id: 'fr-042', text: 'Some frogs have no tongue and simply stuff food into their mouths with their hands.', source: WIKI_FROG },
  { id: 'fr-043', text: 'Bullfrogs hunt at night, waiting patiently until something that looks like a good meal passes by.', source: NGK_BULLFROG },
  { id: 'fr-044', text: "Budgett's frog hunts at night, sitting in water up to its nostrils and waiting for prey to pass.", source: WIKI_BUDGETT },
  { id: 'fr-045', text: 'A tree frog can catch an insect while hanging from a twig by one toe.', source: WIKI_FROG },
  { id: 'fr-046', text: 'Frogs and toads help keep a large part of the insect population of the world under control.', source: SD_ZOO },
  { id: 'fr-047', text: "At the Smithsonian's National Zoo, Panamanian golden frogs are fed fruit flies, beetles and crickets.", source: SI_GOLDEN },

  // Eyes and ears.
  { id: 'fr-048', text: 'With eyes that bulge out from its head, a frog can see almost all the way around itself.', source: WIKI_FROG },
  { id: 'fr-049', text: 'A frog sees faraway things better than things that are close up.', source: WIKI_FROG },
  { id: 'fr-050', text: 'Frogs can see in colour, even in very low light.', source: WIKI_FROG },
  { id: 'fr-051', text: 'Frog pupils come in many shapes: upright slits, sideways slits, circles and even triangles.', source: WIKI_FROG },
  { id: 'fr-052', text: 'Frogs have a third eyelid that lets them keep their eyes open under water.', source: BURKE },
  { id: 'fr-053', text: 'Nobody really knows whether frogs sleep: they close their eyes, but no brain scan has settled it.', source: BURKE },
  { id: 'fr-054', text: 'Frogs can hear both in the air and under water.', source: WIKI_FROG },
  { id: 'fr-055', text: 'Frogs have no outer ears: the round patch just behind each eye is an eardrum.', source: WIKI_FROG },
  { id: 'fr-056', text: "A frog's eardrums are connected to its lungs, which lets it call loudly without hurting its own ears.", source: BURKE },
  { id: 'fr-057', text: 'A male bullfrog has eardrums bigger than his eyes.', source: WIKI_FROG },
  { id: 'fr-058', text: 'In some dry places, the sound of thunder or heavy rain can wake frogs from a long dormant rest.', source: WIKI_FROG },

  // Croaking.
  { id: 'fr-059', text: 'Every kind of frog has a call of its own.', source: WIKI_FROG },
  { id: 'fr-060', text: 'Some frog calls are so loud that they can be heard up to a mile away.', source: WIKI_FROG },
  { id: 'fr-061', text: 'Frogs make their mating, rain and territory calls with their mouths closed.', source: WIKI_FROG },
  { id: 'fr-062', text: 'Tree frogs have a rain call, which they make when the damp air tells them a shower is coming.', source: WIKI_FROG },
  { id: 'fr-063', text: 'Some frogs have been found calling from inside drain pipes, which makes their calls louder.', source: WIKI_FROG },
  { id: 'fr-064', text: 'Calling frogs quickly go quiet when they see an intruder, or even a moving shadow.', source: WIKI_FROG },
  { id: 'fr-065', text: 'Female frogs choose a mate at least partly by how deep his voice is.', source: WIKI_FROG },
  { id: 'fr-066', text: 'If you see a frog calling, it is probably a male.', source: BURKE },
  { id: 'fr-067', text: 'The ribbit so often heard in films is the call of the Pacific tree frog.', source: WIKI_FROG },
  { id: 'fr-068', text: "The croak of the American bullfrog is sometimes written down as jug o' rum.", source: WIKI_FROG },
  { id: 'fr-069', text: "Some people think a bullfrog's call sounds like a cow mooing, which is where the bull in its name is from.", source: NGK_BULLFROG },
  { id: 'fr-070', text: 'The coastal tailed frog of North America lives in mountain streams and makes no call at all.', source: WIKI_FROG },
  { id: 'fr-071', text: 'The concave-eared torrent frog makes calls that reach into ultrasound.', source: WIKI_FROG },
  { id: 'fr-072', text: 'A goliath frog has no vocal sac, so it makes no mating call.', source: WIKI_GOLIATH },
  { id: 'fr-073', text: 'The coquí of Puerto Rico is named for the two-part call the males make at night: co, then quí.', source: WIKI_COQUI },
  { id: 'fr-074', text: 'The call of a common coquí can be as loud as 73 decibels.', source: WIKI_COQUI },
  { id: 'fr-075', text: 'The spring peeper is named for its chirping call, which marks the beginning of spring.', source: WIKI_PEEPER },
  { id: 'fr-076', text: 'A male northern leopard frog makes a short call that sounds like a snore.', source: WIKI_LEOPARD },
  { id: 'fr-077', text: 'In the breeding season, male wood frogs make quack-like calls day and night.', source: NWF_WOOD },
  { id: 'fr-078', text: 'Before a rainstorm, spadefoot toads come out by the hundreds to croak.', source: SD_ZOO },
  { id: 'fr-079', text: 'Male Panamanian golden frogs wave their arms at females instead of calling, and a female may wave back.', source: SI_GOLDEN },

  // Jumping, running, digging, gliding.
  { id: 'fr-080', text: 'For their size, frogs are the best jumpers of all the animals with backbones.', source: WIKI_FROG },
  { id: 'fr-081', text: 'The striped rocket frog can leap over two metres, more than fifty times its own body length.', source: WIKI_FROG },
  { id: 'fr-082', text: 'When a frog jumps, a tendon wrapped around its ankle bone lets go of its energy like a catapult.', source: WIKI_FROG },
  { id: 'fr-083', text: 'Generally, the longer the back legs of a frog are, the farther it can hop.', source: SD_ZOO },
  { id: 'fr-084', text: 'The tiny northern cricket frog can skitter across the top of a pond in a series of quick jumps.', source: WIKI_FROG },
  { id: 'fr-085', text: 'The Indian skipper frog can run across the surface of the water for several metres.', source: WIKI_FROG },
  { id: 'fr-086', text: 'The red-legged running frog does not jump: it runs, using its two back legs one after the other.', source: WIKI_FROG },
  { id: 'fr-087', text: 'The plains spadefoot toad digs itself backwards into the ground, using a spade on each back foot.', source: WIKI_FROG },
  { id: 'fr-088', text: 'In winter, a plains spadefoot toad has been found 4.5 metres under the ground.', source: WIKI_FROG },
  { id: 'fr-089', text: 'Unlike most frogs, the turtle frog digs forwards, like a turtle.', source: WIKI_TURTLE },
  { id: 'fr-090', text: 'The turtle frog gets its name from looking like a turtle with no shell.', source: WIKI_TURTLE },
  { id: 'fr-091', text: 'The purple frog of southern India spends almost its whole life underground.', source: WIKI_FROG },
  { id: 'fr-092', text: 'The desert rain frog cannot hop or leap, so it walks around on the sand.', source: WIKI_DESERT_RAIN },
  { id: 'fr-093', text: 'Sand sticks to the whole body of a desert rain frog, except for its mouth and nose.', source: WIKI_DESERT_RAIN },
  { id: 'fr-094', text: "Wallace's flying frog can glide up to 15 metres from one tree to another.", source: WIKI_FROG },
  { id: 'fr-095', text: "Wallace's flying frog has toes webbed right to the tips, and spreads all four feet to glide.", source: WIKI_WALLACE },
  { id: 'fr-096', text: "Wallace's flying frog has oversized toe pads that help it land softly and stick to tree trunks.", source: WIKI_WALLACE },
  { id: 'fr-097', text: "Wallace's flying frog is named for the biologist Alfred Wallace, who collected the first one known.", source: WIKI_WALLACE },
  { id: 'fr-098', text: 'In the United Kingdom, common toads often climb trees to hide in hollows or in nest boxes.', source: WIKI_TOAD },

  // Eggs, tadpoles and growing up.
  { id: 'fr-099', text: 'Many frogs go back to breed in the same water where they grew up as tadpoles.', source: WIKI_FROG },
  { id: 'fr-100', text: 'American toads go back to breed in the very pond where they were born.', source: WIKI_TOAD },
  { id: 'fr-101', text: 'Around half of all kinds of frog lay their eggs in water, and the rest lay them somewhere else.', source: WIKI_FROG },
  { id: 'fr-102', text: 'Frog eggs have no shell, so they need to stay moist until they hatch.', source: BURKE },
  { id: 'fr-103', text: 'Frog eggs laid in water normally hatch within one week.', source: WIKI_FROG },
  { id: 'fr-104', text: 'Common frogs lay their eggs in clumps, while common toads lay theirs in long strings.', source: WIKI_COMMON_FROG },
  { id: 'fr-105', text: 'Depending on the kind of frog, a mother may lay as few as 2 eggs or more than 50,000.', source: SD_ZOO },
  { id: 'fr-106', text: 'Young frogs still inside their eggs can feel the vibrations of a nearby hunter, and hatch early to escape.', source: WIKI_FROG },
  { id: 'fr-107', text: 'The word tadpole comes from Middle English words for toad and head.', source: WIKI_TADPOLE },
  { id: 'fr-108', text: 'The word polliwog comes from Middle English words for head and wiggle.', source: WIKI_TADPOLE },
  { id: 'fr-109', text: 'Tadpoles have no eyelids and no legs, and they breathe with gills.', source: WIKI_FROG },
  { id: 'fr-110', text: 'Most tadpoles are plant eaters that feed mainly on algae.', source: WIKI_FROG },
  { id: 'fr-111', text: 'The long, spiral gut of a tadpole can be seen through its belly in many kinds of frog.', source: WIKI_TADPOLE },
  { id: 'fr-112', text: 'Fossil tadpoles have been found that date back to the Middle Jurassic.', source: WIKI_TADPOLE },
  { id: 'fr-113', text: 'When a tadpole turns into a frog, its long spiral gut is replaced by a short one.', source: WIKI_FROG },
  { id: 'fr-114', text: 'The tadpole of the paradoxical frog can be 27 centimetres long, far longer than the frog it becomes.', source: WIKI_PARADOXICAL },
  { id: 'fr-115', text: 'Goliath frog eggs and tadpoles are about the same size as those of other frogs.', source: WIKI_GOLIATH },
  { id: 'fr-116', text: 'Tomato frog tadpoles hatch around 36 hours after the eggs are laid.', source: WIKI_TOMATO },
  { id: 'fr-117', text: 'Baby coquís skip the tadpole stage and hatch from their eggs as fully formed froglets.', source: WIKI_COQUI },
  { id: 'fr-118', text: 'A desert rain frog grows straight from an egg into a frog, with no tadpole stage in between.', source: WIKI_DESERT_RAIN },
  { id: 'fr-119', text: 'The red-eyed tree frog lays its eggs on a leaf above a pool, and the tadpoles drop into the water.', source: WIKI_FROG },
  { id: 'fr-120', text: 'Red-eyed tree frogs start out as little brown froglets and turn bright green as they grow up.', source: NGK_RED_EYED },
  { id: 'fr-121', text: 'Panamanian golden frog tadpoles are completely white for their first few days.', source: SI_GOLDEN },
  { id: 'fr-122', text: 'Wood frog tadpoles can pick out their own brothers and sisters, and group together with them.', source: NWF_WOOD },
  { id: 'fr-123', text: 'A European common toad kept in captivity lived to be 40 years old.', source: WIKI_FROG },
  { id: 'fr-124', text: 'An Australian green tree frog lives about 16 years in captivity, a long time for a frog.', source: WIKI_GREEN_TREE },

  // Frog parents.
  { id: 'fr-125', text: 'In many kinds of frog, it is the father that looks after the eggs.', source: SD_ZOO },
  { id: 'fr-126', text: 'A male midwife toad carries his eggs around with him, wrapped around his back legs.', source: WIKI_FROG },
  { id: 'fr-127', text: 'A strawberry poison-dart frog mother carries her tadpoles on her back, one to each tiny pool.', source: WIKI_FROG },
  { id: 'fr-128', text: 'A poison dart frog parent piggybacks its tadpoles to water, one at a time.', source: WIKI_DART },
  { id: 'fr-129', text: "Dyeing poison frog tadpoles clamber onto their father's back, and he carries them to water.", source: NATGEO_DYEING },
  { id: 'fr-130', text: 'The tungara frog builds a floating nest of foam to protect its eggs.', source: WIKI_FROG },
  { id: 'fr-131', text: 'Young pouched frogs wriggle into skin pouches on the sides of their father and grow up there.', source: WIKI_FROG },
  { id: 'fr-132', text: "A male Darwin's frog carries his tadpoles inside his vocal sac until they have become little frogs.", source: WIKI_FROG },
  { id: 'fr-133', text: 'Young Surinam toads grow in the skin on the back of their mother and pop out as fully formed frogs.', source: SD_ZOO },
  { id: 'fr-134', text: 'Coquís lay their eggs on leaves instead of in water, and the males guard them.', source: WIKI_COQUI },
  { id: 'fr-135', text: 'Goliath frogs build semi-circular nests for their eggs, in or beside a river.', source: WIKI_GOLIATH },

  // Staying safe: colour, camouflage and bluff.
  { id: 'fr-136', text: 'Poisonous frogs tend to advertise it with bright colours, as a warning to leave them alone.', source: WIKI_FROG },
  { id: 'fr-137', text: 'Poison dart frogs come in yellows, oranges, reds, greens and blues.', source: NGK_DART },
  { id: 'fr-138', text: 'Scientists think that poison dart frogs get their poison from some of the insects they eat.', source: NGK_DART },
  { id: 'fr-139', text: 'Poison frogs raised in captivity, away from the insects of their home forest, never develop poison.', source: NATGEO_DYEING },
  { id: 'fr-140', text: 'Most frogs are active at night, but poison frogs are busy in the daytime.', source: NATGEO_DYEING },
  { id: 'fr-141', text: 'Most poison dart frogs are tiny, some less than 1.5 centimetres long when fully grown.', source: WIKI_DART },
  { id: 'fr-142', text: 'A fire-bellied toad wears its warning colours underneath, and flashes its belly when it is attacked.', source: WIKI_FROG },
  { id: 'fr-143', text: 'A toad can puff itself up so that it looks too big to swallow.', source: SD_ZOO },
  { id: 'fr-144', text: 'When it is threatened, a tomato frog puffs up its body.', source: WIKI_TOMATO },
  { id: 'fr-145', text: 'Tomato frogs live only in Madagascar, and the name comes from the bright red colour of one kind.', source: WIKI_TOMATO },
  { id: 'fr-146', text: 'A sleeping red-eyed tree frog that is disturbed pops its bright red eyes open to startle the hunter.', source: NGK_RED_EYED },
  { id: 'fr-147', text: 'A group of red-eyed tree frogs is called an army.', source: NGK_RED_EYED },
  { id: 'fr-148', text: 'Some glass frogs have see-through skin on the belly, so the heart and liver can be seen from below.', source: WIKI_GLASS },
  { id: 'fr-149', text: 'When a glass frog sleeps, it tucks most of its blood away in its liver, which makes it harder to see.', source: WIKI_GLASS },
  { id: 'fr-150', text: 'Glass frogs are in the habit of sleeping on green leaves.', source: WIKI_GLASS },
  { id: 'fr-151', text: 'The common frog can lighten and darken its skin to match its surroundings.', source: WIKI_COMMON_FROG },
  { id: 'fr-152', text: 'Common frogs have see-through inner eyelids that protect their eyes under water.', source: WIKI_COMMON_FROG },
  { id: 'fr-153', text: 'A wood frog has a black marking across its eyes that is said to look like a mask.', source: NWF_WOOD },
  { id: 'fr-154', text: 'The Surinam toad is almost entirely flat, and looks like a mottled brown leaf.', source: WIKI_SURINAM },
  { id: 'fr-155', text: 'The Surinam toad has no tongue, so it catches its food by sucking it in.', source: WIKI_SURINAM },
  { id: 'fr-156', text: 'To hide, the paradoxical frog stirs up the muddy bottom with its strong toes.', source: WIKI_PARADOXICAL },
  { id: 'fr-157', text: 'A northern leopard frog has large, dark, round spots, each one normally ringed with a lighter border.', source: WIKI_LEOPARD },

  // Cold, heat and drought.
  { id: 'fr-158', text: 'In colder places, many kinds of frog hibernate through the winter.', source: WIKI_FROG },
  { id: 'fr-159', text: 'Frogs that hibernate in the mud under water go on breathing through their skin.', source: BURKE },
  { id: 'fr-160', text: 'When it turns cold, bullfrogs dig down into the mud to hibernate.', source: NGK_BULLFROG },
  { id: 'fr-161', text: 'Wood frogs are the only frogs that live north of the Arctic Circle.', source: NWF_WOOD },
  { id: 'fr-162', text: 'A wood frog freezes over the winter and stops breathing, then thaws when the weather warms up.', source: NWF_WOOD },
  { id: 'fr-163', text: 'The striped burrowing frog of Australia stays dormant underground for nine or ten months of the year.', source: WIKI_FROG },
  { id: 'fr-164', text: 'The water-holding frog can soak up half its body weight in water and store it for later.', source: WIKI_WATER_HOLDING },
  { id: 'fr-165', text: 'A water-holding frog can stay underground for up to five years without a fresh drink of water.', source: WIKI_WATER_HOLDING },
  { id: 'fr-166', text: 'In dry weather an African bullfrog rests inside a cocoon, and crawls out when the rain softens it.', source: WIKI_AFRICAN_BULLFROG },

  // Record holders and one-offs.
  { id: 'fr-167', text: 'The goliath frog is the largest living frog, and can weigh up to 4.5 kilograms.', source: WIKI_GOLIATH },
  { id: 'fr-168', text: 'With its legs stretched out, the very largest goliath frog can be more than 80 centimetres long.', source: WIKI_GOLIATH },
  { id: 'fr-169', text: 'A frog from Papua New Guinea called Paedophryne amauensis is only 7.7 millimetres long.', source: WIKI_PAEDOPHRYNE },
  { id: 'fr-170', text: 'The tiny frog Paedophryne amauensis can jump thirty times its own body length.', source: WIKI_PAEDOPHRYNE },
  { id: 'fr-171', text: 'The tiny frog Paedophryne amauensis hatches as a hopper, a miniature of the adult, with no tadpole stage.', source: WIKI_PAEDOPHRYNE },
  { id: 'fr-172', text: 'A male African bullfrog can weigh up to 1.4 kilograms, and the females are half his size.', source: WIKI_AFRICAN_BULLFROG },
  { id: 'fr-173', text: 'A spring peeper weighs only 3 to 5 grams.', source: WIKI_PEEPER },
  { id: 'fr-174', text: 'A spring peeper has a dark cross on its back, and its Latin name means cross-bearer.', source: WIKI_PEEPER },
  { id: 'fr-175', text: 'The Australian green tree frog was first called the blue frog, even though it is green.', source: WIKI_GREEN_TREE },
  { id: 'fr-176', text: 'Australian green tree frogs often sit on window sills, eating the insects drawn by the light.', source: WIKI_GREEN_TREE },
  { id: 'fr-177', text: 'The northern leopard frog is the state amphibian of both Minnesota and Vermont.', source: WIKI_LEOPARD },
  { id: 'fr-178', text: 'Scientists have followed frogs by fitting them with radio transmitters in frog-sized backpacks.', source: SD_ZOO },

  // Frogs in stories.
  { id: 'fr-179', text: 'In traditional Chinese myths, the world rests on a giant frog.', source: WIKI_FROG },
  { id: 'fr-180', text: 'The ancient Egyptians drew Heqet, a protector of newborns, with the head of a frog.', source: WIKI_FROG },
  { id: 'fr-181', text: 'In the Ancient Greek comedy The Frogs, the call of the marsh frog is written brekekekex koax koax.', source: WIKI_FROG },
  { id: 'fr-182', text: 'The Japanese poet Matsuo Bashō wrote one of his most famous haiku about a frog jumping into an old pond.', source: WIKI_CULTURE },
  { id: 'fr-183', text: 'The Frog Prince is a Brothers Grimm fairy tale in which a frog turns into a handsome prince.', source: WIKI_FROG },
  { id: 'fr-184', text: 'Kermit the Frog appears in both Sesame Street and The Muppet Show.', source: WIKI_CULTURE },
];
