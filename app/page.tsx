"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseUrl } from "./supabaseClient";

type EventMode = "impromptu" | "extemp";
type Screen =
  | "landing"
  | "eventsAuth"
  | "events"
  | "signIn"
  | "settings"
  | "impromptuIntro"
  | "timeAllocation"
  | "themeSpin"
  | "themeResult"
  | "topicSpin"
  | "topicSelect"
  | "impromptuPrep"
  | "deliveryCountdown"
  | "impromptuDelivery"
  | "analyzing"
  | "extempIntro"
  | "questionSpin"
  | "questionSelect"
  | "extempPrep"
  | "extempDelivery"
  | "results"
  | "vaultAnalysis";

// impromptu scores organization/analysis/delivery; extemp scores
// argumentationAnalysis/sourceConsideration/delivery. Only 3 of these 5 keys
// are ever populated on a given AnalysisResult, depending on mode.
type CategoryKey = "organization" | "analysis" | "delivery" | "argumentationAnalysis" | "sourceConsideration";
type WeakAxis = CategoryKey | "grammar" | "vocab";
type GrammarSubcategory = "agreement" | "verbTense" | "sentenceStructure" | "wordUsage";
type Section = "opening" | "body" | "closing";

interface CategoryResult {
  stars: number;
  takeaway: string;
}

interface SentenceTip {
  text: string;
  section: Section;
  weakAxis: WeakAxis | null;
  tip: string | null;
  example: string | null;
  errorSpan: string | null;
  grammarSubcategory: GrammarSubcategory[] | null;
}

interface WordCallout {
  word: string;
  count: number;
  reason: string;
}

type TaggedWord = WordCallout & { tone: "power" | "weak" };

type AnalysisTab = "scorecard" | "structure" | "words" | "grammar";

interface SectionTip {
  title: string;
  body: string;
  example: string;
}

interface Scorecard {
  stars: number;
  title: string;
  description: string;
}

interface GrammarBreakdown {
  agreement: number;
  verbTense: number;
  sentenceStructure: number;
  wordUsage: number;
}

interface AnalysisResult {
  categories: Partial<Record<CategoryKey, CategoryResult>>;
  grammarBreakdown: GrammarBreakdown;
  grammarSummary: string;
  vocabSummary: string;
  scorecard: Scorecard;
  fillerCount: number;
  pauseCount: number;
  wordsPerMinute: number;
  sentences: SentenceTip[];
  sectionTips: Record<Section, SectionTip>;
  powerWords: WordCallout[];
  weakWords: WordCallout[];
  idealStructure: { opening: number; body: number; closing: number };
  yourStructure: { opening: number; body: number; closing: number };
  topic: string;
  keyTakeawayTip: string;
}

interface TranscriptSentenceTiming {
  text: string;
  start: number;
  end: number;
}

interface TranscriptData {
  paragraphs?: Array<{
    sentences?: TranscriptSentenceTiming[];
  }>;
}

interface VaultRecording {
  id: string;
  prompt: string;
  mode: EventMode;
  duration_seconds: number | null;
  transcript: string | null;
  transcript_data: TranscriptData | null;
  audio_url: string | null;
  analysis: AnalysisResult | null;
  created_at: string;
}


type AnalyzingStage = "uploading" | "transcribing" | "analyzing";

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
  analysis: AnalysisResult | null;
  analysisTranscript: string;
  analysisTranscriptData: TranscriptData | null;
  analysisAudioUrl: string;
  analysisError: string | null;
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
  analysis: null,
  analysisTranscript: "",
  analysisTranscriptData: null,
  analysisAudioUrl: "",
  analysisError: null,
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

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Speech Brigade",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any",
  url: "https://speech-studio-nsda.zeldatf2potato.chatgpt.site",
  creator: {
    "@type": "Person",
    name: "JD Hopper",
    url: "https://www.jdhopper.org",
  },
  audience: [
    {
      "@type": "EducationalAudience",
      educationalRole: "student",
    },
    {
      "@type": "EducationalAudience",
      educationalRole: "teacher",
    },
    {
      "@type": "EducationalAudience",
      educationalRole: "coach",
    },
  ],
  about: [
    "National Speech & Debate Association practice",
    "Extemporaneous Speaking",
    "Impromptu Speaking",
    "high school speech and debate",
    "college public speaking practice",
  ],
  description:
    "A polished speaking practice web app for schools, high school students, college students, teachers, and coaches preparing for National Speech & Debate Association Extemporaneous Speaking and Impromptu Speaking rounds.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

function formatTime(totalSeconds: number) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
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
    press: () => {
      playTone(360, 0.045, "triangle", 0.026);
      window.setTimeout(() => playTone(520, 0.055, "sine", 0.018), 32);
    },
    slotTick: () => {
      playTone(180 + Math.random() * 70, 0.035, "square", 0.018);
    },
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

function StarRating({ value }: { value: number }) {
  const stars = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="star-rating" aria-label={`${stars} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <i key={index} className={index < stars ? "filled" : ""}>
          ★
        </i>
      ))}
    </span>
  );
}

const categoryLabels: Record<CategoryKey, string> = {
  organization: "Organization",
  analysis: "Analysis",
  delivery: "Delivery",
  argumentationAnalysis: "Argumentation and Analysis",
  sourceConsideration: "Source Consideration",
};

const CATEGORY_ORDER_BY_MODE: Record<EventMode, CategoryKey[]> = {
  impromptu: ["organization", "analysis", "delivery"],
  extemp: ["argumentationAnalysis", "sourceConsideration", "delivery"],
};

const weakAxisLabels: Record<WeakAxis, string> = {
  organization: "Organization",
  analysis: "Analysis",
  delivery: "Delivery",
  argumentationAnalysis: "Argumentation and Analysis",
  sourceConsideration: "Source Consideration",
  grammar: "Grammar",
  vocab: "Vocab",
};

function StructureBar({
  ideal,
  yours,
}: {
  ideal: { opening: number; body: number; closing: number };
  yours: { opening: number; body: number; closing: number };
}) {
  const sections: Array<{ key: Section; label: string }> = [
    { key: "opening", label: "Opening" },
    { key: "body", label: "Body" },
    { key: "closing", label: "Closing" },
  ];
  return (
    <div className="structure-sandwich">
      <div className="structure-column">
        <span className="structure-column-label">Ideal</span>
        <div className="structure-stack">
          {sections.map(({ key, label }) => (
            <div key={key} className={`structure-block filled ${key}`} style={{ flexGrow: Math.max(ideal[key], 4) }}>
              <span>
                {label} · {ideal[key]}%
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="structure-column">
        <span className="structure-column-label">Yours</span>
        <div className="structure-stack">
          {sections.map(({ key, label }) => {
            const missing = yours[key] <= 2;
            return (
              <div
                key={key}
                className={`structure-block ${missing ? "missing" : `outline ${key}`}`}
                style={{ flexGrow: Math.max(yours[key], 8) }}
              >
                <span>{missing ? "Missing" : `${label} · ${yours[key]}%`}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function TranscriptCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className="transcript-copy-button" onClick={handleCopy} aria-label="Copy transcript">
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

function alignSentenceTimestamps(sentences: SentenceTip[], transcriptData: TranscriptData | null): Map<SentenceTip, string> {
  const timedSentences: TranscriptSentenceTiming[] = transcriptData?.paragraphs?.flatMap((p) => p.sentences || []) || [];
  const map = new Map<SentenceTip, string>();
  let cursor = 0;
  sentences.forEach((sentence) => {
    const target = sentence.text.trim();
    for (let i = cursor; i < timedSentences.length; i++) {
      if (timedSentences[i].text.trim() === target) {
        map.set(sentence, formatClock(timedSentences[i].start));
        cursor = i + 1;
        break;
      }
    }
  });
  return map;
}

function SectionedTranscript({
  sentences,
  timestamps,
  pauseCount,
  wordsPerMinute,
  transcriptText,
  renderSentence,
  renderSectionFooter,
}: {
  sentences: SentenceTip[];
  timestamps: Map<SentenceTip, string>;
  pauseCount: number;
  wordsPerMinute: number;
  transcriptText: string;
  renderSentence: (sentence: SentenceTip, key: string) => React.ReactNode;
  renderSectionFooter?: (section: Section) => React.ReactNode;
}) {
  if (!sentences.length) return null;
  const sections: Section[] = ["opening", "body", "closing"];
  return (
    <div className="transcript-card">
      <div className="transcript-header">
        <div className="transcript-header-pills">
          <span className="transcript-label">Transcript</span>
          <span className="transcript-pill">
            {pauseCount} {pauseCount === 1 ? "Pause" : "Pauses"}
          </span>
          <span className="transcript-pill">{wordsPerMinute} WPM</span>
        </div>
        <TranscriptCopyButton text={transcriptText} />
      </div>
      <div className="sentence-list">
        {sections.map((section) => {
          const items = sentences.filter((sentence) => sentence.section === section);
          if (!items.length) return null;
          return (
            <div className="sentence-section" key={section}>
              <h4>{section}</h4>
              {items.map((sentence, index) => {
                const key = `${section}-${index}`;
                return (
                  <div className="sentence-row-wrap" key={key}>
                    <span className="sentence-timestamp">{timestamps.get(sentence) || "—"}</span>
                    <div className="sentence-row-body">{renderSentence(sentence, key)}</div>
                  </div>
                );
              })}
              {renderSectionFooter ? renderSectionFooter(section) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlainSentence({ text, keyId }: { text: string; keyId: string }) {
  return (
    <p className="sentence-row plain" key={keyId}>
      {text}
    </p>
  );
}

function TipPopover({
  label,
  correction,
  rewrite,
  description,
  isPinned = false,
  onClose,
}: {
  label: string;
  correction?: { before: string; after: string } | null;
  rewrite?: string | null;
  description?: string | null;
  isPinned?: boolean;
  onClose?: () => void;
}) {
  return (
    <span className={`tip-popover ${isPinned ? "pinned" : ""}`} role="tooltip">
      <span className="tip-popover-head">
        <span className="tip-popover-label">{label}</span>
        {onClose ? (
          <button
            type="button"
            className="tip-popover-close"
            aria-label="Dismiss tip"
            onClick={(event) => {
              onClose?.();
              event.currentTarget.blur();
            }}
          >
            ×
          </button>
        ) : null}
      </span>
      {correction ? (
        <p className="tip-popover-correction">
          <s>{correction.before}</s>
          <span aria-hidden="true"> → </span>
          <strong>{correction.after}</strong>
        </p>
      ) : rewrite ? (
        <p className="tip-popover-rewrite">{rewrite}</p>
      ) : null}
      {description ? <p className="tip-popover-desc">{description}</p> : null}
    </span>
  );
}

function getCorrectedSpan(text: string, errorSpan: string, example: string): string {
  const index = text.indexOf(errorSpan);
  if (index === -1) return example;
  const prefix = text.slice(0, index);
  const suffix = text.slice(index + errorSpan.length);
  if (example.startsWith(prefix) && example.endsWith(suffix) && example.length >= prefix.length + suffix.length) {
    return example.slice(prefix.length, example.length - suffix.length);
  }
  return example;
}

function FlaggedSentence({
  sentence,
  keyId,
  openKey,
  setOpenKey,
  grammarOnly,
}: {
  sentence: SentenceTip;
  keyId: string;
  openKey: string | null;
  setOpenKey: (key: string | null) => void;
  grammarOnly?: boolean;
}) {
  const isFlagged = grammarOnly ? sentence.weakAxis === "grammar" : Boolean(sentence.weakAxis);
  if (!isFlagged || !sentence.weakAxis) {
    return <PlainSentence text={sentence.text} keyId={keyId} />;
  }

  const axis = sentence.weakAxis;
  const isPinned = openKey === keyId;
  const label = `${weakAxisLabels[axis]} tip`;
  const close = () => setOpenKey(null);
  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isPinned) event.currentTarget.blur();
    setOpenKey(isPinned ? null : keyId);
  };

  if (axis === "grammar" && sentence.errorSpan) {
    const index = sentence.text.indexOf(sentence.errorSpan);
    if (index !== -1) {
      const before = sentence.text.slice(0, index);
      const after = sentence.text.slice(index + sentence.errorSpan.length);
      const corrected = sentence.example ? getCorrectedSpan(sentence.text, sentence.errorSpan, sentence.example) : sentence.errorSpan;
      return (
        <div className="sentence-row plain" key={keyId}>
          {before}
          <span className="flag-anchor">
            <button type="button" className="axis-pill span grammar" aria-expanded={isPinned} onClick={toggle}>
              {sentence.errorSpan}
            </button>
            <TipPopover
              label={label}
              correction={{ before: sentence.errorSpan, after: corrected }}
              description={sentence.tip}
              isPinned={isPinned}
              onClose={close}
            />
          </span>
          {after}
        </div>
      );
    }
  }

  return (
    <div className="sentence-row flagged" key={keyId}>
      <span className="flag-anchor">
        <button type="button" className={`axis-pill sentence ${axis}`} aria-expanded={isPinned} onClick={toggle}>
          {sentence.text}
        </button>
        <TipPopover label={label} rewrite={sentence.example} description={sentence.tip} isPinned={isPinned} onClose={close} />
      </span>
    </div>
  );
}

function highlightWordsInSentence(text: string, taggedWords: TaggedWord[], idPrefix: string) {
  if (!taggedWords.length) return text;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sorted = [...taggedWords].sort((a, b) => b.word.length - a.word.length);
  const pattern = new RegExp(`\\b(${sorted.map((word) => escape(word.word)).join("|")})\\b`, "gi");
  const parts = text.split(pattern);
  let matchCount = 0;
  return parts.map((part, index) => {
    const match = taggedWords.find((word) => word.word.toLowerCase() === part.toLowerCase());
    if (!match) return <span key={index}>{part}</span>;
    const id = `${idPrefix}-${matchCount}`;
    matchCount += 1;
    return (
      <span className="flag-anchor" key={id}>
        <span className={`word-mark ${match.tone}`} tabIndex={0}>
          {part}
        </span>
        <TipPopover label={match.tone === "power" ? "Power word" : "Weak word"} description={match.reason} />
      </span>
    );
  });
}

function CategoryAccordion({
  categories,
  categoryKeys,
}: {
  categories: Partial<Record<CategoryKey, CategoryResult>>;
  categoryKeys: CategoryKey[];
}) {
  const [openKey, setOpenKey] = useState<CategoryKey | null>(categoryKeys[0] ?? null);
  return (
    <div className="category-accordion">
      {categoryKeys.map((key) => {
        const isOpen = openKey === key;
        const result = categories[key];
        if (!result) return null;
        return (
          <div className={`accordion-row ${isOpen ? "open" : ""}`} key={key}>
            <button
              type="button"
              className="accordion-head"
              aria-expanded={isOpen}
              onClick={() => setOpenKey(isOpen ? null : key)}
            >
              <span className={`accordion-label ${key}`}>{categoryLabels[key]}</span>
              <StarRating value={result.stars} />
              <span className="accordion-chevron" aria-hidden="true">⌄</span>
            </button>
            {isOpen ? <p className="accordion-body">{result.takeaway}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

function WordListCard({ title, words, tone }: { title: string; words: WordCallout[]; tone: "power" | "weak" }) {
  const total = words.reduce((sum, word) => sum + word.count, 0);
  return (
    <div className={`word-list-card ${tone}`}>
      <div className="word-list-head">
        <h3>{title}</h3>
        <span className="word-count-badge">
          {total} {total === 1 ? "word" : "words"}
        </span>
      </div>
      {words.length ? (
        <div className="word-chip-cloud">
          {words.map((word) => (
            <span className={`word-chip ${tone}`} key={word.word} title={word.reason}>
              {word.word} <em>×{word.count}</em>
            </span>
          ))}
        </div>
      ) : (
        <p className="word-list-empty">None flagged.</p>
      )}
    </div>
  );
}

const grammarBucketInfo: Array<{ key: keyof GrammarBreakdown; label: string }> = [
  { key: "agreement", label: "Agreement" },
  { key: "verbTense", label: "Verb tense" },
  { key: "sentenceStructure", label: "Sentence structure" },
  { key: "wordUsage", label: "Word usage" },
];

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

function GrammarSummaryCard({ breakdown, summary }: { breakdown: GrammarBreakdown; summary: string }) {
  const total = breakdown.agreement + breakdown.verbTense + breakdown.sentenceStructure + breakdown.wordUsage;
  return (
    <div className="grammar-summary-card">
      <div className={`grammar-summary-banner ${total === 0 ? "clean" : "warn"}`}>
        <WarningIcon />
        <span>{total === 0 ? "No grammar issues found" : `${total} grammar issue${total === 1 ? "" : "s"} found`}</span>
      </div>
      <p className="grammar-summary-text">{summary}</p>
      <ul className="grammar-bucket-list">
        {grammarBucketInfo.map((bucket) => {
          const count = breakdown[bucket.key];
          return (
            <li key={bucket.key}>
              <span>{bucket.label}</span>
              <span className="grammar-bucket-count">{count === 0 ? "No issues" : `${count} issue${count === 1 ? "" : "s"}`}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M7 5v14l12-7z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z" fill="currentColor" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  );
}

function TypeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 5h14M12 5v14" />
    </svg>
  );
}

function SpellCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 16l4-11 4 11M5.5 12h5" />
      <path d="M14 12l3 3 5-6" />
    </svg>
  );
}

const TAB_CONFIG: Array<{ key: AnalysisTab; label: string; icon: React.ReactNode }> = [
  { key: "scorecard", label: "Speech Scorecard", icon: <ChartIcon /> },
  { key: "structure", label: "Structure Sandwich", icon: <LayersIcon /> },
  { key: "words", label: "Word Analysis", icon: <TypeIcon /> },
  { key: "grammar", label: "Grammar", icon: <SpellCheckIcon /> },
];

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return undefined;
    const onTime = () => setCurrentTime(audioEl.currentTime);
    const onLoaded = () => setDuration(audioEl.duration || 0);
    const onEnded = () => setIsPlaying(false);
    audioEl.addEventListener("timeupdate", onTime);
    audioEl.addEventListener("loadedmetadata", onLoaded);
    audioEl.addEventListener("ended", onEnded);
    return () => {
      audioEl.removeEventListener("timeupdate", onTime);
      audioEl.removeEventListener("loadedmetadata", onLoaded);
      audioEl.removeEventListener("ended", onEnded);
    };
  }, [src]);

  const toggle = () => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    if (audioEl.paused) {
      void audioEl.play();
      setIsPlaying(true);
    } else {
      audioEl.pause();
      setIsPlaying(false);
    }
  };

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const audioEl = audioRef.current;
    if (!audioEl || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audioEl.currentTime = ratio * duration;
    setCurrentTime(audioEl.currentTime);
  };

  const progress = duration ? currentTime / duration : 0;

  return (
    <div className="audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button type="button" className="audio-play-button" onClick={toggle} aria-label={isPlaying ? "Pause" : "Play"}>
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="audio-scrubber-wrap">
        <div className="audio-scrubber" onClick={seek}>
          <i style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="audio-times">
          <span>{formatClock(currentTime)}</span>
          <span>{formatClock(duration)}</span>
        </div>
      </div>
    </div>
  );
}

function ScorecardPanel({
  analysis,
  transcript,
  transcriptData,
  audioUrl,
  theme,
  mode,
}: {
  analysis: AnalysisResult;
  transcript: string;
  transcriptData: TranscriptData | null;
  audioUrl: string;
  theme: string;
  mode: EventMode;
}) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>("scorecard");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const switchTab = (tab: AnalysisTab) => {
    setActiveTab(tab);
    setOpenKey(null);
  };

  const taggedWords: TaggedWord[] = [
    ...analysis.powerWords.map((word) => ({ ...word, tone: "power" as const })),
    ...analysis.weakWords.map((word) => ({ ...word, tone: "weak" as const })),
  ];

  const sentenceTimestamps = alignSentenceTimestamps(analysis.sentences, transcriptData);

  return (
    <div className="analysis-page">
      <div className="verdict-card">
        <div className="verdict-score">
          <span>Score</span>
          <StarRating value={analysis.scorecard.stars} />
          <strong>{analysis.scorecard.stars} / 5</strong>
        </div>
        <div className="verdict-body">
          <h2>{analysis.scorecard.title}</h2>
          <p>{analysis.scorecard.description}</p>
        </div>
      </div>

      <div className="topic-card">
        {theme ? (
          <div className="topic-card-head">
            <span className="eyebrow">{theme}</span>
          </div>
        ) : null}
        <h2 className="topic-heading">{analysis.topic}</h2>
        {audioUrl ? <AudioPlayer src={audioUrl} /> : null}
      </div>

      <div className="metric-row">
        <div>
          <span>Words per minute</span>
          <strong>{analysis.wordsPerMinute}</strong>
        </div>
        <div>
          <span>Filler words</span>
          <strong>{analysis.fillerCount}</strong>
        </div>
        <div>
          <span>Pauses</span>
          <strong>{analysis.pauseCount}</strong>
        </div>
      </div>

      <div className="tab-bar" role="tablist">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`tab-button ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => switchTab(tab.key)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="tab-panel">
        {activeTab === "scorecard" ? (
          <>
            <CategoryAccordion categories={analysis.categories} categoryKeys={CATEGORY_ORDER_BY_MODE[mode]} />
            <SectionedTranscript
              sentences={analysis.sentences}
              timestamps={sentenceTimestamps}
              pauseCount={analysis.pauseCount}
              wordsPerMinute={analysis.wordsPerMinute}
              transcriptText={transcript}
              renderSentence={(sentence, key) => (
                <FlaggedSentence sentence={sentence} keyId={key} openKey={openKey} setOpenKey={setOpenKey} />
              )}
            />
            <div className="takeaway-callout">
              <span className="eyebrow">
                <SparkleIcon /> Biggest room for improvement
              </span>
              <p>{analysis.keyTakeawayTip}</p>
            </div>
          </>
        ) : null}

        {activeTab === "structure" ? (
          <>
            <StructureBar ideal={analysis.idealStructure} yours={analysis.yourStructure} />
            <SectionedTranscript
              sentences={analysis.sentences}
              timestamps={sentenceTimestamps}
              pauseCount={analysis.pauseCount}
              wordsPerMinute={analysis.wordsPerMinute}
              transcriptText={transcript}
              renderSentence={(sentence, key) => <PlainSentence text={sentence.text} keyId={key} />}
              renderSectionFooter={(section) => {
                const tip = analysis.sectionTips[section];
                return (
                  <details className="structure-tip-card" open>
                    <summary>
                      <span className="structure-tip-title">
                        <SparkleIcon /> {tip.title}
                      </span>
                      <span className="structure-tip-chevron" aria-hidden="true">
                        ⌄
                      </span>
                    </summary>
                    <p className="structure-tip-body">{tip.body}</p>
                    {tip.example ? (
                      <div className="structure-tip-example">
                        <span>Try saying</span>
                        <p>“{tip.example}”</p>
                      </div>
                    ) : null}
                  </details>
                );
              }}
            />
          </>
        ) : null}

        {activeTab === "words" ? (
          <>
            <p className="tab-summary-text">{analysis.vocabSummary}</p>
            <div className="word-analysis-grid">
              <WordListCard title="Weak Words" words={analysis.weakWords} tone="weak" />
              <WordListCard title="Power Words" words={analysis.powerWords} tone="power" />
            </div>
            <SectionedTranscript
              sentences={analysis.sentences}
              timestamps={sentenceTimestamps}
              pauseCount={analysis.pauseCount}
              wordsPerMinute={analysis.wordsPerMinute}
              transcriptText={transcript}
              renderSentence={(sentence, key) => (
                <div className="sentence-row plain" key={key}>
                  {highlightWordsInSentence(sentence.text, taggedWords, key)}
                </div>
              )}
            />
          </>
        ) : null}

        {activeTab === "grammar" ? (
          <>
            <GrammarSummaryCard breakdown={analysis.grammarBreakdown} summary={analysis.grammarSummary} />
            <SectionedTranscript
              sentences={analysis.sentences}
              timestamps={sentenceTimestamps}
              pauseCount={analysis.pauseCount}
              wordsPerMinute={analysis.wordsPerMinute}
              transcriptText={transcript}
              renderSentence={(sentence, key) => (
                <FlaggedSentence sentence={sentence} keyId={key} openKey={openKey} setOpenKey={setOpenKey} grammarOnly />
              )}
            />
          </>
        ) : null}
      </div>

      {transcript ? (
        <details className="transcript-disclosure">
          <summary>Full plain-text transcript</summary>
          <p>{transcript}</p>
        </details>
      ) : null}
    </div>
  );
}

const VAULT_MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatVaultDate(iso: string) {
  const date = new Date(iso);
  return `${VAULT_MONTH_ABBR[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function formatVaultDuration(seconds: number | null) {
  if (seconds == null) return "—";
  return `${Math.round(seconds)}s`;
}

function VaultCard({
  recording,
  roundNumber,
  onOpen,
}: {
  recording: VaultRecording;
  roundNumber: number;
  onOpen: (recording: VaultRecording) => void;
}) {
  const hasAnalysis = Boolean(recording.analysis);
  const content = (
    <>
      <div className="vault-card-head">
        <span className="vault-badge">Round {roundNumber}</span>
        <span className="vault-date">{formatVaultDate(recording.created_at)}</span>
      </div>
      <p className="vault-prompt">{recording.prompt}</p>
      <div className="vault-card-foot">
        <span className="vault-duration">{formatVaultDuration(recording.duration_seconds)}</span>
        {hasAnalysis ? (
          <span className="vault-analysis-pill">
            <SparkleIcon /> Analysis
          </span>
        ) : (
          <span className="vault-analysis-pending">No analysis</span>
        )}
      </div>
    </>
  );

  if (!hasAnalysis) {
    return <div className="vault-card disabled">{content}</div>;
  }

  return (
    <button type="button" className="vault-card" onClick={() => onOpen(recording)}>
      {content}
    </button>
  );
}

export default function SpeechBrigade() {
  const audio = useAudio();
  const [screen, setScreen] = useState<Screen>("vaultAnalysis");
  const [round, setRound] = useState<RoundState>(initialRound);
  const [allocationIndex, setAllocationIndex] = useState(2);
  const [themeDisplay, setThemeDisplay] = useState("READY");
  const [themeSpinning, setThemeSpinning] = useState(false);
  const [slotItems, setSlotItems] = useState<SlotItem[]>([{ value: "—" }, { value: "—" }, { value: "—" }]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [lockedChoice, setLockedChoice] = useState("");

  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authStatus, setAuthStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [authError, setAuthError] = useState("");
  const [analyzingStage, setAnalyzingStage] = useState<AnalyzingStage>("uploading");
  const [recordingError, setRecordingError] = useState("");
  const [vaultRecordings, setVaultRecordings] = useState<VaultRecording[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState("");
  const [activeVaultAnalysis, setActiveVaultAnalysis] = useState<{
    analysis: AnalysisResult;
    transcript: string;
    transcriptData: TranscriptData | null;
    audioUrl: string;
    mode: EventMode;
  } | null>({
    mode: "impromptu",
    analysis: {
      topic: "Laughter",
      scorecard: { stars: 2, title: "Needs real polish", description: "Test." },
      sentences: [
        { tip: null, text: "Laughter is the best medicine.", example: null, section: "opening", weakAxis: null, errorSpan: null, grammarSubcategory: null },
        { tip: "t", text: "Laughter.", example: "e", section: "opening", weakAxis: "delivery", errorSpan: null, grammarSubcategory: null },
        { tip: "t", text: "Laughter.", example: "e", section: "opening", weakAxis: "delivery", errorSpan: null, grammarSubcategory: null },
        { tip: "t", text: "Laughter.", example: "e", section: "opening", weakAxis: "delivery", errorSpan: null, grammarSubcategory: null },
        { tip: "t", text: "Laughter is the best medicine because laughter is oftentimes to be said what is the most necessary for people when they are in pain either mentally or physically.", example: "e", section: "body", weakAxis: "grammar", errorSpan: "is oftentimes to be said what is the most necessary", grammarSubcategory: ["wordUsage"] },
        { tip: "t", text: "It's very important to have laughter so that you are able to see the light of the situation.", example: "e", section: "body", weakAxis: "vocab", errorSpan: null, grammarSubcategory: null },
        { tip: "t", text: "People who are humorous usually live longer.", example: "e", section: "body", weakAxis: "analysis", errorSpan: null, grammarSubcategory: null },
        { tip: null, text: "If you're able to laugh at your own situation, then that means you're not taking yourself too seriously.", example: null, section: "body", weakAxis: null, errorSpan: null, grammarSubcategory: null },
        { tip: "t", text: "You see that there it's not the end of the world if something bad happened to you.", example: "e", section: "closing", weakAxis: "grammar", errorSpan: "that there it's not the end of the world if something bad happened", grammarSubcategory: ["verbTense"] },
      ],
      weakWords: [],
      categories: {
        analysis: { stars: 1, takeaway: "t" },
        delivery: { stars: 2, takeaway: "t" },
        organization: { stars: 2, takeaway: "t" },
      },
      pauseCount: 8,
      powerWords: [],
      fillerCount: 0,
      sectionTips: {
        body: { body: "b", title: "t", example: "e" },
        closing: { body: "b", title: "t", example: "e" },
        opening: { body: "b", title: "t", example: "e" },
      },
      vocabSummary: "v",
      yourStructure: { body: 75, closing: 17, opening: 8 },
      grammarSummary: "g",
      idealStructure: { body: 70, closing: 15, opening: 15 },
      keyTakeawayTip: "k",
      wordsPerMinute: 107,
      grammarBreakdown: { agreement: 0, verbTense: 1, wordUsage: 1, sentenceStructure: 2 },
    },
    transcript:
      "Laughter is the best medicine. Laughter. Laughter. Laughter. Laughter is the best medicine because laughter is oftentimes to be said what is the most necessary for people when they are in pain either mentally or physically. It's very important to have laughter so that you are able to see the light of the situation. People who are humorous usually live longer. If you're able to laugh at your own situation, then that means you're not taking yourself too seriously. You see that there it's not the end of the world if something bad happened to you.",
    transcriptData: {
      paragraphs: [
        {
          sentences: [
            { end: 5.44, text: "Laughter is the best medicine.", start: 2.3999999 },
            { end: 7.12, text: "Laughter.", start: 6.56 },
            { end: 7.52, text: "Laughter.", start: 7.12 },
            { end: 8.16, text: "Laughter.", start: 7.52 },
            { end: 28.064999, text: "Laughter is the best medicine because laughter is oftentimes to be said what is the most necessary for people when they are in pain either mentally or physically.", start: 8.559999 },
          ],
        },
        {
          sentences: [
            { end: 36.91, text: "It's very important to have laughter so that you are able to see the light of the situation.", start: 28.99 },
            { end: 41.39, text: "People who are humorous usually live longer.", start: 38.75 },
            { end: 48.545, text: "If you're able to laugh at your own situation, then that means you're not taking yourself too seriously.", start: 42.704998 },
            { end: 53.425, text: "You see that there it's not the end of the world if something bad happened to you.", start: 49.664997 },
          ],
        },
      ],
    },
    audioUrl: "",
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (screen === "eventsAuth" && session) {
      setScreen("events");
    }
    if (screen === "signIn" && session) {
      setScreen("settings");
    }
  }, [screen, session]);

  useEffect(() => {
    if (screen === "impromptuDelivery" || screen === "extempDelivery") {
      void startRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  useEffect(() => {
    if (screen !== "settings" || !session) return undefined;
    let cancelled = false;
    setVaultLoading(true);
    setVaultError("");
    supabase
      .from("recordings")
      .select("id, prompt, mode, duration_seconds, transcript, transcript_data, audio_url, analysis, created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setVaultError(error.message);
          setVaultRecordings([]);
        } else {
          setVaultRecordings((data || []) as VaultRecording[]);
        }
        setVaultLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [screen, session]);

  const openVaultAnalysis = (recording: VaultRecording) => {
    if (!recording.analysis) return;
    setActiveVaultAnalysis({
      analysis: recording.analysis,
      transcript: recording.transcript || "",
      transcriptData: recording.transcript_data || null,
      audioUrl: recording.audio_url || "",
      mode: recording.mode,
    });
    setScreen("vaultAnalysis");
  };

  const modeLabel = round.mode === "impromptu" ? "Impromptu Speaking" : round.mode === "extemp" ? "Extemporaneous Speaking" : "";
  const isDarkPhase = ["topicSelect", "impromptuPrep", "deliveryCountdown", "impromptuDelivery", "analyzing", "questionSelect", "extempPrep", "extempDelivery", "results", "vaultAnalysis"].includes(screen);

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
    setRecordingError("");
  };

  const startMode = (mode: EventMode) => {
    audio.unlock();
    setRound({ ...initialRound, mode });
    setThemeDisplay("READY");
    setSlotItems([{ value: "—" }, { value: "—" }, { value: "—" }]);
    setActiveSlot(null);
    setLockedChoice("");
    setRecordingError("");
    setScreen(mode === "impromptu" ? "impromptuIntro" : "extempIntro");
  };

  const sendMagicLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!authEmail.trim()) return;
    setAuthStatus("sending");
    setAuthError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
    if (error) {
      setAuthStatus("error");
      setAuthError(error.message);
      return;
    }
    setAuthStatus("sent");
  };

  const RECORDING_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

  const startRecording = async () => {
    setRecordingError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = RECORDING_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch (err) {
      setRecordingError(
        err instanceof Error ? err.message : "Microphone access was denied. Analysis will be skipped for this round.",
      );
    }
  };

  const stopRecording = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      const stream = mediaStreamRef.current;
      if (!recorder) {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream?.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        mediaStreamRef.current = null;
        resolve(blob.size > 0 ? blob : null);
      };
      if (recorder.state !== "inactive") recorder.stop();
      else resolve(null);
    });
  };

  const runAnalysisPipeline = async (blob: Blob, mode: EventMode, topic: string, durationSeconds: number) => {
    try {
      const {
        data: { session: activeSession },
      } = await supabase.auth.getSession();
      if (!activeSession) throw new Error("You need to be signed in to analyze a recording.");
      const token = activeSession.access_token;
      const userId = activeSession.user.id;

      setAnalyzingStage("uploading");
      const extension = blob.type.includes("mp4") ? "m4a" : "webm";
      const path = `${userId}/${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("impromptu-recordings")
        .upload(path, blob, { contentType: blob.type || "audio/webm" });
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from("impromptu-recordings").getPublicUrl(path);
      const audioUrl = publicUrlData.publicUrl;

      setAnalyzingStage("transcribing");
      const form = new FormData();
      form.append("audio", blob, `recording.${extension}`);
      const transcribeRes = await fetch(`${supabaseUrl}/functions/v1/transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const transcribeBody = await transcribeRes.json();
      if (!transcribeRes.ok) throw new Error(transcribeBody.error || "Transcription failed");
      const { transcript, transcriptData } = transcribeBody;

      const { data: recordingRow, error: insertError } = await supabase
        .from("recordings")
        .insert({
          user_id: userId,
          mode,
          prompt: topic,
          transcript,
          transcript_data: transcriptData,
          duration_seconds: durationSeconds,
          audio_url: audioUrl,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      setAnalyzingStage("analyzing");
      const analyzeRes = await fetch(`${supabaseUrl}/functions/v1/analyze-speech`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ recordingId: recordingRow.id }),
      });
      const analyzeBody = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeBody.error || "Analysis failed");

      setRound((current) => ({
        ...current,
        analysis: analyzeBody.analysis,
        analysisTranscript: transcript,
        analysisTranscriptData: transcriptData || null,
        analysisAudioUrl: audioUrl,
        analysisError: null,
      }));
    } catch (err) {
      setRound((current) => ({
        ...current,
        analysisError: err instanceof Error ? err.message : "Analysis failed. Please try again.",
      }));
    } finally {
      setScreen("results");
    }
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
      audio.slotTick();
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
    const tickIntervals: number[] = [];

    items.forEach((item, index) => {
      window.setTimeout(() => {
        setActiveSlot(index);
        audio.slotTick();
        tickIntervals[index] = window.setInterval(() => audio.slotTick(), 92);
      }, index * 1450);
      window.setTimeout(() => {
        if (tickIntervals[index]) window.clearInterval(tickIntervals[index]);
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
    const roundedElapsed = Math.round(elapsed);
    setRound((current) => ({ ...current, deliverySecondsUsed: roundedElapsed }));
    const mode = round.mode;
    if (!mode) {
      setScreen("results");
      return;
    }
    const topic = mode === "extemp" ? round.selectedQuestion?.question || "" : round.selectedTopic;
    stopRecording().then((blob) => {
      if (!blob) {
        setRound((current) => ({
          ...current,
          analysisError: recordingError || "No recording was captured, so analysis is unavailable.",
        }));
        setScreen("results");
        return;
      }
      setAnalyzingStage("uploading");
      setScreen("analyzing");
      void runAnalysisPipeline(blob, mode, topic, roundedElapsed);
    });
  };

  const warningTone = (second: number) => audio.countdown(second === 0);

  const selectedPrompt = round.mode === "extemp" ? round.selectedQuestion?.question || "" : round.selectedTopic;
  const playInteractionSound = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest("button:not(:disabled), a[href]")) return;
    audio.press();
  };

  const content = useMemo(() => {
    switch (screen) {
      case "landing":
        return (
          <section className="hero">
            <p className="eyebrow">National Speech & Debate Association practice studio</p>
            <h1>Speech Brigade</h1>
            <p className="lede">Practice under pressure.</p>
            <div className="hero-actions">
              <button className="ghost-card" type="button" aria-disabled="true" onClick={audio.unlock}>
                <span>Table Topic Mode</span>
                <small>Coming soon</small>
              </button>
              <button
                className="primary-card"
                type="button"
                onClick={() => setScreen(session ? "events" : "eventsAuth")}
              >
                <span>National Speech & Debate Association Mode</span>
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
      case "eventsAuth":
        return (
          <section className="narrow auth-screen">
            <p className="eyebrow">Sign in to continue</p>
            <h1>Sign in to your account</h1>
            <p className="lede">
              Sign in to your account, or sign up for a new one, to start a National Speech & Debate Association
              practice round.
            </p>
            {authStatus === "sent" ? (
              <div className="auth-sent">
                <p>
                  Check <strong>{authEmail}</strong> for a sign-in link. Opening it will bring you right back here,
                  signed in.
                </p>
                <button className="secondary" type="button" onClick={() => setAuthStatus("idle")}>
                  Use a different email
                </button>
              </div>
            ) : (
              <form className="auth-form" onSubmit={sendMagicLink}>
                <input
                  type="email"
                  required
                  placeholder="you@school.edu"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  aria-label="Email address"
                />
                <button className="primary" type="submit" disabled={authStatus === "sending"}>
                  {authStatus === "sending" ? "Sending…" : "Email me a magic link"}
                </button>
                {authStatus === "error" ? <p className="auth-error">{authError}</p> : null}
              </form>
            )}
            <button className="secondary" type="button" onClick={goHome}>
              Back
            </button>
          </section>
        );
      case "signIn":
        return (
          <section className="narrow auth-screen">
            <p className="eyebrow">Sign in</p>
            <h1>Sign in to Speech Brigade</h1>
            <p className="lede">
              Sign in with your email to save your recordings and access your account.
            </p>
            {authStatus === "sent" ? (
              <div className="auth-sent">
                <p>
                  Check <strong>{authEmail}</strong> for a sign-in link. Opening it will bring you right back here,
                  signed in.
                </p>
                <button className="secondary" type="button" onClick={() => setAuthStatus("idle")}>
                  Use a different email
                </button>
              </div>
            ) : (
              <form className="auth-form" onSubmit={sendMagicLink}>
                <input
                  type="email"
                  required
                  placeholder="you@school.edu"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  aria-label="Email address"
                />
                <button className="primary" type="submit" disabled={authStatus === "sending"}>
                  {authStatus === "sending" ? "Sending…" : "Email me a magic link"}
                </button>
                {authStatus === "error" ? <p className="auth-error">{authError}</p> : null}
              </form>
            )}
            <button className="secondary" type="button" onClick={goHome}>
              Back
            </button>
          </section>
        );
      case "settings":
        return (
          <section className="narrow auth-screen">
            <p className="eyebrow">Settings</p>
            <h1>Your account</h1>
            {session ? (
              <p className="lede">
                You&apos;re signed in as <strong>{session.user.email}</strong>.
              </p>
            ) : (
              <p className="lede">You&apos;re not signed in.</p>
            )}
            <button className="secondary" type="button" onClick={goHome}>
              Back
            </button>

            {session ? (
              <div className="vault-section">
                <h2 className="vault-heading">
                  Your <em>vault</em>
                </h2>
                {vaultLoading ? (
                  <p className="vault-status">Loading your recordings…</p>
                ) : vaultError ? (
                  <p className="vault-status error">{vaultError}</p>
                ) : vaultRecordings.length === 0 ? (
                  <p className="vault-status">No recordings yet — complete a round to see it here.</p>
                ) : (
                  <div className="vault-list">
                    {vaultRecordings.map((recording, index) => (
                      <VaultCard
                        key={recording.id}
                        recording={recording}
                        roundNumber={vaultRecordings.length - index}
                        onOpen={openVaultAnalysis}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}
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
          <>
            {recordingError ? (
              <p className="recording-notice error">Microphone unavailable — this round won&apos;t be scored.</p>
            ) : (
              <p className="recording-notice">
                <span className="record-dot" />
                Recording
              </p>
            )}
            <TimerPanel
              label="Delivery"
              seconds={round.deliverySecondsAllocated}
              buttonLabel="I'm done"
              topic={round.selectedTopic}
              timerKey={`impromptu-delivery-${round.selectedTopic}`}
              onComplete={handleDeliveryComplete}
              onWarningSecond={warningTone}
            />
          </>
        );
      case "analyzing":
        return (
          <section className="countdown-screen analyzing-screen">
            <div className="analyzing-spinner" />
            <p>Scoring your speech</p>
            <h1>
              {analyzingStage === "uploading"
                ? "Saving your recording…"
                : analyzingStage === "transcribing"
                  ? "Transcribing your speech…"
                  : "Analyzing with AI…"}
            </h1>
          </section>
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
          <>
            {recordingError ? (
              <p className="recording-notice error">Microphone unavailable — this round won&apos;t be scored.</p>
            ) : (
              <p className="recording-notice">
                <span className="record-dot" />
                Recording
              </p>
            )}
            <TimerPanel
              label="Delivery"
              seconds={420}
              buttonLabel="I'm done"
              topic={selectedPrompt}
              timerKey={`extemp-delivery-${selectedPrompt}`}
              onComplete={handleDeliveryComplete}
              onWarningSecond={warningTone}
            />
          </>
        );
      case "results":
        if (round.mode && round.analysis) {
          return (
            <section className="results">
              <button type="button" className="back-link" onClick={() => setScreen("events")}>
                ← Back to events
              </button>
              <ScorecardPanel
                analysis={round.analysis}
                transcript={round.analysisTranscript}
                transcriptData={round.analysisTranscriptData}
                audioUrl={round.analysisAudioUrl}
                theme={round.mode === "impromptu" ? round.impromptuTheme : round.selectedQuestion?.category || ""}
                mode={round.mode}
              />
              <div className="button-row">
                <button className="primary" type="button" onClick={practiceAgain}>Practice Again</button>
                <button className="secondary" type="button" onClick={() => setScreen("events")}>Back to Events</button>
              </div>
            </section>
          );
        }
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

            {round.analysisError ? (
              <div className="analysis-error-card">
                <span className="eyebrow">Analysis unavailable</span>
                <p>{round.analysisError}</p>
              </div>
            ) : null}

            <div className="button-row">
              <button className="primary" type="button" onClick={practiceAgain}>Practice Again</button>
              <button className="secondary" type="button" onClick={() => setScreen("events")}>Back to Events</button>
            </div>
          </section>
        );
      case "vaultAnalysis":
        if (!activeVaultAnalysis) {
          return (
            <section className="results">
              <p className="eyebrow">No recording selected</p>
              <button className="secondary" type="button" onClick={() => setScreen("settings")}>
                Back to your vault
              </button>
            </section>
          );
        }
        return (
          <section className="results">
            <button type="button" className="back-link" onClick={() => setScreen("settings")}>
              ← Back to your vault
            </button>
            <ScorecardPanel
              analysis={activeVaultAnalysis.analysis}
              transcript={activeVaultAnalysis.transcript}
              transcriptData={activeVaultAnalysis.transcriptData}
              audioUrl={activeVaultAnalysis.audioUrl}
              theme=""
              mode={activeVaultAnalysis.mode}
            />
          </section>
        );
      default:
        return null;
    }
  }, [
    screen,
    round,
    allocationIndex,
    activeSlot,
    slotItems,
    lockedChoice,
    themeDisplay,
    themeSpinning,
    session,
    authEmail,
    authStatus,
    authError,
    analyzingStage,
    recordingError,
    vaultRecordings,
    vaultLoading,
    vaultError,
    activeVaultAnalysis,
  ]);

  return (
    <main className={`app-shell ${isDarkPhase ? "dark-phase" : ""}`} onPointerDownCapture={playInteractionSound}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="ambient" aria-hidden="true" />
      <header className="app-header">
        {screen === "landing" ? (
          <>
            <div />
            <div />
          </>
        ) : (
          <>
            <button className="wordmark" type="button" onClick={goHome} aria-label="Return home">
              <span>Speech</span> Brigade
            </button>
            <div>{modeLabel}</div>
          </>
        )}
        {session ? (
          <button className="home-button" type="button" onClick={() => setScreen("settings")}>
            Settings
          </button>
        ) : (
          <button
            className="home-button"
            type="button"
            onClick={() => setScreen("signIn")}
          >
            {screen === "landing" ? "Sign Up" : "Sign In"}
          </button>
        )}
      </header>
      <div className="screen-frame" key={screen}>
        {content}
      </div>
      <a
        className="creator-float"
        href="https://www.jdhopper.org"
        aria-label="Click to learn more about website creator JD Hopper"
      >
        <span className="creator-copy">Click To Learn More About Website Creator <u>JD Hopper</u></span>
      </a>
    </main>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
