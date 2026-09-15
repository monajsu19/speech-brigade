"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type EventMode = "impromptu" | "extemp";
type Screen =
  | "landing"
  | "events"
  | "impromptuIntro"
  | "timeAllocation"
  | "themeSpin"
  | "themeResult"
  | "topicSpin"
  | "topicSelect"
  | "impromptuPrep"
  | "deliveryCountdown"
  | "impromptuDelivery"
  | "extempIntro"
  | "questionSpin"
  | "questionSelect"
  | "extempPrep"
  | "extempDelivery"
  | "results";

type ThemeBank = { theme: string; topics: string[] };
type ExtempQuestion = { category: string; question: string };
type SlotItem = { value: string; label?: string };

type RoundState = {
  mode: EventMode | null;
  impromptuTheme: string;
  topicOptions: string[];
  questionOptions: ExtempQuestion[];
  selectedTopic: string;
  selectedQuestion: ExtempQuestion | null;
  prepSecondsAllocated: number;
  deliverySecondsAllocated: number;
  prepSecondsUsed: number;
  deliverySecondsUsed: number;
  roundStartTime: number | null;
};

const initialRound: RoundState = {
  mode: null,
  impromptuTheme: "",
  topicOptions: [],
  questionOptions: [],
  selectedTopic: "",
  selectedQuestion: null,
  prepSecondsAllocated: 120,
  deliverySecondsAllocated: 300,
  prepSecondsUsed: 0,
  deliverySecondsUsed: 0,
  roundStartTime: null,
};

const themeBank: ThemeBank[] = [
  ["Celebrities", "Taylor Swift, Beyoncé, Zendaya, MrBeast, LeBron James, Billie Eilish, Bad Bunny"],
  ["Athletes", "Simone Biles, Serena Williams, Lionel Messi, Stephen Curry, Shohei Ohtani, Coco Gauff, Patrick Mahomes"],
  ["Innovators", "Steve Jobs, Walt Disney, Henry Ford, Thomas Edison, Ada Lovelace, Nikola Tesla, Alexander Graham Bell"],
  ["Scientists", "Albert Einstein, Marie Curie, Isaac Newton, Jane Goodall, Charles Darwin, Katherine Johnson, Galileo"],
  ["Explorers", "Amelia Earhart, Marco Polo, Sacagawea, Neil Armstrong, Magellan, Lewis and Clark, Jacques Cousteau"],
  ["Artists", "Picasso, Van Gogh, Frida Kahlo, Leonardo da Vinci, Banksy, Monet, Georgia O'Keeffe"],
  ["Authors", "Shakespeare, Jane Austen, Mark Twain, Maya Angelou, Dr. Seuss, Tolkien, Agatha Christie"],
  ["Entrepreneurs", "Oprah Winfrey, Sara Blakely, Walt Disney, Steve Jobs, Madam C. J. Walker, Richard Branson, Daymond John"],
  ["Courage", "Leap, Fire, Mountain, Stage, Storm, Risk, First Step"],
  ["Success", "Victory, Trophy, Finish Line, Promotion, Graduation, Record, Breakthrough"],
  ["Failure", "Mistake, Rejection, Fumble, Detour, Retry, Collapse, Comeback"],
  ["Change", "Seasons, Moving, Graduation, Upgrade, Revolution, Metamorphosis, New Beginning"],
  ["Friendship", "Trust, Loyalty, Laughter, Reunion, Teammate, Secret, Support"],
  ["Leadership", "Captain, Coach, Vision, Responsibility, Example, Decision, Courage"],
  ["Freedom", "Open Road, Choice, Wings, Independence, Voice, Wilderness, Escape"],
  ["Happiness", "Sunshine, Music, Vacation, Laughter, Family, Surprise, Celebration"],
  ["Fear", "Darkness, Heights, Failure, Unknown, Stage, Storm, Silence"],
  ["Hope", "Sunrise, Seed, Rainbow, Tomorrow, Candle, Comeback, Wish"],
  ["Trust", "Handshake, Promise, Secret, Bridge, Teammate, Parachute, Friendship"],
  ["Patience", "Traffic, Garden, Fishing, Puzzle, Waiting Room, Bread, Marathon"],
  ["Persistence", "Marathon, Climb, Practice, Retry, Homework, Training, Puzzle"],
  ["Creativity", "Blank Page, Paintbrush, Lego, Melody, Recipe, Invention, Imagination"],
  ["Curiosity", "Question, Telescope, Door, Map, Mystery, Microscope, Why"],
  ["Responsibility", "Keys, Deadline, Pet, Team, Promise, Job, Choice"],
  ["Honesty", "Mirror, Confession, Promise, Truth, Secret, Reputation, Trust"],
  ["Kindness", "Smile, Gift, Compliment, Volunteer, Neighbor, Helping Hand, Thank You"],
  ["Ambition", "Summit, Goal, Dream, Medal, Promotion, Record, Horizon"],
  ["Confidence", "Stage, Microphone, Mirror, Interview, Game, Audition, Spotlight"],
  ["Discipline", "Alarm Clock, Practice, Routine, Workout, Homework, Budget, Training"],
  ["Balance", "Tightrope, School, Sleep, Work, Scale, Bicycle, Priorities"],
  ["Opportunity", "Door, Scholarship, Interview, Invitation, Ticket, Chance, Opening"],
  ["Competition", "Race, Chess, Rival, Scoreboard, Audition, Tournament, Finish Line"],
  ["Teamwork", "Relay, Orchestra, Crew, Huddle, Puzzle, Band, Rowboat"],
  ["Communication", "Text, Speech, Gesture, Letter, Phone Call, Silence, Conversation"],
  ["Knowledge", "Library, Teacher, Question, Encyclopedia, Experiment, Lesson, Discovery"],
  ["Wisdom", "Experience, Grandparent, Mistake, Advice, Patience, Reflection, Perspective"],
  ["Time", "Clock, Deadline, Yesterday, Tomorrow, Alarm, Calendar, Moment"],
  ["Memory", "Photograph, Childhood, Song, Smell, Yearbook, Souvenir, Story"],
  ["Dreams", "Stars, Sleep, Goal, Imagination, Future, Wish, Adventure"],
  ["Choices", "Crossroads, Menu, College, Door, Vote, Coin Toss, Fork"],
  ["Adventure", "Road Trip, Mountain, Jungle, Ocean, Backpack, Map, Unknown"],
  ["Travel", "Airplane, Passport, Train, Road Trip, Suitcase, Hotel, Map"],
  ["School", "Homework, Locker, Teacher, Lunch, Test, Graduation, Recess"],
  ["Childhood", "Playground, Bicycle, Cartoon, Toy, Recess, Birthday, Blanket"],
  ["Family", "Dinner, Sibling, Grandparent, Tradition, Reunion, Home, Photograph"],
  ["Home", "Doorstep, Kitchen, Bedroom, Backyard, Neighbor, Couch, Key"],
  ["Food", "Pizza, Taco, Chocolate, Pancake, Sushi, Popcorn, Ice Cream"],
  ["Cooking", "Recipe, Oven, Spice, Cake, Knife, Experiment, Leftovers"],
  ["Music", "Guitar, Chorus, Beat, Piano, Concert, Playlist, Drum"],
  ["Movies", "Hero, Villain, Sequel, Popcorn, Director, Plot Twist, Credits"],
  ["Television", "Sitcom, Finale, Remote, Commercial, Binge, Episode, Reality Show"],
  ["Books", "Chapter, Bookmark, Library, Character, Ending, Mystery, Cover"],
  ["Games", "Chess, Monopoly, Hide-and-Seek, Tag, Cards, Puzzle, Minecraft"],
  ["Sports", "Basketball, Soccer, Tennis, Baseball, Swimming, Football, Gymnastics"],
  ["Technology", "Smartphone, Robot, Drone, Algorithm, Laptop, Virtual Reality, Chatbot"],
  ["Internet", "Meme, Search, Wi-Fi, Viral, Password, Website, Influencer"],
  ["Social Media", "Like, Follow, Selfie, Trending, Comment, Hashtag, Scroll"],
  ["Artificial Intelligence", "Robot, Chatbot, Algorithm, Deepfake, Assistant, Automation, Prompt"],
  ["Inventions", "Wheel, Lightbulb, Telephone, Airplane, Internet, Printing Press, Compass"],
  ["Transportation", "Bicycle, Train, Airplane, Subway, Skateboard, Car, Boat"],
  ["Space", "Moon, Mars, Rocket, Alien, Satellite, Star, Astronaut"],
  ["Ocean", "Wave, Shark, Island, Shipwreck, Coral, Submarine, Lighthouse"],
  ["Weather", "Rain, Snow, Tornado, Sunshine, Lightning, Fog, Rainbow"],
  ["Nature", "Forest, River, Mountain, Desert, Flower, Waterfall, Ocean"],
  ["Animals", "Dog, Elephant, Dolphin, Eagle, Tiger, Penguin, Horse"],
  ["Pets", "Dog, Cat, Goldfish, Hamster, Parrot, Rabbit, Turtle"],
  ["Seasons", "Summer, Winter, Spring, Autumn, Snow Day, Heat Wave, First Bloom"],
  ["Colors", "Red, Blue, Green, Yellow, Purple, Black, White"],
  ["Numbers", "One, Zero, Seven, Thirteen, Hundred, Million, Infinity"],
  ["Shapes", "Circle, Triangle, Square, Spiral, Line, Cube, Star"],
  ["Sounds", "Whisper, Thunder, Applause, Laughter, Alarm, Silence, Echo"],
  ["Light", "Sunrise, Candle, Spotlight, Flashlight, Neon, Firefly, Lighthouse"],
  ["Darkness", "Midnight, Shadow, Cave, Blackout, Eclipse, Night, Mystery"],
  ["Fire", "Candle, Campfire, Spark, Wildfire, Fireplace, Match, Fireworks"],
  ["Water", "Rain, River, Ocean, Puddle, Ice, Waterfall, Tear"],
  ["Mountains", "Summit, Climb, Everest, Trail, Avalanche, View, Base Camp"],
  ["Roads", "Highway, Detour, Intersection, Dead End, Shortcut, Bridge, Journey"],
  ["Doors", "Key, Knock, Entrance, Exit, Locked, Opportunity, Welcome"],
  ["Bridges", "Connection, River, Crossing, Collapse, Distance, Cooperation, Repair"],
  ["Keys", "Lock, Piano, Password, Car, Answer, Treasure, Freedom"],
  ["Mirrors", "Reflection, Identity, Truth, Appearance, Crack, Image, Perspective"],
  ["Masks", "Costume, Identity, Protection, Disguise, Theater, Secret, Halloween"],
  ["Shoes", "Sneakers, Boots, High Heels, Cleats, Slippers, Footprints, Laces"],
  ["Clothing", "Uniform, Jacket, Hat, Costume, Tie, Jeans, Shoes"],
  ["Money", "Dollar, Allowance, Investment, Wallet, Tip, Savings, Lottery"],
  ["Shopping", "Cart, Sale, Receipt, Mall, Online, Coupon, Return"],
  ["Work", "Boss, Deadline, Interview, Paycheck, Promotion, Break, Team"],
  ["Careers", "Doctor, Teacher, Engineer, Artist, Lawyer, Chef, Pilot"],
  ["Learning", "Mistake, Question, Teacher, Practice, Book, Experiment, Curiosity"],
  ["Tests", "Quiz, Final, Score, Study, Guess, Pressure, Pencil"],
  ["Graduation", "Cap, Diploma, Stage, Goodbye, Future, Speech, Celebration"],
  ["Beginnings", "Sunrise, First Day, Blank Page, Seed, Hello, Opening, Birth"],
  ["Endings", "Sunset, Goodbye, Finish Line, Credits, Graduation, Last Page, Farewell"],
  ["Mystery", "Clue, Shadow, Detective, Locked Door, Footprint, Secret, Disappearance"],
  ["Surprise", "Birthday, Gift, Plot Twist, Visitor, Announcement, Confetti, Knock"],
  ["Luck", "Four-Leaf Clover, Dice, Coin, Lottery, Horseshoe, Chance, Fortune Cookie"],
  ["Risk", "Cliff, Investment, Audition, Leap, Gamble, Adventure, Question"],
  ["Rules", "Referee, Speed Limit, Classroom, Game, Curfew, Dress Code, Honor Code"],
  ["Rebellion", "Rule, Protest, Teenager, Revolution, Refusal, Independence, Outsider"],
  ["Tradition", "Holiday, Recipe, Ceremony, Family, Festival, Heirloom, Reunion"],
  ["Celebration", "Birthday, Graduation, Wedding, Victory, Fireworks, Cake, Parade"],
  ["Holidays", "Halloween, Thanksgiving, Christmas, New Year, Valentine's Day, Fourth of July, Birthday"],
  ["Gifts", "Surprise, Wrapping, Birthday, Handmade, Flowers, Money, Thank You"],
  ["Humor", "Joke, Meme, Prank, Comedy, Laughter, Pun, Awkwardness"],
  ["Silence", "Library, Secret, Night, Pause, Awkwardness, Reflection, Protest"],
  ["Noise", "Concert, Traffic, Alarm, Crowd, Thunder, Construction, Stadium"],
  ["Speed", "Racecar, Cheetah, Deadline, Internet, Sprint, Rocket, Fast Food"],
  ["Slow", "Turtle, Traffic, Waiting, Growth, Sunday, Loading Screen, Snail"],
  ["Strength", "Muscle, Courage, Bridge, Team, Weight, Resilience, Foundation"],
  ["Weakness", "Crack, Fear, Temptation, Achilles Heel, Doubt, Fatigue, Blind Spot"],
  ["Growth", "Seed, Child, Business, Tree, Skill, Friendship, City"],
  ["Simplicity", "Minimalism, Pencil, Sandwich, Routine, Plain White Shirt, One Word, Quiet"],
  ["Complexity", "Maze, Computer, Brain, City, Puzzle, Relationship, Clock"],
  ["Identity", "Name, Mirror, Culture, Voice, Uniform, Nickname, Fingerprint"],
  ["Reputation", "Rumor, Review, First Impression, Mistake, Trust, Fame, Comeback"],
  ["Influence", "Teacher, Celebrity, Friend, Advertisement, Algorithm, Parent, Coach"],
  ["Power", "Electricity, Leadership, Money, Strength, Microphone, Crown, Knowledge"],
  ["Pressure", "Deadline, Test, Crowd, Expectations, Diamond, Competition, Interview"],
  ["Stress", "Homework, Traffic, Deadline, Alarm, Email, Exam, Schedule"],
  ["Relaxation", "Beach, Nap, Music, Hammock, Book, Walk, Weekend"],
  ["Energy", "Coffee, Lightning, Crowd, Battery, Workout, Sun, Music"],
  ["Motivation", "Coach, Goal, Reward, Rival, Dream, Deadline, Progress"],
  ["Inspiration", "Teacher, Story, Sunrise, Quote, Music, Hero, Challenge"],
  ["Progress", "First Step, Upgrade, Record, Construction, Practice, Innovation, Milestone"],
  ["Problems", "Puzzle, Traffic, Argument, Broken Phone, Deadline, Leak, Wrong Turn"],
  ["Solutions", "Tool, Conversation, Map, Bandage, Calculator, Compromise, Idea"],
  ["Questions", "Why, Who, What, When, Where, How, What If"],
  ["Answers", "Yes, No, Maybe, Explanation, Discovery, Guess, Truth"],
  ["Secrets", "Diary, Password, Whisper, Surprise Party, Hidden Door, Confession, Treasure"],
  ["Truth", "Evidence, Mirror, Confession, Fact, Witness, Honesty, Reality"],
  ["Lies", "Excuse, Rumor, Bluff, Disguise, Fake, Secret, Alibi"],
  ["Perspective", "Window, Camera, Shoes, Map, Mirror, Distance, Angle"],
  ["Decisions", "Crossroads, College, Menu, Career, Team, Purchase, Yes"],
  ["Consequences", "Domino, Detention, Reward, Regret, Ripple, Scar, Lesson"],
  ["Second Chances", "Retry, Apology, Comeback, Rematch, Rewrite, Recovery, Forgiveness"],
  ["Forgiveness", "Apology, Friendship, Mistake, Family, Grudge, Second Chance, Peace"],
  ["Loyalty", "Dog, Friend, Team, Family, Fan, Promise, Country"],
  ["Independence", "First Car, College, Moving Out, Choice, Job, Travel, Keys"],
  ["Community", "Neighborhood, School, Team, Festival, Library, Volunteer, Park"],
  ["Service", "Volunteer, Coach, Nurse, Firefighter, Tutor, Donation, Neighbor"],
  ["Competition vs. Cooperation", "Relay, Group Project, Rival, Orchestra, Debate, Business, Team"],
  ["Old vs. New", "Book, Smartphone, Vinyl, Electric Car, Tradition, Fashion, AI"],
  ["Real vs. Fake", "Deepfake, Knockoff, Smile, News, Diamond, Friend, Photograph"],
  ["Order vs. Chaos", "Desk, Traffic, Schedule, Storm, Classroom, Closet, City"],
  ["Head vs. Heart", "Career, Friendship, Purchase, Competition, Relationship, Risk, Dream"],
  ["Nature vs. Technology", "Forest, Robot, Farm, Smartphone, River, Drone, Garden"],
  ["Individual vs. Team", "Solo, Orchestra, Captain, Relay, Group Project, Star Player, Crew"],
  ["Past vs. Future", "Yearbook, Time Machine, Tradition, AI, Childhood, Mars, Memory"],
  ["Quality vs. Quantity", "Friends, Food, Practice, Money, Followers, Books, Sleep"],
  ["Winning vs. Learning", "Trophy, Mistake, Rematch, Exam, Tournament, Practice, Failure"],
].map(([theme, topics]) => ({
  theme,
  topics: topics.split(",").map((topic) => topic.trim()),
}));

const extempQuestions: ExtempQuestion[] = [
  ["USX · Government", "How should states respond to the growing use of artificial intelligence in election misinformation?"],
  ["USX · Government", "What role should the federal government play in administering U.S. elections?"],
  ["USX · Government", "How could disputes over voter verification affect confidence in the 2026 midterm elections?"],
  ["USX · Government", "Should Congress establish national standards for the use of AI-generated political content?"],
  ["USX · Government", "How should the United States balance election security with state control of elections?"],
  ["USX · Government", "What should Congress do to strengthen public confidence in election administration?"],
  ["USX · Government", "How significant will federal-state legal disputes be for American governance over the next several years?"],
  ["USX · Government", "Should Congress place greater limits on presidential emergency powers?"],
  ["USX · Government", "How should Congress respond to disputes over presidential control of federal agencies?"],
  ["USX · Government", "What reforms would most strengthen the independence of federal institutions?"],
  ["USX · Economy", "What should be the Federal Reserve's highest priority in responding to renewed inflation?"],
  ["USX · Economy", "How will elevated energy prices affect the U.S. economy?"],
  ["USX · Economy", "Can the Federal Reserve reduce inflation without significantly weakening economic growth?"],
  ["USX · Economy", "How serious a problem are rising long-term borrowing costs for the United States?"],
  ["USX · Economy", "What should Congress do about the growth of the federal debt?"],
  ["USX · Economy", "How should the United States respond to a prolonged period of high interest rates?"],
  ["USX · Economy", "Are current fiscal policies making inflation harder for the Federal Reserve to control?"],
  ["USX · Economy", "What is the best way for the United States to reduce its vulnerability to global energy shocks?"],
  ["USX · Economy", "How should policymakers respond to growing consumer concern about the cost of living?"],
  ["USX · Economy", "Will artificial intelligence meaningfully improve U.S. productivity growth?"],
  ["USX · Technology", "Does the United States need a comprehensive federal law regulating frontier artificial intelligence?"],
  ["USX · Technology", "How should Congress balance AI innovation and AI safety?"],
  ["USX · Technology", "Should advanced AI systems be subject to mandatory independent safety testing?"],
  ["USX · Technology", "How should the United States regulate AI-generated deepfakes?"],
  ["USX · Technology", "Should AI developers receive special antitrust exemptions for safety cooperation?"],
  ["USX · Technology", "How should copyright law apply to the training of generative AI models?"],
  ["USX · Technology", "What should the United States do to maintain its AI advantage over China?"],
  ["USX · Technology", "Should federal or state governments take the lead in regulating artificial intelligence?"],
  ["USX · Technology", "What regulatory framework should the United States adopt for cryptocurrency?"],
  ["USX · Technology", "How should schools prepare students for an economy increasingly shaped by artificial intelligence?"],
  ["USX · Immigration", "What should be the future of U.S. birthright citizenship policy?"],
  ["USX · Immigration", "How should the United States reform its legal immigration system?"],
  ["USX · Immigration", "What should determine how long international students may remain in the United States?"],
  ["USX · Immigration", "How can the United States attract international students while enforcing immigration law?"],
  ["USX · Immigration", "Should Congress create a new path to legal status for long-term undocumented residents?"],
  ["USX · Immigration", "How should the United States address labor shortages through immigration policy?"],
  ["USX · Immigration", "What role should states have in shaping national immigration enforcement?"],
  ["USX · Immigration", "How should American universities respond to changing federal immigration policies?"],
  ["USX · Immigration", "What should be the federal government's role in higher education?"],
  ["USX · Immigration", "How should American schools adapt their academic-integrity policies to generative AI?"],
  ["USX · Energy", "What should the future U.S. electricity mix look like?"],
  ["USX · Energy", "Should the federal government establish nationwide limits on power-sector carbon emissions?"],
  ["USX · Energy", "How should the United States balance energy affordability and climate goals?"],
  ["USX · Energy", "What role should nuclear power play in U.S. energy policy?"],
  ["USX · Energy", "Should the United States accelerate domestic critical-mineral production?"],
  ["USX · Energy", "How should the United States regulate deep-sea mining?"],
  ["USX · Energy", "Can the United States expand AI data centers without putting excessive pressure on electricity grids?"],
  ["USX · Energy", "How should the United States strengthen its power grid against extreme weather and cyberattacks?"],
  ["USX · Energy", "What should federal policy do to encourage domestic solar manufacturing?"],
  ["USX · Energy", "How should policymakers address water scarcity in the American West?"],
  ["USX · Foreign Policy", "What should be the United States' highest priority in its relationship with China?"],
  ["USX · Foreign Policy", "How should Washington approach negotiations with Beijing over artificial intelligence?"],
  ["USX · Foreign Policy", "What strategy should the United States pursue toward Russia and Ukraine?"],
  ["USX · Foreign Policy", "How should Congress define its role in authorizing prolonged U.S. military operations?"],
  ["USX · Foreign Policy", "What should U.S. policy toward Iran prioritize?"],
  ["USX · Foreign Policy", "How should the United States respond to rising competition in the Arctic?"],
  ["USX · Foreign Policy", "Should the United States rely more heavily on allies for collective defense?"],
  ["USX · Foreign Policy", "How should Washington respond to growing BRICS cooperation?"],
  ["USX · Foreign Policy", "What reforms should the United States support at the World Trade Organization?"],
  ["USX · Foreign Policy", "How should the United States balance tariffs, industrial policy, and free trade?"],
  ["IX · Europe", "What would be required for a durable Russia-Ukraine ceasefire?"],
  ["IX · Europe", "Can an agreement protecting energy infrastructure become a pathway toward broader negotiations between Russia and Ukraine?"],
  ["IX · Europe", "How should Europe respond if the war in Ukraine remains prolonged?"],
  ["IX · Europe", "What role should NATO play in protecting critical infrastructure near Russia?"],
  ["IX · Europe", "How should Europe strengthen the security of the Baltic region?"],
  ["IX · Europe", "Can Europe develop a more independent defense strategy?"],
  ["IX · Europe", "How should the international community protect the Zaporizhzhia nuclear power plant?"],
  ["IX · Europe", "What does the changing security environment mean for the future of the Arctic?"],
  ["IX · Europe", "Should European governments continue expanding defense spending?"],
  ["IX · Europe", "How should Europe balance security concerns with economic relations involving Russia?"],
  ["IX · Middle East", "What would be required to make the Gaza ceasefire sustainable?"],
  ["IX · Middle East", "How can Israel and Hamas move from a ceasefire toward a durable political settlement?"],
  ["IX · Middle East", "What should be the international community's priority in Gaza?"],
  ["IX · Middle East", "How can renewed conflict between Israel and Hezbollah be prevented?"],
  ["IX · Middle East", "What would be required to stabilize Lebanon?"],
  ["IX · Middle East", "How should Gulf countries respond to threats to regional energy infrastructure?"],
  ["IX · Middle East", "What role should outside powers play in reducing tensions involving Iran?"],
  ["IX · Middle East", "How can international shipping routes in the Middle East be better protected?"],
  ["IX · Middle East", "What would a durable regional security framework in the Middle East require?"],
  ["IX · Middle East", "How can humanitarian access be protected during continuing regional conflicts?"],
  ["IX · East Asia", "Can China rebalance its economy toward stronger domestic consumption?"],
  ["IX · East Asia", "How sustainable is China's AI-driven industrial expansion?"],
  ["IX · East Asia", "How should China manage the risks posed by increasingly capable artificial intelligence?"],
  ["IX · East Asia", "Can U.S.-China negotiations establish meaningful rules for frontier AI?"],
  ["IX · East Asia", "What would improve relations between China and India?"],
  ["IX · East Asia", "How should China respond to slowing domestic investment?"],
  ["IX · East Asia", "What role will China play in shaping the future of BRICS?"],
  ["IX · East Asia", "How should Asian economies respond to intensifying technology competition between China and the United States?"],
  ["IX · East Asia", "What can reduce tensions across the Taiwan Strait?"],
  ["IX · East Asia", "How will climate-related disasters affect East Asian security and economic planning?"],
  ["IX · Global South", "Can India prevent China from becoming the dominant power within BRICS?"],
  ["IX · Global South", "What does BRICS expansion mean for the international economic system?"],
  ["IX · Global South", "Can BRICS develop viable alternatives to Western-dominated financial institutions?"],
  ["IX · Global South", "Will increased trade in local currencies significantly change global finance?"],
  ["IX · Global South", "How should India balance relations with China, Russia, and the United States?"],
  ["IX · Global South", "Can improving China-India relations produce meaningful economic cooperation?"],
  ["IX · Global South", "What role should BRICS play in Middle East diplomacy?"],
  ["IX · Global South", "How can India translate diplomatic influence into greater global economic influence?"],
  ["IX · Global South", "Should emerging economies push for major reforms of global financial institutions?"],
  ["IX · Global South", "Can the Global South maintain common positions despite major differences among its governments?"],
  ["IX · Africa & Latin America", "How can Sudan's humanitarian crisis receive more sustainable international support?"],
  ["IX · Africa & Latin America", "What could bring Sudan's civil conflict closer to resolution?"],
  ["IX · Africa & Latin America", "Can the G20 Common Framework become an effective tool for sovereign-debt restructuring?"],
  ["IX · Africa & Latin America", "How should Senegal approach its debt restructuring?"],
  ["IX · Africa & Latin America", "What would successful debt restructuring mean for Ethiopia's economy?"],
  ["IX · Africa & Latin America", "How should the Democratic Republic of Congo manage disputes over constitutional reform?"],
  ["IX · Africa & Latin America", "What should be the next stage of Colombia's implementation of the FARC peace accord?"],
  ["IX · Africa & Latin America", "How can Latin American governments reduce the influence of transnational criminal organizations?"],
  ["IX · Africa & Latin America", "How should Brazil manage the economic effects of high global oil prices?"],
  ["IX · Africa & Latin America", "What role should outside powers play in Venezuela's political and economic transition?"],
  ["IX · Global Institutions", "Can the World Trade Organization adapt to an era of industrial policy and geopolitical competition?"],
  ["IX · Global Institutions", "How can the global trading system avoid fragmentation into competing blocs?"],
  ["IX · Global Institutions", "Should WTO decision-making rules be reformed?"],
  ["IX · Global Institutions", "How should international institutions respond to rising sovereign debt?"],
  ["IX · Global Institutions", "Can the G20 accelerate debt relief for developing economies?"],
  ["IX · Global Institutions", "How should Europe manage migration while protecting asylum obligations?"],
  ["IX · Global Institutions", "Will overseas migrant return centers become a major part of European migration policy?"],
  ["IX · Global Institutions", "How should governments prepare workers for widespread adoption of artificial intelligence?"],
  ["IX · Global Institutions", "Can international cooperation keep pace with the development of frontier AI?"],
  ["IX · Global Institutions", "How should governments balance climate policy, energy security, and economic growth?"],
].map(([category, question]) => ({ category, question }));

const allocationOptions = [
  { prep: 0, delivery: 420 },
  { prep: 60, delivery: 360 },
  { prep: 120, delivery: 300 },
  { prep: 180, delivery: 240 },
  { prep: 240, delivery: 180 },
];

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function uniqueDraw<T>(items: T[], count: number, key: (item: T) => string = String) {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < count && pool.length) {
    const index = Math.floor(Math.random() * pool.length);
    const [item] = pool.splice(index, 1);
    if (!picked.some((existing) => key(existing) === key(item))) {
      picked.push(item);
    }
  }
  return picked;
}

function useAudio() {
  const contextRef = useRef<AudioContext | null>(null);

  const getContext = () => {
    if (typeof window === "undefined") return null;
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    if (!contextRef.current) contextRef.current = new AudioCtor();
    if (contextRef.current.state === "suspended") void contextRef.current.resume();
    return contextRef.current;
  };

  const playTone = (frequency: number, duration = 0.12, type: OscillatorType = "sine", gain = 0.055) => {
    const ctx = getContext();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    volume.gain.setValueAtTime(0.0001, ctx.currentTime);
    volume.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.018);
    volume.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.connect(volume);
    volume.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration + 0.03);
  };

  return {
    unlock: getContext,
    ding: () => {
      playTone(720, 0.11, "sine", 0.045);
      window.setTimeout(() => playTone(960, 0.16, "triangle", 0.035), 70);
    },
    countdown: (final = false) => playTone(final ? 280 : 440, final ? 0.18 : 0.09, "sine", final ? 0.05 : 0.035),
  };
}

function useCountdownTimer({
  seconds,
  active,
  onComplete,
  onWarningSecond,
  timerKey,
}: {
  seconds: number;
  active: boolean;
  onComplete: (elapsed: number) => void;
  onWarningSecond?: (second: number) => void;
  timerKey: string;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const startRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const warningRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!active) return undefined;
    completedRef.current = false;
    warningRef.current = new Set();
    startRef.current = performance.now();
    setRemaining(seconds);

    const tick = () => {
      const elapsed = (performance.now() - startRef.current) / 1000;
      const next = Math.max(0, seconds - elapsed);
      setRemaining(next);
      const rounded = Math.ceil(next);
      if (onWarningSecond && rounded <= 5 && rounded >= 1 && !warningRef.current.has(rounded)) {
        warningRef.current.add(rounded);
        onWarningSecond(rounded);
      }
      if (next <= 0) {
        if (!completedRef.current) {
          completedRef.current = true;
          onWarningSecond?.(0);
          onComplete(seconds);
        }
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [active, seconds, onComplete, onWarningSecond, timerKey]);

  const finishNow = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    const elapsed = Math.min(seconds, Math.max(0, (performance.now() - startRef.current) / 1000));
    onComplete(elapsed);
  };

  return { remaining, finishNow, progress: seconds ? (seconds - remaining) / seconds : 1 };
}

function TimerPanel({
  label,
  seconds,
  buttonLabel,
  onComplete,
  onWarningSecond,
  topic,
  timerKey,
}: {
  label: string;
  seconds: number;
  buttonLabel?: string;
  onComplete: (elapsed: number) => void;
  onWarningSecond?: (second: number) => void;
  topic?: string;
  timerKey: string;
}) {
  const { remaining, finishNow, progress } = useCountdownTimer({
    seconds,
    active: true,
    onComplete,
    onWarningSecond,
    timerKey,
  });
  const urgent = remaining <= 5 && remaining > 0;

  return (
    <section className={`timer-stage ${urgent ? "urgent" : ""}`}>
      {topic ? (
        <div className="topic-banner">
          <span>Your {topic.endsWith("?") ? "question" : "topic"}</span>
          <strong>{topic}</strong>
        </div>
      ) : null}
      <div className="timer-card">
        <div className="timer-ring" style={{ "--progress": `${Math.min(1, Math.max(0, progress)) * 360}deg` } as React.CSSProperties}>
          <div>
            <span>{label}</span>
            <strong>{formatTime(remaining)}</strong>
          </div>
        </div>
        {buttonLabel ? (
          <button className="secondary big-action" type="button" onClick={finishNow}>
            {buttonLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SelectionTimer({
  onComplete,
  onWarningSecond,
  timerKey,
}: {
  onComplete: () => void;
  onWarningSecond: (second: number) => void;
  timerKey: string;
}) {
  const { remaining, progress } = useCountdownTimer({
    seconds: 30,
    active: true,
    onComplete,
    onWarningSecond,
    timerKey,
  });
  const urgent = remaining <= 5 && remaining > 0;
  return (
    <div className={`selection-timer ${urgent ? "urgent" : ""}`}>
      <span>Choose before time expires</span>
      <strong>{formatTime(remaining)}</strong>
      <div className="thin-progress">
        <i style={{ transform: `scaleX(${Math.max(0, 1 - progress)})` }} />
      </div>
    </div>
  );
}

function DeliveryCountdown({
  onDone,
  onWarningSecond,
}: {
  onDone: () => void;
  onWarningSecond: (second: number) => void;
}) {
  const { remaining } = useCountdownTimer({
    seconds: 5,
    active: true,
    onComplete: onDone,
    onWarningSecond,
    timerKey: "delivery-countdown",
  });
  const count = Math.max(1, Math.ceil(remaining));

  return (
    <section className="countdown-screen">
      <p>Preparation complete</p>
      <h1>It&apos;s time to deliver.</h1>
      <div className="countdown-number" data-count={count}>
        {count}
      </div>
    </section>
  );
}

function SlotWindows({
  items,
  activeIndex,
  large,
}: {
  items: SlotItem[];
  activeIndex: number | null;
  large?: boolean;
}) {
  return (
    <div className={`slot-stack ${large ? "large" : ""}`}>
      {items.map((item, index) => (
        <div className={`slot-window ${activeIndex === index ? "spinning" : ""} ${item.value !== "—" ? "resolved" : ""}`} key={`${index}-${item.value}`}>
          {item.label ? <span>{item.label}</span> : null}
          <strong>{activeIndex === index ? <i>{item.value}</i> : item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InstructionBlock({ children }: { children: React.ReactNode }) {
  return <div className="instruction-copy">{children}</div>;
}

export default function SpeechStudio() {
  const audio = useAudio();
  const [screen, setScreen] = useState<Screen>("landing");
  const [round, setRound] = useState<RoundState>(initialRound);
  const [allocationIndex, setAllocationIndex] = useState(2);
  const [themeDisplay, setThemeDisplay] = useState("READY");
  const [themeSpinning, setThemeSpinning] = useState(false);
  const [slotItems, setSlotItems] = useState<SlotItem[]>([{ value: "—" }, { value: "—" }, { value: "—" }]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [lockedChoice, setLockedChoice] = useState("");

  const modeLabel = round.mode === "impromptu" ? "Impromptu Speaking" : round.mode === "extemp" ? "Extemporaneous Speaking" : "";
  const isDarkPhase = ["topicSelect", "impromptuPrep", "deliveryCountdown", "impromptuDelivery", "questionSelect", "extempPrep", "extempDelivery", "results"].includes(screen);

  const setAllocatedTime = (index: number) => {
    const picked = allocationOptions[index];
    setAllocationIndex(index);
    setRound((current) => ({
      ...current,
      prepSecondsAllocated: picked.prep,
      deliverySecondsAllocated: picked.delivery,
    }));
  };

  const goHome = () => {
    setScreen("landing");
    setRound(initialRound);
    setThemeDisplay("READY");
    setSlotItems([{ value: "—" }, { value: "—" }, { value: "—" }]);
    setActiveSlot(null);
    setLockedChoice("");
  };

  const startMode = (mode: EventMode) => {
    audio.unlock();
    setRound({ ...initialRound, mode });
    setThemeDisplay("READY");
    setSlotItems([{ value: "—" }, { value: "—" }, { value: "—" }]);
    setActiveSlot(null);
    setLockedChoice("");
    setScreen(mode === "impromptu" ? "impromptuIntro" : "extempIntro");
  };

  const practiceAgain = () => {
    if (round.mode === "impromptu") {
      setRound((current) => ({
        ...initialRound,
        mode: "impromptu",
        prepSecondsAllocated: current.prepSecondsAllocated,
        deliverySecondsAllocated: current.deliverySecondsAllocated,
      }));
      setThemeDisplay("READY");
      setSlotItems([{ value: "—" }, { value: "—" }, { value: "—" }]);
      setScreen("timeAllocation");
    } else {
      setRound({ ...initialRound, mode: "extemp", prepSecondsAllocated: 1800, deliverySecondsAllocated: 420 });
      setSlotItems([{ value: "—" }, { value: "—" }, { value: "—" }]);
      setScreen("questionSpin");
    }
  };

  const spinTheme = () => {
    if (themeSpinning) return;
    audio.unlock();
    setThemeSpinning(true);
    const chosen = randomItem(themeBank);
    let iterations = 0;
    const interval = window.setInterval(() => {
      iterations += 1;
      setThemeDisplay(randomItem(themeBank).theme);
      if (iterations > 22) {
        window.clearInterval(interval);
        setThemeDisplay(chosen.theme);
        setRound((current) => ({ ...current, impromptuTheme: chosen.theme }));
        setThemeSpinning(false);
        audio.ding();
        window.setTimeout(() => setScreen("themeResult"), 650);
      }
    }, 72 + Math.min(iterations * 8, 90));
  };

  const spinSequentialSlots = (items: SlotItem[], nextScreen: Screen) => {
    audio.unlock();
    setSlotItems([{ value: "—" }, { value: "—" }, { value: "—" }]);
    setLockedChoice("");

    items.forEach((item, index) => {
      window.setTimeout(() => setActiveSlot(index), index * 1450);
      window.setTimeout(() => {
        setSlotItems((current) => current.map((slot, slotIndex) => (slotIndex === index ? item : slot)));
        setActiveSlot(null);
        audio.ding();
        if (index === items.length - 1) {
          window.setTimeout(() => setScreen(nextScreen), 900);
        }
      }, index * 1450 + 1180);
    });
  };

  const spinTopics = () => {
    const theme = themeBank.find((item) => item.theme === round.impromptuTheme) || randomItem(themeBank);
    const topics = uniqueDraw(theme.topics, 3);
    setRound((current) => ({ ...current, topicOptions: topics }));
    spinSequentialSlots(topics.map((topic) => ({ value: topic })), "topicSelect");
  };

  const spinQuestions = () => {
    const questions = uniqueDraw(extempQuestions, 3, (question) => question.question);
    setRound((current) => ({
      ...current,
      questionOptions: questions,
      prepSecondsAllocated: 1800,
      deliverySecondsAllocated: 420,
    }));
    spinSequentialSlots(
      questions.map((question) => ({ value: question.question, label: question.category })),
      "questionSelect",
    );
  };

  const chooseTopic = (topic: string) => {
    setLockedChoice(topic);
    window.setTimeout(() => {
      setRound((current) => ({ ...current, selectedTopic: topic, roundStartTime: Date.now() }));
      setScreen(round.prepSecondsAllocated === 0 ? "deliveryCountdown" : "impromptuPrep");
    }, 280);
  };

  const chooseQuestion = (question: ExtempQuestion) => {
    setLockedChoice(question.question);
    window.setTimeout(() => {
      setRound((current) => ({ ...current, selectedQuestion: question, roundStartTime: Date.now() }));
      setScreen("extempPrep");
    }, 280);
  };

  const handlePrepComplete = (elapsed: number) => {
    setRound((current) => ({ ...current, prepSecondsUsed: Math.round(elapsed) }));
    setScreen("deliveryCountdown");
  };

  const handleDeliveryComplete = (elapsed: number) => {
    setRound((current) => ({ ...current, deliverySecondsUsed: Math.round(elapsed) }));
    setScreen("results");
  };

  const warningTone = (second: number) => audio.countdown(second === 0);

  const selectedPrompt = round.mode === "extemp" ? round.selectedQuestion?.question || "" : round.selectedTopic;

  const content = useMemo(() => {
    switch (screen) {
      case "landing":
        return (
          <section className="hero">
            <p className="eyebrow">NSDA practice studio</p>
            <h1>Speech Studio</h1>
            <p className="lede">Practice under pressure.</p>
            <div className="hero-actions">
              <button className="ghost-card" type="button" aria-disabled="true" onClick={audio.unlock}>
                <span>Table Topic Mode</span>
                <small>Coming soon</small>
              </button>
              <button className="primary-card" type="button" onClick={() => setScreen("events")}>
                <span>NSDA Mode</span>
                <small>Impromptu and Extemp rounds</small>
              </button>
            </div>
          </section>
        );
      case "events":
        return (
          <section className="narrow">
            <p className="eyebrow">Choose your event</p>
            <h1>Choose your event</h1>
            <div className="event-grid">
              <button className="event-card" type="button" onClick={() => startMode("extemp")}>
                <span>Extemporaneous Speaking</span>
                <small>Research. Analyze. Persuade.</small>
              </button>
              <button className="event-card" type="button" onClick={() => startMode("impromptu")}>
                <span>Impromptu Speaking</span>
                <small>Think quickly. Speak clearly.</small>
              </button>
            </div>
          </section>
        );
      case "impromptuIntro":
        return (
          <section className="reading">
            <h1>Welcome to Impromptu Speaking</h1>
            <InstructionBlock>
              <p>You will receive three possible topics and choose one to speak about.</p>
              <p>Your goal is to quickly develop a clear central idea, organize your thoughts, and deliver a complete speech with an introduction, body, and conclusion.</p>
              <p>You have <strong>7 total minutes for preparation and delivery</strong>.</p>
              <p>Before beginning, you will choose how to divide that time: <strong>0:00 + 7:00</strong>, <strong>1:00 + 6:00</strong>, <strong>2:00 + 5:00</strong>, <strong>3:00 + 4:00</strong>, or <strong>4:00 + 3:00</strong>.</p>
              <p>First, you will spin for a <strong>theme</strong>. Then, three topics related to your theme will be generated one at a time.</p>
              <p>Once all three topics appear, you will have <strong>30 seconds to choose</strong>. If time expires, the first topic will be selected automatically.</p>
              <p>After choosing a topic, your preparation timer begins. When preparation ends, you will receive a <strong>5-second countdown</strong> before delivery begins.</p>
            </InstructionBlock>
            <button className="primary" type="button" onClick={() => setScreen("timeAllocation")}>Next</button>
          </section>
        );
      case "timeAllocation":
        return (
          <section className="allocation">
            <p className="eyebrow">Impromptu setup</p>
            <h1>Divide your seven minutes</h1>
            <p className="lede">Choose how much time you want to prepare.</p>
            <div className="allocation-display">
              <div>
                <span>Prep</span>
                <strong>{formatTime(round.prepSecondsAllocated)}</strong>
              </div>
              <div className="balance-line" aria-hidden="true" />
              <div>
                <span>Delivery</span>
                <strong>{formatTime(round.deliverySecondsAllocated)}</strong>
              </div>
            </div>
            <input
              aria-label="Preparation time"
              className="time-slider"
              type="range"
              min="0"
              max="4"
              step="1"
              value={allocationIndex}
              onChange={(event) => setAllocatedTime(Number(event.target.value))}
            />
            <div className="slider-labels" aria-hidden="true">
              <span>0:00</span>
              <span>1:00</span>
              <span>2:00</span>
              <span>3:00</span>
              <span>4:00</span>
            </div>
            <button className="primary" type="button" onClick={() => setScreen("themeSpin")}>Continue</button>
          </section>
        );
      case "themeSpin":
        return (
          <section className="spin-screen">
            <p className="eyebrow">Theme draw</p>
            <h1>Spin for your theme</h1>
            <p className="lede">Your topic choices will be based on the theme you draw.</p>
            <div className={`theme-reel ${themeSpinning ? "spinning" : ""}`}>
              <strong>{themeDisplay}</strong>
            </div>
            <button className="primary" type="button" onClick={spinTheme} disabled={themeSpinning}>Spin</button>
          </section>
        );
      case "themeResult":
        return (
          <section className="result-reveal">
            <p>Your theme is</p>
            <h1>{round.impromptuTheme}</h1>
            <button className="primary" type="button" onClick={() => setScreen("topicSpin")}>Next</button>
          </section>
        );
      case "topicSpin":
        return (
          <section className="spin-screen">
            <p className="eyebrow">Topic draw</p>
            <h1>Spin for your topics</h1>
            <p className="lede">Three topics. One choice.</p>
            <SlotWindows items={slotItems} activeIndex={activeSlot} />
            <button className="primary" type="button" onClick={spinTopics} disabled={activeSlot !== null || slotItems.some((slot) => slot.value !== "—")}>Spin</button>
          </section>
        );
      case "topicSelect":
        return (
          <section className="choice-screen">
            <SelectionTimer timerKey={`topic-${round.topicOptions.join("|")}`} onComplete={() => chooseTopic(round.topicOptions[0])} onWarningSecond={warningTone} />
            <h1>Your choices are</h1>
            <div className="choice-grid">
              {round.topicOptions.map((topic) => (
                <button className={lockedChoice === topic ? "choice-card locked" : "choice-card"} type="button" key={topic} onClick={() => chooseTopic(topic)} disabled={Boolean(lockedChoice)}>
                  {topic}
                </button>
              ))}
            </div>
          </section>
        );
      case "impromptuPrep":
        return (
          <TimerPanel
            label="Preparation"
            seconds={round.prepSecondsAllocated}
            buttonLabel="I'm done"
            topic={round.selectedTopic}
            timerKey={`impromptu-prep-${round.selectedTopic}`}
            onComplete={handlePrepComplete}
            onWarningSecond={warningTone}
          />
        );
      case "deliveryCountdown":
        return (
          <DeliveryCountdown
            onDone={() => setScreen(round.mode === "extemp" ? "extempDelivery" : "impromptuDelivery")}
            onWarningSecond={warningTone}
          />
        );
      case "impromptuDelivery":
        return (
          <TimerPanel
            label="Delivery"
            seconds={round.deliverySecondsAllocated}
            buttonLabel="I'm done"
            topic={round.selectedTopic}
            timerKey={`impromptu-delivery-${round.selectedTopic}`}
            onComplete={handleDeliveryComplete}
            onWarningSecond={warningTone}
          />
        );
      case "extempIntro":
        return (
          <section className="reading">
            <h1>Welcome to Extemporaneous Speaking</h1>
            <InstructionBlock>
              <p>Extemporaneous Speaking challenges you to answer a question about an important current event with a clear, organized, evidence-based speech.</p>
              <p>You will receive <strong>three current-events questions</strong> and choose the question you want to answer.</p>
              <p>You have <strong>30 seconds to select your question</strong>. If you do not choose before time expires, the first question will automatically be selected.</p>
              <p>Once your question is selected, your <strong>30-minute preparation period</strong> begins.</p>
              <p>Use your preparation time to research the issue, decide on a direct answer, organize your main points, and identify evidence and examples that support your argument.</p>
              <p>When preparation ends, you will receive a <strong>5-second countdown</strong>. You will then have <strong>7 minutes</strong> to deliver your speech.</p>
            </InstructionBlock>
            <button className="primary" type="button" onClick={() => setScreen("questionSpin")}>Next</button>
          </section>
        );
      case "questionSpin":
        return (
          <section className="spin-screen">
            <p className="eyebrow">Extemp draw</p>
            <h1>Draw your questions</h1>
            <p className="lede">Three questions will be selected from the current-events bank.</p>
            <SlotWindows items={slotItems} activeIndex={activeSlot} large />
            <button className="primary" type="button" onClick={spinQuestions} disabled={activeSlot !== null || slotItems.some((slot) => slot.value !== "—")}>Spin</button>
          </section>
        );
      case "questionSelect":
        return (
          <section className="choice-screen question-choice">
            <SelectionTimer timerKey={`question-${round.questionOptions.map((question) => question.question).join("|")}`} onComplete={() => chooseQuestion(round.questionOptions[0])} onWarningSecond={warningTone} />
            <h1>Choose your question</h1>
            <div className="choice-grid questions">
              {round.questionOptions.map((question) => (
                <button className={lockedChoice === question.question ? "choice-card locked" : "choice-card"} type="button" key={question.question} onClick={() => chooseQuestion(question)} disabled={Boolean(lockedChoice)}>
                  <span>{question.category}</span>
                  {question.question}
                </button>
              ))}
            </div>
          </section>
        );
      case "extempPrep":
        return (
          <TimerPanel
            label="Preparation"
            seconds={1800}
            buttonLabel="I'm done"
            topic={selectedPrompt}
            timerKey={`extemp-prep-${selectedPrompt}`}
            onComplete={handlePrepComplete}
            onWarningSecond={warningTone}
          />
        );
      case "extempDelivery":
        return (
          <TimerPanel
            label="Delivery"
            seconds={420}
            buttonLabel="I'm done"
            topic={selectedPrompt}
            timerKey={`extemp-delivery-${selectedPrompt}`}
            onComplete={handleDeliveryComplete}
            onWarningSecond={warningTone}
          />
        );
      case "results":
        return (
          <section className="results">
            <p className="eyebrow">Round complete</p>
            <h1>Round complete.</h1>
            <p className="lede">Good job. You completed an {round.mode === "extemp" ? "Extemporaneous Speaking" : "Impromptu"} round.</p>
            <div className="summary-card">
              <SummaryRow label="Event" value={modeLabel} />
              {round.mode === "impromptu" ? (
                <>
                  <SummaryRow label="Theme" value={round.impromptuTheme} />
                  <SummaryRow label="Topic" value={round.selectedTopic} />
                  <SummaryRow label="Prep allocation" value={formatTime(round.prepSecondsAllocated)} />
                  <SummaryRow label="Delivery allocation" value={formatTime(round.deliverySecondsAllocated)} />
                </>
              ) : (
                <>
                  <SummaryRow label="Question" value={round.selectedQuestion?.question || ""} />
                  <SummaryRow label="Preparation available" value="30:00" />
                  <SummaryRow label="Delivery available" value="7:00" />
                </>
              )}
              <SummaryRow label="Preparation used" value={formatTime(round.prepSecondsUsed)} />
              <SummaryRow label="Delivery used" value={formatTime(round.deliverySecondsUsed)} />
            </div>
            <div className="button-row">
              <button className="primary" type="button" onClick={practiceAgain}>Practice Again</button>
              <button className="secondary" type="button" onClick={() => setScreen("events")}>Back to Events</button>
            </div>
          </section>
        );
      default:
        return null;
    }
  }, [screen, round, allocationIndex, activeSlot, slotItems, lockedChoice, themeDisplay, themeSpinning]);

  return (
    <main className={`app-shell ${isDarkPhase ? "dark-phase" : ""}`}>
      <div className="ambient" aria-hidden="true" />
      {screen !== "landing" ? (
        <header className="app-header">
          <button className="wordmark" type="button" onClick={goHome} aria-label="Return home">
            <span>Speech</span> Studio
          </button>
          <div>{modeLabel}</div>
          <button className="home-button" type="button" onClick={goHome}>Home</button>
        </header>
      ) : null}
      <div className="screen-frame" key={screen}>
        {content}
      </div>
    </main>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
