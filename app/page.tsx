"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase, supabaseUrl } from "./supabaseClient";
import { TopicSpinner, TopicSpinnerGroup } from "./TopicSpinner";

type EventMode = "impromptu" | "extemp";
type PreparedEventId = "oo" | "inf" | "di" | "hi" | "duo" | "poi";
type AnalysisMode = EventMode | PreparedEventId;
type PreparedEventCategory = "prepared" | "interpretation";
type CompletionStatus = "manual" | "expired";
type SpeakingGameId = "hotSeat" | "wordFusion" | "storyRelay" | "landPlane" | "threeTwoOne" | "weighing";
type Screen =
  | "landing"
  | "gamesSelection"
  | "gameSetup"
  | "gameRounds"
  | "gameResults"
  | "eventsAuth"
  | "events"
  | "preparedEventIntro"
  | "preparedResults"
  | "signIn"
  | "settings"
  | "pastSpeeches"
  | "impromptuIntro"
  | "planSpeech"
  | "recordSpeech"
  | "analyzing"
  | "extempIntro"
  | "results"
  | "vaultAnalysis"
  | "rules"
  | "rulesDetail";

// Matches the impromptu-recordings bucket's file_size_limit (15 MB), which is stricter than
// the transcribe function's own 20 MB cap, so oversized recordings are caught before uploading.
const MAX_RECORDING_BYTES = 15 * 1024 * 1024;
const RECORDING_TOO_LARGE_MESSAGE = "Congrats! You spoke so much we can't handle it. Try a bit shorter.";

// Mid-flow screens (spins, countdowns, timers, recording, auth redirects) never get their own
// browser history entry, so going back skips over them to the last screen the user chose.
const TRANSIENT_SCREENS = new Set<Screen>([
  "gameRounds",
  "eventsAuth",
  "signIn",
  "planSpeech",
  "recordSpeech",
  "analyzing",
]);

// Current analyses use organization/analysis/delivery for every event.
// The legacy Extemp keys remain here so older saved rounds still render.
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
  mode: AnalysisMode;
  duration_seconds: number | null;
  transcript: string | null;
  transcript_data: TranscriptData | null;
  audio_url: string | null;
  analysis: AnalysisResult | null;
  created_at: string;
}


type AnalyzingStage = "uploading" | "transcribing" | "analyzing" | "done";

type ThemeBank = { theme: string; topics: string[] };
type ExtempQuestion = { category: string; question: string };

interface PreparedEventConfig {
  id: PreparedEventId;
  category: PreparedEventCategory;
  name: string;
  acronym: string;
  shortDescription: string;
  introParagraphs: string[];
  objectiveParagraph: string;
  expectationsParagraph: string;
  futureWorkflowParagraph: string;
  performanceDurationSeconds: number;
  aiModalTitle: string;
  aiModalBody: string;
}

interface PreparedPerformanceResult {
  eventId: PreparedEventId;
  elapsedSeconds: number;
  timeLimitSeconds: number;
  completion: CompletionStatus;
  analysis: AnalysisResult | null;
  analysisTranscript: string;
  analysisTranscriptData: TranscriptData | null;
  analysisAudioUrl: string;
  analysisError: string | null;
}

interface PreparedScriptContext {
  fileName: string;
  text: string;
  status: "ready" | "empty" | "error";
  message: string;
}

interface CompletedAnalysis {
  analysis: AnalysisResult;
  transcript: string;
  transcriptData: TranscriptData | null;
  audioUrl: string;
}

interface InfoModalContent {
  title: string;
  body: string[];
  badge?: string;
}

interface SpeakingGameConfig {
  id: SpeakingGameId;
  name: string;
  // Team drills are grouped separately from the solo games.
  team: boolean;
  howItWorks: React.ReactNode[];
  // Each round is one timed speech; most games have a single round.
  rounds: { label: string; seconds: number }[];
}

interface SpeechOutline {
  topic: string;
  centralMessage: string;
  supportingIdeas: string[];
  direction: string;
}

interface SpeakingGameSession {
  gameId: SpeakingGameId;
  question?: string;
  words?: string[];
  openingLine?: string;
  twists?: string[];
  outline?: SpeechOutline;
  argument?: string;
  scenarios?: string[];
  roundIndex?: number;
  roundElapsedSeconds?: number[];
  // Round lengths picked on the dial, by round index.
  roundSeconds?: number[];
}

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

const PREPARED_EVENT_CONFIGS: Record<PreparedEventId, PreparedEventConfig> = {
  oo: {
    id: "oo",
    category: "prepared",
    name: "Original Oratory",
    acronym: "OO",
    shortDescription: "Present an original speech designed to inform, inspire, or persuade.",
    introParagraphs: [
      "Original Oratory challenges you to develop and deliver an original speech that communicates a compelling message.",
      "Your speech may address an important issue, challenge an audience's perspective, or inspire meaningful reflection or action.",
    ],
    objectiveParagraph:
      "Your goal is to present a clear central argument, support your ideas with meaningful evidence and examples, and connect with your audience through confident, engaging delivery.",
    expectationsParagraph:
      "Prepare a polished original speech and practice delivering it under tournament-style timing with clear structure, purposeful emphasis, and confident audience engagement.",
    futureWorkflowParagraph:
      "In Speech Brigade, you will be able to upload your written speech, receive feedback on your writing, and receive recommendations for improving your performance. For now, you can practice delivering your speech under tournament-style timing.",
    performanceDurationSeconds: 600,
    aiModalTitle: "Writing & Delivery Coaching",
    aiModalBody:
      "Soon, Speech Brigade will analyze your written Original Oratory and provide personalized recommendations for improving its argument, organization, evidence, clarity, and rhetorical impact.\n\nIt will also offer performance advice, including recommendations for pacing, emphasis, transitions, vocal delivery, and audience engagement.\n\nThe goal is to help you strengthen both what you say and how you say it.",
  },
  inf: {
    id: "inf",
    category: "prepared",
    name: "Informative Speaking",
    acronym: "INF",
    shortDescription: "Teach your audience something new through a clear, engaging presentation.",
    introParagraphs: [
      "Informative Speaking challenges you to teach your audience something meaningful through a clear, engaging, and well-organized presentation.",
      "Strong informative speeches use logical organization, clear explanations, relevant examples, and effective delivery.",
    ],
    objectiveParagraph:
      "Your goal is to make a subject understandable while maintaining your audience's interest.",
    expectationsParagraph:
      "Prepare a clear presentation, incorporate visual aids when permitted by the applicable tournament rules, and practice explaining complex information with engaging delivery.",
    futureWorkflowParagraph:
      "Speech Brigade will eventually allow you to upload your written speech for feedback on its content, structure, and presentation. For now, you can practice delivering your speech under tournament-style timing and review your performance afterward.",
    performanceDurationSeconds: 600,
    aiModalTitle: "Writing & Delivery Coaching",
    aiModalBody:
      "Soon, Speech Brigade will analyze your written Informative speech and provide personalized feedback on organization, clarity, explanation, supporting examples, and audience understanding.\n\nIt will also recommend ways to improve your delivery, including pacing, emphasis, transitions, and the effective presentation of complex information.\n\nThe goal is to help you make your topic engaging, accessible, and memorable.",
  },
  di: {
    id: "di",
    category: "interpretation",
    name: "Dramatic Interpretation",
    acronym: "DI",
    shortDescription: "A 10-minute performance of a published literary work.",
    introParagraphs: [
      "Dramatic Interpretation challenges you to bring a literary selection to life through a compelling solo performance.",
      "Focus on creating a believable performance that allows your audience to understand and connect with the story.",
    ],
    objectiveParagraph:
      "Your goal is to communicate the meaning of the selection through characterization, vocal variety, emotional development, and purposeful physical expression.",
    expectationsParagraph:
      "Prepare your selected literary performance and practice shaping character, emotion, pacing, and dramatic transitions within a focused performance.",
    futureWorkflowParagraph:
      "You will eventually be able to upload your selected performance script and receive recommendations tailored to its characters, themes, and dramatic structure. For now, you can practice your performance under tournament-style timing and review your results afterward.",
    performanceDurationSeconds: 600,
    aiModalTitle: "Performance Coaching",
    aiModalBody:
      "Soon, Speech Brigade will analyze your selected Dramatic Interpretation script and offer personalized recommendations for bringing it to life.\n\nFeedback will focus on characterization, emotional progression, vocal variety, pacing, dramatic transitions, and the overall meaning of the selection.\n\nThis feature will focus on interpreting and performing the literary work, rather than treating it as an original speech you wrote.",
  },
  hi: {
    id: "hi",
    category: "interpretation",
    name: "Humorous Interpretation",
    acronym: "HI",
    shortDescription: "A 10-minute performance of a published literary work.",
    introParagraphs: [
      "Humorous Interpretation challenges you to bring a literary selection to life through comedic performance.",
      "Focus on making your characterization clear and your performance engaging.",
    ],
    objectiveParagraph:
      "Your goal is to entertain your audience while communicating a coherent story through distinct characters, effective pacing, vocal variety, and strong comedic timing.",
    expectationsParagraph:
      "Prepare your selected performance and practice character differentiation, comedic rhythm, transitions, and storytelling under tournament-style timing.",
    futureWorkflowParagraph:
      "You will eventually be able to upload your performance script and receive recommendations for characterization, delivery, pacing, and comedic effect. For now, you can practice your performance under tournament-style timing and review your results afterward.",
    performanceDurationSeconds: 600,
    aiModalTitle: "Performance Coaching",
    aiModalBody:
      "Soon, Speech Brigade will analyze your Humorous Interpretation script and offer personalized recommendations for character differentiation, comedic timing, pacing, vocal variety, transitions, and storytelling.\n\nThe goal is to help you create a clearer, more entertaining, and more cohesive performance.",
  },
  duo: {
    id: "duo",
    category: "interpretation",
    name: "Duo Interpretation",
    acronym: "DUO",
    shortDescription: "A 10-minute performance of a published literary work.",
    introParagraphs: [
      "Duo Interpretation is a two-person performance of a literary selection.",
      "Both performers should contribute to a unified and engaging presentation.",
    ],
    objectiveParagraph:
      "Your goal is to create a cohesive interpretation through coordinated characterization, effective timing, vocal variety, and strong storytelling.",
    expectationsParagraph:
      "Prepare with your partner and practice timing, coordination, transitions, and shared storytelling through the full performance.",
    futureWorkflowParagraph:
      "Speech Brigade will eventually support uploading your performance script and receiving recommendations for characterization, pacing, transitions, and coordination between performers. For now, you can use the performance timer to practice your piece with your partner.",
    performanceDurationSeconds: 600,
    aiModalTitle: "Duo Performance Coaching",
    aiModalBody:
      "Soon, Speech Brigade will analyze your Duo Interpretation script and offer recommendations for both performers.\n\nFeedback will focus on characterization, coordination, timing, transitions, vocal variety, and the overall cohesion of the performance.\n\nThe goal is to help both speakers work together to deliver a unified interpretation of the selection.",
  },
  poi: {
    id: "poi",
    category: "interpretation",
    name: "Program Oral Interpretation",
    acronym: "POI",
    shortDescription: "A 10-minute performance of a published literary work.",
    introParagraphs: [
      "Program Oral Interpretation challenges you to combine multiple literary selections into one cohesive performance.",
      "Your program should explore a central theme or message through a purposeful combination of literary material.",
    ],
    objectiveParagraph:
      "Your goal is to create a unified presentation through thoughtful organization, effective transitions, vocal variety, and meaningful interpretation.",
    expectationsParagraph:
      "Prepare your program with a clear thematic purpose and practice transitions, vocal variety, characterization, and the overall arc of the performance.",
    futureWorkflowParagraph:
      "You will eventually be able to upload your program script and receive feedback on its structure, thematic development, transitions, and performance. For now, you can practice your program under tournament-style timing and review your results afterward.",
    performanceDurationSeconds: 600,
    aiModalTitle: "Program Coaching",
    aiModalBody:
      "Soon, Speech Brigade will analyze your Program Oral Interpretation script and provide recommendations for improving the cohesion and impact of your program.\n\nFeedback will focus on thematic development, organization, transitions between selections, vocal variety, characterization, and the effectiveness of the overall performance.\n\nThe goal is to help the individual selections come together into one meaningful presentation.",
  },
};

const PREPARED_EVENT_IDS: PreparedEventId[] = ["oo", "inf"];
const INTERPRETATION_EVENT_IDS: PreparedEventId[] = ["di", "hi", "duo", "poi"];

const SPEAKING_GAME_CONFIGS: Record<SpeakingGameId, SpeakingGameConfig> = {
  hotSeat: {
    id: "hotSeat",
    name: "The Hot Seat",
    team: false,
    howItWorks: [
      <>Reveal a <strong>surprise question</strong>.</>,
      <>Answer it in <strong>90 seconds</strong>: a clear answer, a reason or example, and a strong finish.</>,
      <>The timer begins when you press <strong>Start</strong>.</>,
    ],
    rounds: [{ label: "Response", seconds: 90 }],
  },
  wordFusion: {
    id: "wordFusion",
    name: "Word Fusion",
    team: false,
    howItWorks: [
      <>Spin for <strong>three random words</strong>.</>,
      <>Connect all three in one <strong>60-second</strong> speech: a story, an argument, or an analogy.</>,
      <>The timer begins when you press <strong>Start</strong>.</>,
    ],
    rounds: [{ label: "Speech", seconds: 60 }],
  },
  storyRelay: {
    id: "storyRelay",
    name: "Story Relay",
    team: false,
    howItWorks: [
      <>Reveal the <strong>opening line</strong> of a story and continue it for <strong>3 minutes</strong>.</>,
      <><strong>Plot twists</strong> appear as you speak. Work each one into the story.</>,
      <>The timer begins when you press <strong>Start</strong>.</>,
    ],
    rounds: [{ label: "Story", seconds: 180 }],
  },
  landPlane: {
    id: "landPlane",
    name: "Land the Plane",
    team: false,
    howItWorks: [
      <>Reveal a <strong>speech outline</strong>: a topic, a central message, and supporting ideas.</>,
      <>Deliver its conclusion in <strong>20 seconds</strong> without adding a new argument.</>,
      <>The timer begins when you press <strong>Start</strong>.</>,
    ],
    rounds: [{ label: "Conclusion", seconds: 20 }],
  },
  threeTwoOne: {
    id: "threeTwoOne",
    name: "3-2-1 Drill",
    team: true,
    howItWorks: [
      <>Spin for an <strong>argument</strong>, one piece of a full case, and craft it as a team.</>,
      <>Deliver it in <strong>3 minutes</strong>, then <strong>2</strong>, then <strong>1</strong>, keeping the same relevant details.</>,
      <>Each round begins when you press <strong>Start</strong>.</>,
    ],
    rounds: [
      { label: "3 minutes", seconds: 180 },
      { label: "2 minutes", seconds: 120 },
      { label: "1 minute", seconds: 60 },
    ],
  },
  weighing: {
    id: "weighing",
    name: "Weighing Drill",
    team: true,
    howItWorks: [
      <>Spin for <strong>two ridiculous scenarios</strong>.</>,
      <>Speaker 1 argues the first is worse, and Speaker 2 argues the second is worse, for <strong>1 minute</strong> each.</>,
      <>Each speaker&apos;s timer begins when you press <strong>Start</strong>.</>,
    ],
    rounds: [
      { label: "Speaker 1", seconds: 60 },
      { label: "Speaker 2", seconds: 60 },
    ],
  },
};

const SPEAKING_GAME_IDS: SpeakingGameId[] = ["hotSeat", "wordFusion", "storyRelay", "landPlane", "threeTwoOne", "weighing"];

const hotSeatQuestions = [
  "What is one lesson everyone should learn before graduating high school?",
  "What makes someone a good leader?",
  "Is failure necessary for success?",
  "What is one thing schools should teach but often don't?",
  "What is more important: talent or hard work?",
  "What is the most valuable skill a student can develop?",
  "Should people take more risks?",
  "What makes a friendship last?",
  "What is one invention you couldn't live without?",
  "What does confidence mean to you?",
  "What is something people often misunderstand about teenagers?",
  "What makes a great teacher?",
  "Is competition good for personal growth?",
  "What is the most important quality of a teammate?",
  "What is one habit everyone should develop?",
  "What makes a person inspiring?",
  "What would you change about the traditional school day?",
  "Why is communication important?",
  "What is one piece of advice you would give your younger self?",
  "What makes an experience memorable?",
  "Is being busy the same as being productive?",
  "What is one thing that deserves more appreciation?",
  "Why do people fear public speaking?",
  "What is the difference between being smart and being wise?",
  "What makes a community strong?",
  "What should success look like?",
  "What can sports teach us about life?",
  "Is curiosity more valuable than knowledge?",
  "What makes an apology meaningful?",
  "How can students become more independent?",
];

const wordFusionBank = [
  "Umbrella", "Mirror", "Clock", "Key", "Backpack", "Bicycle", "Candle", "Telephone", "Ladder", "Notebook",
  "Penguin", "Elephant", "Dolphin", "Tiger", "Butterfly", "Turtle", "Eagle", "Octopus", "Horse", "Fox",
  "Desert", "Library", "Airport", "Castle", "Forest", "Beach", "Mountain", "Classroom", "Museum", "Island",
  "Robot", "Smartphone", "Satellite", "Drone", "Algorithm", "Camera", "Computer", "Rocket", "Microphone", "Battery",
  "Victory", "Courage", "Mystery", "Freedom", "Trust", "Hope", "Change", "Adventure", "Success", "Time",
  "Pizza", "Homework", "Coffee", "Rain", "Traffic", "Music", "Birthday", "Shoes", "Shopping", "Vacation",
  "Bridge", "Compass", "Lantern", "Garden", "Train", "Window", "Ocean", "Pencil", "Puzzle", "Mailbox",
  "Volcano", "River", "Stadium", "Theater", "Kitchen", "Planet", "Telescope", "Headphones", "Cloud", "Snow",
  "Treasure", "Anchor", "Festival", "Ribbon", "Marathon", "Recipe", "Backstage", "Campfire", "Whistle", "Sculpture",
  "Helmet", "Suitcase", "Calendar", "Footprint", "Sunrise", "Echo", "Blueprint", "Parade", "Handshake", "Flashlight",
  "Kite", "Labyrinth", "Medal", "Orchestra", "Passport", "Quilt", "Rainbow", "Sandbox", "Ticket", "Waterfall",
];

const storyOpenings = [
  "I opened the door and found a mysterious package.",
  "Everything changed when the lights suddenly went out.",
  "The letter arrived exactly twenty years too late.",
  "Nobody believed me when I said I had seen it.",
  "It was supposed to be an ordinary Tuesday.",
  "The elevator stopped on a floor that didn't exist.",
  "I knew something was wrong when the clock started moving backward.",
  "The stranger handed me a key and disappeared.",
  "Our school announced a competition nobody had heard of.",
  "The last person I expected to see was standing at the door.",
  "I found a map hidden inside an old book.",
  "The entire town woke up to the same mysterious message.",
  "The robot was only supposed to make breakfast.",
  "My best friend told me a secret that changed everything.",
  "The train arrived at a station that wasn't on the map.",
  "I received a phone call from my future self.",
  "The museum's most valuable exhibit had disappeared.",
  "Everyone forgot what happened yesterday except me.",
  "The storm revealed something buried beneath the sand.",
  "The moment I pressed the red button, everything went silent.",
];

const storyTwists = [
  "An unexpected visitor arrives.",
  "Someone reveals a surprising secret.",
  "The object everyone was searching for disappears.",
  "A trusted friend changes sides.",
  "The main character discovers an unusual ability.",
  "The setting suddenly changes.",
  "A seemingly harmless decision has major consequences.",
  "Someone receives an urgent message.",
  "An important object breaks.",
  "A stranger offers an unexpected deal.",
  "The main character must make a difficult choice.",
  "A forgotten memory returns.",
  "A new character challenges everything the hero believes.",
  "The solution creates an even bigger problem.",
  "Someone recognizes a familiar face in an unexpected place.",
  "An ordinary object turns out to be extraordinary.",
  "The main character discovers they have been followed.",
  "A celebration is interrupted.",
  "An important deadline suddenly moves closer.",
  "The original problem was not what it seemed.",
];

const threeTwoOneArguments = [
  "Standardized tests measure test-taking skill more than learning.",
  "Social media does more harm than good to teenagers' mental health.",
  "Homework should be optional in middle school.",
  "Cities should make public transportation free.",
  "Schools should start later in the morning.",
  "Every high school student should learn personal finance.",
  "Cell phones should be banned during the school day.",
  "College athletes should be paid.",
  "The voting age should be lowered to 16.",
  "Community service should be a graduation requirement.",
  "Year-round school would improve student learning.",
  "Zoos do more good than harm for animals.",
  "Space exploration is worth its cost.",
  "Plastic bags should be banned nationwide.",
  "Remote work is better for society than office work.",
  "Artificial intelligence should be allowed in classrooms.",
  "Uniforms improve the school environment.",
  "Video games can be a valuable learning tool.",
  "Fast food companies should not advertise to children.",
  "Four-day school weeks would benefit students.",
];

const weighingScenarios = [
  "The ocean turns to soda.",
  "All dogs turn into bears.",
  "Gravity turns off every Tuesday.",
  "Everyone can only speak in rhymes.",
  "All trees become spaghetti.",
  "Cats gain the right to vote.",
  "The sun turns bright green.",
  "Every car becomes a shopping cart.",
  "Rain falls upward.",
  "Everyone swaps bodies with their neighbor once a week.",
  "All music becomes kazoo music.",
  "Pigeons become the size of horses.",
  "Every door leads to a random place on Earth.",
  "Nobody can ever sit down again.",
  "Chocolate becomes as rare as diamonds.",
  "The moon moves twice as close to Earth.",
  "All furniture becomes inflatable.",
  "Everyone sneezes glitter.",
  "Snow falls every day, everywhere, forever.",
  "Humans lose the ability to whisper.",
];

const landPlaneOutlines: SpeechOutline[] = [
  { topic: "The Importance of Teamwork", centralMessage: "People accomplish more when they work together.", supportingIdeas: ["Different people contribute different strengths.", "Collaboration helps overcome challenges.", "Shared success creates stronger relationships."], direction: "Tie the points together and end with a memorable final line." },
  { topic: "Why Failure Helps Us Grow", centralMessage: "Mistakes can become powerful teachers.", supportingIdeas: ["Failure reveals what needs improvement.", "Resilience grows through recovery.", "Many breakthroughs begin with setbacks."], direction: "Reframe failure as a step toward progress." },
  { topic: "The Value of Friendship", centralMessage: "Strong friendships help people feel supported and understood.", supportingIdeas: ["Friends celebrate success.", "Friends provide honesty during hard moments.", "Trust makes challenges easier to face."], direction: "End with a clear statement about why friendship matters." },
  { topic: "Why Students Should Read More", centralMessage: "Reading expands knowledge, empathy, and imagination.", supportingIdeas: ["Books introduce new perspectives.", "Reading strengthens communication.", "Stories help people understand others."], direction: "Invite the audience to see reading as exploration." },
  { topic: "Trying New Things", centralMessage: "Growth often begins outside a person's comfort zone.", supportingIdeas: ["New experiences reveal hidden strengths.", "Trying builds confidence.", "Exploration can lead to unexpected opportunities."], direction: "Close with a call to take the first step." },
  { topic: "Why Kindness Matters", centralMessage: "Small acts of kindness can change the tone of a community.", supportingIdeas: ["Kindness makes people feel seen.", "It encourages others to act generously.", "It builds trust in everyday life."], direction: "Finish with an image of kindness spreading outward." },
  { topic: "The Value of Perseverance", centralMessage: "Consistent effort can carry people through difficulty.", supportingIdeas: ["Progress is often gradual.", "Obstacles test commitment.", "Persistence turns goals into habits."], direction: "Make the ending feel determined and hopeful." },
  { topic: "Why Creativity Is Important", centralMessage: "Creativity helps people solve problems and express who they are.", supportingIdeas: ["Creative thinking finds new solutions.", "Art and ideas connect people.", "Innovation depends on imagination."], direction: "End by celebrating original thinking." },
  { topic: "Protecting the Environment", centralMessage: "People share responsibility for caring for the planet.", supportingIdeas: ["Daily choices add up.", "Nature supports human life.", "Future generations inherit today's decisions."], direction: "Close with urgency and responsibility." },
  { topic: "Why Communication Matters", centralMessage: "Clear communication builds understanding and prevents conflict.", supportingIdeas: ["Listening shows respect.", "Words shape relationships.", "Honest communication solves problems faster."], direction: "End with a concise reminder about the power of words." },
  { topic: "The Power of Small Habits", centralMessage: "Small repeated actions can create major change over time.", supportingIdeas: ["Habits shape daily routines.", "Consistency compounds results.", "Small wins build motivation."], direction: "Leave the audience with one practical image of steady progress." },
  { topic: "Learning from Mistakes", centralMessage: "Mistakes become valuable when people reflect and adjust.", supportingIdeas: ["Reflection turns errors into lessons.", "Accountability builds maturity.", "Trying again develops skill."], direction: "End with a confident line about improvement." },
  { topic: "Leadership and Responsibility", centralMessage: "Real leadership means serving others, not just being in charge.", supportingIdeas: ["Leaders set examples.", "They make decisions that affect others.", "Responsibility builds trust."], direction: "Close by redefining leadership as service." },
  { topic: "The Value of Curiosity", centralMessage: "Curiosity keeps people learning and asking better questions.", supportingIdeas: ["Questions lead to discovery.", "Curiosity makes learning active.", "It helps people understand the world more deeply."], direction: "End with an invitation to keep wondering." },
  { topic: "Confidence Through Preparation", centralMessage: "Confidence grows when people prepare with purpose.", supportingIdeas: ["Practice reduces fear.", "Preparation creates options.", "Knowing the material frees a speaker to connect."], direction: "Finish with a line linking effort to courage." },
  { topic: "Community Service", centralMessage: "Serving others strengthens both individuals and communities.", supportingIdeas: ["Service meets real needs.", "It builds empathy.", "It reminds people they can make a difference."], direction: "Close with a sense of shared responsibility." },
  { topic: "Using Time Wisely", centralMessage: "Time becomes meaningful when people spend it intentionally.", supportingIdeas: ["Priorities shape choices.", "Wasted time can become missed opportunity.", "Focused effort creates lasting results."], direction: "End with a memorable thought about time's value." },
  { topic: "Asking Questions", centralMessage: "Good questions open the door to better understanding.", supportingIdeas: ["Questions reveal curiosity.", "They challenge assumptions.", "They help people learn from one another."], direction: "Close with a final question or call to keep asking." },
  { topic: "Embracing Change", centralMessage: "Change can be uncomfortable, but it often creates growth.", supportingIdeas: ["Change reveals adaptability.", "New circumstances create new possibilities.", "Resisting change can limit progress."], direction: "End with a hopeful view of transition." },
  { topic: "Setting Goals", centralMessage: "Goals give effort direction and purpose.", supportingIdeas: ["Clear goals focus attention.", "Milestones make progress visible.", "Ambition becomes stronger with a plan."], direction: "Close by connecting goals to the future." },
];

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
  ["Old vs. New", "Book, Smartphone, Vinyl, Electric Car, Tradition, Fashion, Robotics"],
  ["Real vs. Fake", "Deepfake, Knockoff, Smile, News, Diamond, Friend, Photograph"],
  ["Order vs. Chaos", "Desk, Traffic, Schedule, Storm, Classroom, Closet, City"],
  ["Head vs. Heart", "Career, Friendship, Purchase, Competition, Relationship, Risk, Dream"],
  ["Nature vs. Technology", "Forest, Robot, Farm, Smartphone, River, Drone, Garden"],
  ["Individual vs. Team", "Solo, Orchestra, Captain, Relay, Group Project, Star Player, Crew"],
  ["Past vs. Future", "Yearbook, Time Machine, Tradition, Robotics, Childhood, Mars, Memory"],
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
  ["USX · Government", "Should Congress establish national standards for the use of synthetic political content?"],
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
  ["USX · Technology", "How should Congress balance technology innovation and public safety?"],
  ["USX · Technology", "Should advanced automated systems be subject to mandatory independent safety testing?"],
  ["USX · Technology", "How should the United States regulate synthetic deepfakes?"],
  ["USX · Technology", "Should technology developers receive special antitrust exemptions for safety cooperation?"],
  ["USX · Technology", "How should copyright law apply to the training of generative technology models?"],
  ["USX · Technology", "What should the United States do to maintain its advanced technology advantage over China?"],
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
  ["USX · Immigration", "How should American schools adapt their academic-integrity policies to generative technology?"],
  ["USX · Energy", "What should the future U.S. electricity mix look like?"],
  ["USX · Energy", "Should the federal government establish nationwide limits on power-sector carbon emissions?"],
  ["USX · Energy", "How should the United States balance energy affordability and climate goals?"],
  ["USX · Energy", "What role should nuclear power play in U.S. energy policy?"],
  ["USX · Energy", "Should the United States accelerate domestic critical-mineral production?"],
  ["USX · Energy", "How should the United States regulate deep-sea mining?"],
  ["USX · Energy", "Can the United States expand data centers without putting excessive pressure on electricity grids?"],
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
  ["IX · East Asia", "How sustainable is China's automation-driven industrial expansion?"],
  ["IX · East Asia", "How should China manage the risks posed by increasingly capable artificial intelligence?"],
  ["IX · East Asia", "Can U.S.-China negotiations establish meaningful rules for frontier technology?"],
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
  ["IX · Global Institutions", "Can international cooperation keep pace with the development of frontier technology?"],
  ["IX · Global Institutions", "How should governments balance climate policy, energy security, and economic growth?"],
].map(([category, question]) => ({ category, question }));

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

const themeNames = themeBank.map((item) => item.theme);
const extempQuestionTexts = extempQuestions.map((item) => item.question);

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

async function extractPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => {
          if (typeof item === "object" && item && "str" in item && typeof item.str === "string") return item.str;
          return "";
        })
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (pageText) pages.push(pageText);
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages.join("\n\n").trim();
}

async function extractScriptText(file: File) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".rtf")) {
    return file.text();
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value.trim();
  }
  if (name.endsWith(".pdf")) {
    return extractPdfText(file);
  }
  throw new Error("Please upload a PDF, DOCX, TXT, MD, or RTF file.");
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
	    toggleOn: () => {
	      playTone(540, 0.055, "triangle", 0.026);
	      window.setTimeout(() => playTone(820, 0.09, "sine", 0.038), 42);
	    },
	    toggleOff: () => {
	      playTone(520, 0.055, "sine", 0.018);
	      window.setTimeout(() => playTone(320, 0.08, "triangle", 0.016), 46);
	    },
	    countdown: (final = false) => playTone(final ? 280 : 440, final ? 0.18 : 0.09, "sine", final ? 0.05 : 0.035),
	  };
	}

function useCountdownTimer({
  seconds,
  active,
  paused = false,
  onComplete,
  onWarningSecond,
  timerKey,
}: {
  seconds: number;
  active: boolean;
  // Holds the countdown where it is; unpausing picks up from the same time.
  paused?: boolean;
  onComplete: (elapsed: number, completion: CompletionStatus) => void;
  onWarningSecond?: (second: number) => void;
  timerKey: string;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const startRef = useRef(0);
  const elapsedBeforeRef = useRef(0);
  const runningRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const warningRef = useRef<Set<number>>(new Set());
  const onCompleteRef = useRef(onComplete);
  const onWarningSecondRef = useRef(onWarningSecond);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onWarningSecondRef.current = onWarningSecond;
  });

  useEffect(() => {
    completedRef.current = false;
    warningRef.current = new Set();
    elapsedBeforeRef.current = 0;
  }, [active, seconds, timerKey]);

  useEffect(() => {
    if (!active || paused || completedRef.current) return undefined;
    startRef.current = performance.now();
    runningRef.current = true;

    const tick = () => {
      const elapsed = elapsedBeforeRef.current + (performance.now() - startRef.current) / 1000;
      const next = Math.max(0, seconds - elapsed);
      setRemaining(next);
      const rounded = Math.ceil(next);
      if (onWarningSecondRef.current && rounded <= 5 && rounded >= 1 && !warningRef.current.has(rounded)) {
        warningRef.current.add(rounded);
        onWarningSecondRef.current(rounded);
      }
      if (next <= 0) {
        if (!completedRef.current) {
          completedRef.current = true;
          onWarningSecondRef.current?.(0);
          onCompleteRef.current(seconds, "expired");
        }
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      runningRef.current = false;
      elapsedBeforeRef.current += (performance.now() - startRef.current) / 1000;
    };
  }, [active, paused, seconds, timerKey]);

  const finishNow = () => {
    // Screens that stay put when time runs out still need their button to move on.
    if (completedRef.current) {
      if (remaining <= 0) onCompleteRef.current(seconds, "manual");
      return;
    }
    completedRef.current = true;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    const running = runningRef.current ? (performance.now() - startRef.current) / 1000 : 0;
    const elapsed = Math.min(seconds, Math.max(0, elapsedBeforeRef.current + running));
    onCompleteRef.current(elapsed, "manual");
  };

  return { remaining, finishNow, progress: seconds ? (seconds - remaining) / seconds : 1 };
}

// Countdown dial from the Speech Pact app's recording screen (DURATION_DIAL_SPEC.md, section 7):
// a green arc for the time remaining that starts at 12 o'clock and runs clockwise, a knob at its
// end, and the remaining time in the center.
const DIAL_SIZE_FULL = 380;
const DIAL_RADIUS_FULL = 160;
const DIAL_SIZE_COMPACT = 280;
// Type and handle sizes were specced for a 260px dial and scale from there.
const DIAL_SIZE_BASE = 260;
// Keeps the dial inside a phone-width screen's side gutters.
const DIAL_SIDE_GUTTER = 48;
const DIAL_HEIGHT_COMPACT = 667;
const DIAL_HEIGHT_FULL = 780;

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pointOnCircle(angleDeg: number, center: number, radius: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: center + radius * Math.cos(rad), y: center + radius * Math.sin(rad) };
}

// The dial shrinks from 260 to 200 as the window gets shorter than 780px, down to 667px.
function useDialGeometry() {
  const [windowHeight, setWindowHeight] = useState(() => (typeof window === "undefined" ? DIAL_HEIGHT_FULL : window.innerHeight));
  const [windowWidth, setWindowWidth] = useState(() => (typeof window === "undefined" ? DIAL_SIZE_FULL * 2 : window.innerWidth));
  useEffect(() => {
    const onResize = () => {
      setWindowHeight(window.innerHeight);
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const t = Math.min(1, Math.max(0, (windowHeight - DIAL_HEIGHT_COMPACT) / (DIAL_HEIGHT_FULL - DIAL_HEIGHT_COMPACT)));
  const size = Math.min(windowWidth - DIAL_SIDE_GUTTER, Math.round(DIAL_SIZE_COMPACT + (DIAL_SIZE_FULL - DIAL_SIZE_COMPACT) * t));
  const scale = size / DIAL_SIZE_BASE;
  const radius = size * (DIAL_RADIUS_FULL / DIAL_SIZE_FULL);
  return {
    size,
    center: size / 2,
    radius,
    circumference: 2 * Math.PI * radius,
    strokeWidth: Math.max(9, Math.round(12 * scale)),
    handleOuterR: Math.max(8, Math.round(11 * scale)),
    handleInnerR: Math.max(4, Math.round(5 * scale)),
    bigFontSize: Math.max(30, Math.round(40 * scale)),
    bigLabelYOffset: Math.round(24 * scale),
  };
}

// Dragging follows the pointer's angle around the center (DURATION_DIAL_SPEC.md, sections 1 and 5):
// 12 o'clock is zero, values grow clockwise in 5 s steps, clamped to 15 s..scaleMax, no wrap-around.
const DIAL_MIN_SECONDS = 15;
const PREPARED_DURATION_PRESETS = [600, 420, 300];
const EXTEMP_DURATION_PRESETS = [420, 300];
// Impromptu's plan and speak timers each drag up to 7 minutes (defaults: 2 to plan, 5 to speak).
const IMPROMPTU_MAX_SECONDS = 420;
const DIAL_STEP_SECONDS = 5;

function CountdownDial({
  remaining,
  total,
  scaleMax = total,
  onDrag,
}: {
  remaining: number;
  total: number;
  // Seconds represented by one full turn of the ring.
  scaleMax?: number;
  // When set, dragging anywhere on the dial picks a new duration.
  onDrag?: (seconds: number) => void;
}) {
  const dial = useDialGeometry();
  const draggingRef = useRef(false);
  const left = Math.max(0, Math.min(total, remaining));
  const angle = scaleMax > 0 ? Math.min(360, (left / scaleMax) * 360) : 0;

  const secondsAt = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const cx = event.clientX - rect.left - rect.width / 2;
    const cy = event.clientY - rect.top - rect.height / 2;
    let angleDeg = (Math.atan2(cy, cx) * 180) / Math.PI + 90;
    if (angleDeg < 0) angleDeg += 360;
    const raw = Math.round((angleDeg / 360) * scaleMax);
    return Math.max(DIAL_MIN_SECONDS, Math.min(scaleMax, Math.round(raw / DIAL_STEP_SECONDS) * DIAL_STEP_SECONDS));
  };

  const dragHandlers = onDrag
    ? {
        onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          draggingRef.current = true;
        },
        onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => {
          if (draggingRef.current) onDrag(secondsAt(event));
        },
        onPointerUp: () => {
          draggingRef.current = false;
        },
        onPointerCancel: () => {
          draggingRef.current = false;
        },
      }
    : {};
  const dashArray = `${(angle / 360) * dial.circumference} ${dial.circumference}`;
  const handlePos = pointOnCircle(angle, dial.center, dial.radius);

  return (
    <div className={`countdown-dial ${onDrag ? "draggable" : ""}`}>
      <svg
        width={dial.size}
        height={dial.size}
        viewBox={`0 0 ${dial.size} ${dial.size}`}
        role="timer"
        aria-label={`${formatDuration(left)} remaining`}
        {...dragHandlers}
      >
        <circle cx={dial.center} cy={dial.center} r={dial.radius} stroke="#E8E4DE" strokeWidth={dial.strokeWidth} fill="none" />
        <circle
          cx={dial.center}
          cy={dial.center}
          r={dial.radius}
          stroke="#135248"
          strokeWidth={dial.strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dashArray}
          transform={`rotate(-90 ${dial.center} ${dial.center})`}
        />
        <circle cx={handlePos.x} cy={handlePos.y} r={dial.handleOuterR} fill="#135248" />
        <circle cx={handlePos.x} cy={handlePos.y} r={dial.handleInnerR} fill="#FFFFFF" />
        <text x={dial.center} y={dial.center + 2} textAnchor="middle" fontSize={dial.bigFontSize} fontWeight="700" fill="#1E1E1E">
          {formatDuration(left)}
        </text>
        <text x={dial.center} y={dial.center + dial.bigLabelYOffset} textAnchor="middle" fontSize={12} fontWeight="500" fill="#999999">
          remaining
        </text>
      </svg>
    </div>
  );
}
function TimerPanel({
  seconds,
  buttonLabel,
  onComplete,
  onWarningSecond,
  topic,
  topicLabel,
  timerKey,
  active = true,
  onStart,
  presets,
  onSecondsChange,
  maxSeconds,
  pausable = false,
  recording = false,
  onPauseChange,
  onStop,
}: {
  seconds: number;
  buttonLabel?: string;
  onComplete: (elapsed: number, completion: CompletionStatus) => void;
  onWarningSecond?: (second: number) => void;
  topic?: string;
  topicLabel?: string;
  timerKey: string;
  // When inactive, the full time shows and the button starts the timer instead.
  active?: boolean;
  onStart?: () => void;
  // Before Start: preset tabs under the dial, and dragging the dial sets any other length.
  presets?: number[];
  onSecondsChange?: (seconds: number) => void;
  // Longest length the dial can be dragged to; defaults to the longest preset.
  maxSeconds?: number;
  // Pause/Resume and Stop buttons, greyed out until Start. Stop hands control back to the page (onStop),
  // which resets to before Start so the speech can be redone. The Stop dot pulses while recording.
  pausable?: boolean;
  recording?: boolean;
  onPauseChange?: (paused: boolean) => void;
  onStop?: () => void;
}) {
  // Pause belongs to one run of the timer: a new key or a restart clears it.
  const runKey = `${timerKey}|${active}`;
  const [pausedRun, setPausedRun] = useState("");
  const paused = pausedRun === runKey;
  const { remaining, finishNow } = useCountdownTimer({
    seconds,
    active,
    paused,
    onComplete,
    onWarningSecond,
    timerKey,
  });

  return (
    <section className="timer-stage">
      {topic ? (
        <div className="topic-banner">
          <span>{topicLabel || `Your ${topic.endsWith("?") ? "question" : "topic"}`}</span>
          <strong>{topic}</strong>
        </div>
      ) : null}
      <div className="timer-card">
        {!active && presets?.length && onSecondsChange ? (
          <div className="duration-presets" role="group" aria-label="Speech length">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                className={preset === seconds ? "active" : ""}
                aria-pressed={preset === seconds}
                onClick={() => onSecondsChange(preset)}
              >
                {preset / 60} min
              </button>
            ))}
          </div>
        ) : null}
        <CountdownDial
          remaining={active ? remaining : seconds}
          total={seconds}
          scaleMax={maxSeconds ?? (presets?.length ? Math.max(seconds, ...presets) : seconds)}
          onDrag={!active ? onSecondsChange : undefined}
        />
        {pausable && (!active || remaining > 0) ? (
          <div className="timer-controls">
            <button
              className="timer-control"
              type="button"
              disabled={!active}
              onClick={() => {
                setPausedRun(paused ? "" : runKey);
                onPauseChange?.(!paused);
              }}
            >
              {paused ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>
              )}
              {paused ? "Resume" : "Pause"}
            </button>
            {onStop ? (
              <button
                className={`timer-control stop ${active && recording && !paused ? "live" : ""}`}
                type="button"
                disabled={!active}
                onClick={onStop}
              >
                <span className="record-dot" aria-hidden="true" />
                Stop
              </button>
            ) : null}
          </div>
        ) : null}
        {!active && onStart ? (
          <button className="primary big-action" type="button" onClick={onStart}>
            Start
          </button>
        ) : buttonLabel ? (
          <button className="secondary big-action" type="button" onClick={finishNow}>
            {buttonLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function GamePromptDisplay({ session, compact = false }: { session: SpeakingGameSession; compact?: boolean }) {
  const textPrompt =
    session.gameId === "hotSeat"
      ? { label: "Your question", text: session.question }
      : session.gameId === "storyRelay"
        ? { label: "Opening line", text: session.openingLine }
        : session.gameId === "threeTwoOne"
          ? { label: "Your argument", text: session.argument }
          : null;
  if (textPrompt?.text) {
    return (
      <div className="topic-banner">
        <span>{textPrompt.label}</span>
        <strong>{textPrompt.text}</strong>
      </div>
    );
  }

  if (session.gameId === "wordFusion" && session.words?.length) {
    return (
      <div className={`game-word-grid ${compact ? "compact" : ""}`}>
        {session.words.map((word) => (
          <div className="game-word-card" key={word}>{word}</div>
        ))}
      </div>
    );
  }

  if (session.gameId === "landPlane" && session.outline) {
    return <SpeechOutlineCard outline={session.outline} compact={compact} />;
  }

  if (session.gameId === "weighing" && session.scenarios?.length === 2) {
    return (
      <div className={`weighing-matchup ${compact ? "compact" : ""}`}>
        {session.scenarios.map((scenario, index) => (
          <div
            className={`game-prompt-card compact ${session.roundIndex === index ? "active" : ""}`}
            key={scenario}
          >
            <span>Speaker {index + 1}: this is worse</span>
            <strong>{scenario}</strong>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

// Every game's timer page: the prompt, a round tracker for multi-round drills, and one timer
// per round that waits for Start, like the speech practice timers.
function GameTimer({
  config,
  session,
  started,
  onStart,
  onRoundComplete,
  onSelectRound,
  onWarningSecond,
  onTwist,
}: {
  config: SpeakingGameConfig;
  session: SpeakingGameSession;
  started: boolean;
  onStart: () => void;
  onRoundComplete: (elapsed: number, seconds: number) => void;
  onSelectRound: (index: number) => void;
  onWarningSecond: (second: number) => void;
  onTwist: () => void;
}) {
  const roundIndex = session.roundIndex || 0;
  const round = config.rounds[roundIndex];
  if (!round) return null;
  const isLast = roundIndex === config.rounds.length - 1;

  return (
    <>
      {config.rounds.length > 1 ? (
        <ol className="drill-rounds" aria-label="Rounds">
          {config.rounds.map((item, index) => (
            <li key={item.label}>
              <button
                type="button"
                className={index === roundIndex ? "active" : session.roundElapsedSeconds?.[index] != null ? "done" : ""}
                aria-current={index === roundIndex ? "step" : undefined}
                disabled={started}
                onClick={() => onSelectRound(index)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      <GamePromptDisplay session={session} compact />
      <GameRoundTimer
        key={`${config.id}-${roundIndex}`}
        label={round.label}
        seconds={session.roundSeconds?.[roundIndex] ?? round.seconds}
        buttonLabel={isLast ? "I'm done" : config.id === "weighing" ? "Next speaker" : "Next round"}
        twists={session.gameId === "storyRelay" ? session.twists : undefined}
        started={started}
        onStart={onStart}
        onComplete={onRoundComplete}
        onWarningSecond={onWarningSecond}
        onTwist={onTwist}
      />
    </>
  );
}

function GameRoundTimer({
  label,
  seconds,
  buttonLabel,
  twists,
  started,
  onStart,
  onComplete,
  onWarningSecond,
  onTwist,
}: {
  label: string;
  seconds: number;
  buttonLabel: string;
  // Story Relay: twists appear at 2:00, 1:00, and 0:30 remaining.
  twists?: string[];
  started: boolean;
  onStart: () => void;
  onComplete: (elapsed: number, seconds: number) => void;
  onWarningSecond: (second: number) => void;
  onTwist: () => void;
}) {
  // Before Start, the dial can be dragged to change this round's length.
  const [duration, setDuration] = useState(seconds);
  const { remaining, finishNow } = useCountdownTimer({
    seconds: duration,
    active: started,
    // Running out of time stays on the round; the button moves on.
    onComplete: (elapsed, completion) => {
      if (completion === "expired") return;
      onComplete(elapsed, duration);
    },
    onWarningSecond,
    timerKey: label,
  });
  const twistThresholds = [120, 60, 30];
  const twistCount = started && twists ? twistThresholds.filter((at) => remaining <= at).length : 0;
  const shownTwistsRef = useRef(0);

  useEffect(() => {
    if (twistCount > shownTwistsRef.current) {
      shownTwistsRef.current = twistCount;
      onTwist();
    }
  }, [twistCount, onTwist]);

  const visibleTwist = twists && twistCount > 0 ? twists[twistCount - 1] : null;

  return (
    <section className="timer-stage">
      {visibleTwist ? (
        <div className="plot-twist-card" key={visibleTwist}>
          <span>Plot Twist</span>
          <strong>{visibleTwist}</strong>
        </div>
      ) : null}
      <div className="timer-card">
        <CountdownDial
          remaining={started ? remaining : duration}
          total={duration}
          scaleMax={Math.max(180, seconds)}
          onDrag={started ? undefined : setDuration}
        />
        {started ? (
          <button className="secondary big-action" type="button" onClick={finishNow}>
            {buttonLabel}
          </button>
        ) : (
          <button className="primary big-action" type="button" onClick={onStart}>
            Start
          </button>
        )}
      </div>
    </section>
  );
}

function SpeechOutlineCard({ outline, compact = false }: { outline: SpeechOutline; compact?: boolean }) {
  return (
    <div className={`speech-outline-card ${compact ? "compact" : ""}`}>
      <div>
        <span>Topic</span>
        <strong>{outline.topic}</strong>
      </div>
      <div>
        <span>Central Message</span>
        <p>{outline.centralMessage}</p>
      </div>
      <div>
        <span>Supporting Ideas</span>
        <ul>
          {outline.supportingIdeas.map((idea) => (
            <li key={idea}>{idea}</li>
          ))}
        </ul>
      </div>
      <p className="outline-direction">{outline.direction}</p>
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

// Event names always render on two lines: the last word drops to the second line.
function EventCardTitle({ name }: { name: string }) {
  const splitAt = name.lastIndexOf(" ");
  if (splitAt === -1) return <span>{name}</span>;
  return (
    <span>
      {name.slice(0, splitAt)}
      <br />
      {name.slice(splitAt + 1)}
    </span>
  );
}

function InstructionBlock({ children }: { children: React.ReactNode }) {
  return <div className="instruction-copy">{children}</div>;
}

// Rules copy is shared by each event's setup page and the Rules page.
function ImpromptuRules() {
  return (
    <>
      <p>Plan for up to <strong>7 minutes</strong> and speak for up to <strong>7 minutes</strong>. Drag either timer to set its length before you press Start.</p>
      <p>Spin for a <strong>theme</strong>, then get three related topics.</p>
      <p><strong>Choose</strong> a topic, then press <strong>Start planning</strong>.</p>
      <p>On each page, press <strong>Start</strong> to begin the timer. Press <strong>I&apos;m ready to speak</strong> when you finish prepping.</p>
    </>
  );
}

function ExtempRules() {
  return (
    <>
      <p>Answer a current-events question with a clear, organized, evidence-based speech.</p>
      <p>Draw <strong>three questions</strong>, choose one, then press <strong>Start planning</strong>.</p>
      <p>Take <strong>30 minutes</strong> to prep, then deliver for <strong>7 minutes</strong>. Each timer begins when you press <strong>Start</strong>.</p>
    </>
  );
}

function PreparedEventRules({ event }: { event: PreparedEventConfig }) {
  return (
    <>
      {event.introParagraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <p>{event.objectiveParagraph}</p>
      <p>{event.expectationsParagraph}</p>
      <p>
        <strong>Time limit: 10 minutes.</strong> Official tournament requirements may vary by event,
        tournament, and season.
      </p>
      <p>{event.futureWorkflowParagraph}</p>
    </>
  );
}

type RulesTopicId = "impromptu" | "extemp" | PreparedEventId | SpeakingGameId;

function isGameTopic(topicId: RulesTopicId): topicId is SpeakingGameId {
  return topicId in SPEAKING_GAME_CONFIGS;
}

function rulesTopicName(topicId: RulesTopicId) {
  if (topicId === "impromptu") return "Impromptu Speaking";
  if (topicId === "extemp") return "Extemporaneous Speaking";
  if (isGameTopic(topicId)) return SPEAKING_GAME_CONFIGS[topicId].name;
  return PREPARED_EVENT_CONFIGS[topicId].name;
}

function RulesContent({ topicId }: { topicId: RulesTopicId }) {
  if (topicId === "impromptu") return <ImpromptuRules />;
  if (topicId === "extemp") return <ExtempRules />;
  if (isGameTopic(topicId)) {
    return (
      <>
        {SPEAKING_GAME_CONFIGS[topicId].howItWorks.map((line, index) => (
          <p key={`${topicId}-${index}`}>{line}</p>
        ))}
      </>
    );
  }
  return <PreparedEventRules event={PREPARED_EVENT_CONFIGS[topicId]} />;
}

// The underlined link that stands in for a Rules / How it works box on each setup page.
function RulesLink({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button className="rules-link" type="button" onClick={onOpen}>
      {label}
    </button>
  );
}

function PracticeOptionToggle({
  title,
  enabled,
  onChange,
  info,
}: {
  title: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  info?: React.ReactNode;
}) {
  return (
    <div className="analysis-toggle">
      <div className="toggle-heading">
        <strong>{title}</strong>
        {info}
      </div>
      <label className="toggle-switch">
        <input
          type="checkbox"
          aria-label={title}
          checked={enabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <i aria-hidden="true" />
      </label>
    </div>
  );
}

function PrivacyInfoButton() {
  // Click pins the tip open; hovering shows it only while the pointer is over the icon or tip.
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <span
      className="info-anchor"
      ref={wrapRef}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <button
        className="info-button"
        type="button"
        aria-label="About saving recordings"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        i
      </button>
      {open || hovered ? (
        <span className="privacy-tip" role="tooltip">
          Your privacy matters. Saving recordings is optional and exists only so you can revisit your own practice.
          Whether you save a recording or not, Speech Brigade does not listen to, reuse, or train on your audio or transcript.
        </span>
      ) : null}
    </span>
  );
}

function PracticePrivacyOptions({
  analysisEnabled,
  saveRecordingEnabled,
  onAnalysisChange,
  onSaveRecordingChange,
}: {
  analysisEnabled: boolean;
  saveRecordingEnabled: boolean;
  onAnalysisChange: (enabled: boolean) => void;
  onSaveRecordingChange: (enabled: boolean) => void;
}) {
  return (
    <div className="practice-options">
      <PracticeOptionToggle
        title="Speech analysis"
        enabled={analysisEnabled}
        onChange={onAnalysisChange}
      />
      <PracticeOptionToggle
        title="Save recording"
        enabled={saveRecordingEnabled}
        onChange={onSaveRecordingChange}
        info={<PrivacyInfoButton />}
      />
    </div>
  );
}

function RecordingPrivacyFooter() {
  return (
    <p className="recording-privacy">
      Your privacy matters to us. Speech Brigade does not listen to, reuse, or train on your audio or transcript.
    </p>
  );
}

function curveAnalysisStars(value: number) {
  const originalStars = Math.max(1, Math.min(5, Math.round(value)));
  return 2 + originalStars * 0.5;
}

function isVirtuallyFlawlessAnalysis(analysis: AnalysisResult) {
  const categoryValues = Object.values(analysis.categories).filter(Boolean);
  const grammarIssues =
    analysis.grammarBreakdown.agreement +
    analysis.grammarBreakdown.verbTense +
    analysis.grammarBreakdown.sentenceStructure +
    analysis.grammarBreakdown.wordUsage;
  return (
    analysis.scorecard.stars >= 5 &&
    categoryValues.length >= 3 &&
    categoryValues.every((category) => (category?.stars ?? 0) >= 5) &&
    grammarIssues === 0 &&
    analysis.weakWords.length === 0 &&
    analysis.fillerCount <= 1 &&
    analysis.pauseCount <= 2 &&
    analysis.wordsPerMinute >= 115 &&
    analysis.wordsPerMinute <= 170
  );
}

function displayScoreValue(value: number, perfect = false) {
  const originalStars = Math.max(1, Math.min(5, Math.round(value)));
  if (perfect && originalStars === 5) return 5;
  return curveAnalysisStars(originalStars);
}

function countTranscriptWords(text: string) {
  const matches = text.trim().match(/\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b/gu);
  return matches?.length ?? 0;
}

function isClearlyUnscorableSpeech(analysis: AnalysisResult, transcript: string) {
  const wordCount = countTranscriptWords(transcript);
  if (wordCount === 0) return true;
  const analysisText = [
    analysis.scorecard.title,
    analysis.scorecard.description,
    analysis.keyTakeawayTip,
    analysis.grammarSummary,
    analysis.vocabSummary,
  ].join(" ");
  const analysisSaysTooShort = /\b(too short|not enough|insufficient|cannot evaluate|can't evaluate|unable to evaluate|try speaking|full time|no meaningful)\b/i.test(analysisText);
  return wordCount <= 12 || (wordCount < 20 && analysisSaysTooShort);
}

function formatStarValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function StarRating({ value, perfect = false }: { value: number; perfect?: boolean }) {
  const stars = displayScoreValue(value, perfect);
  return (
    <span className="star-rating" aria-label={`${stars} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <i
          key={index}
          className={index + 1 <= stars ? "filled" : index < stars ? "half" : ""}
        >
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

const STANDARD_CATEGORY_ORDER: CategoryKey[] = ["organization", "analysis", "delivery"];
const LEGACY_EXTEMP_CATEGORY_ORDER: CategoryKey[] = ["argumentationAnalysis", "sourceConsideration", "delivery"];

function getCategoryOrder(mode: AnalysisMode, categories: Partial<Record<CategoryKey, CategoryResult>>): CategoryKey[] {
  const hasStandardCategories = STANDARD_CATEGORY_ORDER.some((key) => Boolean(categories[key]));
  if (!hasStandardCategories && mode === "extemp") return LEGACY_EXTEMP_CATEGORY_ORDER;
  return STANDARD_CATEGORY_ORDER;
}

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

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" />
      <path d="M10 12h10M16 8l4 4-4 4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
  transcriptText,
  renderSentence,
  renderSectionFooter,
}: {
  sentences: SentenceTip[];
  timestamps: Map<SentenceTip, string>;
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
  scoresUnavailable = false,
}: {
  categories: Partial<Record<CategoryKey, CategoryResult>>;
  categoryKeys: CategoryKey[];
  scoresUnavailable?: boolean;
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
              {scoresUnavailable ? <span className="score-na">N/A</span> : <StarRating value={result.stars} />}
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

function GrammarSummaryCard({ breakdown }: { breakdown: GrammarBreakdown }) {
  const total = breakdown.agreement + breakdown.verbTense + breakdown.sentenceStructure + breakdown.wordUsage;
  return (
    <div className={`grammar-summary-card ${total === 0 ? "clean" : "warn"}`}>
      <div className="grammar-summary-banner">
        {total === 0 ? <CheckIcon /> : <WarningIcon />}
        <span>{total === 0 ? "No grammar issues" : `${total} grammar issue${total === 1 ? "" : "s"} found`}</span>
      </div>
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
  mode: AnalysisMode;
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
  const perfectScore = isVirtuallyFlawlessAnalysis(analysis);
  const scoresUnavailable = isClearlyUnscorableSpeech(analysis, transcript);

  return (
    <div className="analysis-page">
      <div className="verdict-card">
        <div className="verdict-score">
          <span>Score</span>
          {scoresUnavailable ? (
            <span className="score-na large">N/A</span>
          ) : (
            <>
              <StarRating value={analysis.scorecard.stars} perfect={perfectScore} />
              <strong>{formatStarValue(displayScoreValue(analysis.scorecard.stars, perfectScore))} / 5</strong>
            </>
          )}
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
            <CategoryAccordion
              categories={analysis.categories}
              categoryKeys={getCategoryOrder(mode, analysis.categories)}
              scoresUnavailable={scoresUnavailable}
            />
            <SectionedTranscript
              sentences={analysis.sentences}
              timestamps={sentenceTimestamps}
              transcriptText={transcript}
              renderSentence={(sentence, key) => (
                <FlaggedSentence sentence={sentence} keyId={key} openKey={openKey} setOpenKey={setOpenKey} />
              )}
            />
          </>
        ) : null}

        {activeTab === "structure" ? (
          <>
            <StructureBar ideal={analysis.idealStructure} yours={analysis.yourStructure} />
            <SectionedTranscript
              sentences={analysis.sentences}
              timestamps={sentenceTimestamps}
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
            <div className="word-analysis-grid">
              <WordListCard title="Weak Words" words={analysis.weakWords} tone="weak" />
              <WordListCard title="Power Words" words={analysis.powerWords} tone="power" />
            </div>
            <SectionedTranscript
              sentences={analysis.sentences}
              timestamps={sentenceTimestamps}
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
            <GrammarSummaryCard breakdown={analysis.grammarBreakdown} />
            <SectionedTranscript
              sentences={analysis.sentences}
              timestamps={sentenceTimestamps}
              transcriptText={transcript}
              renderSentence={(sentence, key) => (
                <FlaggedSentence sentence={sentence} keyId={key} openKey={openKey} setOpenKey={setOpenKey} grammarOnly />
              )}
            />
          </>
        ) : null}
      </div>

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

function formatAnalysisModeLabel(mode: AnalysisMode) {
  if (mode === "impromptu") return "Impromptu Speaking";
  if (mode === "extemp") return "Extemporaneous Speaking";
  const eventConfig = PREPARED_EVENT_CONFIGS[mode];
  return eventConfig ? `${eventConfig.name} (${eventConfig.acronym})` : "Practice round";
}

const ANALYZING_STAGE_RANGES: Record<Exclude<AnalyzingStage, "done">, [number, number]> = {
  uploading: [0, 20],
  transcribing: [20, 55],
  analyzing: [55, 95],
};

function AnalyzingProgress({ stage, saveOnly }: { stage: AnalyzingStage; saveOnly: boolean }) {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (stage === "done") {
      const doneTimer = window.setTimeout(() => setPercent(100), 0);
      return () => window.clearTimeout(doneTimer);
    }
    const [floor, ceiling] = saveOnly ? [0, 95] : ANALYZING_STAGE_RANGES[stage];
    const floorTimer = window.setTimeout(() => {
      setPercent((current) => Math.max(current, floor));
    }, 0);
    const timer = window.setInterval(() => {
      setPercent((current) => {
        if (current >= ceiling) return current;
        return Math.min(ceiling, current + Math.max(0.15, (ceiling - current) * 0.04));
      });
    }, 200);
    return () => {
      window.clearTimeout(floorTimer);
      window.clearInterval(timer);
    };
  }, [stage, saveOnly]);

  const rounded = Math.round(percent);
  return (
    <div className="analyzing-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rounded}>
      <div className="analyzing-progress-track">
        <div className="analyzing-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="analyzing-progress-label">{rounded}%</span>
    </div>
  );
}

interface VaultFilters {
  mode: AnalysisMode | "all";
  analyzed: "all" | "analyzed" | "notAnalyzed";
  minStars: number;
  withinDays: number;
}

const DEFAULT_VAULT_FILTERS: VaultFilters = { mode: "all", analyzed: "all", minStars: 0, withinDays: 0 };

const VAULT_MODE_OPTIONS: AnalysisMode[] = [
  "impromptu",
  "extemp",
  ...(Object.keys(PREPARED_EVENT_CONFIGS) as PreparedEventId[]),
];

// A cream dropdown in place of the native select, whose menu would otherwise open in the
// operating system's own (dark, small) style.
function FilterSelect<T extends string | number>({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: T;
  // selectedLabel: what the closed button shows when this option is picked, if not its label.
  options: { value: T; label: string; selectedLabel?: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const openMenu = () => {
    setActiveIndex(selectedIndex);
    setOpen(true);
  };

  const choose = (index: number) => {
    onChange(options[index].value);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + step + options.length) % options.length);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      choose(activeIndex);
    }
  };

  return (
    <div className={`filter-select ${open ? "open" : ""}`} ref={wrapRef} onKeyDown={handleKeyDown}>
      <button
        className="filter-select-button"
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
      >
        <span>{options[selectedIndex]?.selectedLabel ?? options[selectedIndex]?.label}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <ul className="filter-select-menu" role="listbox" id={listId} aria-label={label}>
          {options.map((option, index) => (
            <li
              key={String(option.value)}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === selectedIndex}
              className={index === activeIndex ? "active" : undefined}
              onPointerEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const VAULT_ANALYZED_OPTIONS: { value: VaultFilters["analyzed"]; label: string; selectedLabel?: string }[] = [
  { value: "all", label: "All", selectedLabel: "Analysis? All" },
  { value: "analyzed", label: "Yes", selectedLabel: "Analysis? Yes" },
  { value: "notAnalyzed", label: "No", selectedLabel: "Analysis? No" },
];

const VAULT_STAR_OPTIONS = [
  { value: 0, label: "Any stars" },
  ...[1, 2, 3, 4, 5].map((stars) => ({ value: stars, label: stars === 5 ? "5 stars" : `${stars}+ stars` })),
];

const VAULT_DATE_OPTIONS = [
  { value: 0, label: "Any time" },
  { value: 7, label: "Past week" },
  { value: 30, label: "Past month" },
  { value: 90, label: "Past 3 months" },
];

function VaultFilterBar({
  filters,
  active,
  onChange,
}: {
  filters: VaultFilters;
  active: boolean;
  onChange: (filters: VaultFilters) => void;
}) {
  return (
    <div className="vault-filters" role="group" aria-label="Filter recordings">
      <FilterSelect<VaultFilters["mode"]>
        label="Event"
        value={filters.mode}
        options={[
          { value: "all", label: "All events" },
          ...VAULT_MODE_OPTIONS.map((mode) => ({ value: mode, label: formatAnalysisModeLabel(mode) })),
        ]}
        onChange={(mode) => onChange({ ...filters, mode })}
      />
      <FilterSelect
        label="Analysis"
        value={filters.analyzed}
        options={VAULT_ANALYZED_OPTIONS}
        onChange={(analyzed) => {
          // Unanalyzed recordings have no stars, so a star filter would hide everything.
          onChange({ ...filters, analyzed, minStars: analyzed === "notAnalyzed" ? 0 : filters.minStars });
        }}
      />
      <FilterSelect
        label="Stars"
        value={filters.minStars}
        options={VAULT_STAR_OPTIONS}
        disabled={filters.analyzed === "notAnalyzed"}
        onChange={(minStars) => onChange({ ...filters, minStars })}
      />
      <FilterSelect
        label="Date"
        value={filters.withinDays}
        options={VAULT_DATE_OPTIONS}
        onChange={(withinDays) => onChange({ ...filters, withinDays })}
      />
      {active ? (
        <button className="vault-filters-clear" type="button" onClick={() => onChange(DEFAULT_VAULT_FILTERS)}>
          Clear filters
        </button>
      ) : null}
    </div>
  );
}

function VaultCard({
  recording,
  onOpen,
}: {
  recording: VaultRecording;
  onOpen: (recording: VaultRecording) => void;
}) {
  const hasAnalysis = Boolean(recording.analysis);
  const hasAudio = Boolean(recording.audio_url);
  const canOpen = hasAnalysis || hasAudio;
  const content = (
    <>
      <div className="vault-card-head">
        <span className="vault-card-meta">
          <span className="vault-badge">{formatAnalysisModeLabel(recording.mode)}</span>
          <span className="vault-date">{formatVaultDate(recording.created_at)}</span>
        </span>
        {typeof recording.analysis?.scorecard?.stars === "number" ? (
          <StarRating value={recording.analysis.scorecard.stars} />
        ) : null}
      </div>
      <p className="vault-prompt">{recording.prompt}</p>
      <div className="vault-card-foot">
        <span className="vault-duration">{formatVaultDuration(recording.duration_seconds)}</span>
        {hasAnalysis ? (
          <span className="vault-analysis-pill">
            <SparkleIcon /> Analysis
          </span>
        ) : hasAudio ? (
          <span className="vault-analysis-pill recording-only">Recording</span>
        ) : (
          <span className="vault-analysis-pending">No analysis</span>
        )}
      </div>
    </>
  );

  if (!canOpen) {
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
  const [screen, setScreenState] = useState<Screen>("landing");
  const screenRef = useRef<Screen>("landing");
  const historyKeyRef = useRef("");

  // Every screen change becomes a browser history entry so Back returns to the previous screen.
  // Leaving a transient screen replaces its entry instead of stacking a new one.
  const setScreen = useCallback((next: Screen) => {
    const current = screenRef.current;
    if (next === current) return;
    screenRef.current = next;
    const state = { screen: next, key: historyKeyRef.current };
    if (TRANSIENT_SCREENS.has(current)) window.history.replaceState(state, "");
    else window.history.pushState(state, "");
    setScreenState(next);
  }, []);

  const openRules = (topicId: RulesTopicId) => {
    setRulesTopic(topicId);
    setScreen("rulesDetail");
  };

  const goBack = useCallback(() => {
    if (window.history.state?.key === historyKeyRef.current && screenRef.current !== "landing") {
      window.history.back();
    } else {
      screenRef.current = "landing";
      setScreenState("landing");
    }
  }, []);
  const [round, setRound] = useState<RoundState>(initialRound);
  // Bumped to remount the theme spinner reel when a round resets.
  const [themeReelKey, setThemeReelKey] = useState(0);
  const [themeSpinning, setThemeSpinning] = useState(false);
  const [lockedChoice, setLockedChoice] = useState("");
  // Impromptu/Extemp setup steps stack on one page; each appears after pressing Next.
  const [setupStage, setSetupStage] = useState<"spin" | "topics">("spin");
  // Plan/record timers wait for the user to press Start.
  const [roundTimerStarted, setRoundTimerStarted] = useState(false);
  const latestSetupStepRef = useRef<HTMLDivElement | null>(null);
  // Prepared/interp events: the countdown and performance timer appear under the script step.
  const [preparedStage, setPreparedStage] = useState<"setup" | "performance">("setup");
  const [preparedDurationSeconds, setPreparedDurationSeconds] = useState(600);
  const [rulesTopic, setRulesTopic] = useState<RulesTopicId>("impromptu");

  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authStatus, setAuthStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [authError, setAuthError] = useState("");
  const [signOutStatus, setSignOutStatus] = useState<"idle" | "confirming" | "signingOut" | "done">("idle");
  const [speechAnalysisEnabled, setSpeechAnalysisEnabled] = useState(true);
  const [saveRecordingEnabled, setSaveRecordingEnabled] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("speech-brigade-save-recording") === "true",
  );
  const [analyzingStage, setAnalyzingStage] = useState<AnalyzingStage>("uploading");
  const [recordingError, setRecordingError] = useState("");
  const [vaultRecordings, setVaultRecordings] = useState<VaultRecording[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState("");
  // The vault loads 10 recordings, then 20 more on scroll, then the rest on the next scroll.
  const [vaultHasMore, setVaultHasMore] = useState(false);
  const [vaultLoadingMore, setVaultLoadingMore] = useState(false);
  const vaultRequestRef = useRef(0);
  const vaultSentinelRef = useRef<HTMLDivElement | null>(null);
  const [vaultFilters, setVaultFilters] = useState<VaultFilters>(DEFAULT_VAULT_FILTERS);
  const vaultFiltersActive = JSON.stringify(vaultFilters) !== JSON.stringify(DEFAULT_VAULT_FILTERS);
  const [foundersOpen, setFoundersOpen] = useState(false);
  const [selectedPreparedEventId, setSelectedPreparedEventId] = useState<PreparedEventId | null>(null);
  const [preparedResult, setPreparedResult] = useState<PreparedPerformanceResult | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<SpeakingGameId | null>(null);
  const [gameSession, setGameSession] = useState<SpeakingGameSession | null>(null);
  const [gameRevealSpinning, setGameRevealSpinning] = useState(false);
  const [gameRoundStarted, setGameRoundStarted] = useState(false);
  const [infoModal, setInfoModal] = useState<InfoModalContent | null>(null);
  const [activeVaultAnalysis, setActiveVaultAnalysis] = useState<{
    analysis: AnalysisResult | null;
    transcript: string;
    transcriptData: TranscriptData | null;
    audioUrl: string;
    mode: AnalysisMode;
    prompt: string;
    durationSeconds: number | null;
  } | null>(null);
  const [preparedScript, setPreparedScript] = useState<PreparedScriptContext | null>(null);
  const [scriptUploadStatus, setScriptUploadStatus] = useState("");
  const [pendingAuthScreen, setPendingAuthScreen] = useState<Screen | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const saveRecordingPreferenceLoadedRef = useRef(false);
  const scriptInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [screen]);

  useEffect(() => {
    const readyId = window.setTimeout(() => {
      saveRecordingPreferenceLoadedRef.current = true;
    }, 0);
    return () => window.clearTimeout(readyId);
  }, []);

  useEffect(() => {
    if (!saveRecordingPreferenceLoadedRef.current) return;
    window.localStorage.setItem("speech-brigade-save-recording", String(saveRecordingEnabled));
  }, [saveRecordingEnabled]);

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (screen === "eventsAuth" && session) {
      const id = window.setTimeout(() => {
        setScreen(pendingAuthScreen || "events");
        setPendingAuthScreen(null);
      }, 0);
      return () => window.clearTimeout(id);
    }
    if (screen === "signIn" && session) {
      const id = window.setTimeout(() => setScreen("settings"), 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [screen, session, setScreen, pendingAuthScreen]);

  // Page sizes by offset: the first 10, the next 20, then everything else.
  const fetchVaultPage = useCallback(async (offset: number) => {
    if (!supabase) return { rows: [] as VaultRecording[], hasMore: false, error: "" };
    const pageSize = offset === 0 ? 10 : offset < 30 ? 30 - offset : null;
    let query = supabase
      .from("recordings")
      .select("id, prompt, mode, duration_seconds, transcript, transcript_data, audio_url, analysis, created_at")
      .order("created_at", { ascending: false });
    if (vaultFilters.mode !== "all") query = query.eq("mode", vaultFilters.mode);
    if (vaultFilters.analyzed === "analyzed") query = query.not("analysis", "is", null);
    if (vaultFilters.analyzed === "notAnalyzed") query = query.is("analysis", null);
    if (vaultFilters.minStars > 0) query = query.gte("analysis->scorecard->stars", vaultFilters.minStars);
    if (vaultFilters.withinDays > 0) {
      query = query.gte("created_at", new Date(Date.now() - vaultFilters.withinDays * 86_400_000).toISOString());
    }
    // One extra row tells us whether another page exists.
    query = pageSize === null ? query.range(offset, offset + 9999) : query.range(offset, offset + pageSize);
    const { data, error } = await query;
    if (error) return { rows: [] as VaultRecording[], hasMore: false, error: error.message };
    const rows = (data || []) as VaultRecording[];
    if (pageSize === null) return { rows, hasMore: false, error: "" };
    return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize, error: "" };
  }, [vaultFilters]);

  const loadMoreVault = useCallback(() => {
    if (vaultLoadingMore || !vaultHasMore) return;
    const requestId = vaultRequestRef.current;
    setVaultLoadingMore(true);
    void fetchVaultPage(vaultRecordings.length).then(({ rows, hasMore, error }) => {
      if (requestId !== vaultRequestRef.current) return;
      if (error) {
        setVaultError(error);
        setVaultHasMore(false);
      } else {
        setVaultRecordings((current) => [...current, ...rows]);
        setVaultHasMore(hasMore);
      }
      setVaultLoadingMore(false);
    });
  }, [vaultLoadingMore, vaultHasMore, vaultRecordings.length, fetchVaultPage]);

  useEffect(() => {
    const sentinel = vaultSentinelRef.current;
    if (screen !== "pastSpeeches" || !sentinel || !vaultHasMore) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMoreVault();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [screen, vaultHasMore, loadMoreVault]);

  useEffect(() => {
    if (screen !== "pastSpeeches" || !session || !supabase) return undefined;
    let cancelled = false;
    const loadingId = window.setTimeout(() => {
      if (cancelled) return;
      setVaultLoading(true);
      setVaultLoadingMore(false);
      setVaultError("");
    }, 0);
    const requestId = ++vaultRequestRef.current;
    fetchVaultPage(0).then(({ rows, hasMore, error }) => {
      if (cancelled || requestId !== vaultRequestRef.current) return;
      if (error) {
        setVaultError(error);
        setVaultRecordings([]);
        setVaultHasMore(false);
      } else {
        setVaultRecordings(rows);
        setVaultHasMore(hasMore);
      }
      setVaultLoading(false);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(loadingId);
    };
  }, [screen, session, fetchVaultPage]);

  // Impromptu's topic draw appears below the theme spinner, so bring it into view.
  useEffect(() => {
    if (setupStage === "spin") return;
    latestSetupStepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [setupStage]);

  useEffect(() => {
    if (!foundersOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFoundersOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [foundersOpen]);

  useEffect(() => {
    if (!infoModal) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInfoModal(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [infoModal]);

  const openVaultAnalysis = (recording: VaultRecording) => {
    if (!recording.analysis && !recording.audio_url) return;
    setActiveVaultAnalysis({
      analysis: recording.analysis || null,
      transcript: recording.transcript || "",
      transcriptData: recording.transcript_data || null,
      audioUrl: recording.audio_url || "",
      mode: recording.mode,
      prompt: recording.prompt,
      durationSeconds: recording.duration_seconds,
    });
    setScreen("vaultAnalysis");
  };

  const selectedPreparedEvent = selectedPreparedEventId ? PREPARED_EVENT_CONFIGS[selectedPreparedEventId] : null;
  const selectedGame = selectedGameId ? SPEAKING_GAME_CONFIGS[selectedGameId] : null;
  const modeLabel =
    round.mode === "impromptu"
      ? "Impromptu Speaking"
      : round.mode === "extemp"
        ? "Extemporaneous Speaking"
        : selectedPreparedEvent
          ? `${selectedPreparedEvent.name} (${selectedPreparedEvent.acronym})`
          : selectedGame
            ? selectedGame.name
          : "";
  const isDarkPhase = [
    "recordSpeech",
    "analyzing",
    "results",
    "vaultAnalysis",
    "preparedResults",
    "gameRounds",
    "gameResults",
  ].includes(screen);

  const closeInfoModal = () => {
    setInfoModal(null);
  };

  const goToPracticeStart = (nextScreen: Screen) => {
    if (isSupabaseConfigured && !session) {
      setPendingAuthScreen(nextScreen);
      setScreen("eventsAuth");
      return;
    }
    setPendingAuthScreen(null);
    setScreen(nextScreen);
  };

  const goHome = () => {
    setScreen("landing");
    setRound(initialRound);
    setSelectedPreparedEventId(null);
    setPreparedResult(null);
    setPreparedScript(null);
    setScriptUploadStatus("");
    setPendingAuthScreen(null);
    setSelectedGameId(null);
    setGameSession(null);
    setGameRevealSpinning(false);
    setGameRoundStarted(false);
    setThemeReelKey((key) => key + 1);
    setThemeSpinning(false);
    setLockedChoice("");
    setSpeechAnalysisEnabled(true);
    setRecordingError("");
  };

  const resetModeRound = (mode: EventMode) => {
    setRound({ ...initialRound, mode });
    setSetupStage("spin");
    setThemeReelKey((key) => key + 1);
    setThemeSpinning(false);
    setLockedChoice("");
    setSpeechAnalysisEnabled(true);
    setRecordingError("");
  };

  const startMode = (mode: EventMode) => {
    audio.unlock();
    resetModeRound(mode);
    goToPracticeStart(mode === "impromptu" ? "impromptuIntro" : "extempIntro");
  };

  const startPreparedEvent = (eventId: PreparedEventId) => {
    audio.unlock();
    setSelectedPreparedEventId(eventId);
    setPreparedDurationSeconds(PREPARED_EVENT_CONFIGS[eventId].performanceDurationSeconds);
    setPreparedResult(null);
    setPreparedScript(null);
    setScriptUploadStatus("");
    setRound(initialRound);
    setRecordingError("");
    setPreparedStage("setup");
    goToPracticeStart("preparedEventIntro");
  };

  const startSpeakingGame = (gameId: SpeakingGameId) => {
    audio.unlock();
    setSelectedGameId(gameId);
    setGameSession({ gameId });
    setGameRevealSpinning(false);
    setGameRoundStarted(false);
    setScreen("gameSetup");
  };

  useEffect(() => {
    historyKeyRef.current = `${Date.now()}-${Math.random()}`;
    window.history.replaceState({ screen: "landing", key: historyKeyRef.current }, "");

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as { screen?: Screen; key?: string } | null;
      // Entries from before a reload point at screens whose data is gone, so they fall back to landing.
      const target: Screen = state?.key === historyKeyRef.current && state.screen ? state.screen : "landing";
      if (TRANSIENT_SCREENS.has(target)) {
        // Only reachable with Forward after abandoning a round; don't resume a dead timer.
        window.history.back();
        return;
      }

      // Leaving mid-round: release the microphone without uploading anything.
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state !== "inactive") recorder.stop();
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        mediaStreamRef.current = null;
      }

      // Intro screens start a fresh round, like entering them the first time.
      if (target === "impromptuIntro") resetModeRound("impromptu");
      if (target === "extempIntro") resetModeRound("extemp");
      if (target === "preparedEventIntro") {
        setRound(initialRound);
        setPreparedStage("setup");
      }
      // Game setup pages start a fresh game, like the event intros above.
      if (target === "gameSetup") {
        setGameSession((current) => (current ? { gameId: current.gameId } : current));
        setGameRevealSpinning(false);
        setGameRoundStarted(false);
      }
      screenRef.current = target;
      setScreenState(target);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const gameConfig = selectedGameId ? SPEAKING_GAME_CONFIGS[selectedGameId] : null;

  const chooseDifferent = <T,>(items: T[], previous: T | undefined, key: (item: T) => string = String) => {
    const options = previous ? items.filter((item) => key(item) !== key(previous)) : items;
    return randomItem(options.length ? options : items);
  };

  const prepareHotSeatQuestion = () => {
    const previous = gameSession?.question;
    const question = chooseDifferent(hotSeatQuestions, previous);
    setGameSession({ gameId: "hotSeat", question });
    setGameRevealSpinning(false);
    audio.ding();
  };

  const prepareWordFusionWords = (words: string[]) => {
    setGameSession({ gameId: "wordFusion", words });
    setGameRevealSpinning(false);
  };

  const prepareStoryRelay = () => {
    const previous = gameSession?.openingLine;
    const openingLine = chooseDifferent(storyOpenings, previous);
    const twists = uniqueDraw(storyTwists, 3);
    setGameSession({ gameId: "storyRelay", openingLine, twists });
    audio.ding();
  };

  const prepareLandPlane = () => {
    const previous = gameSession?.outline;
    const outline = chooseDifferent(landPlaneOutlines, previous, (item) => item.topic);
    setGameSession({ gameId: "landPlane", outline });
    audio.ding();
  };

  const completeGameRound = (elapsed: number, seconds: number) => {
    if (!gameSession || !gameConfig) return;
    const roundIndex = gameSession.roundIndex || 0;
    const roundElapsedSeconds = [...(gameSession.roundElapsedSeconds || [])];
    roundElapsedSeconds[roundIndex] = Math.round(elapsed);
    const roundSeconds = [...(gameSession.roundSeconds || [])];
    roundSeconds[roundIndex] = seconds;
    setGameRoundStarted(false);
    // Rounds can be picked out of order, so move on to the next one not yet spoken.
    const count = gameConfig.rounds.length;
    const nextIndex = Array.from({ length: count - 1 }, (_, step) => (roundIndex + 1 + step) % count).find(
      (index) => roundElapsedSeconds[index] == null,
    );
    if (nextIndex !== undefined) {
      setGameSession({ ...gameSession, roundIndex: nextIndex, roundElapsedSeconds, roundSeconds });
      return;
    }
    setGameSession({ ...gameSession, roundElapsedSeconds, roundSeconds });
    setScreen("gameResults");
  };

  const selectGameRound = (index: number) => {
    if (!gameSession || gameRoundStarted) return;
    setGameSession({ ...gameSession, roundIndex: index });
  };

  const startGameTimer = () => {
    setGameRoundStarted(false);
    setScreen("gameRounds");
  };

  const retrySpeakingGame = () => {
    if (!gameSession) return;
    setSelectedGameId(gameSession.gameId);
    setGameSession({ gameId: gameSession.gameId });
    setGameRevealSpinning(false);
    setGameRoundStarted(false);
    setScreen("gameSetup");
  };

  const sendMagicLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setAuthStatus("error");
      setAuthError("Supabase is not configured for this local preview.");
      return;
    }
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

  const signOut = async () => {
    if (!supabase) return;
    setSignOutStatus("signingOut");
    const { error } = await supabase.auth.signOut();
    setSignOutStatus(error ? "confirming" : "done");
  };

  const signInWithGoogle = async () => {
    if (!supabase) {
      setAuthStatus("error");
      setAuthError("Supabase is not configured for this local preview.");
      return;
    }
    setAuthError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
    if (error) {
      setAuthStatus("error");
      setAuthError(error.message);
    }
  };

  const RECORDING_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

	  const startRecording = async () => {
	    setRecordingError("");
	    if (!isSupabaseConfigured) {
	      setRecordingError("Recording features need Supabase settings. You can still complete the practice round locally.");
	      return;
	    }
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

  useEffect(() => {
    if (
      (speechAnalysisEnabled || saveRecordingEnabled) &&
      ((screen === "recordSpeech" && roundTimerStarted) ||
        (screen === "preparedEventIntro" && preparedStage === "performance"))
    ) {
      const id = window.setTimeout(() => {
        void startRecording();
      }, 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, roundTimerStarted, preparedStage, speechAnalysisEnabled, saveRecordingEnabled]);

	  const getRecordingSession = async () => {
	    if (!supabase || !supabaseUrl) {
	      throw new Error("Recording features need Supabase settings. You can still use timers and prompts locally.");
	    }
	    const {
	      data: { session: activeSession },
	    } = await supabase.auth.getSession();
	    if (!activeSession) throw new Error("You need to be signed in to record this round.");
	    return {
	      token: activeSession.access_token,
	      userId: activeSession.user.id,
	    };
	  };

	  const uploadRecordingBlob = async (blob: Blob, userId: string) => {
	    if (!supabase) throw new Error("Recording features need Supabase settings.");
	    if (blob.size > MAX_RECORDING_BYTES) throw new Error(RECORDING_TOO_LARGE_MESSAGE);
	    const extension = blob.type.includes("mp4") ? "m4a" : "webm";
	    const path = `${userId}/${Date.now()}.${extension}`;
	    const { error: uploadError } = await supabase.storage
	      .from("impromptu-recordings")
	      .upload(path, blob, { contentType: blob.type || "audio/webm" });
	    if (uploadError) {
	      const statusCode = "statusCode" in uploadError ? String(uploadError.statusCode) : "";
	      if (statusCode === "413" || /maximum allowed size/i.test(uploadError.message)) {
	        throw new Error(RECORDING_TOO_LARGE_MESSAGE);
	      }
	      throw uploadError;
	    }
	    const { data: publicUrlData } = supabase.storage.from("impromptu-recordings").getPublicUrl(path);
	    return { extension, path, audioUrl: publicUrlData.publicUrl };
	  };

	  const removeTemporaryRecording = async (recordingId: string | null, path: string | null) => {
	    if (!supabase) return;
	    const cleanupTasks: Array<Promise<unknown>> = [];
	    if (recordingId) cleanupTasks.push(Promise.resolve(supabase.from("recordings").delete().eq("id", recordingId)));
	    if (path) cleanupTasks.push(supabase.storage.from("impromptu-recordings").remove([path]));
	    const results = await Promise.allSettled(cleanupTasks);
	    results.forEach((result) => {
	      if (result.status === "rejected") {
	        console.warn("Unable to remove temporary recording", result.reason);
	      }
	    });
	  };

  // Pause on the timer holds the recorder too.
  const pauseRecording = (paused: boolean) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (paused && recorder.state === "recording") recorder.pause();
    else if (!paused && recorder.state === "paused") recorder.resume();
  };
  const isRecordingAudio = (speechAnalysisEnabled || saveRecordingEnabled) && !recordingError;

  // Stop throws the take away and releases the microphone; Start records a fresh one.
  const discardRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder) {
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    audioChunksRef.current = [];
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

	  const saveRecordingOnly = async (
	    blob: Blob,
	    mode: AnalysisMode,
	    topic: string,
	    durationSeconds: number,
	    options?: { resultScreen?: Screen; onError?: (message: string) => void },
	  ) => {
	    try {
	      if (!supabase) throw new Error("Recording features need Supabase settings.");
	      const { userId } = await getRecordingSession();
	      const { audioUrl } = await uploadRecordingBlob(blob, userId);

	      const { error: insertError } = await supabase
	        .from("recordings")
	        .insert({
	          user_id: userId,
	          mode,
	          prompt: topic,
	          transcript: "",
	          transcript_data: null,
	          duration_seconds: durationSeconds,
	          audio_url: audioUrl,
	        });
	      if (insertError) throw insertError;

	      setRound((current) => ({ ...current, analysisError: null }));
	      setAnalyzingStage("done");
	      await new Promise((resolve) => setTimeout(resolve, 450));
	    } catch (err) {
	      const message = err instanceof Error ? err.message : "Recording could not be saved. Please try again.";
	      options?.onError?.(message);
	      setRound((current) => ({ ...current, analysisError: message }));
	    } finally {
	      setScreen(options?.resultScreen || "results");
	    }
	  };

	  const runAnalysisPipeline = async (
	    blob: Blob,
	    mode: AnalysisMode,
	    topic: string,
	    durationSeconds: number,
	    saveRecording: boolean,
	    options?: {
	      scriptContext?: PreparedScriptContext | null;
	      resultScreen?: Screen;
	      onComplete?: (result: CompletedAnalysis) => void;
	      onError?: (message: string) => void;
	    },
	  ) => {
	    let temporaryRecordingId: string | null = null;
	    let temporaryPath: string | null = null;
	    try {
	      if (!supabase || !supabaseUrl) {
	        throw new Error("Speech analysis needs Supabase settings. You can still use timers and prompts locally.");
	      }
	      const { token, userId } = await getRecordingSession();

	      setAnalyzingStage("uploading");
	      const { extension, path, audioUrl } = await uploadRecordingBlob(blob, userId);
	      temporaryPath = saveRecording ? null : path;

	      setAnalyzingStage("transcribing");
      const form = new FormData();
      form.append("audio", blob, `recording.${extension}`);
      const transcribeRes = await fetch(`${supabaseUrl}/functions/v1/transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (transcribeRes.status === 413) throw new Error(RECORDING_TOO_LARGE_MESSAGE);
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
	      temporaryRecordingId = saveRecording ? null : recordingRow.id;

	      setAnalyzingStage("analyzing");
      const analyzeRes = await fetch(`${supabaseUrl}/functions/v1/analyze-speech`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          recordingId: recordingRow.id,
          eventMode: mode,
          scriptContext: options?.scriptContext?.status === "ready"
            ? {
                fileName: options.scriptContext.fileName,
                text: options.scriptContext.text,
              }
            : null,
        }),
      });
      const analyzeBody = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeBody.error || "Analysis failed");

	      const completedAnalysis: CompletedAnalysis = {
	        analysis: analyzeBody.analysis,
	        transcript,
	        transcriptData: transcriptData || null,
	        audioUrl: saveRecording ? audioUrl : "",
	      };
	      if (options?.onComplete) {
	        options.onComplete(completedAnalysis);
	      } else {
	        setRound((current) => ({
	          ...current,
	          analysis: completedAnalysis.analysis,
	          analysisTranscript: completedAnalysis.transcript,
	          analysisTranscriptData: completedAnalysis.transcriptData,
	          analysisAudioUrl: completedAnalysis.audioUrl,
	          analysisError: null,
	        }));
	      }
	      if (!saveRecording) {
	        await removeTemporaryRecording(temporaryRecordingId, temporaryPath);
	        temporaryRecordingId = null;
	        temporaryPath = null;
	      }
	      setAnalyzingStage("done");
	      await new Promise((resolve) => setTimeout(resolve, 450));
	    } catch (err) {
	      const message = err instanceof Error ? err.message : "Analysis failed. Please try again.";
	      options?.onError?.(message);
	      setRound((current) => ({ ...current, analysisError: message }));
	    } finally {
	      if (!saveRecording) {
	        await removeTemporaryRecording(temporaryRecordingId, temporaryPath);
	      }
	      setScreen(options?.resultScreen || "results");
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
      setThemeReelKey((key) => key + 1);
      setThemeSpinning(false);
      setLockedChoice("");
      setSetupStage("spin");
      setScreen("impromptuIntro");
    } else {
      setRound({ ...initialRound, mode: "extemp", prepSecondsAllocated: 1800, deliverySecondsAllocated: 420 });
      setLockedChoice("");
      setSetupStage("spin");
      setScreen("extempIntro");
    }
  };

  const practicePreparedAgain = () => {
    if (!selectedPreparedEventId) return;
    setPreparedResult(null);
    setPreparedStage("setup");
    setScreen("preparedEventIntro");
  };

  const startThemeSpin = () => {
    setThemeSpinning(true);
    setRound((current) => ({ ...current, impromptuTheme: "" }));
  };

  const landTheme = (theme: string) => {
    setRound((current) => ({ ...current, impromptuTheme: theme }));
    setThemeSpinning(false);
  };

  const landQuestions = (texts: string[]) => {
    const questions = texts.flatMap((text) => extempQuestions.find((item) => item.question === text) || []);
    setRound((current) => ({
      ...current,
      questionOptions: questions,
      prepSecondsAllocated: 1800,
      deliverySecondsAllocated: 420,
    }));
  };

  // Multi-reel game draws clear the last result while the reels turn.
  const startGameReveal = () => {
    audio.unlock();
    setGameRevealSpinning(true);
    setGameSession((current) => (current ? { gameId: current.gameId } : current));
  };

  const startThreeTwoOneSpin = () => {
    setGameRevealSpinning(true);
    setGameSession({ gameId: "threeTwoOne", roundIndex: 0 });
  };

  const landThreeTwoOne = (argument: string) => {
    setGameSession({ gameId: "threeTwoOne", argument, roundIndex: 0 });
    setGameRevealSpinning(false);
  };

  const chooseTopic = (topic: string) => {
    setLockedChoice(topic);
    window.setTimeout(() => {
      setRound((current) => ({ ...current, selectedTopic: topic, roundStartTime: Date.now() }));
    }, 280);
  };

  const chooseQuestion = (question: ExtempQuestion) => {
    setLockedChoice(question.question);
    window.setTimeout(() => {
      setRound((current) => ({ ...current, selectedQuestion: question, roundStartTime: Date.now() }));
    }, 280);
  };

  const handleScriptFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setScriptUploadStatus("Reading script…");
    setPreparedScript(null);
    try {
      const text = (await extractScriptText(file)).replace(/\s+/g, " ").trim();
      if (!text) {
        setPreparedScript({
          fileName: file.name,
          text: "",
          status: "empty",
          message: "Script attached, but no readable text was found. You can still continue without script context.",
        });
        setScriptUploadStatus("");
        return;
      }
      setPreparedScript({
        fileName: file.name,
        text: text.slice(0, 28000),
        status: "ready",
        message: "Script attached. Feedback will use it as performance context, not as a writing grade.",
      });
      setScriptUploadStatus("");
    } catch (err) {
      setPreparedScript({
        fileName: file.name,
        text: "",
        status: "error",
        message: err instanceof Error ? err.message : "That script could not be read. You can still continue without it.",
      });
      setScriptUploadStatus("");
    }
  };

  const startPlanning = () => {
    setRoundTimerStarted(false);
    setScreen("planSpeech");
  };

  // Running out of prep time stays on the page; "I'm ready to speak" moves on.
  const handlePrepComplete = (elapsed: number, completion: CompletionStatus) => {
    setRound((current) => ({ ...current, prepSecondsUsed: Math.round(elapsed) }));
    if (completion === "expired") return;
    setRoundTimerStarted(false);
    setScreen("recordSpeech");
  };

	  // Running out of delivery time stays on the page; "Analyze this speech" moves on.
	  const handleDeliveryComplete = (elapsed: number, completion: CompletionStatus) => {
	    const roundedElapsed = Math.round(elapsed);
	    setRound((current) => ({ ...current, deliverySecondsUsed: roundedElapsed }));
	    if (completion === "expired") return;
	    const mode = round.mode;
    if (!mode) {
      setScreen("results");
	      return;
	    }
	    const topic = mode === "extemp" ? round.selectedQuestion?.question || "" : round.selectedTopic;
	    if (!speechAnalysisEnabled && !saveRecordingEnabled) {
	      setScreen("results");
	      return;
	    }
	    stopRecording().then((blob) => {
	      if (!blob) {
	        setRound((current) => ({
	          ...current,
	          analysisError:
	            recordingError ||
	            (speechAnalysisEnabled
	              ? "No recording was captured, so analysis is unavailable."
	              : "No recording was captured, so it could not be saved."),
	        }));
        setScreen("results");
	        return;
	      }
	      setAnalyzingStage("uploading");
	      setScreen("analyzing");
	      if (speechAnalysisEnabled) {
	        void runAnalysisPipeline(blob, mode, topic, roundedElapsed, saveRecordingEnabled);
	      } else {
	        void saveRecordingOnly(blob, mode, topic, roundedElapsed);
	      }
	    });
	  };

  const handlePreparedPerformanceComplete = (elapsed: number, completion: CompletionStatus) => {
    if (!selectedPreparedEventId) return;
    const roundedElapsed = Math.round(elapsed);
    const baseResult: PreparedPerformanceResult = {
      eventId: selectedPreparedEventId,
      elapsedSeconds: roundedElapsed,
      timeLimitSeconds: preparedDurationSeconds,
      completion,
      analysis: null,
      analysisTranscript: "",
      analysisTranscriptData: null,
      analysisAudioUrl: "",
      analysisError: null,
    };

    if (!speechAnalysisEnabled && !saveRecordingEnabled) {
      setPreparedResult(baseResult);
      setScreen("preparedResults");
      return;
    }

    stopRecording().then((blob) => {
      if (!blob) {
        setPreparedResult({
          ...baseResult,
          analysisError:
            recordingError ||
            (speechAnalysisEnabled
              ? "No recording was captured, so analysis is unavailable."
              : "No recording was captured, so it could not be saved."),
        });
        setScreen("preparedResults");
        return;
      }
      const eventConfig = PREPARED_EVENT_CONFIGS[selectedPreparedEventId];
      const topic = `${eventConfig.name} (${eventConfig.acronym})`;
      setAnalyzingStage("uploading");
      setScreen("analyzing");
      if (speechAnalysisEnabled) {
        void runAnalysisPipeline(blob, selectedPreparedEventId, topic, roundedElapsed, saveRecordingEnabled, {
          scriptContext: preparedScript,
          resultScreen: "preparedResults",
          onComplete: (analysisResult) => {
            setPreparedResult({
              ...baseResult,
              analysis: analysisResult.analysis,
              analysisTranscript: analysisResult.transcript,
              analysisTranscriptData: analysisResult.transcriptData,
              analysisAudioUrl: analysisResult.audioUrl,
              analysisError: null,
            });
          },
          onError: (message) => {
            setPreparedResult({ ...baseResult, analysisError: message });
          },
        });
      } else {
        void saveRecordingOnly(blob, selectedPreparedEventId, topic, roundedElapsed, {
          resultScreen: "preparedResults",
          onError: (message) => {
            setPreparedResult({ ...baseResult, analysisError: message });
          },
        });
        setPreparedResult(baseResult);
      }
    });
  };

  const warningTone = (second: number) => audio.countdown(second === 0);

  const selectedPrompt = round.mode === "extemp" ? round.selectedQuestion?.question || "" : round.selectedTopic;
  const impromptuThemeTopics = (themeBank.find((item) => item.theme === round.impromptuTheme) || themeBank[0]).topics;
  const playInteractionSound = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest("button:not(:disabled), a[href]")) return;
    if (target.closest("[data-no-press-sound='true']")) return;
    audio.press();
  };

  const practicePrivacyOptions = (
    <PracticePrivacyOptions
      analysisEnabled={speechAnalysisEnabled}
      saveRecordingEnabled={saveRecordingEnabled}
      onAnalysisChange={(enabled) => {
        if (enabled) audio.toggleOn();
        else audio.toggleOff();
        setSpeechAnalysisEnabled(enabled);
        setRecordingError("");
      }}
      onSaveRecordingChange={(enabled) => {
        if (enabled) audio.toggleOn();
        else audio.toggleOff();
        setSaveRecordingEnabled(enabled);
        setRecordingError("");
      }}
    />
  );

  const content = (() => {
    switch (screen) {
      case "landing":
        return (
          <section className="hero">
            <h1>Speech Brigade</h1>
            <p className="lede">Speech and Debate Practice and Analysis</p>
            <div className="hero-actions">
              <button className="ghost-card" type="button" onClick={() => setScreen("gamesSelection")}>
                <span>Speaking Games</span>
              </button>
              <button
                className="primary-card"
                type="button"
                onClick={() => setScreen("events")}
              >
                <span>National Speech & Debate Association</span>
              </button>
            </div>
          </section>
        );
      case "gamesSelection":
        return (
          <section className="narrow">
            <p className="eyebrow">Speaking Games</p>
            <h1>Choose Your Game</h1>
            <div className="event-board">
              <h2 className="event-group-title wide">Team</h2>
              {SPEAKING_GAME_IDS.filter((gameId) => SPEAKING_GAME_CONFIGS[gameId].team).map((gameId, index) => (
                <button
                  className={`event-card compact ${index === 0 ? "centered-row-start" : ""}`}
                  type="button"
                  key={gameId}
                  onClick={() => startSpeakingGame(gameId)}
                >
                  <EventCardTitle name={SPEAKING_GAME_CONFIGS[gameId].name} />
                </button>
              ))}
              <h2 className="event-group-title wide">Individual</h2>
              {SPEAKING_GAME_IDS.filter((gameId) => !SPEAKING_GAME_CONFIGS[gameId].team).map((gameId) => (
                <button className="event-card compact" type="button" key={gameId} onClick={() => startSpeakingGame(gameId)}>
                  <EventCardTitle name={SPEAKING_GAME_CONFIGS[gameId].name} />
                </button>
              ))}
            </div>
          </section>
        );
      case "gameSetup": {
        if (!gameConfig) {
          return (
            <section className="reading">
              <h1>Select a game to continue</h1>
              <button className="secondary" type="button" onClick={() => setScreen("gamesSelection")}>Back to Games</button>
            </section>
          );
        }
        const startButton = (
          <button className="primary" type="button" onClick={startGameTimer}>Start speaking</button>
        );
        const setupStep = (() => {
          switch (gameConfig.id) {
            case "hotSeat":
              return (
                <>
                  <p className="eyebrow step-heading"><strong>Reveal</strong> your question</p>
                  <div className={`question-reveal-card ${gameRevealSpinning ? "revealing" : ""} ${gameSession?.question ? "answered" : ""}`}>
                    {gameSession?.question || "?"}
                  </div>
                  {gameSession?.question && !gameRevealSpinning ? startButton : (
                    <button
                      className="primary"
                      type="button"
                      disabled={gameRevealSpinning}
                      onClick={() => {
                        setGameRevealSpinning(true);
                        audio.slotTick();
                        window.setTimeout(prepareHotSeatQuestion, 760);
                      }}
                    >
                      Reveal
                    </button>
                  )}
                </>
              );
            case "wordFusion":
              return (
                <>
                  <p className="eyebrow step-heading"><strong>Spin</strong> for three words</p>
                  <TopicSpinnerGroup
                    count={3}
                    items={wordFusionBank}
                    onSpinStart={startGameReveal}
                    onLand={prepareWordFusionWords}
                    useLabel="Start speaking"
                    onUse={startGameTimer}
                    canUse={Boolean(gameSession?.words?.length) && !gameRevealSpinning}
                  />
                </>
              );
            case "storyRelay":
              return (
                <>
                  <p className="eyebrow step-heading"><strong>Reveal</strong> your opening line</p>
                  <div className="game-prompt-card">
                    <span>Opening Line</span>
                    <strong>{gameSession?.openingLine || "?"}</strong>
                  </div>
                  {gameSession?.openingLine ? startButton : (
                    <button className="primary" type="button" onClick={prepareStoryRelay}>Reveal</button>
                  )}
                </>
              );
            case "landPlane":
              return (
                <>
                  <p className="eyebrow step-heading"><strong>Reveal</strong> your speech outline</p>
                  {gameSession?.outline ? (
                    <>
                      <SpeechOutlineCard outline={gameSession.outline} />
                      {startButton}
                    </>
                  ) : (
                    <>
                      <div className="game-prompt-card">
                        <span>Speech Outline</span>
                        <strong>?</strong>
                      </div>
                      <button className="primary" type="button" onClick={prepareLandPlane}>Reveal</button>
                    </>
                  )}
                </>
              );
            case "threeTwoOne":
              return (
                <>
                  <p className="eyebrow step-heading"><strong>Spin</strong> for your argument</p>
                  <TopicSpinner
                    items={threeTwoOneArguments}
                    onSpinStart={startThreeTwoOneSpin}
                    onLand={landThreeTwoOne}
                    useLabel="Start speaking"
                    onUse={startGameTimer}
                    canUse={Boolean(gameSession?.argument) && !gameRevealSpinning}
                  />
                </>
              );
            case "weighing":
              return (
                <>
                  <TopicSpinnerGroup
                    count={2}
                    items={weighingScenarios}
                    layout="row"
                    headings={[
                      <><strong>Spin</strong> for Speaker 1&apos;s topic</>,
                      <><strong>Spin</strong> for Speaker 2&apos;s topic</>,
                    ]}
                    labels={["Speaker 1: this is worse", "Speaker 2: this is worse"]}
                    tones={["blue", "green"]}
                    spinEach
                    onSpinStart={startGameReveal}
                    onLand={(scenarios) => {
                      setGameSession({ gameId: "weighing", scenarios, roundIndex: 0 });
                      setGameRevealSpinning(false);
                    }}
                    useLabel="Start speaking"
                    onUse={startGameTimer}
                    canUse={Boolean(gameSession?.scenarios?.length) && !gameRevealSpinning}
                  />
                </>
              );
          }
        })();
        return (
          <section className="reading event-setup">
            <h1>{gameConfig.name}</h1>
            <RulesLink label="How it works" onOpen={() => openRules(gameConfig.id)} />
            <div className="setup-step spin-screen">{setupStep}</div>
          </section>
        );
      }
      case "gameRounds":
        if (!gameConfig || !gameSession) {
          return (
            <section className="results">
              <p className="eyebrow">No game selected</p>
              <button className="secondary" type="button" onClick={() => setScreen("gamesSelection")}>Back to Games</button>
            </section>
          );
        }
        return (
          <section className="delivery-layout round-timer-page">
            <h1>{gameConfig.name}</h1>
            <GameTimer
              config={gameConfig}
              session={gameSession}
              started={gameRoundStarted}
              onStart={() => {
                audio.unlock();
                setGameRoundStarted(true);
              }}
              onRoundComplete={completeGameRound}
              onSelectRound={selectGameRound}
              onWarningSecond={warningTone}
              onTwist={audio.ding}
            />
          </section>
        );
      case "gameResults":
        if (!gameConfig || !gameSession) {
          return (
            <section className="results">
              <p className="eyebrow">No game selected</p>
              <button className="secondary" type="button" onClick={() => setScreen("gamesSelection")}>Back to Games</button>
            </section>
          );
        }
        return (
          <section className="results">
            <h1>Round complete!</h1>
            <div className="summary-card">
              <SummaryRow label="Game" value={gameConfig.name} />
              {gameSession.question ? <SummaryRow label="Question" value={gameSession.question} /> : null}
              {gameSession.words?.length ? <SummaryRow label="Words" value={gameSession.words.join(", ")} /> : null}
              {gameSession.openingLine ? <SummaryRow label="Opening line" value={gameSession.openingLine} /> : null}
              {gameSession.outline ? <SummaryRow label="Topic" value={gameSession.outline.topic} /> : null}
              {gameSession.argument ? <SummaryRow label="Argument" value={gameSession.argument} /> : null}
              {gameSession.scenarios?.map((scenario, index) => (
                <SummaryRow key={scenario} label={`Speaker ${index + 1} defended`} value={scenario} />
              ))}
              {gameConfig.rounds.map((round, index) => (
                <SummaryRow
                  key={round.label}
                  label={gameConfig.rounds.length > 1 ? round.label : "Time used"}
                  value={`${formatTime(gameSession.roundElapsedSeconds?.[index] || 0)} of ${formatTime(gameSession.roundSeconds?.[index] ?? round.seconds)}`}
                />
              ))}
            </div>
            <div className="button-row">
              <button className="primary" type="button" onClick={retrySpeakingGame}>Practice Again</button>
              <button className="secondary" type="button" onClick={() => setScreen("gamesSelection")}>Back to Games</button>
            </div>
          </section>
        );
      case "rules": {
        const rulesGroup = (title: string, topicIds: RulesTopicId[]) => (
          <div className="account-field rules-group" key={title}>
            <span>{title}</span>
            <ul>
              {topicIds.map((topicId) => (
                <li key={topicId}>
                  <RulesLink label={rulesTopicName(topicId)} onOpen={() => openRules(topicId)} />
                </li>
              ))}
            </ul>
          </div>
        );
        return (
          <section className="narrow">
            <p className="eyebrow">National Speech & Debate Association</p>
            <h1>Rules</h1>
            <div className="account-card rules-card">
              {rulesGroup("Limited Prep", ["impromptu", "extemp"])}
              {rulesGroup("Prepared Speaking", PREPARED_EVENT_IDS)}
              {rulesGroup("Interpretation", INTERPRETATION_EVENT_IDS)}
              {rulesGroup("Games", SPEAKING_GAME_IDS)}
            </div>
          </section>
        );
      }
      case "rulesDetail":
        return (
          <section className="reading rules-detail">
            <p className="eyebrow">Rules</p>
            <h1>{rulesTopicName(rulesTopic)}</h1>
            <InstructionBlock>
              <RulesContent topicId={rulesTopic} />
            </InstructionBlock>
            <button className="secondary" type="button" onClick={goBack}>
              Back
            </button>
          </section>
        );
      case "events":
        return (
          <section className="narrow">
            <p className="eyebrow">National Speech & Debate Association</p>
            <h1>Choose Your Event</h1>
            <div className="event-board grouped">
              <div className="event-group">
                <h2 className="event-group-title">Limited Prep</h2>
                <div className="event-group-cards">
                  <button className="event-card compact" type="button" onClick={() => startMode("impromptu")}>
                    <EventCardTitle name="Impromptu Speaking" />
                  </button>
                  <button className="event-card compact" type="button" onClick={() => startMode("extemp")}>
                    <EventCardTitle name="Extemporaneous Speaking" />
                  </button>
                </div>
              </div>
              <div className="event-group">
                <h2 className="event-group-title">Prepared Speaking</h2>
                <div className="event-group-cards">
                  {PREPARED_EVENT_IDS.map((eventId) => (
                    <button className="event-card compact" type="button" key={eventId} onClick={() => startPreparedEvent(eventId)}>
                      <EventCardTitle name={PREPARED_EVENT_CONFIGS[eventId].name} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="event-group wide">
                <h2 className="event-group-title">Interpretation</h2>
                <div className="event-group-cards">
                  {INTERPRETATION_EVENT_IDS.map((eventId) => (
                    <button className="event-card compact" type="button" key={eventId} onClick={() => startPreparedEvent(eventId)}>
                      <EventCardTitle name={PREPARED_EVENT_CONFIGS[eventId].name} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      case "preparedEventIntro":
        if (!selectedPreparedEvent) {
          return (
            <section className="reading">
              <h1>Select an event to continue</h1>
              <button className="secondary" type="button" onClick={() => setScreen("events")}>
                Back to Events
              </button>
            </section>
          );
        }
        return (
          <section className="reading event-setup speech-workspace prepared-setup">
            <div className="setup-corner">
              {practicePrivacyOptions}
              <input
                ref={scriptInputRef}
                className="visually-hidden"
                type="file"
                accept=".pdf,.docx,.txt,.md,.rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={handleScriptFileChange}
              />
              <button
                className="corner-upload"
                type="button"
                disabled={preparedStage !== "setup"}
                title="PDF, DOCX, TXT, MD, and RTF files are supported."
                onClick={() => scriptInputRef.current?.click()}
              >
                <span className="document-icon" aria-hidden="true" />
                Upload script (optional)
              </button>
              {scriptUploadStatus ? <p className="script-status compact">{scriptUploadStatus}</p> : null}
              {preparedScript ? (
                <div className={`script-context-card compact ${preparedScript.status}`} title={preparedScript.message}>
                  <strong>{preparedScript.fileName}</strong>
                  <p>
                    {preparedScript.status === "ready"
                      ? "Used as performance context"
                      : preparedScript.status === "empty"
                        ? "No readable text found"
                        : "Couldn't read this file"}
                  </p>
                </div>
              ) : null}
            </div>
            <h1>{selectedPreparedEvent.name}</h1>
            <div className="setup-step delivery-layout">
              {preparedStage === "performance" && (speechAnalysisEnabled || saveRecordingEnabled) && recordingError ? (
                <p className="recording-notice error">Microphone unavailable — this round won&apos;t be recorded.</p>
              ) : null}
              <TimerPanel
                seconds={preparedDurationSeconds}
                presets={PREPARED_DURATION_PRESETS}
                onSecondsChange={setPreparedDurationSeconds}
                pausable
                recording={isRecordingAudio}
                onPauseChange={pauseRecording}
                onStop={() => {
                  discardRecording();
                  setPreparedStage("setup");
                }}
                buttonLabel={speechAnalysisEnabled ? "Analyze this speech" : "I'm done"}
                timerKey={`prepared-performance-${selectedPreparedEvent.id}`}
                active={preparedStage === "performance"}
                onStart={() => {
                  audio.unlock();
                  setPreparedResult(null);
                  setPreparedStage("performance");
                }}
                onComplete={handlePreparedPerformanceComplete}
                onWarningSecond={warningTone}
              />
              {preparedStage === "performance" && (speechAnalysisEnabled || saveRecordingEnabled) ? <RecordingPrivacyFooter /> : null}
            </div>
            <RulesLink label="Rules" onOpen={() => openRules(selectedPreparedEvent.id)} />
            <button className="secondary" type="button" onClick={goBack}>
              Back
            </button>
          </section>
        );
      case "preparedResults": {
        const resultEvent = preparedResult ? PREPARED_EVENT_CONFIGS[preparedResult.eventId] : selectedPreparedEvent;
        if (!resultEvent || !preparedResult) {
          return (
            <section className="results">
              <p className="eyebrow">No performance recorded</p>
              <button className="secondary" type="button" onClick={() => setScreen("events")}>
                Back to Events
              </button>
            </section>
          );
        }
        return (
          <section className="results">
            <h1>Round complete!</h1>
            <p className="lede">Great work. You&apos;ve completed a practice performance.</p>
            {preparedResult.analysis ? (
              <ScorecardPanel
                analysis={preparedResult.analysis}
                transcript={preparedResult.analysisTranscript}
                transcriptData={preparedResult.analysisTranscriptData}
                audioUrl={preparedResult.analysisAudioUrl}
                theme={resultEvent.category === "interpretation" ? "Interpretation performance" : "Prepared speaking"}
                mode={resultEvent.id}
              />
            ) : preparedResult.analysisError ? (
              <div className="analysis-error-card">
                <span className="eyebrow">{preparedResult.analysisError.toLowerCase().includes("recording") ? "Recording unavailable" : "Analysis unavailable"}</span>
                <p>{preparedResult.analysisError}</p>
              </div>
            ) : (
              <div className="analysis-error-card future-analysis-card">
                <span className="eyebrow">No analysis requested</span>
                <p>This round was completed without speech analysis. Turn on speech analysis before your next performance to generate personalized feedback.</p>
              </div>
            )}
            <div className="button-row">
              <button className="primary" type="button" onClick={practicePreparedAgain}>Practice Again</button>
              <button className="secondary" type="button" onClick={() => setScreen("events")}>Back to Events</button>
            </div>
          </section>
        );
      }
      case "eventsAuth":
        return (
          <section className="narrow auth-screen">
            <p className="eyebrow">{isSupabaseConfigured ? "Sign in to continue" : "Local preview"}</p>
            <h1>{isSupabaseConfigured ? "Sign in to your account" : "Practice mode is available"}</h1>
            <p className="lede">
              {isSupabaseConfigured
                ? "Sign in to your account, or sign up for a new one, to start a National Speech & Debate Association practice round."
                : "Supabase is not configured on this computer, so saved recordings and speech analysis are disabled. Timers, prompts, and practice rounds still work."}
            </p>
            {!isSupabaseConfigured ? (
              <button className="primary" type="button" onClick={() => setScreen("events")}>
                Continue to Events
              </button>
            ) : (
              <button className="primary" type="button" onClick={() => setScreen("signIn")}>
                Sign In
              </button>
            )}
            <button className="secondary" type="button" onClick={goBack}>
              Back
            </button>
          </section>
        );
      case "signIn":
        return (
          <section className="narrow auth-screen sign-in-screen">
            <h1 className="sign-in-heading">
              {!isSupabaseConfigured ? (
                "Practice mode is available"
              ) : authStatus === "sent" ? (
                <>
                  Check your <em>email</em>
                </>
              ) : (
                <>
                  Welcome <em>back</em>
                </>
              )}
            </h1>
            <p className="lede">
              {!isSupabaseConfigured
                ? "Add Supabase environment variables to enable sign-in, saved recordings, transcription, and speech analysis."
                : authStatus === "sent"
                  ? "We sent you a sign-in link."
                  : "Sign in to continue your challenge."}
            </p>
            {!isSupabaseConfigured ? (
              <button className="primary" type="button" onClick={() => setScreen("events")}>
                Continue to Events
              </button>
            ) : authStatus === "sent" ? (
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
              <>
                <button className="google-signin-button" type="button" onClick={signInWithGoogle}>
                  <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z"
                    />
                    <path
                      fill="#34A853"
                      d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
                    />
                  </svg>
                  Continue with Google
                </button>
                <div className="auth-divider">
                  <span>or</span>
                </div>
                <form className="auth-form" onSubmit={sendMagicLink}>
                  <div className="auth-field">
                    <label htmlFor="auth-email">Email</label>
                    <input
                      id="auth-email"
                      type="email"
                      required
                      placeholder="you@example.com"
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                    />
                  </div>
                  <button className="auth-primary-button" type="submit" disabled={authStatus === "sending"}>
                    {authStatus === "sending" ? "Sending…" : "Email me a magic link"}
                  </button>
                  {authStatus === "error" ? <p className="auth-error">{authError}</p> : null}
                </form>
              </>
            )}
            <button className="secondary" type="button" onClick={goBack}>
              Back
            </button>
          </section>
        );
      case "settings":
        return (
          <section className="narrow auth-screen">
            <h1>Settings</h1>
            {!isSupabaseConfigured ? (
              <p className="lede">Supabase is not configured for this local preview, so account features are disabled.</p>
            ) : session ? (
              <div className="account-card">
                <h2>
                  <MailIcon />
                  Account
                </h2>
                <div className="account-field">
                  <span>Email</span>
                  <p>{session.user.email}</p>
                </div>
                <div className="account-field">
                  <span>Signed in with</span>
                  <p>{session.user.app_metadata?.provider === "google" ? "Google" : "Email"}</p>
                </div>
              </div>
            ) : signOutStatus === "done" ? (
              <p className="lede sign-out-success">You&apos;ve successfully signed out.</p>
            ) : (
              <p className="lede">You&apos;re not signed in.</p>
            )}
            <button className="secondary" type="button" onClick={goBack}>
              Back
            </button>
            {isSupabaseConfigured && session ? (
              signOutStatus === "confirming" || signOutStatus === "signingOut" ? (
                <div className="sign-out-confirm" role="group" aria-label="Confirm sign out">
                  <p>Sign out of your account?</p>
                  <div>
                    <button
                      className="sign-out-button"
                      type="button"
                      disabled={signOutStatus === "signingOut"}
                      onClick={() => setSignOutStatus("idle")}
                    >
                      Cancel
                    </button>
                    <button
                      className="sign-out-button confirm"
                      type="button"
                      disabled={signOutStatus === "signingOut"}
                      onClick={() => void signOut()}
                    >
                      <SignOutIcon />
                      {signOutStatus === "signingOut" ? "Signing out…" : "Sign out"}
                    </button>
                  </div>
                </div>
              ) : (
                <button className="sign-out-button" type="button" onClick={() => setSignOutStatus("confirming")}>
                  <SignOutIcon />
                  Sign out
                </button>
              )
            ) : null}
          </section>
        );
      case "pastSpeeches":
        return (
          <section className="narrow auth-screen">
            <h1>Recent</h1>
            {!isSupabaseConfigured ? (
              <p className="lede">Supabase is not configured for this local preview, so saved recordings are unavailable.</p>
            ) : !session ? (
              <>
                <p className="lede">Sign in to listen to your saved practice speeches.</p>
                <button className="primary" type="button" onClick={() => setScreen("signIn")}>
                  Sign In
                </button>
              </>
            ) : (
              <div className="vault-section">
                <VaultFilterBar filters={vaultFilters} active={vaultFiltersActive} onChange={setVaultFilters} />
                {vaultLoading ? (
                  <p className="vault-status">Loading your recordings…</p>
                ) : vaultError ? (
                  <p className="vault-status error">{vaultError}</p>
                ) : vaultRecordings.length === 0 && vaultFiltersActive ? (
                  <p className="vault-status">No recordings match these filters.</p>
                ) : vaultRecordings.length === 0 ? (
                  <p className="vault-status">No recordings yet — turn on Save recording before a round to see it here.</p>
                ) : (
                  <>
                    <div className="vault-list">
                      {vaultRecordings.map((recording) => (
                        <VaultCard key={recording.id} recording={recording} onOpen={openVaultAnalysis} />
                      ))}
                    </div>
                    {vaultHasMore ? (
                      <div className="vault-sentinel" ref={vaultSentinelRef}>
                        {vaultLoadingMore ? <p className="vault-status">Loading more recordings…</p> : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            )}
            <button className="secondary" type="button" onClick={goBack}>
              Back
            </button>
          </section>
        );
      case "impromptuIntro":
        return (
          <section className="reading event-setup">
            <h1>Impromptu Speaking</h1>
            <div className="setup-corner">
              {practicePrivacyOptions}
              <RulesLink label="How it works" onOpen={() => openRules("impromptu")} />
            </div>
            <div className="setup-step spin-screen">
              <p className="eyebrow step-heading"><strong>Spin</strong> for your theme</p>
              <TopicSpinner
                key={themeReelKey}
                items={themeNames}
                onSpinStart={startThemeSpin}
                onLand={landTheme}
                useLabel="Use this theme"
                onUse={() => setSetupStage("topics")}
                canUse={Boolean(round.impromptuTheme) && !themeSpinning}
                showActions={setupStage === "spin"}
              />
            </div>
            {setupStage !== "spin" ? (
              <div className="setup-step spin-screen" ref={setupStage === "topics" ? latestSetupStepRef : undefined}>
                <p className="eyebrow step-heading"><strong>Spin</strong> for a list of topics, and <strong>choose</strong> which to speak on</p>
                <TopicSpinnerGroup
                  count={3}
                  items={impromptuThemeTopics}
                  layout="row"
                  onSpinStart={() => audio.unlock()}
                  onLand={(topics) => setRound((current) => ({ ...current, topicOptions: topics }))}
                  canSpin={round.topicOptions.length === 0}
                  useLabel="Start planning"
                  onUse={startPlanning}
                  canUse={Boolean(round.selectedTopic)}
                  selectedValue={lockedChoice}
                  onSelect={chooseTopic}
                  pickPrompt="Pick which of these 3 topics to speak on"
                />
                {round.topicOptions.length ? (
                  <p className="competition-note">Note that you will only have 30 seconds to choose during the competition.</p>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      case "planSpeech":
        return (
          <section className="delivery-layout round-timer-page">
            <h1>Plan your speech</h1>
            <TimerPanel
              seconds={round.mode === "extemp" ? 1800 : round.prepSecondsAllocated}
              maxSeconds={round.mode === "impromptu" ? IMPROMPTU_MAX_SECONDS : undefined}
              onSecondsChange={
                round.mode === "impromptu"
                  ? (seconds) => setRound((current) => ({ ...current, prepSecondsAllocated: seconds }))
                  : undefined
              }
              buttonLabel="I'm ready to speak"
              topic={selectedPrompt}
              timerKey={`${round.mode}-prep-${selectedPrompt}`}
              active={roundTimerStarted}
              onStart={() => {
                audio.unlock();
                setRoundTimerStarted(true);
              }}
              onComplete={handlePrepComplete}
              onWarningSecond={warningTone}
            />
          </section>
        );
      case "recordSpeech":
        return (
          <section className="delivery-layout round-timer-page">
            <h1>Record your speech</h1>
            {roundTimerStarted && (speechAnalysisEnabled || saveRecordingEnabled) && recordingError ? (
              <p className="recording-notice error">Microphone unavailable — this round won&apos;t be recorded.</p>
            ) : null}
            <TimerPanel
              seconds={round.deliverySecondsAllocated}
              presets={round.mode === "extemp" ? EXTEMP_DURATION_PRESETS : undefined}
              maxSeconds={round.mode === "impromptu" ? IMPROMPTU_MAX_SECONDS : undefined}
              onSecondsChange={(seconds) => setRound((current) => ({ ...current, deliverySecondsAllocated: seconds }))}
              pausable
              recording={isRecordingAudio}
              onPauseChange={pauseRecording}
              onStop={() => {
                discardRecording();
                setRoundTimerStarted(false);
              }}
              buttonLabel={speechAnalysisEnabled ? "Analyze this speech" : "I'm done"}
              topic={selectedPrompt}
              timerKey={`${round.mode}-delivery-${selectedPrompt}`}
              active={roundTimerStarted}
              onStart={() => {
                audio.unlock();
                setRoundTimerStarted(true);
              }}
              onComplete={handleDeliveryComplete}
              onWarningSecond={warningTone}
            />
            {speechAnalysisEnabled || saveRecordingEnabled ? <RecordingPrivacyFooter /> : null}
          </section>
        );
      case "analyzing":
        return (
          <section className="countdown-screen analyzing-screen">
            <div className="analyzing-spinner" />
	            <p className="analyzing-status" role="status">
	              {!speechAnalysisEnabled
	                ? "Saving your recording…"
	                : analyzingStage === "uploading"
	                  ? saveRecordingEnabled
	                    ? "Saving your recording…"
	                    : "Preparing your speech…"
	                  : analyzingStage === "transcribing"
	                    ? "Transcribing your speech…"
	                    : analyzingStage === "done"
	                      ? "Done"
	                      : "Analyzing…"}
            </p>
            <AnalyzingProgress stage={analyzingStage} saveOnly={!speechAnalysisEnabled} />
          </section>
        );
      case "extempIntro":
        return (
          <section className="reading event-setup">
            <h1>Extemporaneous Speaking</h1>
            <div className="setup-corner">
              {practicePrivacyOptions}
              <RulesLink label="How it works" onOpen={() => openRules("extemp")} />
            </div>
            <div className="setup-step spin-screen">
              <p className="eyebrow step-heading"><strong>Spin</strong> for a list of questions, and <strong>choose</strong> which to speak on</p>
              <TopicSpinnerGroup
                count={3}
                items={extempQuestionTexts}
                labels={round.questionOptions.map((question) => question.category)}
                onSpinStart={() => audio.unlock()}
                onLand={landQuestions}
                canSpin={round.questionOptions.length === 0}
                useLabel="Start planning"
                onUse={startPlanning}
                canUse={Boolean(round.selectedQuestion)}
                selectedValue={lockedChoice}
                onSelect={(text) => {
                  const question = round.questionOptions.find((item) => item.question === text);
                  if (question) chooseQuestion(question);
                }}
                pickPrompt="Pick which of these 3 questions to speak on"
              />
              {round.questionOptions.length ? (
                <p className="competition-note">Note that you will only have 30 seconds to choose during the competition.</p>
              ) : null}
            </div>
          </section>
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
            <h1>Round complete!</h1>
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
                  <SummaryRow label="Delivery available" value={formatTime(round.deliverySecondsAllocated)} />
                </>
              )}
              <SummaryRow label="Preparation used" value={formatTime(round.prepSecondsUsed)} />
              <SummaryRow label="Delivery used" value={formatTime(round.deliverySecondsUsed)} />
            </div>

	            {round.analysisError ? (
	              <div className="analysis-error-card">
	                <span className="eyebrow">{round.analysisError.toLowerCase().includes("recording") ? "Recording unavailable" : "Analysis unavailable"}</span>
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
              <button className="secondary" type="button" onClick={() => setScreen("pastSpeeches")}>
                Back to your vault
              </button>
            </section>
          );
        }
	        return (
	          <section className="results">
		            <button type="button" className="back-link" onClick={() => setScreen("pastSpeeches")}>
		              ← Back to your vault
		            </button>
	            {activeVaultAnalysis.analysis ? (
	              <ScorecardPanel
	                analysis={activeVaultAnalysis.analysis}
	                transcript={activeVaultAnalysis.transcript}
	                transcriptData={activeVaultAnalysis.transcriptData}
	                audioUrl={activeVaultAnalysis.audioUrl}
	                theme=""
	                mode={activeVaultAnalysis.mode}
	              />
	            ) : (
	              <div className="recording-review-card">
	                <p className="eyebrow">Saved recording</p>
	                <h1>Practice recording.</h1>
	                <div className="summary-card">
	                  <SummaryRow label="Event" value={formatAnalysisModeLabel(activeVaultAnalysis.mode)} />
	                  <SummaryRow label="Prompt" value={activeVaultAnalysis.prompt} />
	                  <SummaryRow label="Duration" value={formatVaultDuration(activeVaultAnalysis.durationSeconds)} />
	                </div>
	                {activeVaultAnalysis.audioUrl ? <AudioPlayer src={activeVaultAnalysis.audioUrl} /> : null}
	              </div>
	            )}
	          </section>
	        );
      default:
        return null;
    }
  })();

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
	            <div className="header-spacer" />
	            <div className="mode-label" />
	          </>
	        ) : (
	          <>
	            {/* Text wordmark on desktop, round logo on phones. */}
	            <button className="wordmark" type="button" onClick={goHome} aria-label="Return home">
	              <span className="wordmark-text">
	                <span>Speech</span> Brigade
	              </span>
	              <Image
	                className="wordmark-logo"
	                src="/speech-brigade-logo.png"
	                alt=""
	                width={64}
	                height={64}
	                priority
	              />
	            </button>
	            <div className="mode-label" />
	          </>
	        )}
	        <nav className="header-actions" aria-label="Account and recordings">
	          <button
	            className="home-button"
	            type="button"
		            onClick={() => setScreen("pastSpeeches")}
	          >
	            Recent
	          </button>
	          <button className="home-button" type="button" onClick={() => setScreen("rules")}>
	            Rules
	          </button>
	          {session ? (
	            <button
	              className="home-button icon-button"
	              type="button"
	              aria-label="Settings"
	              title="Settings"
	              onClick={() => {
	                setSignOutStatus("idle");
	                setScreen("settings");
	              }}
	            >
	              <SettingsIcon />
	            </button>
	          ) : (
	            <button
	              className="home-button"
	              type="button"
	              onClick={() => setScreen("signIn")}
	            >
	              Sign In
	            </button>
	          )}
	        </nav>
	      </header>
      <div className={`screen-frame ${screen === "landing" ? "landing-frame" : ""}`} key={screen}>
        {content}
      </div>
      <button
        type="button"
        className="creator-float"
        onClick={() => setFoundersOpen(true)}
        aria-label="Learn about Speech Brigade's founders"
      >
        <span className="creator-copy">Learn About Speech Brigade&apos;s Founders</span>
      </button>
      <a
        className="tip-float"
        href="https://buymeacoffee.com/speechbrigade"
        target="_blank"
        rel="noreferrer"
        aria-label="Leave a tip to keep Speech Brigade free"
      >
        Leave a tip to keep our site free!
      </a>
      {infoModal ? (
        <div
          className="founders-modal-backdrop"
          role="presentation"
          onMouseDown={closeInfoModal}
        >
          <section
            className="info-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="info-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="founders-close"
              type="button"
              onClick={closeInfoModal}
              aria-label="Close informational popup"
            >
              ×
            </button>
            <span className="document-icon large" aria-hidden="true" />
            {infoModal.badge ? <span className="coming-soon-badge">{infoModal.badge}</span> : null}
            <h2 id="info-modal-title">{infoModal.title}</h2>
            <div className="info-modal-copy">
              {infoModal.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <button className="primary" type="button" onClick={closeInfoModal}>
              Got it
            </button>
          </section>
        </div>
      ) : null}
      {foundersOpen ? (
        <div
          className="founders-modal-backdrop"
          role="presentation"
          onMouseDown={() => setFoundersOpen(false)}
        >
          <section
            className="founders-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="founders-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="founders-close"
              type="button"
              onClick={() => setFoundersOpen(false)}
              aria-label="Close founders popup"
            >
              ×
            </button>
            <p className="eyebrow">Speech Brigade</p>
            <h2 id="founders-title">Meet the Founders</h2>
            <div className="founders-grid">
              <article className="founder-card">
                <Image
                  src="/founders/jd-hopper-founder.png"
                  alt="JD Hopper speaking"
                  width={900}
                  height={900}
                  sizes="(max-width: 760px) 90vw, 360px"
                />
                <h3>JD Hopper</h3>
                <div className="founder-links">
                  <a href="https://www.jdhopper.org/" target="_blank" rel="noreferrer">
                    Website
                  </a>
                  <a href="https://www.linkedin.com/in/jd-hopper" target="_blank" rel="noreferrer">
                    LinkedIn
                  </a>
                </div>
              </article>
              <article className="founder-card">
                <Image
                  src="/founders/mona-su.jpg"
                  alt="Mona Su"
                  width={400}
                  height={400}
                  sizes="(max-width: 760px) 90vw, 360px"
                />
                <h3>Mona Su</h3>
                <div className="founder-links">
                  <a href="https://www.speechpact.com/" target="_blank" rel="noreferrer">
                    Website
                  </a>
                  <a href="https://www.linkedin.com/in/mona-su-255301195" target="_blank" rel="noreferrer">
                    LinkedIn
                  </a>
                </div>
              </article>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
