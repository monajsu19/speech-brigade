"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase, supabaseUrl } from "./supabaseClient";

type EventMode = "impromptu" | "extemp";
type PreparedEventId = "oo" | "inf" | "di" | "hi" | "duo" | "poi";
type PreparedEventCategory = "prepared" | "interpretation";
type CompletionStatus = "manual" | "expired";
type SpeakingGameId = "hotSeat" | "wordFusion" | "storyRelay" | "landPlane";
type Screen =
  | "landing"
  | "gamesSelection"
  | "gameInstructions"
  | "hotSeatReveal"
  | "wordFusionSpin"
  | "storyRelaySetup"
  | "landPlaneSetup"
  | "gamePrepCountdown"
  | "gameChallenge"
  | "gameResults"
  | "eventsAuth"
  | "events"
  | "preparedSelection"
  | "interpretationSelection"
  | "preparedEventIntro"
  | "speechWorkspace"
  | "preparedDeliveryCountdown"
  | "preparedPerformance"
  | "preparedResults"
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

interface PreparedEventConfig {
  id: PreparedEventId;
  category: PreparedEventCategory;
  name: string;
  acronym: string;
  shortDescription: string;
  welcomeTitle: string;
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
  completion: CompletionStatus;
}

interface InfoModalContent {
  title: string;
  body: string[];
  badge?: string;
}

interface SpeakingGameConfig {
  id: SpeakingGameId;
  name: string;
  tagline: string;
  description: string;
  durationLabel: string;
  durationSeconds: number;
  icon: string;
  welcomeTitle: string;
  instructionParagraphs: string[];
  setupScreen: Screen;
  challengeLabel: string;
  resultTitle: string;
  tip: string;
  retryLabel: string;
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
  activeTwistIndex?: number;
  outline?: SpeechOutline;
  elapsedSeconds?: number;
  completion?: CompletionStatus;
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
    welcomeTitle: "Welcome to Original Oratory",
    introParagraphs: [
      "Original Oratory challenges you to develop and deliver an original speech that communicates a compelling message.",
      "Your speech may address an important issue, challenge an audience's perspective, or inspire meaningful reflection or action.",
    ],
    objectiveParagraph:
      "Your goal is to present a clear central argument, support your ideas with meaningful evidence and examples, and connect with your audience through confident, engaging delivery.",
    expectationsParagraph:
      "Prepare a polished original speech and practice delivering it under tournament-style timing with clear structure, purposeful emphasis, and confident audience engagement.",
    futureWorkflowParagraph:
      "In Speech Brigade, you will be able to upload your written speech, receive AI feedback on your writing, and receive recommendations for improving your performance. For now, you can practice delivering your speech under tournament-style timing.",
    performanceDurationSeconds: 600,
    aiModalTitle: "AI Writing & Delivery Coaching",
    aiModalBody:
      "Soon, Speech Brigade will analyze your written Original Oratory and provide personalized recommendations for improving its argument, organization, evidence, clarity, and rhetorical impact.\n\nIt will also offer performance advice, including recommendations for pacing, emphasis, transitions, vocal delivery, and audience engagement.\n\nThe goal is to help you strengthen both what you say and how you say it.",
  },
  inf: {
    id: "inf",
    category: "prepared",
    name: "Informative Speaking",
    acronym: "INF",
    shortDescription: "Teach your audience something new through a clear, engaging presentation.",
    welcomeTitle: "Welcome to Informative Speaking",
    introParagraphs: [
      "Informative Speaking challenges you to teach your audience something meaningful through a clear, engaging, and well-organized presentation.",
      "Strong informative speeches use logical organization, clear explanations, relevant examples, and effective delivery.",
    ],
    objectiveParagraph:
      "Your goal is to make a subject understandable while maintaining your audience's interest.",
    expectationsParagraph:
      "Prepare a clear presentation, incorporate visual aids when permitted by the applicable tournament rules, and practice explaining complex information with engaging delivery.",
    futureWorkflowParagraph:
      "Speech Brigade will eventually allow you to upload your written speech for AI feedback on its content, structure, and presentation. For now, you can practice delivering your speech under tournament-style timing and review your performance afterward.",
    performanceDurationSeconds: 600,
    aiModalTitle: "AI Writing & Delivery Coaching",
    aiModalBody:
      "Soon, Speech Brigade will analyze your written Informative speech and provide personalized feedback on organization, clarity, explanation, supporting examples, and audience understanding.\n\nIt will also recommend ways to improve your delivery, including pacing, emphasis, transitions, and the effective presentation of complex information.\n\nThe goal is to help you make your topic engaging, accessible, and memorable.",
  },
  di: {
    id: "di",
    category: "interpretation",
    name: "Dramatic Interpretation",
    acronym: "DI",
    shortDescription: "Bring a dramatic literary selection to life through characterization and emotional expression.",
    welcomeTitle: "Welcome to Dramatic Interpretation",
    introParagraphs: [
      "Dramatic Interpretation challenges you to bring a literary selection to life through a compelling solo performance.",
      "Focus on creating a believable performance that allows your audience to understand and connect with the story.",
    ],
    objectiveParagraph:
      "Your goal is to communicate the meaning of the selection through characterization, vocal variety, emotional development, and purposeful physical expression.",
    expectationsParagraph:
      "Prepare your selected literary performance and practice shaping character, emotion, pacing, and dramatic transitions within a focused performance.",
    futureWorkflowParagraph:
      "You will eventually be able to upload your selected performance script and receive AI recommendations tailored to its characters, themes, and dramatic structure. For now, you can practice your performance under tournament-style timing and review your results afterward.",
    performanceDurationSeconds: 600,
    aiModalTitle: "AI Performance Coaching",
    aiModalBody:
      "Soon, Speech Brigade will analyze your selected Dramatic Interpretation script and offer personalized recommendations for bringing it to life.\n\nFeedback will focus on characterization, emotional progression, vocal variety, pacing, dramatic transitions, and the overall meaning of the selection.\n\nThis feature will focus on interpreting and performing the literary work, rather than treating it as an original speech you wrote.",
  },
  hi: {
    id: "hi",
    category: "interpretation",
    name: "Humorous Interpretation",
    acronym: "HI",
    shortDescription: "Entertain through comedic storytelling, characterization, and timing.",
    welcomeTitle: "Welcome to Humorous Interpretation",
    introParagraphs: [
      "Humorous Interpretation challenges you to bring a literary selection to life through comedic performance.",
      "Focus on making your characterization clear and your performance engaging.",
    ],
    objectiveParagraph:
      "Your goal is to entertain your audience while communicating a coherent story through distinct characters, effective pacing, vocal variety, and strong comedic timing.",
    expectationsParagraph:
      "Prepare your selected performance and practice character differentiation, comedic rhythm, transitions, and storytelling under tournament-style timing.",
    futureWorkflowParagraph:
      "You will eventually be able to upload your performance script and receive AI recommendations for characterization, delivery, pacing, and comedic effect. For now, you can practice your performance under tournament-style timing and review your results afterward.",
    performanceDurationSeconds: 600,
    aiModalTitle: "AI Performance Coaching",
    aiModalBody:
      "Soon, Speech Brigade will analyze your Humorous Interpretation script and offer personalized recommendations for character differentiation, comedic timing, pacing, vocal variety, transitions, and storytelling.\n\nThe goal is to help you create a clearer, more entertaining, and more cohesive performance.",
  },
  duo: {
    id: "duo",
    category: "interpretation",
    name: "Duo Interpretation",
    acronym: "DUO",
    shortDescription: "Perform a literary selection with a partner through coordinated characterization and delivery.",
    welcomeTitle: "Welcome to Duo Interpretation",
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
    aiModalTitle: "AI Duo Performance Coaching",
    aiModalBody:
      "Soon, Speech Brigade will analyze your Duo Interpretation script and offer recommendations for both performers.\n\nFeedback will focus on characterization, coordination, timing, transitions, vocal variety, and the overall cohesion of the performance.\n\nThe goal is to help both speakers work together to deliver a unified interpretation of the selection.",
  },
  poi: {
    id: "poi",
    category: "interpretation",
    name: "Program Oral Interpretation",
    acronym: "POI",
    shortDescription: "Combine multiple literary selections into a unified performance centered on a common theme.",
    welcomeTitle: "Welcome to Program Oral Interpretation",
    introParagraphs: [
      "Program Oral Interpretation challenges you to combine multiple literary selections into one cohesive performance.",
      "Your program should explore a central theme or message through a purposeful combination of literary material.",
    ],
    objectiveParagraph:
      "Your goal is to create a unified presentation through thoughtful organization, effective transitions, vocal variety, and meaningful interpretation.",
    expectationsParagraph:
      "Prepare your program with a clear thematic purpose and practice transitions, vocal variety, characterization, and the overall arc of the performance.",
    futureWorkflowParagraph:
      "You will eventually be able to upload your program script and receive AI feedback on its structure, thematic development, transitions, and performance. For now, you can practice your program under tournament-style timing and review your results afterward.",
    performanceDurationSeconds: 600,
    aiModalTitle: "AI Program Coaching",
    aiModalBody:
      "Soon, Speech Brigade will analyze your Program Oral Interpretation script and provide recommendations for improving the cohesion and impact of your program.\n\nFeedback will focus on thematic development, organization, transitions between selections, vocal variety, characterization, and the effectiveness of the overall performance.\n\nThe goal is to help the individual selections come together into one meaningful presentation.",
  },
};

const PREPARED_EVENT_IDS: PreparedEventId[] = ["oo", "inf"];
const INTERPRETATION_EVENT_IDS: PreparedEventId[] = ["di", "hi", "duo", "poi"];

const uploadComingSoonModal: InfoModalContent = {
  title: "Your Speech Library Is Coming Soon",
  badge: "Coming Soon",
  body: [
    "Soon, you'll be able to upload your speeches and performance scripts directly to Speech Brigade.",
    "You will also be able to save your documents, access previously uploaded pieces, and reuse them across practice sessions without uploading them again.",
    "When this feature launches, selecting a document will be required before beginning a prepared speaking or interpretation session.",
  ],
};

const SPEAKING_GAME_CONFIGS: Record<SpeakingGameId, SpeakingGameConfig> = {
  hotSeat: {
    id: "hotSeat",
    name: "The Hot Seat",
    tagline: "Think fast. Speak with confidence.",
    description: "A rapid-fire challenge where students respond to unexpected questions.",
    durationLabel: "90 sec",
    durationSeconds: 90,
    icon: "?",
    welcomeTitle: "Welcome to The Hot Seat",
    instructionParagraphs: [
      "Think fast. Speak with confidence.",
      "You will receive a surprise question and have just a few seconds to prepare.",
      "Your challenge is to deliver a complete response in 90 seconds.",
      "Start with a clear answer, develop your ideas using a reason or example, and finish with a strong conclusion.",
      "You do not need a perfect answer. Focus on thinking clearly and keeping your speech moving.",
      "When you are ready, begin the challenge.",
    ],
    setupScreen: "hotSeatReveal",
    challengeLabel: "Your Response",
    resultTitle: "You survived the Hot Seat.",
    tip: "A strong short response clearly answers the question, develops an idea, and finishes with purpose.",
    retryLabel: "Try Another Question",
  },
  wordFusion: {
    id: "wordFusion",
    name: "Word Fusion",
    tagline: "Three words. One coherent speech.",
    description: "Connect three random words naturally in a single creative speech.",
    durationLabel: "60 sec",
    durationSeconds: 60,
    icon: "3",
    welcomeTitle: "Welcome to Word Fusion",
    instructionParagraphs: [
      "Three random words. One connected speech.",
      "You will spin three slot machines to reveal three unrelated words.",
      "Your challenge is to connect all three words naturally in a single 60-second speech.",
      "You can tell a story, make an argument, create an analogy, or find an unexpected connection.",
      "The goal is to make your speech feel coherent rather than simply listing the words.",
      "You will have five seconds to prepare before speaking.",
    ],
    setupScreen: "wordFusionSpin",
    challengeLabel: "Connect the Words",
    resultTitle: "Connection complete.",
    tip: "The strongest connections create one unified idea rather than three unrelated observations.",
    retryLabel: "Spin Again",
  },
  storyRelay: {
    id: "storyRelay",
    name: "Story Relay",
    tagline: "Keep the story alive.",
    description: "Continue an evolving story while adapting to unexpected plot twists.",
    durationLabel: "3 min",
    durationSeconds: 180,
    icon: "↗",
    welcomeTitle: "Welcome to Story Relay",
    instructionParagraphs: [
      "Every great story begins somewhere. Where it goes next is up to you.",
      "You will receive the opening line of a story.",
      "Your challenge is to continue it out loud.",
      "As you speak, unexpected plot twists will appear. You must incorporate each twist into your story while keeping the narrative moving.",
      "The challenge lasts three minutes.",
      "Focus on creativity, clear storytelling, and connecting each new development to what came before.",
    ],
    setupScreen: "storyRelaySetup",
    challengeLabel: "Story Relay",
    resultTitle: "Story complete.",
    tip: "Strong improvisational storytelling connects new developments to the existing narrative rather than abandoning the story each time something changes.",
    retryLabel: "New Story",
  },
  landPlane: {
    id: "landPlane",
    name: "Land the Plane",
    tagline: "Finish with impact.",
    description: "Deliver a concise, memorable conclusion to a partially built speech.",
    durationLabel: "20 sec",
    durationSeconds: 20,
    icon: "⌁",
    welcomeTitle: "Welcome to Land the Plane",
    instructionParagraphs: [
      "A great speech deserves a great ending.",
      "You will receive a short speech outline containing a topic, central argument, and supporting points.",
      "Your challenge is to deliver a compelling conclusion in just 20 seconds.",
      "Reinforce the central message, bring the ideas together, and finish with a memorable final statement.",
      "Avoid introducing an entirely new argument at the end.",
      "Make your final words count.",
    ],
    setupScreen: "landPlaneSetup",
    challengeLabel: "Your Conclusion",
    resultTitle: "Perfect landing.",
    tip: "A strong conclusion reinforces the central message, connects the main ideas, and leaves the audience with a memorable final thought.",
    retryLabel: "Try Another Speech",
  },
};

const SPEAKING_GAME_IDS: SpeakingGameId[] = ["hotSeat", "wordFusion", "storyRelay", "landPlane"];

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
  onComplete: (elapsed: number, completion: CompletionStatus) => void;
  onWarningSecond?: (second: number) => void;
  timerKey: string;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const startRef = useRef(0);
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
    if (!active) return undefined;
    completedRef.current = false;
    warningRef.current = new Set();
    startRef.current = performance.now();

    const tick = () => {
      const elapsed = (performance.now() - startRef.current) / 1000;
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
    };
  }, [active, seconds, timerKey]);

  const finishNow = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    const elapsed = Math.min(seconds, Math.max(0, (performance.now() - startRef.current) / 1000));
    onCompleteRef.current(elapsed, "manual");
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
  topicLabel,
  timerKey,
}: {
  label: string;
  seconds: number;
  buttonLabel?: string;
  onComplete: (elapsed: number, completion: CompletionStatus) => void;
  onWarningSecond?: (second: number) => void;
  topic?: string;
  topicLabel?: string;
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
          <span>{topicLabel || `Your ${topic.endsWith("?") ? "question" : "topic"}`}</span>
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
    onComplete: () => onComplete(),
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
    onComplete: () => onDone(),
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

function GamePromptDisplay({ session, compact = false }: { session: SpeakingGameSession; compact?: boolean }) {
  if (session.gameId === "hotSeat" && session.question) {
    return (
      <div className={`game-prompt-card ${compact ? "compact" : ""}`}>
        <span>Question</span>
        <strong>{session.question}</strong>
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

  if (session.gameId === "storyRelay" && session.openingLine) {
    return (
      <div className={`game-prompt-card ${compact ? "compact" : ""}`}>
        <span>Opening Line</span>
        <strong>{session.openingLine}</strong>
      </div>
    );
  }

  if (session.gameId === "landPlane" && session.outline) {
    return <SpeechOutlineCard outline={session.outline} compact={compact} />;
  }

  return null;
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

function GamePrepCountdown({
  config,
  session,
  onDone,
  onWarningSecond,
}: {
  config: SpeakingGameConfig;
  session: SpeakingGameSession;
  onDone: () => void;
  onWarningSecond: (second: number) => void;
}) {
  const { remaining } = useCountdownTimer({
    seconds: 5,
    active: true,
    onComplete: () => onDone(),
    onWarningSecond,
    timerKey: `game-prep-${config.id}-${JSON.stringify(session)}`,
  });
  const count = Math.max(1, Math.ceil(remaining));

  return (
    <section className="game-countdown">
      <p>{config.name}</p>
      <h1>Get ready.</h1>
      <GamePromptDisplay session={session} compact />
      <div className="countdown-number" data-count={count}>
        {count}
      </div>
    </section>
  );
}

function SpeakingGameChallenge({
  config,
  session,
  onComplete,
  onWarningSecond,
  onTwist,
}: {
  config: SpeakingGameConfig;
  session: SpeakingGameSession;
  onComplete: (elapsed: number, completion: CompletionStatus) => void;
  onWarningSecond: (second: number) => void;
  onTwist: () => void;
}) {
  const [activeTwistIndex, setActiveTwistIndex] = useState(-1);
  const triggeredTwistsRef = useRef<Set<number>>(new Set());
  const { remaining, finishNow, progress } = useCountdownTimer({
    seconds: config.durationSeconds,
    active: true,
    onComplete,
    onWarningSecond,
    timerKey: `game-challenge-${config.id}-${JSON.stringify(session)}`,
  });
  const urgent = remaining <= 5 && remaining > 0;

  useEffect(() => {
    if (session.gameId !== "storyRelay") return;
    const thresholds = [
      { at: 120, index: 0 },
      { at: 60, index: 1 },
      { at: 30, index: 2 },
    ];
    const nextTwist = thresholds.find(({ at, index }) => remaining <= at && !triggeredTwistsRef.current.has(index));
    if (!nextTwist) return;
    triggeredTwistsRef.current.add(nextTwist.index);
    setActiveTwistIndex(nextTwist.index);
    onTwist();
  }, [remaining, session.gameId, onTwist]);

  const visibleTwist = session.twists && activeTwistIndex >= 0 ? session.twists[activeTwistIndex] : null;

  return (
    <section className={`timer-stage game-challenge ${urgent ? "urgent" : ""}`}>
      <GamePromptDisplay session={session} compact />
      {visibleTwist ? (
        <div className="plot-twist-card" key={visibleTwist}>
          <span>Plot Twist</span>
          <strong>{visibleTwist}</strong>
        </div>
      ) : null}
      {session.gameId === "storyRelay" && session.twists?.length ? (
        <div className="twist-history">
          {session.twists.slice(0, Math.max(0, activeTwistIndex + 1)).map((twist, index) => (
            <span key={twist}>{index + 1}. {twist}</span>
          ))}
        </div>
      ) : null}
      <div className="timer-card">
        <div className="timer-ring" style={{ "--progress": `${Math.min(1, Math.max(0, progress)) * 360}deg` } as React.CSSProperties}>
          <div>
            <span>{config.challengeLabel}</span>
            <strong>{formatTime(remaining)}</strong>
          </div>
        </div>
        <button className="secondary big-action" type="button" onClick={finishNow}>
          I&apos;m done
        </button>
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
  const [screen, setScreen] = useState<Screen>("landing");
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
  const [foundersOpen, setFoundersOpen] = useState(false);
  const [selectedPreparedEventId, setSelectedPreparedEventId] = useState<PreparedEventId | null>(null);
  const [preparedResult, setPreparedResult] = useState<PreparedPerformanceResult | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<SpeakingGameId | null>(null);
  const [gameSession, setGameSession] = useState<SpeakingGameSession | null>(null);
  const [gameRevealSpinning, setGameRevealSpinning] = useState(false);
  const [infoModal, setInfoModal] = useState<InfoModalContent | null>(null);
  const [activeVaultAnalysis, setActiveVaultAnalysis] = useState<{
    analysis: AnalysisResult;
    transcript: string;
    transcriptData: TranscriptData | null;
    audioUrl: string;
    mode: EventMode;
  } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const infoModalTriggerRef = useRef<HTMLElement | null>(null);

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
    if (screen !== "settings" || !session || !supabase) return undefined;
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
      if (event.key === "Escape") closeInfoModal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [infoModal]);

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
    "topicSelect",
    "impromptuPrep",
    "deliveryCountdown",
    "impromptuDelivery",
    "analyzing",
    "questionSelect",
    "extempPrep",
    "extempDelivery",
    "results",
    "vaultAnalysis",
    "preparedDeliveryCountdown",
    "preparedPerformance",
    "preparedResults",
    "gamePrepCountdown",
    "gameChallenge",
    "gameResults",
  ].includes(screen);

  const openInfoModal = (content: InfoModalContent, trigger: HTMLElement) => {
    infoModalTriggerRef.current = trigger;
    setInfoModal(content);
  };

  const closeInfoModal = () => {
    setInfoModal(null);
    window.setTimeout(() => {
      infoModalTriggerRef.current?.focus();
      infoModalTriggerRef.current = null;
    }, 0);
  };

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
    setSelectedPreparedEventId(null);
    setPreparedResult(null);
    setSelectedGameId(null);
    setGameSession(null);
    setGameRevealSpinning(false);
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

  const startPreparedEvent = (eventId: PreparedEventId) => {
    audio.unlock();
    setSelectedPreparedEventId(eventId);
    setPreparedResult(null);
    setRound(initialRound);
    setRecordingError("");
    setScreen("preparedEventIntro");
  };

  const startSpeakingGame = (gameId: SpeakingGameId) => {
    audio.unlock();
    setSelectedGameId(gameId);
    setGameSession({ gameId });
    setGameRevealSpinning(false);
    setScreen("gameInstructions");
  };

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
    window.setTimeout(() => setScreen("gamePrepCountdown"), 700);
  };

  const prepareWordFusionWords = (words: string[]) => {
    setGameSession({ gameId: "wordFusion", words });
    setGameRevealSpinning(false);
    window.setTimeout(() => setScreen("gamePrepCountdown"), 900);
  };

  const prepareStoryRelay = () => {
    const previous = gameSession?.openingLine;
    const openingLine = chooseDifferent(storyOpenings, previous);
    const twists = uniqueDraw(storyTwists, 3);
    setGameSession({ gameId: "storyRelay", openingLine, twists, activeTwistIndex: -1 });
    audio.ding();
    window.setTimeout(() => setScreen("gamePrepCountdown"), 700);
  };

  const prepareLandPlane = () => {
    const previous = gameSession?.outline;
    const outline = chooseDifferent(landPlaneOutlines, previous, (item) => item.topic);
    setGameSession({ gameId: "landPlane", outline });
    audio.ding();
  };

  const completeSpeakingGame = (elapsed: number, completion: CompletionStatus) => {
    if (!gameSession) return;
    setGameSession({
      ...gameSession,
      elapsedSeconds: Math.round(elapsed),
      completion,
    });
    setScreen("gameResults");
  };

  const retrySpeakingGame = () => {
    if (!gameSession) return;
    const retryGameId = gameSession.gameId;
    setSelectedGameId(retryGameId);
    setGameRevealSpinning(false);
    if (retryGameId === "hotSeat") {
      setGameSession({ gameId: retryGameId });
      setScreen("hotSeatReveal");
    } else if (retryGameId === "wordFusion") {
      setGameSession({ gameId: retryGameId });
      setSlotItems([{ value: "—" }, { value: "—" }, { value: "—" }]);
      setActiveSlot(null);
      setScreen("wordFusionSpin");
    } else if (retryGameId === "storyRelay") {
      setGameSession({ gameId: retryGameId });
      setScreen("storyRelaySetup");
    } else {
      setGameSession({ gameId: retryGameId });
      setScreen("landPlaneSetup");
    }
  };

  const openPreparedAiModal = (eventConfig: PreparedEventConfig, trigger: HTMLElement) => {
    openInfoModal(
      {
        title: eventConfig.aiModalTitle,
        badge: "Coming Soon",
        body: eventConfig.aiModalBody.split("\n\n"),
      },
      trigger,
    );
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

  const RECORDING_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

  const startRecording = async () => {
    setRecordingError("");
    if (!isSupabaseConfigured) {
      setRecordingError("Speech analysis needs Supabase settings. You can still complete the practice round locally.");
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
      if (!supabase || !supabaseUrl) {
        throw new Error("Speech analysis needs Supabase settings. You can still use timers and prompts locally.");
      }
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

  const practicePreparedAgain = () => {
    if (!selectedPreparedEventId) return;
    setPreparedResult(null);
    setScreen("speechWorkspace");
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

  const spinWordFusion = () => {
    if (activeSlot !== null || gameRevealSpinning) return;
    audio.unlock();
    setGameRevealSpinning(true);
    const words = uniqueDraw(wordFusionBank, 3);
    setSlotItems([{ value: "—" }, { value: "—" }, { value: "—" }]);
    const tickIntervals: number[] = [];

    words.forEach((word, index) => {
      window.setTimeout(() => {
        setActiveSlot(index);
        audio.slotTick();
        tickIntervals[index] = window.setInterval(() => audio.slotTick(), 92);
      }, index * 1450);
      window.setTimeout(() => {
        if (tickIntervals[index]) window.clearInterval(tickIntervals[index]);
        setSlotItems((current) => current.map((slot, slotIndex) => (slotIndex === index ? { value: word } : slot)));
        setActiveSlot(null);
        audio.ding();
        if (index === words.length - 1) {
          prepareWordFusionWords(words);
        }
      }, index * 1450 + 1180);
    });
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

  const handlePreparedPerformanceComplete = (elapsed: number, completion: CompletionStatus) => {
    if (!selectedPreparedEventId) return;
    setPreparedResult({
      eventId: selectedPreparedEventId,
      elapsedSeconds: Math.round(elapsed),
      completion,
    });
    setScreen("preparedResults");
  };

  const warningTone = (second: number) => audio.countdown(second === 0);

  const selectedPrompt = round.mode === "extemp" ? round.selectedQuestion?.question || "" : round.selectedTopic;
  const playInteractionSound = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest("button:not(:disabled), a[href]")) return;
    if (target.closest("[data-no-press-sound='true']")) return;
    audio.press();
  };

  const content = (() => {
    switch (screen) {
      case "landing":
        return (
          <section className="hero">
            <p className="eyebrow">National Speech & Debate Association practice studio</p>
            <h1>Speech Brigade</h1>
            <p className="lede">Practice under pressure.</p>
            <div className="hero-actions">
              <button
                className="ghost-card"
                type="button"
                onClick={() => setScreen("gamesSelection")}
              >
                <span>Speaking Games</span>
                <small>Small challenges. Stronger speakers.</small>
              </button>
              <button
                className="primary-card"
                type="button"
                onClick={() => setScreen(session || !isSupabaseConfigured ? "events" : "eventsAuth")}
              >
                <span>National Speech & Debate Association</span>
                <small>Speaking event practice</small>
              </button>
            </div>
          </section>
        );
      case "gamesSelection":
        return (
          <section className="narrow">
            <p className="eyebrow">Speaking Games</p>
            <h1>Speaking Games</h1>
            <p className="lede">Small challenges. Stronger speakers.</p>
            <div className="game-grid">
              {SPEAKING_GAME_IDS.map((gameId) => {
                const game = SPEAKING_GAME_CONFIGS[gameId];
                return (
                  <button className="game-card" type="button" key={gameId} onClick={() => startSpeakingGame(gameId)}>
                    <i aria-hidden="true">{game.icon}</i>
                    <span>{game.name}</span>
                    <strong>{game.tagline}</strong>
                    <small>{game.description}</small>
                    <em>{game.durationLabel}</em>
                  </button>
                );
              })}
            </div>
            <button className="secondary" type="button" onClick={goHome}>
              Back
            </button>
          </section>
        );
      case "gameInstructions":
        if (!gameConfig) {
          return (
            <section className="reading">
              <h1>Select a game to continue</h1>
              <button className="secondary" type="button" onClick={() => setScreen("gamesSelection")}>Back to Games</button>
            </section>
          );
        }
        return (
          <section className="reading">
            <p className="eyebrow">Speaking Games</p>
            <h1>{gameConfig.welcomeTitle}</h1>
            <InstructionBlock>
              {gameConfig.instructionParagraphs.map((paragraph, index) => (
                <p key={`${gameConfig.id}-${index}`}>{paragraph}</p>
              ))}
            </InstructionBlock>
            <div className="button-row">
              <button className="primary" type="button" onClick={() => setScreen(gameConfig.setupScreen)}>Next</button>
              <button className="secondary" type="button" onClick={() => setScreen("gamesSelection")}>Back</button>
            </div>
          </section>
        );
      case "hotSeatReveal":
        return (
          <section className="game-setup">
            <p className="eyebrow">The Hot Seat</p>
            <h1>Your question awaits.</h1>
            <p className="lede">One question. Ninety seconds. Make it count.</p>
            <div className={`question-reveal-card ${gameRevealSpinning ? "revealing" : ""} ${gameSession?.question ? "answered" : ""}`}>
              {gameSession?.question || "?"}
            </div>
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
              Reveal Question
            </button>
          </section>
        );
      case "wordFusionSpin":
        return (
          <section className="spin-screen">
            <p className="eyebrow">Word Fusion</p>
            <h1>Spin your words.</h1>
            <p className="lede">Three unexpected ingredients. One creative response.</p>
            <SlotWindows items={slotItems} activeIndex={activeSlot} />
            <button className="primary" type="button" onClick={spinWordFusion} disabled={activeSlot !== null || gameRevealSpinning || slotItems.some((slot) => slot.value !== "—")}>Spin</button>
          </section>
        );
      case "storyRelaySetup":
        return (
          <section className="game-setup">
            <p className="eyebrow">Story Relay</p>
            <h1>Every story starts somewhere.</h1>
            <div className="game-prompt-card">
              <span>Opening Line</span>
              <strong>{gameSession?.openingLine || "Your opening line is waiting."}</strong>
            </div>
            <button className="primary" type="button" onClick={prepareStoryRelay}>
              Begin Story
            </button>
          </section>
        );
      case "landPlaneSetup":
        return (
          <section className="game-setup land-plane-setup">
            <p className="eyebrow">Land the Plane</p>
            <h1>Prepare for landing.</h1>
            <p className="lede">Read the argument. Deliver the ending.</p>
            {gameSession?.outline ? (
              <>
                <SpeechOutlineCard outline={gameSession.outline} />
                <p className="ready-line">Ready to deliver your conclusion?</p>
                <button className="primary" type="button" onClick={() => setScreen("gamePrepCountdown")}>Start Challenge</button>
              </>
            ) : (
              <>
                <div className="game-prompt-card">
                  <span>Speech Outline</span>
                  <strong>Your speech outline is waiting.</strong>
                </div>
                <button className="primary" type="button" onClick={prepareLandPlane}>Reveal Speech</button>
              </>
            )}
          </section>
        );
      case "gamePrepCountdown":
        if (!gameConfig || !gameSession) {
          return (
            <section className="results">
              <p className="eyebrow">No game selected</p>
              <button className="secondary" type="button" onClick={() => setScreen("gamesSelection")}>Back to Games</button>
            </section>
          );
        }
        return (
          <GamePrepCountdown
            config={gameConfig}
            session={gameSession}
            onDone={() => setScreen("gameChallenge")}
            onWarningSecond={warningTone}
          />
        );
      case "gameChallenge":
        if (!gameConfig || !gameSession) {
          return (
            <section className="results">
              <p className="eyebrow">No game selected</p>
              <button className="secondary" type="button" onClick={() => setScreen("gamesSelection")}>Back to Games</button>
            </section>
          );
        }
        return (
          <SpeakingGameChallenge
            config={gameConfig}
            session={gameSession}
            onComplete={completeSpeakingGame}
            onWarningSecond={warningTone}
            onTwist={audio.ding}
          />
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
          <section className="results game-results">
            <p className="eyebrow">Speaking Games</p>
            <h1>{gameConfig.resultTitle}</h1>
            <div className="summary-card">
              <SummaryRow label="Game" value={gameConfig.name} />
              {gameSession.question ? <SummaryRow label="Question" value={gameSession.question} /> : null}
              {gameSession.words?.length ? <SummaryRow label="Words" value={gameSession.words.join(", ")} /> : null}
              {gameSession.openingLine ? <SummaryRow label="Opening" value={gameSession.openingLine} /> : null}
              {gameSession.twists?.length ? <SummaryRow label="Plot twists" value={gameSession.twists.join(" · ")} /> : null}
              {gameSession.outline ? <SummaryRow label="Topic" value={gameSession.outline.topic} /> : null}
              {gameSession.outline ? <SummaryRow label="Central message" value={gameSession.outline.centralMessage} /> : null}
              <SummaryRow label="Time available" value={formatTime(gameConfig.durationSeconds)} />
              <SummaryRow label="Time used" value={formatTime(gameSession.elapsedSeconds || 0)} />
              <SummaryRow label="Completion" value={gameSession.completion === "expired" ? "Timer expired" : "I'm done"} />
            </div>
            <div className="analysis-error-card future-analysis-card">
              <span className="eyebrow">Practice tip</span>
              <p>{gameConfig.tip}</p>
              <p>No AI feedback has been generated for this game round.</p>
            </div>
            <div className="button-row">
              <button className="primary" type="button" onClick={retrySpeakingGame}>{gameConfig.retryLabel}</button>
              <button className="secondary" type="button" onClick={() => setScreen("gamesSelection")}>Back to Games</button>
            </div>
          </section>
        );
      case "events":
        return (
          <section className="narrow">
            <p className="eyebrow">National Speech & Debate Association</p>
            <h1>Choose Your Event</h1>
            <p className="lede">Select a speaking event to begin your practice.</p>
            <div className="event-grid">
              <button className="event-card" type="button" onClick={() => startMode("impromptu")}>
                <span>Impromptu Speaking</span>
                <small>Think quickly. Speak clearly.</small>
              </button>
              <button className="event-card" type="button" onClick={() => startMode("extemp")}>
                <span>Extemporaneous Speaking</span>
                <small>Research. Analyze. Deliver.</small>
              </button>
              <button className="event-card" type="button" onClick={() => setScreen("preparedSelection")}>
                <span>Prepared Speaking</span>
                <small>Develop your message. Perfect your delivery.</small>
              </button>
              <button className="event-card" type="button" onClick={() => setScreen("interpretationSelection")}>
                <span>Interpretation</span>
                <small>Bring stories and characters to life.</small>
              </button>
            </div>
          </section>
        );
      case "preparedSelection":
        return (
          <section className="narrow">
            <p className="eyebrow">Prepared Speaking</p>
            <h1>Prepared Speaking</h1>
            <p className="lede">Craft your message. Refine your performance.</p>
            <div className="event-grid">
              {PREPARED_EVENT_IDS.map((eventId) => {
                const eventConfig = PREPARED_EVENT_CONFIGS[eventId];
                return (
                  <button className="event-card event-card-with-badge" type="button" key={eventId} onClick={() => startPreparedEvent(eventId)}>
                    <span>{eventConfig.name}</span>
                    <i className="event-acronym">{eventConfig.acronym}</i>
                    <small>{eventConfig.shortDescription}</small>
                  </button>
                );
              })}
            </div>
            <button className="secondary" type="button" onClick={() => setScreen("events")}>
              Back
            </button>
          </section>
        );
      case "interpretationSelection":
        return (
          <section className="narrow">
            <p className="eyebrow">Interpretation</p>
            <h1>Interpretation</h1>
            <p className="lede">Transform literature into a compelling performance.</p>
            <div className="event-grid">
              {INTERPRETATION_EVENT_IDS.map((eventId) => {
                const eventConfig = PREPARED_EVENT_CONFIGS[eventId];
                return (
                  <button className="event-card event-card-with-badge" type="button" key={eventId} onClick={() => startPreparedEvent(eventId)}>
                    <span>{eventConfig.name}</span>
                    <i className="event-acronym">{eventConfig.acronym}</i>
                    <small>{eventConfig.shortDescription}</small>
                  </button>
                );
              })}
            </div>
            <button className="secondary" type="button" onClick={() => setScreen("events")}>
              Back
            </button>
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
          <section className="reading">
            <p className="eyebrow">{selectedPreparedEvent.name} · {selectedPreparedEvent.acronym}</p>
            <h1>{selectedPreparedEvent.welcomeTitle}</h1>
            <InstructionBlock>
              {selectedPreparedEvent.introParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              <p>{selectedPreparedEvent.objectiveParagraph}</p>
              <p>{selectedPreparedEvent.expectationsParagraph}</p>
              <p><strong>Time limit: 10 minutes.</strong></p>
              <p>
                For this practice flow, Speech Brigade uses a ten-minute base performance timer. Official tournament
                requirements may vary by event, tournament, and season.
              </p>
              <p>{selectedPreparedEvent.futureWorkflowParagraph}</p>
              <p>
                After setup, you will move to your speech workspace, review upcoming document tools, and launch a
                timed practice performance.
              </p>
            </InstructionBlock>
            <div className="button-row">
              <button className="primary" type="button" onClick={() => setScreen("speechWorkspace")}>Next</button>
              <button className="secondary" type="button" onClick={() => setScreen(selectedPreparedEvent.category === "prepared" ? "preparedSelection" : "interpretationSelection")}>Back</button>
            </div>
          </section>
        );
      case "speechWorkspace":
        if (!selectedPreparedEvent) {
          return (
            <section className="results">
              <p className="eyebrow">No event selected</p>
              <button className="secondary" type="button" onClick={() => setScreen("events")}>
                Back to Events
              </button>
            </section>
          );
        }
        return (
          <section className="speech-workspace">
            <p className="eyebrow">{selectedPreparedEvent.name} · {selectedPreparedEvent.acronym}</p>
            <h1>Your Speech</h1>
            <p className="lede">Upload tools are coming soon. For now, you can begin a timed practice performance without selecting a document.</p>
            <button
              className="upload-card has-info-hover"
              type="button"
              title="Click for more info"
              onClick={(event) => openInfoModal(uploadComingSoonModal, event.currentTarget)}
            >
              <span className="document-icon" aria-hidden="true" />
              <span className="coming-soon-badge">Coming Soon</span>
              <strong>Upload Your Speech</strong>
              <small>Upload a new document or choose one from your speech library.</small>
            </button>
            <div className="workspace-actions">
              <button
                className="workspace-card has-info-hover"
                type="button"
                title="Click for more info"
                onClick={(event) => openPreparedAiModal(selectedPreparedEvent, event.currentTarget)}
              >
                <span className="coming-soon-badge">Coming Soon</span>
                <strong>Get AI Feedback</strong>
                <small>Improve your speech and prepare for performance.</small>
              </button>
              <button
                className="workspace-card primary-action"
                type="button"
                data-no-press-sound="true"
                onClick={() => {
                  audio.unlock();
                  setPreparedResult(null);
                  setScreen("preparedDeliveryCountdown");
                }}
              >
                <strong>Begin Speech</strong>
                <small>Start a timed performance now. No upload is required yet.</small>
              </button>
            </div>
            <button className="secondary" type="button" onClick={() => setScreen("preparedEventIntro")}>
              Back
            </button>
          </section>
        );
      case "preparedDeliveryCountdown":
        return (
          <DeliveryCountdown
            onDone={() => setScreen("preparedPerformance")}
            onWarningSecond={warningTone}
          />
        );
      case "preparedPerformance":
        if (!selectedPreparedEvent) {
          return (
            <section className="results">
              <p className="eyebrow">No event selected</p>
              <button className="secondary" type="button" onClick={() => setScreen("events")}>
                Back to Events
              </button>
            </section>
          );
        }
        return (
          <TimerPanel
            label="Performance"
            seconds={selectedPreparedEvent.performanceDurationSeconds}
            buttonLabel="I'm done"
            topic={`${selectedPreparedEvent.name} (${selectedPreparedEvent.acronym})`}
            topicLabel={selectedPreparedEvent.id === "duo" ? "Two-person performance" : "Event"}
            timerKey={`prepared-performance-${selectedPreparedEvent.id}`}
            onComplete={handlePreparedPerformanceComplete}
            onWarningSecond={warningTone}
          />
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
            <p className="eyebrow">Round complete</p>
            <h1>Round complete.</h1>
            <p className="lede">Great work. You&apos;ve completed a practice performance.</p>
            <div className="summary-card">
              <SummaryRow label="Event" value={`${resultEvent.name} (${resultEvent.acronym})`} />
              <SummaryRow label="Time limit" value={formatTime(resultEvent.performanceDurationSeconds)} />
              <SummaryRow label="Performance time" value={formatTime(preparedResult.elapsedSeconds)} />
              <SummaryRow label="Completion" value={preparedResult.completion === "expired" ? "Timer expired" : "I'm done"} />
            </div>
            <div className="analysis-error-card future-analysis-card">
              <span className="eyebrow">Future analysis</span>
              <p>Post-performance AI analysis for this event can be integrated here later. No AI feedback has been generated for this practice round.</p>
            </div>
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
                : "Supabase is not configured on this computer, so saved recordings and AI analysis are disabled. Timers, prompts, and practice rounds still work."}
            </p>
            {!isSupabaseConfigured ? (
              <button className="primary" type="button" onClick={() => setScreen("events")}>
                Continue to Events
              </button>
            ) : null}
            {isSupabaseConfigured && authStatus === "sent" ? (
              <div className="auth-sent">
                <p>
                  Check <strong>{authEmail}</strong> for a sign-in link. Opening it will bring you right back here,
                  signed in.
                </p>
                <button className="secondary" type="button" onClick={() => setAuthStatus("idle")}>
                  Use a different email
                </button>
              </div>
            ) : isSupabaseConfigured ? (
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
            ) : null}
            <button className="secondary" type="button" onClick={goHome}>
              Back
            </button>
          </section>
        );
      case "signIn":
        return (
          <section className="narrow auth-screen">
            <p className="eyebrow">{isSupabaseConfigured ? "Sign in" : "Local preview"}</p>
            <h1>{isSupabaseConfigured ? "Sign in to Speech Brigade" : "Account features are disabled locally"}</h1>
            <p className="lede">
              {isSupabaseConfigured
                ? "Sign in with your email to save your recordings and access your account."
                : "Add Supabase environment variables to enable sign-in, saved recordings, transcription, and AI analysis."}
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
            {!isSupabaseConfigured ? (
              <p className="lede">Supabase is not configured for this local preview, so account and vault features are disabled.</p>
            ) : session ? (
              <p className="lede">
                You&apos;re signed in as <strong>{session.user.email}</strong>.
              </p>
            ) : (
              <p className="lede">You&apos;re not signed in.</p>
            )}
            <button className="secondary" type="button" onClick={goHome}>
              Back
            </button>

            {session && isSupabaseConfigured ? (
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
      <button
        type="button"
        className="creator-float"
        onClick={() => setFoundersOpen(true)}
        aria-label="Learn about Speech Brigade's founders"
      >
        <span className="creator-copy">Learn About Speech Brigade&apos;s Founders</span>
      </button>
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
