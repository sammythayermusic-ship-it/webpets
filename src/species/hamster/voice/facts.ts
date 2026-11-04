// True things the hamster knows, each with the page that says so. Researched 2026-11-03; every fact
// was checked against the text of its source page.
import type { Fact } from '../../../brain/types';

const WIKI_HAMSTER = { title: 'Hamster — Wikipedia', url: 'https://en.wikipedia.org/wiki/Hamster' };
const WIKI_GOLDEN = { title: 'Golden hamster — Wikipedia', url: 'https://en.wikipedia.org/wiki/Golden_hamster' };
const WIKI_ROBO = { title: 'Roborovski dwarf hamster — Wikipedia', url: 'https://en.wikipedia.org/wiki/Roborovski_dwarf_hamster' };
const WIKI_DJUNGARIAN = { title: 'Djungarian hamster — Wikipedia', url: 'https://en.wikipedia.org/wiki/Djungarian_hamster' };
const WIKI_CAMPBELL = { title: "Campbell's dwarf hamster — Wikipedia", url: 'https://en.wikipedia.org/wiki/Campbell%27s_dwarf_hamster' };
const WIKI_CHINESE = { title: 'Chinese hamster — Wikipedia', url: 'https://en.wikipedia.org/wiki/Chinese_hamster' };
const WIKI_EUROPEAN = { title: 'European hamster — Wikipedia', url: 'https://en.wikipedia.org/wiki/European_hamster' };
const WIKI_POUCH = { title: 'Cheek pouch — Wikipedia', url: 'https://en.wikipedia.org/wiki/Cheek_pouch' };
const WIKI_WHEEL = { title: 'Hamster wheel — Wikipedia', url: 'https://en.wikipedia.org/wiki/Hamster_wheel' };
const WIKI_BALL = { title: 'Hamster ball — Wikipedia', url: 'https://en.wikipedia.org/wiki/Hamster_ball' };
const WIKI_AHARONI = { title: 'Israel Aharoni — Wikipedia', url: 'https://en.wikipedia.org/wiki/Israel_Aharoni' };
const WIKI_PHODOPUS = { title: 'Phodopus — Wikipedia', url: 'https://en.wikipedia.org/wiki/Phodopus' };
const GWR_OLDEST = { title: 'Oldest hamster in captivity ever | Guinness World Records', url: 'https://www.guinnessworldrecords.com/world-records/oldest-hamster-ever' };
const GWR_LITTER = { title: 'Largest litter of hamsters | Guinness World Records', url: 'https://www.guinnessworldrecords.com/world-records/70481-largest-litter-hamster' };
const GWR_LARGEST = { title: 'Largest hamster species | Guinness World Records', url: 'https://www.guinnessworldrecords.com/world-records/411421-largest-hamster-species' };
const NATGEO_KIDS = { title: 'Hamsters: From the Wild to Your Bedroom | National Geographic Kids', url: 'https://kids.nationalgeographic.com/nature/article/wild-hamsters' };
const RSPCA_PETS = { title: 'Keeping Hamsters As Pets - RSPCA', url: 'https://www.rspca.org.uk/adviceandwelfare/pets/rodents/hamsters' };
const RSPCA_HOME = { title: 'Creating a Good Home for Hamsters - RSPCA', url: 'https://www.rspca.org.uk/adviceandwelfare/pets/rodents/hamsters/environment' };
const RSPCA_BEHAVIOUR = { title: 'Hamster behaviour - Pet Care | RSPCA', url: 'https://www.rspca.org.uk/adviceandwelfare/pets/rodents/hamsters/behaviour' };
const RSPCA_DIET = { title: 'What To Feed a Pet Hamster | RSPCA', url: 'https://www.rspca.org.uk/adviceandwelfare/pets/rodents/hamsters/diet' };
const RSPCA_COMPANY = { title: 'Keeping Hamsters Together | RSPCA', url: 'https://www.rspca.org.uk/adviceandwelfare/pets/rodents/hamsters/company' };
const RSPCA_SOLENT = { title: 'Hamster accommodation - RSPCA Solent Branch', url: 'https://www.rspcasolentbranch.org.uk/?p=54537' };
const PDSA = { title: 'Hamsters as pets - PDSA', url: 'https://www.pdsa.org.uk/pet-help-and-advice/looking-after-your-pet/small-pets/hamsters-as-pets' };
const HARTPURY = { title: 'Student research highlights key welfare concerns for pet hamsters ahead of World Hamster Day - Hartpury University', url: 'https://www.hartpury.ac.uk/news/2025/04/student-research-highlights-key-welfare-concerns-for-pet-hamsters-ahead-of-world-hamster-day/' };
const MERCK_BODY = { title: 'Description and Physical Characteristics of Hamsters - Merck Veterinary Manual', url: 'https://www.merckvetmanual.com/all-other-pets/hamsters/description-and-physical-characteristics-of-hamsters' };
const MERCK_HOME = { title: 'Providing a Home for a Hamster - Merck Veterinary Manual', url: 'https://www.merckvetmanual.com/all-other-pets/hamsters/providing-a-home-for-a-hamster' };
const MERCK_CARE = { title: 'Routine Health Care of Hamsters - Merck Veterinary Manual', url: 'https://www.merckvetmanual.com/all-other-pets/hamsters/routine-health-care-of-hamsters' };

export const HAMSTER_FACTS: readonly Fact[] = [
  // The body and the senses: pouches, teeth, eyes, whiskers, scent glands.
  { id: 'hm-001', text: 'Hamsters are stout little rodents with short stocky legs, small furry ears and wide feet.', source: WIKI_HAMSTER },
  { id: 'hm-002', text: 'There are 19 kinds of hamster in the world, sorted into seven groups.', source: WIKI_HAMSTER },
  { id: 'hm-003', text: "A hamster's tail is usually only about one-sixth as long as its body.", source: WIKI_HAMSTER },
  { id: 'hm-004', text: 'Hamsters come in black, grey, honey, white, brown, yellow and red, or mixes of those.', source: WIKI_HAMSTER },
  { id: 'hm-005', text: "A hamster's cheek pouches reach all the way back to its shoulders.", source: WIKI_HAMSTER },
  { id: 'hm-006', text: "With its cheek pouches full, a hamster's head can look two or three times its normal size.", source: WIKI_HAMSTER },
  { id: 'hm-007', text: "A hamster's front teeth never stop growing, so it has to keep wearing them down.", source: WIKI_HAMSTER },
  { id: 'hm-008', text: 'Hamsters are nearsighted and colorblind, so they do not see very well.', source: WIKI_HAMSTER },
  { id: 'hm-009', text: 'Even with poor eyesight, hamsters love to climb and explore.', source: WIKI_HAMSTER },
  { id: 'hm-010', text: 'Hamsters have scent glands on their sides that leave a smell trail wherever they go.', source: WIKI_HAMSTER },
  { id: 'hm-011', text: "A hamster's nose helps it find food and tells a mother which babies are hers.", source: WIKI_HAMSTER },
  { id: 'hm-012', text: "Hamsters can learn the sound of feeding time and their owner's voice.", source: WIKI_HAMSTER },
  { id: 'hm-013', text: 'Hamsters can hear and chat with each other in sounds too high for people to hear.', source: WIKI_HAMSTER },
  { id: 'hm-014', text: 'Hamsters talk with smells and body language, even to their owners.', source: WIKI_HAMSTER },
  { id: 'hm-015', text: "A hamster's bones are bendy but a bit fragile.", source: WIKI_HAMSTER },
  { id: 'hm-016', text: 'Hamsters do not like drafts or sudden changes in temperature.', source: WIKI_HAMSTER },
  { id: 'hm-017', text: "A hamster's whiskers can whisk back and forth up to 30 times a second.", source: RSPCA_PETS },
  { id: 'hm-018', text: 'Hamsters have big eyes built for seeing in dim light.', source: RSPCA_PETS },
  { id: 'hm-019', text: 'Hamsters find their way with smell, touch and their whiskers more than with their eyes.', source: NATGEO_KIDS },
  { id: 'hm-020', text: "The scent glands on a hamster's sides look like little dark spots.", source: MERCK_BODY },
  { id: 'hm-021', text: 'Hamsters are distant cousins of mice and rats.', source: MERCK_BODY },
  { id: 'hm-022', text: 'A Syrian hamster can carry up to half its body weight in food in its cheek pouches.', source: RSPCA_PETS },
  { id: 'hm-023', text: 'A hamster can quite literally fill its face with food!', source: WIKI_POUCH },
  { id: 'hm-024', text: 'Some mother hamsters tuck their babies into their cheek pouches to carry them to safety.', source: WIKI_POUCH },
  { id: 'hm-025', text: 'Some hamsters fill their cheek pouches with air so they float better when they swim.', source: WIKI_POUCH },
  { id: 'hm-026', text: "A hamster's normal body temperature is about 37 to 38 °C (98 to 101 °F).", source: MERCK_CARE },

  // Behaviour: hoarding, digging, night life, living alone, running.
  { id: 'hm-027', text: 'The word hamster comes from the German word hamstern, which means to hoard.', source: WIKI_HAMSTER },
  { id: 'hm-028', text: 'A group of hamsters is called a horde.', source: WIKI_HAMSTER },
  { id: 'hm-029', text: 'Hamsters stash their food in storerooms deep inside their burrows.', source: WIKI_HAMSTER },
  { id: 'hm-030', text: 'Wild hamsters are busiest at twilight, but pet hamsters usually wake up around sundown.', source: WIKI_HAMSTER },
  { id: 'hm-031', text: 'Most hamsters like to live alone and are happiest with a home all to themselves.', source: WIKI_HAMSTER },
  { id: 'hm-032', text: 'Hamsters are expert diggers whose burrows have several doors, hallways and rooms.', source: WIKI_HAMSTER },
  { id: 'hm-033', text: 'A wild Syrian hamster digs its burrow about 70 cm (over two feet) down.', source: WIKI_HAMSTER },
  { id: 'hm-034', text: 'A hamster burrow has a steep front door only 4 to 5 cm wide.', source: WIKI_HAMSTER },
  { id: 'hm-035', text: 'A hamster burrow has a bedroom, a pantry and even a separate bathroom corner.', source: WIKI_HAMSTER },
  { id: 'hm-036', text: 'Burrows keep hamsters cool in summer, warm in winter and safe from predators.', source: WIKI_HAMSTER },
  { id: 'hm-037', text: 'Wild Syrian hamsters can nap through a cold spell for two or three days at a time.', source: WIKI_HAMSTER },
  { id: 'hm-038', text: 'Pet Syrian hamsters do not hibernate.', source: WIKI_HAMSTER },
  { id: 'hm-039', text: 'Hamsters lose a little weight every autumn to get ready for winter, even as pets.', source: WIKI_HAMSTER },
  { id: 'hm-040', text: 'Baby hamsters are born without fur and start exploring the nest after about a week.', source: WIKI_HAMSTER },
  { id: 'hm-041', text: 'At hamster shows, judges pick the hamsters that best match the official varieties.', source: WIKI_HAMSTER },
  { id: 'hm-042', text: 'Hamsters are smart, learn quickly, and can be trained to come when food appears.', source: RSPCA_PETS },
  { id: 'hm-043', text: 'Wild hamsters live on dry, rocky plains and slopes with just a few plants.', source: RSPCA_PETS },
  { id: 'hm-044', text: 'When something new startles a hamster, it heads straight back to its burrow.', source: RSPCA_PETS },
  { id: 'hm-045', text: 'Wild hamsters can run up to five miles in a single day.', source: RSPCA_BEHAVIOUR },
  { id: 'hm-046', text: 'Hamsters need to sleep undisturbed during the day.', source: RSPCA_BEHAVIOUR },
  { id: 'hm-047', text: 'Let a hamster sniff and investigate your hands in its own time.', source: RSPCA_BEHAVIOUR },
  { id: 'hm-048', text: 'Hamsters like to sit up, hold their food in their paws and nibble it.', source: RSPCA_DIET },
  { id: 'hm-049', text: 'A hamster may carry food in its cheeks and then stash it in its nest for later.', source: RSPCA_DIET },
  { id: 'hm-050', text: 'Scattering food around the cage lets a hamster forage the way it would in the wild.', source: RSPCA_DIET },
  { id: 'hm-051', text: 'Wild hamsters snack on seeds, cereals and insects, even crickets.', source: RSPCA_DIET },
  { id: 'hm-052', text: 'Syrian and Chinese hamsters should always live on their own.', source: RSPCA_COMPANY },
  { id: 'hm-053', text: 'Some dwarf hamsters can live in pairs or trios, but they are just as happy alone.', source: RSPCA_COMPANY },
  { id: 'hm-054', text: 'Hamsters talk with smells, so two strangers should not even live in cages side by side.', source: RSPCA_COMPANY },
  { id: 'hm-055', text: 'In the wild, hamsters live underground, where they sleep, store food and build nests.', source: MERCK_BODY },
  { id: 'hm-056', text: 'Hamsters are awake at night and asleep by day, so play with them when they are already up.', source: MERCK_HOME },
  { id: 'hm-057', text: 'A hamster often hides food around its cage.', source: MERCK_HOME },

  // The wheel.
  { id: 'hm-058', text: 'It is not unusual for a hamster to run 9 km (5.6 miles) on its wheel in one night.', source: WIKI_WHEEL },
  { id: 'hm-059', text: 'Given the choice, Syrian hamsters pick a big 35 cm wheel over smaller ones.', source: WIKI_WHEEL },
  { id: 'hm-060', text: 'Wild mice run on wheels left out in a field, so wheel running is not just a cage habit.', source: WIKI_WHEEL },
  { id: 'hm-061', text: 'Scientists think running on a wheel simply feels good to a hamster, a bit like play.', source: WIKI_WHEEL },
  { id: 'hm-062', text: 'Dwarf hamsters need a wheel at least 20 cm across, and Syrians at least 30 cm.', source: WIKI_WHEEL },
  { id: 'hm-063', text: 'The first known use of the words "hamster wheel" was in a 1949 Los Angeles newspaper ad.', source: WIKI_WHEEL },
  { id: 'hm-064', text: 'A hamster on a wheel with a tiny generator can make enough electricity to light small LEDs.', source: WIKI_WHEEL },
  { id: 'hm-065', text: 'Solid wheels are the safest kind, because little feet cannot slip between rungs.', source: WIKI_WHEEL },
  { id: 'hm-066', text: 'Hamster balls have been sold since at least the 1970s.', source: WIKI_BALL },
  { id: 'hm-067', text: 'A hamster ball rumbles as it rolls, so you can hear where your hamster has got to.', source: WIKI_BALL },

  // Species and sizes: Syrian, Roborovski, winter white, Campbell's, Chinese, European.
  { id: 'hm-068', text: 'Wild golden hamsters come from a dry corner of northern Syria and southern Turkey.', source: WIKI_GOLDEN },
  { id: 'hm-069', text: 'A grown Syrian hamster can be about 18 cm (7 inches) long.', source: WIKI_GOLDEN },
  { id: 'hm-070', text: 'Female Syrian hamsters are usually bigger than the males.', source: WIKI_GOLDEN },
  { id: 'hm-071', text: 'A Syrian hamster usually weighs 100 to 150 grams.', source: WIKI_GOLDEN },
  { id: 'hm-072', text: "In Arabic, the golden hamster's local name means something like mister saddlebags.", source: WIKI_GOLDEN },
  { id: 'hm-073', text: 'Syrian hamsters do about 80 percent of their daily activity at night.', source: WIKI_GOLDEN },
  { id: 'hm-074', text: "A Syrian hamster's sleep cycle lasts only about 10 to 12 minutes.", source: WIKI_GOLDEN },
  { id: 'hm-075', text: 'Given 40 cm of bedding, pet hamsters dig burrows much like the ones wild hamsters make.', source: WIKI_GOLDEN },
  { id: 'hm-076', text: 'Male Syrian hamsters mark their territory by dragging their sides along things.', source: WIKI_GOLDEN },
  { id: 'hm-077', text: 'Syrian hamsters are larder hoarders, carrying food home in their cheeks to store it.', source: WIKI_GOLDEN },
  { id: 'hm-078', text: 'Roborovski hamsters are the smallest hamsters of all, about 6.3 cm long.', source: WIKI_ROBO },
  { id: 'hm-079', text: 'A grown Roborovski hamster weighs only about 16 grams.', source: WIKI_ROBO },
  { id: 'hm-080', text: 'A newborn Roborovski hamster is about 1.6 cm long and weighs about 1 gram.', source: WIKI_ROBO },
  { id: 'hm-081', text: 'Roborovski hamsters live in the sandy deserts of Mongolia, China and Kazakhstan.', source: WIKI_ROBO },
  { id: 'hm-082', text: 'Roborovski hamsters have little white spots above their eyes that look like eyebrows.', source: WIKI_ROBO },
  { id: 'hm-083', text: 'Roborovski hamsters are speedy and can run up to 6 miles in a single night.', source: WIKI_ROBO },
  { id: 'hm-084', text: 'Roborovski hamsters are named after a Russian explorer who first spotted them in 1894.', source: WIKI_ROBO },
  { id: 'hm-085', text: 'Roborovski hamsters dig steep burrows that can go six feet underground.', source: WIKI_ROBO },
  { id: 'hm-086', text: 'Roborovski hamsters bathe in sand, not water, which would wash the oils out of their fur.', source: WIKI_ROBO },
  { id: 'hm-087', text: 'Roborovski hamsters stock up on food in warm weather so they can stay underground all winter.', source: WIKI_ROBO },
  { id: 'hm-088', text: 'Roborovski hamsters came to the UK in the 1960s and to the US in 1998.', source: WIKI_ROBO },
  { id: 'hm-089', text: 'Roborovski hamsters can live two to four years.', source: WIKI_ROBO },
  { id: 'hm-090', text: 'Roborovski hamsters are quick and shy, but they can be tamed with patience.', source: WIKI_ROBO },
  { id: 'hm-091', text: 'Roborovski hamster babies open their eyes at about two weeks old.', source: WIKI_ROBO },
  { id: 'hm-092', text: 'Winter white hamsters are round like a ball and about half the size of a Syrian hamster.', source: WIKI_DJUNGARIAN },
  { id: 'hm-093', text: 'A winter white hamster is only 7 to 9 cm long.', source: WIKI_DJUNGARIAN },
  { id: 'hm-094', text: "As the days get shorter, a winter white hamster's dark fur turns almost all white.", source: WIKI_DJUNGARIAN },
  { id: 'hm-095', text: 'A white winter coat hides the winter white hamster in the snow.', source: WIKI_DJUNGARIAN },
  { id: 'hm-096', text: 'Pet winter whites usually stay dark, because indoor lights hide the short winter days.', source: WIKI_DJUNGARIAN },
  { id: 'hm-097', text: 'Winter white hamsters have furry feet and a thick dark stripe down their backs.', source: WIKI_DJUNGARIAN },
  { id: 'hm-098', text: 'Wild winter white hamsters dig burrows up to a metre deep, and most have six entrances.', source: WIKI_DJUNGARIAN },
  { id: 'hm-099', text: 'In winter, a winter white hamster shuts all but one door of its burrow and lines it with wool.', source: WIKI_DJUNGARIAN },
  { id: 'hm-100', text: 'In summer, winter white hamsters line their burrows with moss.', source: WIKI_DJUNGARIAN },
  { id: 'hm-101', text: 'Winter white hamsters are known as one of the easiest hamsters to tame.', source: WIKI_DJUNGARIAN },
  { id: 'hm-102', text: 'Winter white hamster coats come in colors named pearl, sapphire and marbled.', source: WIKI_DJUNGARIAN },
  { id: 'hm-103', text: 'In 1968, four winter white hamsters caught in Siberia were taken to a science institute in Germany.', source: WIKI_DJUNGARIAN },
  { id: 'hm-104', text: "Campbell's dwarf hamsters are named after the man who found the first one in Mongolia in 1902.", source: WIKI_CAMPBELL },
  { id: 'hm-105', text: "A Campbell's dwarf hamster is about 8 cm long with a tail only 5 mm long.", source: WIKI_CAMPBELL },
  { id: 'hm-106', text: "Campbell's dwarf hamsters line their burrows with dry grass or sheep's wool.", source: WIKI_CAMPBELL },
  { id: 'hm-107', text: "A Campbell's dwarf hamster burrow can have four to six tunnels.", source: WIKI_CAMPBELL },
  { id: 'hm-108', text: "By 11 days old, a Campbell's hamster can already carry a sunflower seed in its cheek pouch.", source: WIKI_CAMPBELL },
  { id: 'hm-109', text: "Campbell's dwarf hamsters have white hands and feet, which help keep them warm.", source: WIKI_CAMPBELL },
  { id: 'hm-110', text: "In Mongolia, Campbell's dwarf hamsters sometimes move into yurts to stay warm in winter.", source: WIKI_CAMPBELL },
  { id: 'hm-111', text: "Campbell's dwarf hamsters keep their grey coats all winter and do not turn white.", source: WIKI_CAMPBELL },
  { id: 'hm-112', text: "Campbell's dwarf hamsters sometimes share their burrows with pikas.", source: WIKI_CAMPBELL },
  { id: 'hm-113', text: "A Campbell's dwarf hamster weighs about 23 grams on average.", source: WIKI_PHODOPUS },
  { id: 'hm-114', text: 'Dwarf hamsters have fur on the bottoms of their feet.', source: WIKI_PHODOPUS },
  { id: 'hm-115', text: 'Dwarf hamsters are the only hamsters known to live in groups.', source: WIKI_PHODOPUS },
  { id: 'hm-116', text: 'Dwarf hamsters first became pets in the 1970s.', source: WIKI_PHODOPUS },
  { id: 'hm-117', text: 'Dwarf hamsters are very good at saving water in their dry desert homes.', source: WIKI_PHODOPUS },
  { id: 'hm-118', text: 'The dwarf hamster family is at least 8.5 million years old.', source: WIKI_PHODOPUS },
  { id: 'hm-119', text: 'A winter white hunches up when it is colder than -20 °C and lies flat when it is hotter than 30 °C.', source: WIKI_PHODOPUS },
  { id: 'hm-120', text: 'Chinese hamsters have long thin bodies and a tail much longer than other hamsters, up to 33 mm.', source: WIKI_CHINESE },
  { id: 'hm-121', text: 'A Chinese hamster is 8 to 13 cm long and weighs 30 to 45 grams.', source: WIKI_CHINESE },
  { id: 'hm-122', text: 'Chinese hamsters are brown with a black stripe down the spine and a whitish belly.', source: WIKI_CHINESE },
  { id: 'hm-123', text: 'Chinese hamsters come from the deserts of northern China and Mongolia.', source: WIKI_CHINESE },
  { id: 'hm-124', text: 'Chinese hamsters mostly sleep by day but wake for short breaks between naps.', source: WIKI_CHINESE },
  { id: 'hm-125', text: 'Chinese hamsters live two to three years on average.', source: WIKI_CHINESE },
  { id: 'hm-126', text: 'European hamsters are the biggest hamsters, up to 34 cm long plus a 6 cm tail.', source: WIKI_HAMSTER },
  { id: 'hm-127', text: 'The smallest hamsters, the dwarf kinds, are only 5.5 to 10.5 cm long.', source: WIKI_HAMSTER },
  { id: 'hm-128', text: "Campbell's, winter white and Chinese hamsters wear a dark stripe from head to tail.", source: WIKI_HAMSTER },
  { id: 'hm-129', text: 'European hamsters have black bellies, brown backs and white patches on nose, paws and cheeks.', source: WIKI_EUROPEAN },
  { id: 'hm-130', text: 'A European hamster can weigh 200 to 650 grams, and a few have topped a kilogram.', source: WIKI_EUROPEAN },
  { id: 'hm-131', text: 'European hamsters moult their fur once a year.', source: WIKI_EUROPEAN },
  { id: 'hm-132', text: 'European hamsters live from Belgium all the way east to Russia and western China.', source: WIKI_EUROPEAN },
  { id: 'hm-133', text: "A European hamster's pantry holds 2 to 3 kg of food, and one held 65 kg!", source: WIKI_EUROPEAN },
  { id: 'hm-134', text: 'European hamsters hibernate from October to March, waking every five to seven days for a snack.', source: WIKI_EUROPEAN },
  { id: 'hm-135', text: 'European hamsters hardly ever need to drink, because they get their water from food.', source: WIKI_EUROPEAN },
  { id: 'hm-136', text: 'When scared, a European hamster stands up tall, shows its black belly and makes loud noises.', source: WIKI_EUROPEAN },
  { id: 'hm-137', text: "Some tunnels in a European hamster's burrow are used only as a toilet.", source: WIKI_EUROPEAN },
  { id: 'hm-138', text: 'A male European hamster may use up to 10 different burrows.', source: WIKI_EUROPEAN },
  { id: 'hm-139', text: 'Black-bellied hamsters puff up their cheeks and growl when they need to defend themselves.', source: NATGEO_KIDS },
  { id: 'hm-140', text: 'Only five kinds of hamster are common as pets.', source: NATGEO_KIDS },
  { id: 'hm-141', text: 'Hamsters are related to voles, lemmings and mice.', source: NATGEO_KIDS },

  // History: the 1930 litter from Aleppo.
  { id: 'hm-142', text: 'George Waterhouse gave the Syrian hamster its scientific name in 1839.', source: WIKI_GOLDEN },
  { id: 'hm-143', text: 'Golden hamsters were first written about in 1797, in a book on the natural history of Aleppo.', source: WIKI_GOLDEN },
  { id: 'hm-144', text: 'In 1930, Israel Aharoni found a hamster nest with a mother and eleven babies near Aleppo.', source: WIKI_AHARONI },
  { id: 'hm-145', text: 'The Aleppo hamsters were found living 8 feet (2.4 metres) below a wheat field.', source: NATGEO_KIDS },
  { id: 'hm-146', text: 'Nearly every pet Syrian hamster in the world descends from that one 1930 litter from Aleppo.', source: WIKI_HAMSTER },
  { id: 'hm-147', text: "Aharoni's hamsters went to Hebrew University in Jerusalem, and their family spread worldwide.", source: NATGEO_KIDS },
  { id: 'hm-148', text: 'Some of the very first hamsters kept in Jerusalem escaped through a hole in the floor.', source: WIKI_AHARONI },
  { id: 'hm-149', text: 'Israel Aharoni discovered 30 kinds of animals, insects and birds that were new to science.', source: WIKI_AHARONI },
  { id: 'hm-150', text: 'In 1931, descendants of the Aleppo hamsters were shipped to Britain.', source: WIKI_GOLDEN },
  { id: 'hm-151', text: 'People in the United States were keeping hamsters as pets by 1942.', source: WIKI_HAMSTER },
  { id: 'hm-152', text: 'In 1946, Albert Marsh started the first business that bred hamsters to sell.', source: WIKI_GOLDEN },

  // Records.
  { id: 'hm-153', text: 'The oldest hamster ever lived to 4.5 years old, with Karen Smeaton in Tyne and Wear, UK.', source: GWR_OLDEST },
  { id: 'hm-154', text: 'The biggest hamster litter on record was 26 babies, born in Louisiana in 1974.', source: GWR_LITTER },
  { id: 'hm-155', text: 'A typical hamster litter is about 8 babies.', source: GWR_LITTER },
  { id: 'hm-156', text: 'The biggest hamster species is the European hamster, up to 40 cm from nose to tail tip.', source: GWR_LARGEST },
  { id: 'hm-157', text: 'European hamsters can live up to eight years in captivity.', source: GWR_LARGEST },

  // Care: how long they live, bedding, chewing, food, handling.
  { id: 'hm-158', text: 'Pet Syrian hamsters usually live two to three years.', source: WIKI_HAMSTER },
  { id: 'hm-159', text: 'Bigger Syrian hamsters tend to live a little longer than Russian dwarf hamsters.', source: PDSA },
  { id: 'hm-160', text: 'Wild hamsters walk for miles each day, so pets need a cage with lots of floor space.', source: PDSA },
  { id: 'hm-161', text: 'A hamster cage should be at least 100 by 50 cm, and bigger is always better.', source: PDSA },
  { id: 'hm-162', text: 'Give a hamster at least 25 cm (10 inches) of bedding to burrow, sleep and store food in.', source: PDSA },
  { id: 'hm-163', text: 'Hamsters like a steady 18 to 21 °C, out of draughts and direct sun.', source: PDSA },
  { id: 'hm-164', text: 'Hamsters love to gnaw on untreated softwood branches, cardboard and hay cubes.', source: PDSA },
  { id: 'hm-165', text: 'A teaspoon or two of fresh fruit, veg or herbs a day is a good hamster treat.', source: PDSA },
  { id: 'hm-166', text: 'Hide food in paper bags and cardboard tubes so your hamster can forage for it.', source: PDSA },
  { id: 'hm-167', text: 'Scoop a hamster up gently with both hands, and never wake a sleeping hamster to hold it.', source: PDSA },
  { id: 'hm-168', text: 'Keep a little of the old clean bedding when you clean the cage, so it still smells like home.', source: PDSA },
  { id: 'hm-169', text: 'A hamster cage should be wide rather than tall, because hamsters cannot see drops well.', source: PDSA },
  { id: 'hm-170', text: 'Hamsters are omnivores, so a mealworm or a bit of boiled egg makes a fine treat.', source: PDSA },
  { id: 'hm-171', text: 'Welfare groups say a hamster needs at least 20 to 25 cm of bedding to dig in.', source: HARTPURY },
  { id: 'hm-172', text: 'Welfare charities recommend at least 5,000 square cm of floor space for a hamster cage.', source: HARTPURY },
  { id: 'hm-173', text: 'Hamsters dig fast and can escape from a poorly built cage.', source: RSPCA_HOME },
  { id: 'hm-174', text: 'Hamsters like the lights to go off at about the same time every night.', source: RSPCA_HOME },
  { id: 'hm-175', text: 'Good nesting materials for a hamster are hay, wood wool, shredded paper or cardboard.', source: RSPCA_HOME },
  { id: 'hm-176', text: "Clean a hamster's cage while it is awake, not in the middle of its daytime sleep.", source: RSPCA_HOME },
  { id: 'hm-177', text: "Keep a hamster's cage away from TVs and computer screens, which give off very high sounds.", source: RSPCA_HOME },
  { id: 'hm-178', text: 'Wild hamsters live in warm, dry places, so pet hamsters need a cosy, draft-free home indoors.', source: RSPCA_HOME },
  { id: 'hm-179', text: 'Never give a hamster grapes or rhubarb, because they can be poisonous to rodents.', source: RSPCA_DIET },
  { id: 'hm-180', text: 'Hamsters need fresh clean water all the time, best from a bottle with a sipper tube.', source: RSPCA_DIET },
  { id: 'hm-181', text: 'A Syrian hamster needs at least 100 by 50 cm of unbroken floor space.', source: RSPCA_SOLENT },
  { id: 'hm-182', text: 'For a hamster home, the more natural the better.', source: RSPCA_SOLENT },
  { id: 'hm-183', text: 'Pet hamsters are popular because they are fairly clean and easy to care for.', source: MERCK_BODY },
  { id: 'hm-184', text: 'A hamster needs safe chew toys, like small wooden blocks, to keep its front teeth worn down.', source: MERCK_CARE },
  { id: 'hm-185', text: 'Plain tissues torn into strips make good nesting material for a hamster.', source: MERCK_HOME },
  { id: 'hm-186', text: 'To lift a hamster safely, slide your hand under its whole body and lift gently.', source: MERCK_HOME },
  { id: 'hm-187', text: 'Treats should be no more than a tenth of what a hamster eats.', source: MERCK_HOME },
  { id: 'hm-188', text: 'Always keep an eye on a hamster when it is out of its cage.', source: MERCK_HOME },
];
