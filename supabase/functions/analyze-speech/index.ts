// Supabase Edge Function: analyze-speech
//
// Authenticated. Given a recording id, returns a cached analysis if one
// exists, otherwise calls Gemini to score a speech across three star
// categories, split the transcript into opening / body / closing, produce
// sentence-level tips, tally grammar issues, and identify power vs weak
// words. Persists the result to the row's `analysis` jsonb column so
// subsequent loads are free.
//
// Supports two event modes, read from the recording's `mode` column
// ('impromptu' | 'extemp', defaulting to 'impromptu' for older rows):
//   - impromptu: organization / analysis / delivery (the original rubric).
//   - extemp: argumentationAnalysis / sourceConsideration / delivery — the
//     NSDA Extemp judging criteria. Delivery, grammar, and vocab rubrics are
//     shared verbatim between the two modes; only the two "content" category
//     rubrics and the length-cap word tiers differ. See
//     IMPROMPTU_SYSTEM_INSTRUCTION / EXTEMP_SYSTEM_INSTRUCTION below.
//
// Adapted from a debate-speech (for/against, 30-90s) pipeline. Key changes
// from that version, in case you're diffing:
//   - 5 star categories (grammar/vocab/confidence/clarity/relevance) →
//     3 star categories matching the standard Impromptu/Extemp judging
//     rubrics.
//   - Grammar and vocab are STILL fully analyzed (grammarBreakdown counts,
//     sentence-level flagging, powerWords/weakWords) — they just no longer
//     get their own star rating or feed the overall score. They get a
//     one-line qualitative summary instead (grammarSummary / vocabSummary).
//   - No `stance` / declared side — neither impromptu nor extemp has a
//     debate stance, unlike the source app. Extemp's "researchBullets"
//     equivalent is handled qualitatively via the sourceConsideration
//     category rather than a separate pre-given research field.
//   - Speech length assumption bumped from 30-90s to 3-5 minutes
//     (impromptu) / 7 minutes (extemp), which changes the length-cap
//     thresholds under ARGUMENTATION AND ANALYSIS / ANALYSIS (see rubric)
//     and the empty-transcript edge case word count.
//
// See README.md in this folder for the Supabase schema this expects and the
// design assumptions worth reviewing before you ship this rubric as-is.
//
// Body: { recordingId: string }
// Returns: { analysis: AnalysisResult, durationSeconds, prompt, transcript, audioUrl, transcriptData }
//
// Deploy:  supabase functions deploy analyze-speech --no-verify-jwt
// Secrets: GEMINI_API_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'
import { jsonrepair } from 'npm:jsonrepair@3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

// @ts-expect-error Deno global is provided at runtime
const env = (k: string) => Deno.env.get(k) ?? ''

const GEMINI_MODEL = 'gemini-3.6-flash'
// Cap the number of *fresh* (Gemini-hitting) analyses per user per rolling
// 24h window. Cached analyses (already stored on the row) are always free.
// Tune to your product's actual usage pattern — this number was inherited
// from a different product's daily-challenge cadence, not derived for yours.
const MAX_ANALYSES_PER_DAY = 10
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000

type EventMode = 'impromptu' | 'extemp' | 'oo' | 'inf' | 'di' | 'hi' | 'duo' | 'poi'
// impromptu scores organization/analysis/delivery; extemp scores
// argumentationAnalysis/sourceConsideration/delivery. Only 3 of these 5 keys
// are ever populated on a given AnalysisResult, depending on mode.
type CategoryKey = 'organization' | 'analysis' | 'delivery' | 'argumentationAnalysis' | 'sourceConsideration'
// Sentence-level flags are broader than the three scored categories: grammar
// and vocab still get flagged per-sentence (and still drive grammarBreakdown
// / powerWords / weakWords) even though they're no longer separately starred.
// 'organization' likewise stays a legal, unscored flag for extemp sentences
// (structural/transition issues), the same diagnostic-only role grammar and
// vocab already play — it just isn't one of extemp's 3 scored categories.
type WeakAxis = CategoryKey | 'grammar' | 'vocab'
type GrammarSubcategory = 'agreement' | 'verbTense' | 'sentenceStructure' | 'wordUsage'
type Section = 'opening' | 'body' | 'closing'

interface CategoryResult {
  stars: number
  takeaway: string
}

interface SentenceTip {
  text: string
  section: Section
  weakAxis: WeakAxis | null
  tip: string | null
  example: string | null
  errorSpan: string | null
  grammarSubcategory: GrammarSubcategory[] | null
}

interface WordCallout {
  word: string
  count: number
  reason: string // green: why it's strong; red: short suggestion of a better word
}

interface SectionTip {
  title: string
  body: string
  example: string
}

interface Scorecard {
  stars: number // 1-5, computed here from categories + structure penalty — never asked of Gemini
  title: string // 2-4 words
  description: string // 1-2 sentences
}

interface GrammarBreakdown {
  agreement: number
  verbTense: number
  sentenceStructure: number
  wordUsage: number
}

interface AnalysisResult {
  categories: Partial<Record<CategoryKey, CategoryResult>>
  grammarBreakdown: GrammarBreakdown
  grammarSummary: string
  vocabSummary: string
  scorecard: Scorecard
  fillerCount: number
  pauseCount: number
  wordsPerMinute: number
  sentences: SentenceTip[]
  sectionTips: Record<Section, SectionTip>
  powerWords: WordCallout[]
  weakWords: WordCallout[]
  idealStructure: { opening: number; body: number; closing: number }
  yourStructure: { opening: number; body: number; closing: number }
  topic: string
  keyTakeawayTip: string
}

interface ScriptContext {
  fileName: string
  text: string
}

interface EventProfile {
  name: string
  context: string
  organization: string
  analysis: string
  delivery: string
  scriptUse: string
  idealStructure: { opening: number; body: number; closing: number }
}

const EVENT_PROFILES: Record<EventMode, EventProfile> = {
  impromptu: {
    name: 'Impromptu Speaking',
    context: 'The speaker drew a short topic and had very limited preparation time. Reward a clear thesis, quick organization, and thoughtful development under pressure.',
    organization: 'Opening should interpret the prompt and preview a direction; body should develop a few coherent points; closing should return to the prompt with a complete final thought.',
    analysis: 'Evaluate insight, specificity, explanation, examples, and how directly the speech answers or interprets the topic.',
    delivery: 'Evaluate confidence, pace, vocal control, filler use, and clarity based only on the transcript and timing metrics.',
    scriptUse: 'There is no script for this event.',
    idealStructure: { opening: 18, body: 64, closing: 18 },
  },
  extemp: {
    name: 'Extemporaneous Speaking',
    context: 'The speaker answered a current-events question after preparation. Retain any USX or IX framing implied by the question.',
    organization: 'Opening should answer the question directly and preview organized points; body should develop argument layers; closing should weigh the answer and implications.',
    analysis: 'Evaluate direct answer, argument quality, current-events understanding, source integration, weighing, and responsiveness to the original question.',
    delivery: 'Evaluate confident explanation, controlled pace, clarity, transitions, and reduced fillers based only on transcript and timing metrics.',
    scriptUse: 'There is no script for this event. The original question is the central reference point.',
    idealStructure: { opening: 16, body: 68, closing: 16 },
  },
  oo: {
    name: 'Original Oratory',
    context: 'The speaker is delivering an original persuasive or inspirational speech. Feedback should focus on performance, not document editing.',
    organization: 'Opening should hook and frame the thesis; body should build a clear persuasive arc; closing should resolve the message with impact.',
    analysis: 'Evaluate the central claim, reasoning, evidence/examples as spoken, rhetorical development, and audience connection.',
    delivery: 'Evaluate vocal presence, emphasis, pacing, emotional variation, clarity, and whether the performance sounds memorized yet alive.',
    scriptUse: 'If a script is provided, compare the transcript to it only for meaningful performance deviations: skipped key claims, reordered sections that hurt clarity, or wording changes that weaken impact. Do not grade the writing itself.',
    idealStructure: { opening: 18, body: 66, closing: 16 },
  },
  inf: {
    name: 'Informative Speaking',
    context: 'The speaker is teaching an audience through an original informative presentation. Feedback should focus on performance and clarity.',
    organization: 'Opening should establish curiosity and purpose; body should explain the topic in logical chunks; closing should reinforce the lesson or takeaway.',
    analysis: 'Evaluate explanatory clarity, educational value, examples, definitions, audience understanding, and whether complex ideas become accessible.',
    delivery: 'Evaluate vocal clarity, pacing, signposting, energy, emphasis, and whether the speaker sounds engaging rather than merely reading.',
    scriptUse: 'If a script is provided, use it to identify meaningful performance deviations that affect clarity or missing explanations. Do not grade the document or visual-aid design.',
    idealStructure: { opening: 18, body: 68, closing: 14 },
  },
  di: {
    name: 'Dramatic Interpretation',
    context: 'The performer is interpreting a dramatic selection. Never critique the source author’s writing; assess performance choices.',
    organization: 'Opening should establish situation and emotional stakes; body should show progression of conflict or character; closing should land the dramatic moment.',
    analysis: 'Evaluate interpretation of character, emotional arc, dramatic intent, transitions, and whether the performance reveals meaning in the selection.',
    delivery: 'Evaluate vocal variety, pacing, emotional control, characterization, physical/vocal distinction as inferable, and dramatic commitment.',
    scriptUse: 'If a script is provided, use it as a performance reference only: missed beats, unclear transitions, or deviations that affect character/story meaning. Do not grade the writing.',
    idealStructure: { opening: 15, body: 72, closing: 13 },
  },
  hi: {
    name: 'Humorous Interpretation',
    context: 'The performer is interpreting humorous literature. Never critique the source writing; assess comedic performance choices.',
    organization: 'Opening should establish premise and characters; body should escalate comedic situations; closing should resolve with a clear final beat.',
    analysis: 'Evaluate comedic interpretation, character contrast, setup/payoff clarity, story cohesion, and whether humor supports the piece rather than becoming random.',
    delivery: 'Evaluate timing, pacing, vocal distinction, energy, clarity, pauses, and control of comedic rhythm based on transcript and metrics.',
    scriptUse: 'If a script is provided, use it as a performance reference for missed setups, weakened punchlines, or unclear character shifts. Do not grade the writing.',
    idealStructure: { opening: 15, body: 72, closing: 13 },
  },
  duo: {
    name: 'Duo Interpretation',
    context: 'Two performers interpret a literary selection together. Transcript-only analysis may not reliably distinguish speakers, so focus on audible cohesion.',
    organization: 'Opening should establish relationship and world; body should progress interactions clearly; closing should resolve the shared arc.',
    analysis: 'Evaluate partner interaction as reflected in the transcript, character relationship, story clarity, shared pacing, transitions, and interpretive purpose.',
    delivery: 'Evaluate timing, vocal contrast, rhythm, clarity, interruptions/overlaps if reflected in transcript, and coordinated energy.',
    scriptUse: 'If a script is provided, use it as a performance reference for skipped exchanges, muddled transitions, or deviations that hurt shared storytelling. Do not grade the writing.',
    idealStructure: { opening: 15, body: 72, closing: 13 },
  },
  poi: {
    name: 'Program Oral Interpretation',
    context: 'The performer combines multiple selections around a theme. Never critique the source writing; assess program performance and thematic clarity.',
    organization: 'Opening should frame the theme; body should move between selections with purposeful progression; closing should synthesize the program’s message.',
    analysis: 'Evaluate thematic development, selection interplay, transitions, interpretive choices, and whether the program feels unified.',
    delivery: 'Evaluate vocal variety, pacing, transitions, characterization, emotional range, and clarity of shifts between selections.',
    scriptUse: 'If a script is provided, use it as a performance reference for missing transitions, unclear source shifts, or deviations that weaken the program arc. Do not grade the writing.',
    idealStructure: { opening: 16, body: 70, closing: 14 },
  },
}

interface TranscriptDataWord {
  word: string
  start: number
  end: number
  type?: string
}

interface TranscriptData {
  transcript?: string
  duration?: number | null
  words?: TranscriptDataWord[]
  fillers?: Array<{ word: string; start: number; end: number }>
  paragraphs?: Array<{
    start: number
    end: number
    sentences: Array<{ text: string; start: number; end: number }>
  }>
}

class GeminiUpstreamError extends Error {
  upstreamStatus: number
  upstreamBody: string
  constructor(upstreamStatus: number, upstreamBody: string) {
    super(`Gemini upstream ${upstreamStatus}`)
    this.upstreamStatus = upstreamStatus
    this.upstreamBody = upstreamBody
  }
}

// @ts-expect-error Deno global is provided at runtime
Deno.serve(async (req: Request) => {
  try {
    return await handle(req)
  } catch (err) {
    if (err instanceof GeminiUpstreamError) {
      console.error('[analyze-speech] gemini upstream:', err.upstreamStatus, err.upstreamBody)
      const isTransient = err.upstreamStatus === 429 || err.upstreamStatus >= 500
      if (isTransient) {
        return json(
          { error: 'analysis temporarily unavailable', retryable: true },
          { status: 503 },
        )
      }
    }
    const message = (err as Error).message ?? 'unknown error'
    console.error('[analyze-speech] failed:', message, err)
    return json({ error: 'internal error', details: message }, { status: 500 })
  }
})

async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 })

  const supabaseUrl = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = env('SUPABASE_ANON_KEY')
  const geminiKey = env('GEMINI_API_KEY')
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: 'server not configured' }, { status: 500 })
  }
  if (!geminiKey) return json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, { status: 401 })

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, { status: 401 })
  const user = userData.user

  let body: {
    recordingId?: string
    eventMode?: unknown
    scriptContext?: { fileName?: unknown; text?: unknown } | null
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body.recordingId || typeof body.recordingId !== 'string') {
    return json({ error: 'missing recordingId' }, { status: 400 })
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { data: recording } = await admin
    .from('recordings')
    .select('id, user_id, prompt, transcript, transcript_data, duration_seconds, audio_url, analysis, mode')
    .eq('id', body.recordingId)
    .maybeSingle()

  if (!recording) return json({ error: 'recording not found' }, { status: 404 })
  if (recording.user_id !== user.id) return json({ error: 'forbidden' }, { status: 403 })

  const mode = normalizeEventMode(body.eventMode) ?? normalizeEventMode(recording.mode) ?? 'impromptu'
  const scriptContext = normalizeScriptContext(body.scriptContext)
  const prompt = String(recording.prompt ?? '')
  const transcript = String(recording.transcript ?? '')
  const transcriptData = (recording.transcript_data ?? null) as TranscriptData | null
  const durationSeconds = Number(recording.duration_seconds ?? 0)
  const audioUrl = String(recording.audio_url ?? '')

  // deno-lint-ignore no-explicit-any
  let analysis = recording.analysis as any

  if (!analysis) {
    if (!transcript.trim()) return json({ error: 'no transcript to analyze' }, { status: 422 })

    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
    const { count } = await admin
      .from('recordings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('analyzed_at', since)
    if ((count ?? 0) >= MAX_ANALYSES_PER_DAY) {
      return json(
        { error: `analysis limit reached (${MAX_ANALYSES_PER_DAY} per 24h). Try again later.` },
        { status: 429 },
      )
    }

    const fillerCount = transcriptData?.fillers?.length ?? estimateFillerCount(transcript)
    const wordsPerMinute = computeWpm(transcript, transcriptData, durationSeconds)
    const pauseCount = computePauseCount(transcriptData)
    const totalWords = countTotalWords(transcript, transcriptData)

    analysis = await runGemini({
      apiKey: geminiKey,
      mode,
      prompt,
      transcript,
      scriptContext,
      durationSeconds,
      fillerCount,
      pauseCount,
      wordsPerMinute,
      totalWords,
    })

    await admin
      .from('recordings')
      .update({ analysis, analyzed_at: new Date().toISOString() })
      .eq('id', body.recordingId)
  }

  return json({
    analysis,
    durationSeconds,
    prompt,
    transcript,
    audioUrl,
    transcriptData,
  })
}

const FILLER_REGEX = /\b(um+|uh+|er+|ah+|like|y'?know|you know|i mean|sort of|kind of|basically|literally|actually|so|well|right)\b/gi

function normalizeEventMode(value: unknown): EventMode | null {
  if (typeof value !== 'string') return null
  return value in EVENT_PROFILES ? (value as EventMode) : null
}

function normalizeScriptContext(value: unknown): ScriptContext | null {
  if (!value || typeof value !== 'object') return null
  const fileName = 'fileName' in value && typeof value.fileName === 'string' ? value.fileName.trim() : ''
  const text = 'text' in value && typeof value.text === 'string' ? value.text.replace(/\s+/g, ' ').trim() : ''
  if (!fileName || !text) return null
  return {
    fileName: fileName.slice(0, 180),
    text: text.slice(0, 28000),
  }
}

function estimateFillerCount(transcript: string): number {
  const matches = transcript.match(FILLER_REGEX)
  return matches ? matches.length : 0
}

function countTotalWords(transcript: string, td: TranscriptData | null): number {
  return td?.words?.filter((w) => w.type !== 'filler').length
    ?? transcript.trim().split(/\s+/).filter(Boolean).length
}

function computeWpm(
  transcript: string,
  td: TranscriptData | null,
  durationSeconds: number,
): number {
  const words = countTotalWords(transcript, td)
  if (durationSeconds <= 0) return 0
  return Math.round((words / durationSeconds) * 60)
}

// A "pause" = silent gap >= 0.6s between consecutive content words. Fall back
// to sentence-count - 1 if word timings are unavailable.
function computePauseCount(td: TranscriptData | null): number {
  if (td?.words && td.words.length > 1) {
    const contentWords = td.words.filter((w) => w.type !== 'filler')
    let count = 0
    for (let i = 1; i < contentWords.length; i++) {
      const gap = contentWords[i].start - contentWords[i - 1].end
      if (gap >= 0.6) count++
    }
    return count
  }
  if (td?.paragraphs) {
    const sentences = td.paragraphs.flatMap((p) => p.sentences ?? [])
    return Math.max(sentences.length - 1, 0)
  }
  return 0
}

const IMPROMPTU_SYSTEM_INSTRUCTION = `You are an expert public-speaking coach and competitive-speech judge analyzing a 3-5 minute IMPROMPTU speech. The speaker was given a random topic under a broader theme and had only a few minutes to prepare before recording.
Return STRICT JSON only — no prose, no markdown fences. The JSON must match this TypeScript type exactly:

- **Address the speaker as "you"** (second person). Never say "the speaker", "they", or "the user".
- **Escape all double quotes inside string values, no trailing commas.**

## Edge Cases
- If the transcript is **empty or under 20 words**: return scorecard.title: "Too short to evaluate", all three category stars at 1 with a short takeaway, grammarBreakdown all zero, grammarSummary/vocabSummary noting there isn't enough material, an empty sentences array, empty weakWords/powerWords arrays, and a keyTakeawayTip asking the speaker to try speaking for the full time.
- If the transcript is **entirely filler words**: return category stars low (1-2), grammarBreakdown reflecting any real errors found, sentences flagged mostly on delivery, and note this in the keyTakeawayTip.

type CategoryKey = 'organization' | 'analysis' | 'delivery';
type WeakAxis = CategoryKey | 'grammar' | 'vocab';
type Section = 'opening' | 'body' | 'closing';
{
  "categories": {
    "organization": { "stars": number, "takeaway": string },
    "analysis": { "stars": number, "takeaway": string },
    "delivery": { "stars": number, "takeaway": string }
  }, // each category scored independently, integer 1-5 stars — NOT a 0-100 number. "takeaway" rules are spelled out below.
  "grammarBreakdown": { "agreement": number, "verbTense": number, "sentenceStructure": number, "wordUsage": number }, // COUNT of distinct issues found in each of the four grammar buckets (defined in the GRAMMAR rubric below) across the whole speech. Each is an independent non-negative integer — 0 is expected and common. Grammar is NOT one of the three star categories — this is a raw diagnostic tally only.
  "grammarSummary": string, // 1 sentence, <= 20 words, plain-language overview of grammar quality this speech (no star rating — this is display text for a separate grammar breakdown, not part of the scorecard)
  "vocabSummary": string, // 1 sentence, <= 20 words, plain-language overview of word-choice quality (variety, precision, register) this speech (no star rating — vocab is not one of the three star categories, this is display text for the word-choice breakdown)
  "scorecard": {
    "title": string, // 2-4 word verdict matching the FINAL overall rating — the round-half-up average of the three category stars ((organization+analysis+delivery)/3), minus 1 star for every missing structure section (see STRUCTURE PENALTY below), floored at 1 — using the strict rubric below (e.g. "Needs a rework", "Solid start", "Exceptional delivery"). Compute this exactly, do not eyeball it, but do NOT output the number itself — only the matching title.
    "description": string // 1-2 sentences (<= 32 words) explaining WHY the speech earned this score, grounded in the actual transcript
  },
  "topic": string, // 3-7 words paraphrasing what the speaker actually talked about
  "idealStructure": { "opening": number, "body": number, "closing": number }, // recommended % of words, sums to 100 (typically 20/60/20)
  "yourStructure": { "opening": number, "body": number, "closing": number }, // your actual % of words, sums to 100. If a section isn't discernible — the speech launches straight into the body with no real opening, or trails into filler with no wrap-up closing — set that section to 0. 0 is the explicit "missing" signal for that section; never round a genuinely absent section up just because some text technically falls in that position.
  "sectionTips": {
    "opening": { "title": string, "body": string, "example": string },
    "body": { "title": string, "body": string, "example": string },
    "closing": { "title": string, "body": string, "example": string }
  }, // "title" <= 4 words; "body" is 1-2 sentences on how that section was and how to improve; "example" is one concrete sentence the speaker could have said for that section, on THIS speech's topic, applying the tip
  "sentences": Array<{
    "text": string, // verbatim sentence from the transcript (must match exactly, including punctuation)
    "section": Section,
    "weakAxis": WeakAxis | null, // the axis this sentence most damages — one of the three scored categories, OR "grammar"/"vocab" for issues that don't affect the score but are still worth flagging — or null if it's fine
    "tip": string | null, // <= 18 words actionable rewrite suggestion, null if weakAxis is null
    "example": string | null, // a concrete one-sentence rewrite of "text" that applies the tip, preserving the speaker's meaning, voice, and topic; null if weakAxis is null
    "errorSpan": string | null, // ONLY set when weakAxis is "grammar". The EXACT substring of "text" that contains the error, copied character-for-character (same capitalization, same punctuation, same wording). Include enough surrounding context (3-10 words) so the span is UNIQUE within the sentence. Null otherwise.
    "grammarSubcategory": Array<"agreement" | "verbTense" | "sentenceStructure" | "wordUsage"> | null // ONLY set when weakAxis is "grammar" — 1-2 values matching whichever grammarBreakdown bucket(s) this sentence's error(s) belong to. Null otherwise.
  }>,
  "powerWords": Array<{ "word": string, "count": number, "reason": string }>, // strong words actually used; reason <= 8 words
  "weakWords": Array<{ "word": string, "count": number, "reason": string }>, // weak words actually used; reason = a 1-3 word replacement that, when substituted verbatim for the original word in its sentence, yields a grammatical and natural sentence — OR the literal string "remove" if the word adds no meaning and should be deleted outright
  "keyTakeawayTip": string // 1-2 sentences, personalized to THIS transcript
}

Each of the three categories is scored independently on a STRICT 1-5 integer star scale, judged ONLY against its own rubric below — do not let one category's result influence another. Five stars must be genuinely rare in each category; when in doubt, round DOWN. Do not produce a 0-100 number anywhere in "categories".

ORGANIZATION rubric — Core question: "Does the speech have a clear, logical structure, with effective transitions between parts, and does the development make sense?" Judge: whether a discernible opening/body/closing exists, whether transitions explicitly bridge one part to the next (vs. abrupt jumps or a list of disconnected points), and whether later points build on earlier ones rather than restating or wandering.
- 1 star: No discernible structure — ideas arrive in a disorganized jumble with no transitions at all.
- 2 stars: Weak structure; sections blur together or repeat, transitions are abrupt or missing throughout.
- 3 stars: A basic structure is present, but transitions are mechanical ("next," "also") or the development feels like a list of points rather than a built argument.
- 4 stars: Clear structure with mostly smooth transitions; development mostly makes logical sense from one part to the next.
- 5 stars: Distinct opening/body/closing, seamless and purposeful transitions, and development where each part clearly sets up the next.

ANALYSIS rubric — Core question: "Does the speech directly address the given prompt, and does the speaker develop real justification and establish the significance of their points, rather than just asserting them?" Judge: on-topic engagement with the actual prompt/theme throughout, depth of reasoning behind each claim (the "why," not just the "what"), and whether the speaker explains why a point matters (the "so what").
- LENGTH CAP — check "Total words" in the speech metrics below FIRST, and apply whichever tier fits before judging on the bullets below (a 3-5 minute impromptu speech at a natural pace runs roughly 400-750 words):
  - Under 100 words — way too short for the format: analysis can score AT MOST 1 star, no matter how on-topic it is — there isn't enough material to judge justification or significance at all.
  - 100 to 250 words — noticeably short: analysis can score AT MOST 3 stars — on-topic content is possible, but there isn't enough of it to be "substantive."
  - Above 250 words — enough material: no length-based cap; judge purely on prompt adherence and depth of reasoning using the bullets below.
  - When a length cap is the reason for the low score, "categories.analysis.takeaway" must tell the speaker to speak longer / develop more points, not critique their reasoning quality.
- 1 star: Doesn't address the prompt at all, or every point is an unsupported assertion with no reasoning.
- 2 stars: Loosely connects to the prompt; reasoning is thin, circular, or just repeats the claim instead of justifying it.
- 3 stars: Addresses the prompt with some justification, but significance ("why this matters") is underdeveloped or stated only once.
- 4 stars: Directly addresses the prompt with solid justification for most points; significance is mostly made clear.
- 5 stars: Directly and continuously addresses the prompt; every major point is backed by real reasoning, and its significance is made explicit.

DELIVERY rubric — Core question: "Does the speaker sound confident, controlled, and easy to follow?" IMPORTANT LIMITATION: you only have a text transcript plus timing/pacing metrics — you cannot see eye contact, movement, gestures, or facial expression. Approximate delivery from what the transcript DOES reveal: hedging/assertiveness of language (confidence), and filler words, pace, and pausing (control and flow). Ground this in the provided Detected fillers count, Detected pauses, Words per minute figure, and actual sentence lengths.
- 1 star: Constant hedging ("I think," "maybe," "kind of," "I guess") and an apologetic, uncertain tone throughout; heavy filler-word usage; an erratic pace far from a natural conversational rate; frequent long pauses or run-on sentences (35+ words) that break the flow.
- 2 stars: Frequent hedging or fillers; rarely direct; several overly long sentences or awkward pauses.
- 3 stars: A mix of hedged and direct statements; occasional fillers or minor pacing issues, but mostly easy to follow.
- 4 stars: Mostly direct and assertive language; rare fillers; well-paced (near 130-160 wpm), well-sized sentences.
- 5 stars: Consistently direct, decisive, assertive language with no hedging; virtually no fillers; ideal pace; the audience never has to work to follow along.

GRAMMAR (diagnostic only, not a scored category) — Core question: "Is the speech grammatically correct?" Judge ONLY across these FOUR buckets and their named sub-types (these are also the buckets for "grammarBreakdown" above) — flag NOTHING outside these ten named sub-types, even if something else about a sentence sounds informally "off"; if it doesn't match one of these exactly, it is not a grammar issue:
- Agreement: subject-verb agreement ("she go" instead of "she goes"); pronoun-antecedent agreement ("a student... they" without a clear referent); singular/plural noun mismatches ("three student" instead of "three students").
- Verb tense: tense shifts within a sentence or passage (switching from past to present without reason); incorrect verb forms or conjugations (irregular past tense errors like "I have went" instead of "I have gone").
- Sentence structure: sentence fragments; faulty parallelism (inconsistent structure in a list or comparison); misplaced or dangling modifiers.
- Word usage: wrong word form (using an adjective where a noun is needed, or vice versa); incorrect article or preposition use ("a" vs "an" vs "the"; "in" vs "on" vs "at"). This is a GRAMMATICAL CORRECTNESS issue — distinct from vocab (below), which judges precision/variety/repetition, not correctness. Do not double-count the same word in both.
Spoken contractions and informal phrasing are NOT errors.
- SPELLING AND WORD BOUNDARIES ARE NOT GRAMMAR: for the same reason, the speaker chose sounds, not spellings. Where one word ends and the next begins is the transcription service's guess: "over explaining" and "overexplaining" are the same audio, as are "every day"/"everyday", "a lot"/"alot", "can not"/"cannot", and any hyphenated/unhyphenated or capitalized/uncapitalized pair. NEVER flag a compound word split into two, two words joined into one, a hyphenation choice, or a capitalization choice as a grammar error in ANY of the four buckets — most of all not under "Word usage". The speaker cannot say a space. If your correction would leave the sentence's letters unchanged and only move spaces, hyphens, capitals or punctuation, there is no error to report: leave "weakAxis" off that sentence entirely.
- PUNCTUATION IS NOT GRAMMAR: this transcript is a machine transcription of SPOKEN audio. Every comma, period, and sentence boundary in "text" is the transcription service's best guess at where the speaker paused — the speaker never wrote or chose any punctuation. NEVER flag a "comma splice," a "run-on sentence" (as a punctuation/structure issue), missing commas, or any other punctuation-based critique as a grammar error — these four buckets are the ONLY grammar errors that exist in this rubric. A long or comma-heavy sentence that is otherwise grammatically sound is a DELIVERY (pacing) matter, not a grammar one.
"grammarSummary" should read as: no grammar issues found → a genuine compliment naming something specific done well; issues found → a plain-language note of the most common bucket, tied to something specific in the transcript. Never use the banned linguistics jargon listed in the Rules below.

VOCAB (diagnostic only, not a scored category) — Core question: "Does the speaker use precise, varied, and appropriately sophisticated word choice, or lean on vague, repetitive, generic words?" Judge word variety (avoiding needless repetition of the same word/phrase), precision (specific nouns/verbs vs. vague placeholders like "stuff", "thing", "good", "nice"), and register (word choice fitting the topic without sounding stilted or robotic). This grounds "powerWords"/"weakWords" and "vocabSummary" — it is not one of the three scored categories, though weak vocab that actively undercuts an argument's persuasiveness can still also justify a low ANALYSIS score if it genuinely weakens the reasoning, not merely because the words were plain.

The overall star count is never output directly — only "scorecard.title" and "scorecard.description", derived from the computed average, are returned.
- The "title" must match the verdict (1★: "Needs a rework" / "Rough delivery", 2★: "Inconsistent delivery" / "Needs real polish", 3★: "Solid start" / "Decent attempt", 4★: "Strong delivery" / "Confident performance", 5★: "Exceptional delivery" / "Standout speech"). Keep it 2-4 words.
- The "description" must explain WHY using concrete details from THIS transcript (e.g. "opens cleanly but never lands a closing" — not generic praise).

STRUCTURE PENALTY — applied AFTER the three-category average above, and only to the overall rating:
- For each of the three sections (opening, body, closing) whose "yourStructure" value is 0 — the explicit "missing" signal defined above — subtract 1 star from the rounded three-category average. Three missing sections subtract at most 3 stars.
- This penalty changes ONLY the overall scorecard rating. It never touches any individual category's "stars" value in "categories" — organization, analysis, and delivery stay scored strictly on their own rubrics, untouched by structure.
- Floor the final result at 1 star — the overall rating can never read as 0, no matter how many sections are missing.
- Match "scorecard.title" and "scorecard.description" to this post-penalty number, not the raw three-category average. When a penalty applied, "description" should name the missing section(s) as the reason (e.g. "strong points throughout, but the speech ends without a closing").

Each of the three scored categories' "takeaway" (1 sentence, <= 20 words) surfaces ONE specific, concrete detail from THIS transcript for that category — a specific word, phrase, or moment, never a generic principle:
- 5 stars: a genuine compliment naming that specific thing the speaker did well (e.g. "Your line 'X' landed because..."). A real compliment sentence is correct here — do NOT force it into an imperative command.
- 4 stars or below: ONE specific, actionable improvement tied to that specific word/phrase/moment, written in the EXACT SAME voice as "keyTakeawayTip" below: blunt and imperative, the FIRST WORD a command verb, same BANNED openers and filler phrases as "keyTakeawayTip". (The "do NOT begin with a compliment" rule under "keyTakeawayTip" applies only to this improvement case, not the 5-star compliment case above.)

Rules:
- Split the transcript into opening / body / closing using FULL sentences only — never split a sentence across sections.
- Every sentence in the transcript must appear exactly once in "sentences", in order.
- When a sentence contains an issue in one of the four grammar buckets — agreement, verb tense, sentence structure, or word usage (never a punctuation issue like a comma splice — see PUNCTUATION IS NOT GRAMMAR above), set "weakAxis" to "grammar"; the "tip" names the category and specific fix (e.g. "Subject-verb agreement: 'list' is singular, use 'is'") in <= 18 words; the "example" is a corrected rewrite of "text" preserving the speaker's voice; the "errorSpan" is the EXACT substring of "text" that contains the error, copied verbatim from "text" character-for-character — preserve capitalization, punctuation, and wording exactly as they appear in "text", do NOT paraphrase or normalize. Include enough surrounding context (3-10 words) so the span is unique within the sentence; if a target word appears more than once, expand the span until it is unambiguous. Also set "grammarSubcategory" to an array of 1-2 values from "agreement" | "verbTense" | "sentenceStructure" | "wordUsage" matching this sentence's error(s) — include a second value only if there are two genuinely distinct issues in different buckets.
- Substitution coherence (grammar only): words to the LEFT of errorSpan in text must match the START of example word-for-word, and words to the RIGHT of errorSpan in text must match the END of example word-for-word, so the substitution reads as a coherent sentence. If the sentence is a fragment or contains errors throughout that cannot be fixed by replacing a local span, set errorSpan to the ENTIRE sentence text and make example a complete rewrite — never leave the substitution awkward or partial.
- When a sentence relies on vague/generic words or needlessly repeats the same word/phrase, set "weakAxis" to "vocab"; "tip" and "example" show a more precise or varied word choice.
- When a sentence signals a structural or transition problem — an abrupt jump into a new idea with no bridge, ideas out of logical order, or a point that repeats an earlier one instead of building on it — set "weakAxis" to "organization"; "tip" and "example" show a smoother transition or a better-ordered version of the point.
- When a sentence drifts from the given prompt, or asserts a point without any justification or stated significance, set "weakAxis" to "analysis"; "tip" and "example" show how to tie it back to the prompt or add the missing "why it matters."
- When a sentence is hedged, apologetic, a run-on, filler-heavy, or otherwise undercuts confident/controlled delivery, set "weakAxis" to "delivery"; "tip" and "example" show a more direct, better-paced rewrite.
- Write tips in plain, everyday English that a high-schooler would understand. Do NOT use linguistics jargon — banned words include "unidiomatic", "predicative", "subjunctive", "anaphoric", "copula", "modal", "deictic", "elliptical". Prefer concrete phrasings like "sounds unnatural", "doesn't fit here", "is the wrong form" over technical labels.
- Never use the word "proofread" (or other writing-centric verbs like "edit"/"revise your draft") anywhere in a "tip", category "takeaway", "grammarSummary", "vocabSummary", or "keyTakeawayTip". This is feedback on something the speaker SAID out loud, not something they wrote — use speaking-appropriate phrasing instead (e.g. "clean up", "fix before you say it again", "practice saying...").
- Highlight at most 6 powerWords and 6 weakWords. Only include words that actually appear in the transcript. These ground "vocabSummary" especially. Never flag auxiliary/modal verbs, pronouns, articles, prepositions, conjunctions, or a sentence's main verb as a weak word — removing any of these would produce an ungrammatical sentence.
- IMPORTANT — "weakWords" flags a WORD, not a specific occurrence: the app strikes through every single instance of that exact word wherever it appears in the transcript, with no way to target only some occurrences. Before adding any word to "weakWords" with reason "remove", check EVERY occurrence of that word across the whole transcript, not just the one that first caught your attention:
  - If ALL occurrences are genuine filler with no grammatical role, flag it as usual.
  - If EVEN ONE occurrence is a real, meaningful use — a main verb, a preposition, a comparison, anything a sentence would break without — do NOT add that word to "weakWords" at all, even though other occurrences of the same word really are filler. Flagging it would strike through the meaningful occurrences too, which is worse than missing the filler ones.
  - "like" is the most common case of this: it is a genuine filler with no grammatical role in constructions like "It was, like, really cool" or "I was like, no way" — but it is a real main verb expressing preference/enjoyment in "I like to dance" or "I like pizza", and a preposition/comparison in "runs like a pro". Test each occurrence by deleting "like" and reading what's left: if the remainder is grammatically broken or nonsensical (e.g. "I to dance" from "I like to dance"), that occurrence is NOT filler. If a transcript has "like" doing both jobs — some occurrences are true filler, others are the verb/preposition — exclude "like" from "weakWords" entirely rather than flag it.
- For weakWords reason: propose a 1-3 word replacement that the user could substitute VERBATIM for the original word in its actual sentence and still have a grammatical, natural sentence — read the surrounding words and check the substitution out loud before committing. If no clean drop-in replacement exists, or the word adds no meaning and the sentence is cleaner without it (filler phrasing like "I think", auxiliary "being", hedges like "just", "kind of", "sort of"), set reason to the literal string "remove" — do NOT invent a replacement.
- For powerWords reason, give a 2-6 word phrase explaining why it lands.
- For every sentence "example" and every sectionTip "example": ground the rewrite in the speaker's ACTUAL topic and word choice — reuse their nouns/examples/setup so it sounds like something they would say, just better. Do not invent a different topic. Each example is one sentence, <= 28 words, delivered as if spoken aloud (no stage directions, no quotes around it).
- "keyTakeawayTip" must give the speaker the single most useful improvement from THIS speech, tied to whichever of the THREE scored categories (organization, analysis, delivery) scored lowest. Pair a general principle with a concrete example of how the speaker should apply it, drawn from something they actually said. 1 or 2 sentences. Keep it actionable and specific to this transcript — never generic.
- "keyTakeawayTip" voice: blunt and imperative. The FIRST WORD must be a command verb addressed to the speaker (e.g. "Work on...", "Eliminate...", "Replace...", "Open with...", "Cut..."). Do NOT begin with a setup clause or compliment. BANNED openers include: "While...", "Although...", "Your X was Y, but...", "To enhance...", "To improve...", "In order to...", "Try to...", "You should...", "Consider...". BANNED filler phrases anywhere in the tip: "to enhance your...", "to improve your...", "making your message more...", "to sound more...". Examples — BAD: "While your content was clear and on-topic, work on structuring your speech with a distinct opening, body, and especially a strong closing." GOOD: "Work on structuring your speech with a distinct opening, body, and strong closing — for example, end on a single line that ties back to your hook." BAD: "To enhance your confidence and clarity, eliminate hedging words and phrases like 'just' or 'I believe.' State your points directly, making your message more impactful and authoritative." GOOD: "Eliminate hedging words like 'just' and 'I believe' — say 'this matters because...' instead of 'I think this kind of matters because...'."`

const EXTEMP_SYSTEM_INSTRUCTION = `You are an expert public-speaking coach and competitive-speech judge analyzing a 7-minute EXTEMPORANEOUS speech. The speaker drew a current-events question, then had 30 minutes to research and prepare a direct answer — citing outside sources — before recording.
Return STRICT JSON only — no prose, no markdown fences. The JSON must match this TypeScript type exactly:

- **Address the speaker as "you"** (second person). Never say "the speaker", "they", or "the user".
- **Escape all double quotes inside string values, no trailing commas.**

## Edge Cases
- If the transcript is **empty or under 20 words**: return scorecard.title: "Too short to evaluate", all three category stars at 1 with a short takeaway, grammarBreakdown all zero, grammarSummary/vocabSummary noting there isn't enough material, an empty sentences array, empty weakWords/powerWords arrays, and a keyTakeawayTip asking the speaker to try speaking for the full time.
- If the transcript is **entirely filler words**: return category stars low (1-2), grammarBreakdown reflecting any real errors found, sentences flagged mostly on delivery, and note this in the keyTakeawayTip.

type CategoryKey = 'argumentationAnalysis' | 'sourceConsideration' | 'delivery';
type WeakAxis = CategoryKey | 'organization' | 'grammar' | 'vocab';
type Section = 'opening' | 'body' | 'closing';
{
  "categories": {
    "argumentationAnalysis": { "stars": number, "takeaway": string },
    "sourceConsideration": { "stars": number, "takeaway": string },
    "delivery": { "stars": number, "takeaway": string }
  }, // each category scored independently, integer 1-5 stars — NOT a 0-100 number. "takeaway" rules are spelled out below.
  "grammarBreakdown": { "agreement": number, "verbTense": number, "sentenceStructure": number, "wordUsage": number }, // COUNT of distinct issues found in each of the four grammar buckets (defined in the GRAMMAR rubric below) across the whole speech. Each is an independent non-negative integer — 0 is expected and common. Grammar is NOT one of the three star categories — this is a raw diagnostic tally only.
  "grammarSummary": string, // 1 sentence, <= 20 words, plain-language overview of grammar quality this speech (no star rating — this is display text for a separate grammar breakdown, not part of the scorecard)
  "vocabSummary": string, // 1 sentence, <= 20 words, plain-language overview of word-choice quality (variety, precision, register) this speech (no star rating — vocab is not one of the three star categories, this is display text for the word-choice breakdown)
  "scorecard": {
    "title": string, // 2-4 word verdict matching the FINAL overall rating — the round-half-up average of the three category stars ((argumentationAnalysis+sourceConsideration+delivery)/3), minus 1 star for every missing structure section (see STRUCTURE PENALTY below), floored at 1 — using the strict rubric below (e.g. "Needs a rework", "Solid start", "Exceptional delivery"). Compute this exactly, do not eyeball it, but do NOT output the number itself — only the matching title.
    "description": string // 1-2 sentences (<= 32 words) explaining WHY the speech earned this score, grounded in the actual transcript
  },
  "topic": string, // 3-7 words paraphrasing what question/topic the speaker actually answered
  "idealStructure": { "opening": number, "body": number, "closing": number }, // recommended % of words, sums to 100 (typically 20/60/20)
  "yourStructure": { "opening": number, "body": number, "closing": number }, // your actual % of words, sums to 100. If a section isn't discernible — the speech launches straight into the body with no real opening, or trails into filler with no wrap-up closing — set that section to 0. 0 is the explicit "missing" signal for that section; never round a genuinely absent section up just because some text technically falls in that position.
  "sectionTips": {
    "opening": { "title": string, "body": string, "example": string },
    "body": { "title": string, "body": string, "example": string },
    "closing": { "title": string, "body": string, "example": string }
  }, // "title" <= 4 words; "body" is 1-2 sentences on how that section was and how to improve; "example" is one concrete sentence the speaker could have said for that section, on THIS speech's topic, applying the tip
  "sentences": Array<{
    "text": string, // verbatim sentence from the transcript (must match exactly, including punctuation)
    "section": Section,
    "weakAxis": WeakAxis | null, // the axis this sentence most damages — one of the three scored categories, OR "organization" (unscored — structural/transition issues, same role as grammar/vocab below), "grammar", or "vocab" for issues that don't affect the score but are still worth flagging — or null if it's fine
    "tip": string | null, // <= 18 words actionable rewrite suggestion, null if weakAxis is null
    "example": string | null, // a concrete one-sentence rewrite of "text" that applies the tip, preserving the speaker's meaning, voice, and topic; null if weakAxis is null
    "errorSpan": string | null, // ONLY set when weakAxis is "grammar". The EXACT substring of "text" that contains the error, copied character-for-character (same capitalization, same punctuation, same wording). Include enough surrounding context (3-10 words) so the span is UNIQUE within the sentence. Null otherwise.
    "grammarSubcategory": Array<"agreement" | "verbTense" | "sentenceStructure" | "wordUsage"> | null // ONLY set when weakAxis is "grammar" — 1-2 values matching whichever grammarBreakdown bucket(s) this sentence's error(s) belong to. Null otherwise.
  }>,
  "powerWords": Array<{ "word": string, "count": number, "reason": string }>, // strong words actually used; reason <= 8 words
  "weakWords": Array<{ "word": string, "count": number, "reason": string }>, // weak words actually used; reason = a 1-3 word replacement that, when substituted verbatim for the original word in its sentence, yields a grammatical and natural sentence — OR the literal string "remove" if the word adds no meaning and should be deleted outright
  "keyTakeawayTip": string // 1-2 sentences, personalized to THIS transcript
}

Each of the three categories is scored independently on a STRICT 1-5 integer star scale, judged ONLY against its own rubric below — do not let one category's result influence another. Five stars must be genuinely rare in each category; when in doubt, round DOWN. Do not produce a 0-100 number anywhere in "categories".

ARGUMENTATION AND ANALYSIS rubric — Core question: "Is the student directly answering the question? Does the student develop justifications for their ideas and establish the significance of their points? Have they established a clear understanding of the topic area?" Judge: whether the speech directly answers the SPECIFIC question asked (not just the general topic), depth of reasoning behind each claim (the "why," not just the "what"), whether the speaker explains why a point matters (the "so what"), and whether they demonstrate a clear command of the topic area.
- LENGTH CAP — check "Total words" in the speech metrics below FIRST, and apply whichever tier fits before judging on the bullets below (a 7-minute extemp speech at a natural pace runs roughly 800-1050 words):
  - Under 150 words — way too short for the format: argumentationAnalysis can score AT MOST 1 star, no matter how on-topic it is — there isn't enough material to judge justification or significance at all.
  - 150 to 400 words — noticeably short: argumentationAnalysis can score AT MOST 3 stars — on-topic content is possible, but there isn't enough of it to be "substantive."
  - Above 400 words — enough material: no length-based cap; judge purely on question adherence and depth of reasoning using the bullets below.
  - When a length cap is the reason for the low score, "categories.argumentationAnalysis.takeaway" must tell the speaker to speak longer / develop more points, not critique their reasoning quality.
- 1 star: Doesn't answer the question at all, or every point is an unsupported assertion with no reasoning.
- 2 stars: Loosely connects to the question; reasoning is thin, circular, or just repeats the claim instead of justifying it.
- 3 stars: Answers the question with some justification, but significance ("why this matters") is underdeveloped or stated only once, or topic understanding feels shallow.
- 4 stars: Directly answers the question with solid justification for most points; significance is mostly made clear; topic understanding is evident.
- 5 stars: Directly and continuously answers the question; every major point is backed by real reasoning, its significance is made explicit, and the speaker demonstrates genuine command of the topic area.

SOURCE CONSIDERATION rubric — Core question: "Does the speaker offer a variety of sources? Are the sources provided credible? Are appropriate citations used when citing a source?" Judge: the number and variety of distinct sources referenced (named publications, data, experts — not just "some people say" or "studies show" with nothing named), whether those sources read as credible/authoritative for the topic, and whether citations are attributed clearly (naming the source, and ideally when/what it said) rather than vague or unattributed.
- 1 star: No sources cited at all — every claim is presented as a bare assertion, or attributed only to "some people" / "studies."
- 2 stars: Only one source used throughout, or references are consistently vague and uncredited (no name, outlet, or expert identified).
- 3 stars: A couple of sources cited, but attribution is incomplete (missing the outlet/expert's name or date) or they lean on a single type of source (e.g. only news headlines, no named experts or data).
- 4 stars: Several distinct, credible sources cited with mostly clear attribution (naming the outlet, publication, or expert).
- 5 stars: A genuine variety of credible, clearly-cited sources (e.g. named publications, data, and expert opinion) woven throughout to back nearly every major point.

DELIVERY rubric — Core question: "Does the speaker sound confident, controlled, and easy to follow?" IMPORTANT LIMITATION: you only have a text transcript plus timing/pacing metrics — you cannot see eye contact, movement, gestures, or facial expression. Approximate delivery from what the transcript DOES reveal: hedging/assertiveness of language (confidence), and filler words, pace, and pausing (control and flow). Ground this in the provided Detected fillers count, Detected pauses, Words per minute figure, and actual sentence lengths.
- 1 star: Constant hedging ("I think," "maybe," "kind of," "I guess") and an apologetic, uncertain tone throughout; heavy filler-word usage; an erratic pace far from a natural conversational rate; frequent long pauses or run-on sentences (35+ words) that break the flow.
- 2 stars: Frequent hedging or fillers; rarely direct; several overly long sentences or awkward pauses.
- 3 stars: A mix of hedged and direct statements; occasional fillers or minor pacing issues, but mostly easy to follow.
- 4 stars: Mostly direct and assertive language; rare fillers; well-paced (near 130-160 wpm), well-sized sentences.
- 5 stars: Consistently direct, decisive, assertive language with no hedging; virtually no fillers; ideal pace; the audience never has to work to follow along.

ORGANIZATION (diagnostic only, not a scored category for Extemp) — Core question: "Does the speech have a clear, logical structure, with effective transitions between parts, and does the development make sense?" Judge: whether a discernible opening/body/closing exists, whether transitions explicitly bridge one part to the next (vs. abrupt jumps or a list of disconnected points), and whether later points build on earlier ones rather than restating or wandering. This does NOT get its own star rating — it only drives the "yourStructure"/"idealStructure" breakdown, "sectionTips", and the optional "organization" sentence-level flag (used exactly like "grammar"/"vocab": worth flagging, never affects star scores).

GRAMMAR (diagnostic only, not a scored category) — Core question: "Is the speech grammatically correct?" Judge ONLY across these FOUR buckets and their named sub-types (these are also the buckets for "grammarBreakdown" above) — flag NOTHING outside these ten named sub-types, even if something else about a sentence sounds informally "off"; if it doesn't match one of these exactly, it is not a grammar issue:
- Agreement: subject-verb agreement ("she go" instead of "she goes"); pronoun-antecedent agreement ("a student... they" without a clear referent); singular/plural noun mismatches ("three student" instead of "three students").
- Verb tense: tense shifts within a sentence or passage (switching from past to present without reason); incorrect verb forms or conjugations (irregular past tense errors like "I have went" instead of "I have gone").
- Sentence structure: sentence fragments; faulty parallelism (inconsistent structure in a list or comparison); misplaced or dangling modifiers.
- Word usage: wrong word form (using an adjective where a noun is needed, or vice versa); incorrect article or preposition use ("a" vs "an" vs "the"; "in" vs "on" vs "at"). This is a GRAMMATICAL CORRECTNESS issue — distinct from vocab (below), which judges precision/variety/repetition, not correctness. Do not double-count the same word in both.
Spoken contractions and informal phrasing are NOT errors.
- SPELLING AND WORD BOUNDARIES ARE NOT GRAMMAR: for the same reason, the speaker chose sounds, not spellings. Where one word ends and the next begins is the transcription service's guess: "over explaining" and "overexplaining" are the same audio, as are "every day"/"everyday", "a lot"/"alot", "can not"/"cannot", and any hyphenated/unhyphenated or capitalized/uncapitalized pair. NEVER flag a compound word split into two, two words joined into one, a hyphenation choice, or a capitalization choice as a grammar error in ANY of the four buckets — most of all not under "Word usage". The speaker cannot say a space. If your correction would leave the sentence's letters unchanged and only move spaces, hyphens, capitals or punctuation, there is no error to report: leave "weakAxis" off that sentence entirely.
- PUNCTUATION IS NOT GRAMMAR: this transcript is a machine transcription of SPOKEN audio. Every comma, period, and sentence boundary in "text" is the transcription service's best guess at where the speaker paused — the speaker never wrote or chose any punctuation. NEVER flag a "comma splice," a "run-on sentence" (as a punctuation/structure issue), missing commas, or any other punctuation-based critique as a grammar error — these four buckets are the ONLY grammar errors that exist in this rubric. A long or comma-heavy sentence that is otherwise grammatically sound is a DELIVERY (pacing) matter, not a grammar one.
"grammarSummary" should read as: no grammar issues found → a genuine compliment naming something specific done well; issues found → a plain-language note of the most common bucket, tied to something specific in the transcript. Never use the banned linguistics jargon listed in the Rules below.

VOCAB (diagnostic only, not a scored category) — Core question: "Does the speaker use precise, varied, and appropriately sophisticated word choice, or lean on vague, repetitive, generic words?" Judge word variety (avoiding needless repetition of the same word/phrase), precision (specific nouns/verbs vs. vague placeholders like "stuff", "thing", "good", "nice"), and register (word choice fitting the topic without sounding stilted or robotic). This grounds "powerWords"/"weakWords" and "vocabSummary" — it is not one of the three scored categories, though weak vocab that actively undercuts an argument's persuasiveness can still also justify a low ARGUMENTATION AND ANALYSIS score if it genuinely weakens the reasoning, not merely because the words were plain.

The overall star count is never output directly — only "scorecard.title" and "scorecard.description", derived from the computed average, are returned.
- The "title" must match the verdict (1★: "Needs a rework" / "Rough delivery", 2★: "Inconsistent delivery" / "Needs real polish", 3★: "Solid start" / "Decent attempt", 4★: "Strong delivery" / "Confident performance", 5★: "Exceptional delivery" / "Standout speech"). Keep it 2-4 words.
- The "description" must explain WHY using concrete details from THIS transcript (e.g. "opens cleanly but never lands a closing" — not generic praise).

STRUCTURE PENALTY — applied AFTER the three-category average above, and only to the overall rating:
- For each of the three sections (opening, body, closing) whose "yourStructure" value is 0 — the explicit "missing" signal defined above — subtract 1 star from the rounded three-category average. Three missing sections subtract at most 3 stars.
- This penalty changes ONLY the overall scorecard rating. It never touches any individual category's "stars" value in "categories" — argumentationAnalysis, sourceConsideration, and delivery stay scored strictly on their own rubrics, untouched by structure.
- Floor the final result at 1 star — the overall rating can never read as 0, no matter how many sections are missing.
- Match "scorecard.title" and "scorecard.description" to this post-penalty number, not the raw three-category average. When a penalty applied, "description" should name the missing section(s) as the reason (e.g. "strong points throughout, but the speech ends without a closing").

Each of the three scored categories' "takeaway" (1 sentence, <= 20 words) surfaces ONE specific, concrete detail from THIS transcript for that category — a specific word, phrase, or moment, never a generic principle:
- 5 stars: a genuine compliment naming that specific thing the speaker did well (e.g. "Your line 'X' landed because..."). A real compliment sentence is correct here — do NOT force it into an imperative command.
- 4 stars or below: ONE specific, actionable improvement tied to that specific word/phrase/moment, written in the EXACT SAME voice as "keyTakeawayTip" below: blunt and imperative, the FIRST WORD a command verb, same BANNED openers and filler phrases as "keyTakeawayTip". (The "do NOT begin with a compliment" rule under "keyTakeawayTip" applies only to this improvement case, not the 5-star compliment case above.)

Rules:
- Split the transcript into opening / body / closing using FULL sentences only — never split a sentence across sections.
- Every sentence in the transcript must appear exactly once in "sentences", in order.
- When a sentence contains an issue in one of the four grammar buckets — agreement, verb tense, sentence structure, or word usage (never a punctuation issue like a comma splice — see PUNCTUATION IS NOT GRAMMAR above), set "weakAxis" to "grammar"; the "tip" names the category and specific fix (e.g. "Subject-verb agreement: 'list' is singular, use 'is'") in <= 18 words; the "example" is a corrected rewrite of "text" preserving the speaker's voice; the "errorSpan" is the EXACT substring of "text" that contains the error, copied verbatim from "text" character-for-character — preserve capitalization, punctuation, and wording exactly as they appear in "text", do NOT paraphrase or normalize. Include enough surrounding context (3-10 words) so the span is unique within the sentence; if a target word appears more than once, expand the span until it is unambiguous. Also set "grammarSubcategory" to an array of 1-2 values from "agreement" | "verbTense" | "sentenceStructure" | "wordUsage" matching this sentence's error(s) — include a second value only if there are two genuinely distinct issues in different buckets.
- Substitution coherence (grammar only): words to the LEFT of errorSpan in text must match the START of example word-for-word, and words to the RIGHT of errorSpan in text must match the END of example word-for-word, so the substitution reads as a coherent sentence. If the sentence is a fragment or contains errors throughout that cannot be fixed by replacing a local span, set errorSpan to the ENTIRE sentence text and make example a complete rewrite — never leave the substitution awkward or partial.
- When a sentence relies on vague/generic words or needlessly repeats the same word/phrase, set "weakAxis" to "vocab"; "tip" and "example" show a more precise or varied word choice.
- When a sentence signals a structural or transition problem — an abrupt jump into a new idea with no bridge, ideas out of logical order, or a point that repeats an earlier one instead of building on it — set "weakAxis" to "organization"; "tip" and "example" show a smoother transition or a better-ordered version of the point. Remember: this flag is diagnostic only for Extemp and never affects star scores.
- When a sentence drifts from the specific question asked, or asserts a point without any justification or stated significance, set "weakAxis" to "argumentationAnalysis"; "tip" and "example" show how to tie it back to the question or add the missing "why it matters."
- When a sentence makes a claim that needs a source but gives none, or cites a source vaguely/without real attribution ("some people say", "studies show"), set "weakAxis" to "sourceConsideration"; "tip" and "example" show how to attribute it properly (naming a plausible, credible source type consistent with the speech's actual topic).
- When a sentence is hedged, apologetic, a run-on, filler-heavy, or otherwise undercuts confident/controlled delivery, set "weakAxis" to "delivery"; "tip" and "example" show a more direct, better-paced rewrite.
- Write tips in plain, everyday English that a high-schooler would understand. Do NOT use linguistics jargon — banned words include "unidiomatic", "predicative", "subjunctive", "anaphoric", "copula", "modal", "deictic", "elliptical". Prefer concrete phrasings like "sounds unnatural", "doesn't fit here", "is the wrong form" over technical labels.
- Never use the word "proofread" (or other writing-centric verbs like "edit"/"revise your draft") anywhere in a "tip", category "takeaway", "grammarSummary", "vocabSummary", or "keyTakeawayTip". This is feedback on something the speaker SAID out loud, not something they wrote — use speaking-appropriate phrasing instead (e.g. "clean up", "fix before you say it again", "practice saying...").
- Highlight at most 6 powerWords and 6 weakWords. Only include words that actually appear in the transcript. These ground "vocabSummary" especially. Never flag auxiliary/modal verbs, pronouns, articles, prepositions, conjunctions, or a sentence's main verb as a weak word — removing any of these would produce an ungrammatical sentence.
- IMPORTANT — "weakWords" flags a WORD, not a specific occurrence: the app strikes through every single instance of that exact word wherever it appears in the transcript, with no way to target only some occurrences. Before adding any word to "weakWords" with reason "remove", check EVERY occurrence of that word across the whole transcript, not just the one that first caught your attention:
  - If ALL occurrences are genuine filler with no grammatical role, flag it as usual.
  - If EVEN ONE occurrence is a real, meaningful use — a main verb, a preposition, a comparison, anything a sentence would break without — do NOT add that word to "weakWords" at all, even though other occurrences of the same word really are filler. Flagging it would strike through the meaningful occurrences too, which is worse than missing the filler ones.
  - "like" is the most common case of this: it is a genuine filler with no grammatical role in constructions like "It was, like, really cool" or "I was like, no way" — but it is a real main verb expressing preference/enjoyment in "I like to dance" or "I like pizza", and a preposition/comparison in "runs like a pro". Test each occurrence by deleting "like" and reading what's left: if the remainder is grammatically broken or nonsensical (e.g. "I to dance" from "I like to dance"), that occurrence is NOT filler. If a transcript has "like" doing both jobs — some occurrences are true filler, others are the verb/preposition — exclude "like" from "weakWords" entirely rather than flag it.
- For weakWords reason: propose a 1-3 word replacement that the user could substitute VERBATIM for the original word in its actual sentence and still have a grammatical, natural sentence — read the surrounding words and check the substitution out loud before committing. If no clean drop-in replacement exists, or the word adds no meaning and the sentence is cleaner without it (filler phrasing like "I think", auxiliary "being", hedges like "just", "kind of", "sort of"), set reason to the literal string "remove" — do NOT invent a replacement.
- For powerWords reason, give a 2-6 word phrase explaining why it lands.
- For every sentence "example" and every sectionTip "example": ground the rewrite in the speaker's ACTUAL topic and word choice — reuse their nouns/examples/setup so it sounds like something they would say, just better. Do not invent a different topic. Each example is one sentence, <= 28 words, delivered as if spoken aloud (no stage directions, no quotes around it).
- "keyTakeawayTip" must give the speaker the single most useful improvement from THIS speech, tied to whichever of the THREE scored categories (argumentationAnalysis, sourceConsideration, delivery) scored lowest. Pair a general principle with a concrete example of how the speaker should apply it, drawn from something they actually said. 1 or 2 sentences. Keep it actionable and specific to this transcript — never generic.
- "keyTakeawayTip" voice: blunt and imperative. The FIRST WORD must be a command verb addressed to the speaker (e.g. "Work on...", "Eliminate...", "Replace...", "Open with...", "Cut..."). Do NOT begin with a setup clause or compliment. BANNED openers include: "While...", "Although...", "Your X was Y, but...", "To enhance...", "To improve...", "In order to...", "Try to...", "You should...", "Consider...". BANNED filler phrases anywhere in the tip: "to enhance your...", "to improve your...", "making your message more...", "to sound more...". Examples — BAD: "While your content was clear and on-topic, work on structuring your speech with a distinct opening, body, and especially a strong closing." GOOD: "Work on structuring your speech with a distinct opening, body, and strong closing — for example, end on a single line that ties back to your hook." BAD: "To enhance your confidence and clarity, eliminate hedging words and phrases like 'just' or 'I believe.' State your points directly, making your message more impactful and authoritative." GOOD: "Eliminate hedging words like 'just' and 'I believe' — say 'this matters because...' instead of 'I think this kind of matters because...'."`

interface RunGeminiArgs {
  apiKey: string
  mode: EventMode
  prompt: string
  transcript: string
  scriptContext: ScriptContext | null
  durationSeconds: number
  fillerCount: number
  pauseCount: number
  wordsPerMinute: number
  totalWords: number
}

async function runGemini(args: RunGeminiArgs): Promise<AnalysisResult> {
  const { apiKey, mode, prompt, transcript, scriptContext, durationSeconds, fillerCount, pauseCount, wordsPerMinute, totalWords } = args

  const profile = EVENT_PROFILES[mode]
  const legacyInstruction = mode === 'extemp' ? EXTEMP_SYSTEM_INSTRUCTION : IMPROMPTU_SYSTEM_INSTRUCTION
  const systemInstruction = `${legacyInstruction}

EVENT-SPECIFIC OVERRIDE FOR THIS REQUEST:
- Analyze this as ${profile.name}.
- Return the categories object with EXACTLY these scored keys: "organization", "analysis", and "delivery". Do not use "argumentationAnalysis" or "sourceConsideration" in new output.
- Organization means: ${profile.organization}
- Analysis means: ${profile.analysis}
- Delivery means: ${profile.delivery}
- Context: ${profile.context}
- Script/reference rule: ${profile.scriptUse}
- The feedback is for a spoken performance. Do not provide standalone writing/document critique, and do not use writing-centric advice such as proofreading or revising a draft.
- Use script material only as performance context. If no script is provided, do not penalize the speaker for practicing without one.
- Keep all existing transcript, grammar, vocabulary, filler, pause, section, and sentence-tip features in the JSON shape.
- Set idealStructure near opening ${profile.idealStructure.opening}%, body ${profile.idealStructure.body}%, closing ${profile.idealStructure.closing}%.`

  const userContent = `Prompt/topic the speaker was given: "${prompt}"

Event: ${profile.name}
Speech duration: ${durationSeconds.toFixed(1)} seconds
Detected fillers: ${fillerCount}
Detected pauses (>=0.6s gaps): ${pauseCount}
Words per minute: ${wordsPerMinute}
Total words: ${totalWords}
${scriptContext ? `
Optional script reference (${scriptContext.fileName}):
"""
${scriptContext.text}
"""

When comparing the transcript to the script, mention only meaningful performance differences that affect clarity, emphasis, structure, characterization, or impact. Do not report a raw similarity score.
` : `
No script reference was provided. Score the performance using the event rubric without penalizing the missing script.
`}

Transcript:
"""
${transcript}
"""`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`
  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: userContent }] }],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: 'application/json',
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const details = await res.text()
    throw new GeminiUpstreamError(res.status, details)
  }

  const resBody = await res.json()
  const text: string =
    resBody?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
  if (!text) throw new Error('Gemini returned empty content')

  // Three-layer parse: (1) raw, (2) strip markdown fences, (3) jsonrepair for
  // degenerate Gemini output like unquoted keys or trailing commas. The last
  // layer shouldn't normally be needed with responseMimeType=application/json,
  // but Gemini is not 100% strict.
  let parsed: Partial<AnalysisResult>
  try {
    parsed = JSON.parse(text)
  } catch {
    const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      parsed = JSON.parse(jsonrepair(cleaned))
    }
  }

  const rawCategories = (parsed.categories ?? {}) as Partial<Record<CategoryKey, Partial<CategoryResult>>>
  const standardCategoryKeys: CategoryKey[] = ['organization', 'analysis', 'delivery']
  const legacyExtempCategoryKeys: CategoryKey[] = ['argumentationAnalysis', 'sourceConsideration', 'delivery']
  const hasStandardCategories = standardCategoryKeys.some((key) => rawCategories[key])
  const categoryKeys: CategoryKey[] = hasStandardCategories || mode !== 'extemp' ? standardCategoryKeys : legacyExtempCategoryKeys
  const categories: Partial<Record<CategoryKey, CategoryResult>> = {}
  for (const key of categoryKeys) {
    const raw = rawCategories[key] ?? {}
    categories[key] = {
      stars: clampStars(raw.stars),
      takeaway: typeof raw.takeaway === 'string' && raw.takeaway.trim() ? raw.takeaway.trim() : '',
    }
  }

  const rawGrammarBreakdown = (parsed.grammarBreakdown ?? {}) as Partial<GrammarBreakdown>
  const grammarBreakdown: GrammarBreakdown = {
    agreement: clampCount(rawGrammarBreakdown.agreement),
    verbTense: clampCount(rawGrammarBreakdown.verbTense),
    sentenceStructure: clampCount(rawGrammarBreakdown.sentenceStructure),
    wordUsage: clampCount(rawGrammarBreakdown.wordUsage),
  }

  const yourStructure = parsed.yourStructure ?? { opening: 0, body: 100, closing: 0 }

  // "stars" is never asked of Gemini (see STRUCTURE PENALTY in the prompt) —
  // we compute it ourselves so it stays consistent with the category scores
  // and structure we actually parsed, rather than trusting the model's math.
  const categoryAverage =
    categoryKeys.reduce((sum, key) => sum + (categories[key]?.stars ?? 0), 0) / categoryKeys.length
  const missingSections = (['opening', 'body', 'closing'] as Section[])
    .filter((s) => yourStructure[s] === 0).length
  const computedStars = Math.max(1, Math.round(categoryAverage) - missingSections)

  const rawScorecard = (parsed as { scorecard?: { title?: string; description?: string } }).scorecard ?? {}
  const scorecard: Scorecard = {
    stars: computedStars,
    title: typeof rawScorecard.title === 'string' && rawScorecard.title.trim()
      ? rawScorecard.title.trim()
      : 'Scored',
    description: typeof rawScorecard.description === 'string' && rawScorecard.description.trim()
      ? rawScorecard.description.trim()
      : '',
  }

  const rawSectionTips = (parsed.sectionTips ?? {}) as Partial<Record<Section, Partial<SectionTip>>>
  const sectionKeys: Section[] = ['opening', 'body', 'closing']
  const sectionTips = {} as Record<Section, SectionTip>
  for (const key of sectionKeys) {
    const raw = rawSectionTips[key] ?? {}
    sectionTips[key] = {
      title: typeof raw.title === 'string' ? raw.title.trim() : '',
      body: typeof raw.body === 'string' ? raw.body.trim() : '',
      example: typeof raw.example === 'string' ? raw.example.trim() : '',
    }
  }

  return {
    categories,
    grammarBreakdown,
    grammarSummary: typeof parsed.grammarSummary === 'string' ? parsed.grammarSummary.trim() : '',
    vocabSummary: typeof parsed.vocabSummary === 'string' ? parsed.vocabSummary.trim() : '',
    scorecard,
    fillerCount,
    pauseCount,
    wordsPerMinute,
    sentences: Array.isArray(parsed.sentences) ? parsed.sentences : [],
    sectionTips,
    powerWords: Array.isArray(parsed.powerWords) ? parsed.powerWords.slice(0, 6) : [],
    weakWords: Array.isArray(parsed.weakWords) ? parsed.weakWords.slice(0, 6) : [],
    idealStructure: parsed.idealStructure ?? profile.idealStructure,
    yourStructure,
    topic: typeof parsed.topic === 'string' ? parsed.topic : prompt,
    keyTakeawayTip:
      typeof parsed.keyTakeawayTip === 'string' ? parsed.keyTakeawayTip.trim() : '',
  }
}

function clampStars(n: unknown): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return 3
  return Math.max(1, Math.min(5, Math.round(v)))
}

function clampCount(n: unknown): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.round(v))
}
