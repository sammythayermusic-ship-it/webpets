// True things the chicken knows, each with the page that says so. Researched 2026-11-17; every fact
// was checked against the text of its source page. Nothing here is about the table: the facts are
// about hens, chicks, roosters, eggs as laid, their senses and wits, and the wild red junglefowl.
import type { Fact } from '../../../brain/types';

const WIKI_CHICKEN = { title: 'Chicken — Wikipedia', url: 'https://en.wikipedia.org/wiki/Chicken' };
const WIKI_JUNGLEFOWL = { title: 'Red junglefowl — Wikipedia', url: 'https://en.wikipedia.org/wiki/Red_junglefowl' };
const WIKI_SILKIE = { title: 'Silkie (chicken breed) — Wikipedia', url: 'https://en.wikipedia.org/wiki/Silkie_(chicken_breed)' };
const WIKI_ARAUCANA = { title: 'Araucana — Wikipedia', url: 'https://en.wikipedia.org/wiki/Araucana' };
const WIKI_ONAGADORI = { title: 'Onagadori — Wikipedia', url: 'https://en.wikipedia.org/wiki/Onagadori' };
const WIKI_SERAMA = { title: 'Serama — Wikipedia', url: 'https://en.wikipedia.org/wiki/Serama' };
const WIKI_BRAHMA = { title: 'Brahma chicken — Wikipedia', url: 'https://en.wikipedia.org/wiki/Brahma_chicken' };
const WIKI_POLISH = { title: 'Polish chicken — Wikipedia', url: 'https://en.wikipedia.org/wiki/Polish_chicken' };
const WIKI_MARANS = { title: 'Marans — Wikipedia', url: 'https://en.wikipedia.org/wiki/Marans' };
const WIKI_CEMANI = { title: 'Ayam Cemani — Wikipedia', url: 'https://en.wikipedia.org/wiki/Ayam_Cemani' };
const WIKI_BANTAM = { title: 'Bantam (poultry) — Wikipedia', url: 'https://en.wikipedia.org/wiki/Bantam_(poultry)' };
const WIKI_EGG_TOOTH = { title: 'Egg tooth — Wikipedia', url: 'https://en.wikipedia.org/wiki/Egg_tooth' };
const WIKI_DUST = { title: 'Dust bathing — Wikipedia', url: 'https://en.wikipedia.org/wiki/Dust_bathing' };
const WIKI_ROAD = { title: 'Why did the chicken cross the road? — Wikipedia', url: 'https://en.wikipedia.org/wiki/Why_did_the_chicken_cross_the_road%3F' };
const RSPCA_FACTS = { title: 'Chickens in the UK: facts, behaviour and welfare - RSPCA', url: 'https://www.rspca.org.uk/adviceandwelfare/farm/farmanimals/chickens' };
const RSPCA_PETS = { title: 'Keeping chickens as pets: how to care for backyard hens - RSPCA', url: 'https://www.rspca.org.uk/adviceandwelfare/pets/chickens' };
const RSPCA_NEXTGEN = { title: 'How to look after chickens - RSPCA NextGen', url: 'https://nextgen.rspca.org.uk/animal-care/how-to-look-after-chickens' };
const RSPCA_HENS = { title: 'Laying hens: egg farming and hen welfare - RSPCA', url: 'https://www.rspca.org.uk/adviceandwelfare/farm/layinghens' };
const BHWT_BEHAVIOUR = { title: 'Understanding Hen Behaviour | British Hen Welfare Trust', url: 'https://www.bhwt.org.uk/blog/health-welfare/understanding-hen-behaviour/' };
const EXT_BEHAVIOUR = { title: 'Normal Behaviors of Chickens in Small and Backyard Poultry Flocks – Poultry Extension', url: 'https://poultry.extension.org/articles/poultry-behavior/normal-behaviors-of-chickens-in-small-and-backyard-poultry-flocks/' };
const EXT_EXTERNAL = { title: 'External Anatomy of Chickens – Poultry Extension', url: 'https://poultry.extension.org/articles/poultry-anatomy/external-anatomy-of-chickens/' };
const EXT_SKELETAL = { title: 'Avian Skeletal System – Poultry Extension', url: 'https://poultry.extension.org/articles/poultry-anatomy/avian-skeletal-system/' };
const EXT_DIGESTIVE = { title: 'Avian Digestive System – Poultry Extension', url: 'https://poultry.extension.org/articles/poultry-anatomy/avian-digestive-system/' };
const EXT_RESPIRATORY = { title: 'Avian Respiratory System – Poultry Extension', url: 'https://poultry.extension.org/articles/poultry-anatomy/avian-respiratory-system/' };
const SCIAM = { title: 'The Startling Intelligence of the Common Chicken | Scientific American', url: 'https://www.scientificamerican.com/article/the-startling-intelligence-of-the-common-chicken1/' };
const NATGEO = { title: 'Chickens Prefer Attractive People | National Geographic', url: 'https://www.nationalgeographic.com/animals/article/animals-chickens-evolution-eggs-food' };
const GWR_OLDEST = { title: 'Oldest chicken ever | Guinness World Records', url: 'https://www.guinnessworldrecords.com/world-records/739669-oldest-chicken-ever' };
const GWR_PEANUT = { title: "20-year-old hen from USA verified as world's oldest chicken | Guinness World Records", url: 'https://www.guinnessworldrecords.com/news/2023/3/20-year-old-hen-from-usa-verified-as-worlds-oldest-chicken-739634' };
const GWR_FLIGHT = { title: 'Longest poultry flight | Guinness World Records', url: 'https://www.guinnessworldrecords.com/world-records/70785-longest-poultry-flight' };
const GWR_EGGS = { title: 'Most prolific chicken | Guinness World Records', url: 'https://www.guinnessworldrecords.com/world-records/70781-most-prolific-chicken' };

export const CHICKEN_FACTS: readonly Fact[] = [
  // Who chickens are: names, numbers, and how long they have lived alongside people.
  { id: 'ck-001', text: 'The chicken is the tame form of the red junglefowl, a wild bird from Southeast Asia.', source: WIKI_CHICKEN },
  { id: 'ck-002', text: 'People first tamed chickens around 8,000 years ago.', source: WIKI_CHICKEN },
  { id: 'ck-003', text: 'There are more than 26 billion chickens in the world.', source: WIKI_CHICKEN },
  { id: 'ck-004', text: 'The word chicken is Old English, and may have begun as a copy of the sound a chicken makes.', source: WIKI_CHICKEN },
  { id: 'ck-005', text: 'In Australia and New Zealand, a chicken is often called a chook.', source: WIKI_CHICKEN },
  { id: 'ck-006', text: 'A young hen less than a year old is called a pullet.', source: WIKI_CHICKEN },
  { id: 'ck-007', text: 'A young male chicken is called a cockerel.', source: WIKI_CHICKEN },
  { id: 'ck-008', text: 'Long ago, the word chicken meant just the chick.', source: WIKI_CHICKEN },
  { id: 'ck-009', text: 'Ancient seafarers carried chickens, dogs and pigs with them across the islands of the Pacific.', source: WIKI_CHICKEN },
  { id: 'ck-010', text: 'The first pictures of chickens in Europe are on pottery made in Corinth in the 7th century BC.', source: WIKI_CHICKEN },
  { id: 'ck-011', text: 'The nursery rhyme Cock a Doodle Doo was printed in a Mother Goose book in 1765.', source: WIKI_CHICKEN },
  { id: 'ck-012', text: 'The chicken was the first bird to have its whole genome read by scientists.', source: WIKI_CHICKEN },
  { id: 'ck-013', text: 'Chickens have about as many protein-making genes as people do.', source: WIKI_CHICKEN },
  { id: 'ck-014', text: 'The gene that gives chickens yellow skin came from the grey junglefowl.', source: WIKI_CHICKEN },
  { id: 'ck-015', text: "Ground-dwelling fowl of the chicken's kind lived through the event that ended the dinosaurs.", source: WIKI_CHICKEN },
  { id: 'ck-016', text: 'In 2006, scientists switched on a sleeping gene in chicken embryos and they began to form teeth.', source: WIKI_CHICKEN },
  { id: 'ck-017', text: 'Scientists have long studied chicken eggs to learn how animals grow before they hatch.', source: WIKI_CHICKEN },
  { id: 'ck-018', text: 'Pet chickens will eat from your hand, hop onto your lap and follow you around.', source: WIKI_CHICKEN },
  { id: 'ck-019', text: 'The joke about the chicken crossing the road was printed in a New York magazine in 1847.', source: WIKI_ROAD },
  { id: 'ck-020', text: 'The Light Sussex is believed to be the first chicken bred in Britain, back in Roman times.', source: RSPCA_FACTS },
  { id: 'ck-021', text: 'Chickens are descended from dinosaurs, and are the closest living animal to Tyrannosaurus rex.', source: RSPCA_FACTS },

  // The body: comb, wattles, toes, bones, breathing, and a stomach that does the chewing.
  { id: 'ck-022', text: 'Grown chickens have a fleshy crest on their heads called a comb.', source: WIKI_CHICKEN },
  { id: 'ck-023', text: "The flaps of skin that hang under a chicken's beak are called wattles.", source: WIKI_CHICKEN },
  { id: 'ck-024', text: 'Some chicken breeds grow extra feathers under the face that look just like a beard.', source: WIKI_CHICKEN },
  { id: 'ck-025', text: 'Wild junglefowl can fly, but chickens are too heavy to fly more than a short distance.', source: WIKI_CHICKEN },
  { id: 'ck-026', text: 'Chickens can fly, but only in short, low bursts.', source: RSPCA_FACTS },
  { id: 'ck-027', text: "A chicken's comb and wattles are red, soft and warm.", source: EXT_EXTERNAL },
  { id: 'ck-028', text: 'Chickens stand and walk on their toes.', source: EXT_EXTERNAL },
  { id: 'ck-029', text: 'Most chickens have three toes pointing forward and one pointing back.', source: EXT_EXTERNAL },
  { id: 'ck-030', text: "The hock joint in a chicken's leg is the same joint as a person's ankle.", source: EXT_EXTERNAL },
  { id: 'ck-031', text: 'Some chicken breeds have feathers on their legs and toes.', source: EXT_EXTERNAL },
  { id: 'ck-032', text: "Some of a chicken's bones are hollow and are part of how it breathes.", source: EXT_SKELETAL },
  { id: 'ck-033', text: "A bird's long neck works as a shock absorber, protecting its brain when it lands.", source: EXT_SKELETAL },
  { id: 'ck-034', text: 'A chicken has nine air sacs inside its body that work like bellows when it breathes.', source: EXT_RESPIRATORY },
  { id: 'ck-035', text: "Air flows through a bird's lungs in one direction only.", source: EXT_RESPIRATORY },
  { id: 'ck-036', text: 'A chick should be held gently, because a bird breathes by moving its ribs.', source: EXT_RESPIRATORY },
  { id: 'ck-037', text: 'Chickens have no teeth, so they swallow grit to help grind up their food.', source: RSPCA_PETS },
  { id: 'ck-038', text: 'A chicken stores swallowed food in a pouch in its neck called the crop.', source: EXT_DIGESTIVE },
  { id: 'ck-039', text: "When a chicken's crop is nearly empty, it sends a hunger signal to the brain.", source: EXT_DIGESTIVE },
  { id: 'ck-040', text: 'The crop lets a bird eat a lot quickly, then go somewhere safe to digest it.', source: EXT_DIGESTIVE },
  { id: 'ck-041', text: "A chicken's gizzard has strong muscles that grind up food, doing the job of teeth.", source: EXT_DIGESTIVE },
  { id: 'ck-042', text: 'A chicken uses its tongue to push food to the back of its mouth to swallow.', source: EXT_DIGESTIVE },
  { id: 'ck-043', text: 'A chicken lifts its head after each sip so that the water can run down its throat.', source: EXT_BEHAVIOUR },
  { id: 'ck-044', text: 'Chickens cannot sweat, so they cool off by dipping their beaks in cold water or flapping.', source: EXT_BEHAVIOUR },
  { id: 'ck-045', text: 'Chickens cope with cold weather better than hot weather.', source: EXT_BEHAVIOUR },
  { id: 'ck-046', text: "A chicken's claws grip so firmly that it will not fall off its perch, even when asleep.", source: EXT_BEHAVIOUR },
  { id: 'ck-047', text: 'A chicken has an oil gland at the base of its tail, and spreads the oil over its feathers.', source: BHWT_BEHAVIOUR },
  { id: 'ck-048', text: "A chicken's brain is about the size of a walnut.", source: SCIAM },

  // The senses.
  { id: 'ck-049', text: 'Chickens can see ultraviolet light, so they see more colours than people do.', source: RSPCA_FACTS },
  { id: 'ck-050', text: 'A chicken can see about 310 degrees around itself.', source: RSPCA_FACTS },
  { id: 'ck-051', text: "A chicken's right eye is better at seeing close up, and its left eye at seeing far away.", source: RSPCA_FACTS },
  { id: 'ck-052', text: "A chicken's ears are hidden under soft feathers on the sides of its head.", source: RSPCA_FACTS },
  { id: 'ck-053', text: 'Chickens can hear sounds from low rumbles like thunder up to very high notes.', source: RSPCA_FACTS },
  { id: 'ck-054', text: "A chicken's beak is packed full of nerves and is used for touching things as well as eating.", source: RSPCA_FACTS },
  { id: 'ck-055', text: 'On a cold day a chicken may lift one leg at a time to warm its foot in its feathers.', source: RSPCA_FACTS },

  // Clever birds: memory, numbers, faces and calls.
  { id: 'ck-056', text: 'Chickens are smart, curious birds, and they can dream.', source: RSPCA_FACTS },
  { id: 'ck-057', text: 'Chickens can remember people they have seen before and recognise up to 100 faces.', source: RSPCA_FACTS },
  { id: 'ck-058', text: 'Chickens can do simple sums and solve puzzles.', source: RSPCA_FACTS },
  { id: 'ck-059', text: 'A two-day-old chick already knows that a thing still exists when it is hidden from view.', source: RSPCA_FACTS },
  { id: 'ck-060', text: 'A happy chicken may close its eyes and purr.', source: RSPCA_FACTS },
  { id: 'ck-061', text: 'Chickens enjoy playing with toys, and some even like a swing.', source: RSPCA_FACTS },
  { id: 'ck-062', text: 'Curious chickens enjoy toys, and the RSPCA suggests giving them a xylophone to play.', source: RSPCA_NEXTGEN },
  { id: 'ck-063', text: 'Chickens can recognise up to 30 other chickens.', source: NATGEO },
  { id: 'ck-064', text: 'In one study, chickens preferred the same human faces that people did.', source: NATGEO },
  { id: 'ck-065', text: 'Trained chicks can judge how far away their food is, even when the distance changes.', source: NATGEO },
  { id: 'ck-066', text: 'Scientists who sorted through chicken calls counted about 24 different sounds.', source: SCIAM },
  { id: 'ck-067', text: 'The clucking sound most people know is the call chickens make on meeting a ground predator.', source: SCIAM },
  { id: 'ck-068', text: 'A chicken that hears a warning call acts as if the danger is there, without needing to see it.', source: SCIAM },
  { id: 'ck-069', text: 'A hen in a lab, nicknamed 007, worked out how to unlatch a door and never waited again.', source: SCIAM },
  { id: 'ck-070', text: 'Mother hens get upset when they see their chicks ruffled by a harmless puff of air.', source: SCIAM },
  { id: 'ck-071', text: 'Chicks shown half a triangle can tell what the whole shape should look like.', source: SCIAM },
  { id: 'ck-072', text: 'Scientists built an animated 3-D rooster to find out what chicken displays mean.', source: SCIAM },
  { id: 'ck-073', text: "A rooster's swinging wattle helps a hen spot which rooster has found the food.", source: SCIAM },
  { id: 'ck-074', text: 'Chickens give one warning call for danger from the air and another for danger on the ground.', source: WIKI_CHICKEN },

  // The day: pecking, scratching, the pecking order, dust baths and bedtime.
  { id: 'ck-075', text: 'Chickens are omnivores that scratch at the soil to find seeds and insects.', source: WIKI_CHICKEN },
  { id: 'ck-076', text: 'Chickens live in flocks and sort themselves into a pecking order.', source: WIKI_CHICKEN },
  { id: 'ck-077', text: 'The pecking order was first described in hens by Thorleif Schjelderup-Ebbe in 1921.', source: WIKI_CHICKEN },
  { id: 'ck-078', text: 'Chickens are born with the instinct to peck, and use their beaks to explore the world.', source: BHWT_BEHAVIOUR },
  { id: 'ck-079', text: 'When a chicken scratches for food, it usually starts with its right foot.', source: BHWT_BEHAVIOUR },
  { id: 'ck-080', text: 'Hens that have never seen the sun will sunbathe and dust bathe straight away, by instinct.', source: BHWT_BEHAVIOUR },
  { id: 'ck-081', text: 'Chickens still have the instinct to perch from their wild ancestors, who roost in trees.', source: BHWT_BEHAVIOUR },
  { id: 'ck-082', text: 'Wild junglefowl spend 61 percent of their time looking for food.', source: EXT_BEHAVIOUR },
  { id: 'ck-083', text: 'Hens keep scratching for food even when their feed is given to them.', source: EXT_BEHAVIOUR },
  { id: 'ck-084', text: 'Chickens like to preen their feathers together as a group.', source: EXT_BEHAVIOUR },
  { id: 'ck-085', text: 'With no dust to bathe in, a chicken will still go through the motions of a dust bath.', source: EXT_BEHAVIOUR },
  { id: 'ck-086', text: 'Chickens head for their perches about half an hour before twilight.', source: EXT_BEHAVIOUR },
  { id: 'ck-087', text: 'On a dull, cloudy day, chickens go to their perches earlier than usual.', source: EXT_BEHAVIOUR },
  { id: 'ck-088', text: 'Chickens snuggle together during the night.', source: EXT_BEHAVIOUR },
  { id: 'ck-089', text: 'A hen takes a dust bath by squatting down, shaking her wings and rubbing her head in the dust.', source: WIKI_DUST },
  { id: 'ck-090', text: 'Hens take most of their dust baths in the middle of the day.', source: WIKI_DUST },
  { id: 'ck-091', text: 'Chickens love dust bathing in dry soil to clean their feathers.', source: RSPCA_NEXTGEN },
  { id: 'ck-092', text: 'Chickens like to perch on log piles, straw bales and tree stumps.', source: RSPCA_NEXTGEN },
  { id: 'ck-093', text: "The RSPCA calls a dust bath the hen's version of a spa day.", source: RSPCA_HENS },
  { id: 'ck-094', text: 'A dust bath helps a hen stay clean and cool.', source: RSPCA_HENS },
  { id: 'ck-095', text: 'Hens like to roost on perches at night with their flockmates, which helps them keep warm.', source: RSPCA_HENS },
  { id: 'ck-096', text: 'A hen who cannot get to something she needs may make a special sound called a gakel-call.', source: RSPCA_HENS },
  { id: 'ck-097', text: 'Chickens like to forage, roost and dust bathe together.', source: RSPCA_PETS },
  { id: 'ck-098', text: 'A perch about 40 cm off the ground helps a chicken feel safe.', source: RSPCA_PETS },
  { id: 'ck-099', text: 'Chickens sleep more in winter to save energy.', source: RSPCA_FACTS },

  // Eggs, as laid.
  { id: 'ck-100', text: 'A hen bred for laying can lay over 300 eggs in a year.', source: WIKI_CHICKEN },
  { id: 'ck-101', text: 'Hens cluck loudly after laying an egg, and also to call their chicks.', source: WIKI_CHICKEN },
  { id: 'ck-102', text: 'Hens often choose to lay in a nest that already has eggs in it.', source: WIKI_CHICKEN },
  { id: 'ck-103', text: 'A hen that settles on her eggs to hatch them is said to have gone broody.', source: WIKI_CHICKEN },
  { id: 'ck-104', text: 'A chicken egg takes about 21 days to hatch.', source: WIKI_CHICKEN },
  { id: 'ck-105', text: 'Chickens that live high up in Tibet lay eggs suited to hatching in thin mountain air.', source: WIKI_CHICKEN },
  { id: 'ck-106', text: 'Hens tend to lay an egg every 24 to 27 hours.', source: RSPCA_NEXTGEN },
  { id: 'ck-107', text: 'Hens start laying eggs when they are between four and six months old.', source: RSPCA_HENS },
  { id: 'ck-108', text: 'Hens with dark earlobes usually lay brown eggs, and hens with lighter earlobes lay white ones.', source: RSPCA_HENS },
  { id: 'ck-109', text: 'Hens do not need a rooster to lay eggs, only for the eggs to become chicks.', source: NATGEO },
  { id: 'ck-110', text: 'A hen needs about 12 hours of light a day before her body is ready to lay eggs.', source: NATGEO },
  { id: 'ck-111', text: 'A hen uses 47 percent of the calcium in her body to make a single eggshell.', source: EXT_SKELETAL },
  { id: 'ck-112', text: 'Hens keep a store of calcium for eggshells inside some of their bones.', source: EXT_SKELETAL },
  { id: 'ck-113', text: 'Oyster shell gives hens extra calcium, which helps them make stronger eggshells.', source: RSPCA_PETS },
  { id: 'ck-114', text: 'A hen starts looking for a nest an hour or two before her egg is ready.', source: EXT_BEHAVIOUR },
  { id: 'ck-115', text: 'Young hens learn where to lay by copying the first hens in the flock to start.', source: EXT_BEHAVIOUR },
  { id: 'ck-116', text: 'The record for egg laying is 371 eggs in 364 days, by a White Leghorn hen in 1979.', source: GWR_EGGS },

  // Chicks.
  { id: 'ck-117', text: 'A newly hatched chick weighs about 37 grams (1.3 oz).', source: WIKI_CHICKEN },
  { id: 'ck-118', text: 'For their first couple of days, new chicks feed by absorbing yolk left over from the egg.', source: WIKI_CHICKEN },
  { id: 'ck-119', text: 'A mother hen leads her chicks to food and water and calls them over to eat.', source: WIKI_CHICKEN },
  { id: 'ck-120', text: 'Chicks imprint on their mother hen and then follow her everywhere.', source: WIKI_CHICKEN },
  { id: 'ck-121', text: 'A chick breaks out of its shell with an egg tooth, a sharp bump on its beak.', source: WIKI_EGG_TOOTH },
  { id: 'ck-122', text: "A chick's egg tooth falls off or is absorbed into its beak after hatching.", source: WIKI_EGG_TOOTH },
  { id: 'ck-123', text: 'Before hatching, a chick pokes into an air pocket in the egg that gives it a few hours of air.', source: WIKI_EGG_TOOTH },
  { id: 'ck-124', text: 'Chipping through the shell from the inside is called pipping.', source: WIKI_EGG_TOOTH },
  { id: 'ck-125', text: "Chicks learn their mother's sounds while they are still inside the egg.", source: RSPCA_FACTS },
  { id: 'ck-126', text: 'A group of newly hatched chicks is called a clutch, and later a brood.', source: RSPCA_FACTS },
  { id: 'ck-127', text: 'Within hours of hatching, chicks can eat, walk and run all on their own.', source: RSPCA_FACTS },
  { id: 'ck-128', text: 'A mother hen teaches her chicks how to look for food.', source: RSPCA_FACTS },
  { id: 'ck-129', text: 'Chicks imprint on the sight of their mother between 24 and 36 hours after hatching.', source: NATGEO },
  { id: 'ck-130', text: 'A hen and her chicks start calling to each other the day before the eggs hatch.', source: EXT_BEHAVIOUR },
  { id: 'ck-131', text: 'What a newly hatched chick needs most is warmth.', source: EXT_BEHAVIOUR },
  { id: 'ck-132', text: "The sound of a mother hen's clucking calms her chicks.", source: EXT_BEHAVIOUR },
  { id: 'ck-133', text: 'Chicks can pick out their own mother hen, and her voice is one of the main clues.', source: EXT_BEHAVIOUR },
  { id: 'ck-134', text: 'Some chicks have been seen going back for a cold straggler and leading it to the heat lamp.', source: EXT_BEHAVIOUR },
  { id: 'ck-135', text: 'In one study, chicks given a worm ran about as if others were after it, even when all alone.', source: EXT_BEHAVIOUR },
  { id: 'ck-136', text: 'Chicks are naturally wary of stinging insects but will try to catch flies.', source: EXT_BEHAVIOUR },
  { id: 'ck-137', text: 'Chicks raised without a hen have to be shown how to drink.', source: EXT_BEHAVIOUR },
  { id: 'ck-138', text: 'Chicks will peck at shiny things and at bubbles in water.', source: EXT_BEHAVIOUR },
  { id: 'ck-139', text: 'At about three weeks old, chicks start jumping up onto higher things.', source: EXT_BEHAVIOUR },
  { id: 'ck-140', text: 'Hens have no favourites among their chicks: it is first come, first served.', source: EXT_BEHAVIOUR },

  // The wild cousin: the red junglefowl.
  { id: 'ck-141', text: 'A wild red junglefowl rooster weighs about 1.5 kg, and a hen about 1 kg.', source: WIKI_JUNGLEFOWL },
  { id: 'ck-142', text: "A red junglefowl rooster's tail has 14 feathers that shimmer blue, purple and green in the light.", source: WIKI_JUNGLEFOWL },
  { id: 'ck-143', text: "Gallus, the first word of the chicken's scientific name, is Latin for a farmyard cockerel.", source: WIKI_JUNGLEFOWL },
  { id: 'ck-144', text: 'The red junglefowl was first formally described by Carl Linnaeus in 1758.', source: WIKI_JUNGLEFOWL },
  { id: 'ck-145', text: 'Red junglefowl fly up into trees at sunset to roost somewhere safe.', source: WIKI_JUNGLEFOWL },
  { id: 'ck-146', text: 'Red junglefowl bathe in dust to keep the right balance of oil in their feathers.', source: WIKI_JUNGLEFOWL },
  { id: 'ck-147', text: 'Wild junglefowl chicks eat mostly insects and earthworms.', source: WIKI_JUNGLEFOWL },
  { id: 'ck-148', text: 'About 1,000 termites were once found in the crop of a single red junglefowl.', source: WIKI_JUNGLEFOWL },
  { id: 'ck-149', text: 'The wild red junglefowl is much shyer of people than the chicken is.', source: WIKI_JUNGLEFOWL },
  { id: 'ck-150', text: 'A red junglefowl hen is a drab colour, which helps her stay hidden.', source: WIKI_JUNGLEFOWL },
  { id: 'ck-151', text: 'While she is laying, a red junglefowl hen lays one egg every day.', source: WIKI_JUNGLEFOWL },

  // Roosters.
  { id: 'ck-152', text: "A rooster's crowing is controlled by his body clock.", source: WIKI_JUNGLEFOWL },
  { id: 'ck-153', text: 'The top rooster always crows first, and the others follow in order of rank.', source: WIKI_JUNGLEFOWL },
  { id: 'ck-154', text: 'When one rooster announces the dawn, the others nearby join in straight away.', source: WIKI_JUNGLEFOWL },
  { id: 'ck-155', text: "A wild junglefowl rooster's crow is shorter than a farm rooster's and stops suddenly.", source: WIKI_JUNGLEFOWL },
  { id: 'ck-156', text: 'A rooster who finds food may do a display called tidbitting, picking it up and dropping it for a hen.', source: WIKI_JUNGLEFOWL },
  { id: 'ck-157', text: 'Roosters have a sharp, bony spur on the back of each leg.', source: WIKI_JUNGLEFOWL },

  // Breeds, and a few famous birds.
  { id: 'ck-158', text: 'The Silkie chicken has fluffy plumage that feels like silk or fur.', source: WIKI_SILKIE },
  { id: 'ck-159', text: 'Silkies have five toes on each foot, while most chickens have only four.', source: WIKI_SILKIE },
  { id: 'ck-160', text: 'Silkie chickens have black skin and blue earlobes.', source: WIKI_SILKIE },
  { id: 'ck-161', text: 'Silkie hens love to sit on eggs, so they are often used to hatch eggs for other birds.', source: WIKI_SILKIE },
  { id: 'ck-162', text: 'The explorer Marco Polo wrote about a furry chicken on his travels in Asia in the 13th century.', source: WIKI_SILKIE },
  { id: 'ck-163', text: 'Early Dutch breeders told buyers that Silkies were a cross between a chicken and a rabbit.', source: WIKI_SILKIE },
  { id: 'ck-164', text: 'The Araucana, a chicken from Chile, lays blue-shelled eggs.', source: WIKI_ARAUCANA },
  { id: 'ck-165', text: 'An Araucana hen lays about 250 blue or green eggs a year.', source: WIKI_ARAUCANA },
  { id: 'ck-166', text: 'Some Araucana chickens have no tail at all.', source: WIKI_ARAUCANA },
  { id: 'ck-167', text: 'Marans hens lay dark brown eggs, from mahogany to chocolate in colour.', source: WIKI_MARANS },
  { id: 'ck-168', text: 'The Onagadori, a Japanese chicken, has a tail over 1.5 metres long that can reach 12 metres.', source: WIKI_ONAGADORI },
  { id: 'ck-169', text: 'In Japan, the long-tailed Onagadori chicken is an official national treasure.', source: WIKI_ONAGADORI },
  { id: 'ck-170', text: 'The Serama of Malaysia is the smallest breed of chicken in the world.', source: WIKI_SERAMA },
  { id: 'ck-171', text: 'A Serama chicken stands 25 cm (10 inches) tall or less.', source: WIKI_SERAMA },
  { id: 'ck-172', text: 'Brahma roosters weighing about 8 kg (18 lb) have been recorded.', source: WIKI_BRAHMA },
  { id: 'ck-173', text: 'In 1852, nine chickens of the Brahma kind were sent to Queen Victoria as a gift.', source: WIKI_BRAHMA },
  { id: 'ck-174', text: 'The Polish chicken has a big crest of feathers on top of its head.', source: WIKI_POLISH },
  { id: 'ck-175', text: 'Crested chickens appear in paintings from the 15th century.', source: WIKI_POLISH },
  { id: 'ck-176', text: 'The Ayam Cemani chicken of Indonesia is black nearly all over, even its beak and tongue.', source: WIKI_CEMANI },
  { id: 'ck-177', text: 'In Indonesian, ayam means chicken, and cemani means thoroughly black.', source: WIKI_CEMANI },
  { id: 'ck-178', text: 'A bantam is a small kind of chicken, and the name comes from the port of Bantam in Java.', source: WIKI_BANTAM },
  { id: 'ck-179', text: 'Most large chicken breeds have a much smaller bantam version.', source: WIKI_BANTAM },
  { id: 'ck-180', text: 'The oldest chicken ever recorded, Muffy, lived to 23 years and 152 days.', source: GWR_OLDEST },
  { id: 'ck-181', text: 'In 2023, Peanut, a bantam hen from Michigan, was the oldest living chicken at 20 years old.', source: GWR_PEANUT },
  { id: 'ck-182', text: "Peanut the record-breaking hen liked watching TV on her owner's lap.", source: GWR_PEANUT },
  { id: 'ck-183', text: 'Peanut the record-breaking hen always answered to her name and loved to be cuddled.', source: GWR_PEANUT },
  { id: 'ck-184', text: 'The longest chicken flight on record is 192 metres (630 ft), by a bantam named Sheena in 1985.', source: GWR_FLIGHT },
];
