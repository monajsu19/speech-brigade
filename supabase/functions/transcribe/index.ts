// Supabase Edge Function: transcribe
// Forwards an uploaded audio file to Deepgram and returns the transcript,
// word count, and structured transcript data (words with timestamps,
// detected fillers, paragraphs) used downstream by analyze-speech.
//
// This is provider plumbing — it doesn't know or care that the speech is
// "impromptu" specifically, so it's carried over from the source app almost
// unchanged. Multi-language handling is kept in case you want it; delete the
// CJK/Romance branches and just always request English if you don't.
//
// Auth + abuse protection:
//   1. Requires a Bearer token (verified in-function via auth.getUser, NOT
//      just the platform's verify_jwt — so the function stays safe even if
//      it's ever redeployed with --no-verify-jwt).
//   2. Caps fresh transcriptions per user in a rolling 24h window, counted
//      from `transcription_events`. Without this, an authenticated user
//      could spam this endpoint and drain Deepgram credits.
//   3. Rejects audio bodies larger than MAX_AUDIO_BYTES (should match
//      whatever your storage bucket's own file size cap is).
//   4. Only successful Deepgram calls log an event row.
//
// Deploy: `supabase functions deploy transcribe`
// Set secret: `supabase secrets set DEEPGRAM_API_KEY=...`

import { createClient } from 'npm:@supabase/supabase-js@2'

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

// A 3-5 minute impromptu speech is longer than the 30-90s clips this cap was
// tuned for. Tune both of these to your actual product's usage pattern.
const MAX_TRANSCRIPTIONS_PER_DAY = 30
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000

// At typical voice bitrates, 20 MB comfortably covers the longest clip this
// app records — Extemp's 7-minute delivery — with headroom. Match this to
// your storage bucket's own file_size_limit.
const MAX_AUDIO_BYTES = 20 * 1024 * 1024

interface DeepgramWord {
  word: string
  punctuated_word?: string
  start: number
  end: number
  confidence?: number
  type?: string // present when filler_words=true: 'word' | 'filler'
}

interface DeepgramAlt {
  transcript: string
  confidence?: number
  words: DeepgramWord[]
  paragraphs?: {
    transcript?: string
    paragraphs?: Array<{
      sentences?: Array<{ text: string; start: number; end: number }>
      start: number
      end: number
      num_words?: number
    }>
  }
}

interface DeepgramUtterance {
  transcript?: string
  words?: DeepgramWord[]
  start?: number
  end?: number
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{ alternatives?: DeepgramAlt[] }>
    utterances?: DeepgramUtterance[]
  }
  metadata?: { duration?: number }
}

// @ts-expect-error Deno global is provided at runtime
const env = (k: string) => Deno.env.get(k) ?? ''

// @ts-expect-error Deno global is provided at runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, { status: 405 })

  const apiKey = env('DEEPGRAM_API_KEY')
  if (!apiKey) return json({ error: 'DEEPGRAM_API_KEY not configured' }, { status: 500 })

  const supabaseUrl = env('SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = env('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: 'server not configured' }, { status: 500 })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, { status: 401 })

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, { status: 401 })
  const user = userData.user

  const admin = createClient(supabaseUrl, serviceKey)

  // Rolling 24h cap. Counted before the Deepgram call so a denied request
  // doesn't burn budget.
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count, error: countErr } = await admin
    .from('transcription_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)
  if (countErr) {
    return json({ error: 'rate-limit check failed', details: countErr.message }, { status: 500 })
  }
  if ((count ?? 0) >= MAX_TRANSCRIPTIONS_PER_DAY) {
    return json(
      { error: `transcription limit reached (${MAX_TRANSCRIPTIONS_PER_DAY} per 24h). Try again later.` },
      { status: 429 },
    )
  }

  let audio: File | null = null
  let reqLanguage: string | null = null
  try {
    const form = await req.formData()
    const file = form.get('audio')
    if (file instanceof File) audio = file
    const lang = form.get('language')
    if (typeof lang === 'string' && lang) reqLanguage = lang
  } catch {
    return json({ error: 'expected multipart/form-data with audio field' }, { status: 400 })
  }
  if (!audio) return json({ error: 'missing audio field' }, { status: 400 })

  if (audio.size > MAX_AUDIO_BYTES) {
    return json(
      { error: `audio too large (max ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)} MB)` },
      { status: 413 },
    )
  }

  const contentType = audio.type || 'audio/webm'

  // English: nova-3, full feature set (utterances + paragraphs + filler_words).
  // CJK (zh/ko/ja): nova-2, explicit language code (detect_language misses these).
  // Romance (es/fr): nova-3, explicit language + paragraphs.
  //   - nova-2 + language=es/fr returns empty transcript.
  //   - nova-3 without paragraphs also returns empty transcript.
  //   - nova-3 + paragraphs gives a transcript (though alt.transcript may be
  //     truncated to first paragraph; we read from alt.paragraphs.transcript).
  const isEnglish = !reqLanguage || reqLanguage === 'en'
  const isCJK = reqLanguage === 'zh' || reqLanguage === 'ko' || reqLanguage === 'ja'
  const isRomance = reqLanguage === 'es' || reqLanguage === 'fr'
  const model = isCJK ? 'nova-2' : 'nova-3'
  const langParam: Record<string, string> = isEnglish
    ? { detect_language: 'true' }
    : { language: reqLanguage! }

  const params = new URLSearchParams({
    model,
    smart_format: 'true',
    punctuate: 'true',
    ...(isEnglish ? { utterances: 'true', paragraphs: 'true', filler_words: 'true' } : {}),
    ...(isRomance ? { paragraphs: 'true' } : {}),
    ...langParam,
  })

  const dgRes = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': contentType,
    },
    body: audio,
  })

  if (!dgRes.ok) {
    const details = await dgRes.text()
    console.error('[transcribe] Deepgram error', dgRes.status, details)
    return json({ error: 'transcription failed', details }, { status: 502 })
  }

  const data = (await dgRes.json()) as DeepgramResponse
  const alt = data.results?.channels?.[0]?.alternatives?.[0]
  console.log('[transcribe] lang:', reqLanguage, 'utterances:', data.results?.utterances?.length ?? 0, 'alt transcript length:', alt?.transcript?.length ?? 0, 'alt words:', alt?.words?.length ?? 0)
  if (!alt) return json({ error: 'transcription empty' }, { status: 502 })

  // When utterances are present, concatenate them for the full transcript.
  // channels[0].alternatives[0].transcript can be truncated to only the first
  // utterance for some non-English languages with nova-3.
  // Prefer fuller transcript sources over alt.transcript, which can be
  // truncated to the first utterance/paragraph depending on the model + params.
  // Priority: utterances concat > paragraphs.transcript > alt.transcript.
  const utterances = data.results?.utterances
  const transcript = utterances && utterances.length > 0
    ? utterances.map((u) => u.transcript ?? '').join(' ').trim()
    : (alt.paragraphs?.transcript ?? alt.transcript ?? '')
  const words = utterances && utterances.length > 0
    ? utterances.flatMap((u) => u.words ?? [])
    : (alt.words ?? [])

  // For CJK/Hangul scripts that don't delimit words with spaces, count each
  // character individually — Deepgram's token count underestimates real content.
  // Falls back to Deepgram's token count (minus fillers) for space-delimited languages.
  const NON_SPACED_RE = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/gu
  const cjkCount = (transcript.match(NON_SPACED_RE) ?? []).length
  const wordCount = cjkCount > 0 ? cjkCount : words.filter((w) => w.type !== 'filler').length

  const fillers = words
    .filter((w) => w.type === 'filler')
    .map((w) => ({
      word: (w.punctuated_word ?? w.word).toLowerCase().replace(/[^\p{L}']/gu, ''),
      start: w.start,
      end: w.end,
    }))

  const transcriptData = {
    transcript,
    duration: data.metadata?.duration ?? null,
    words: words.map((w) => ({
      word: w.punctuated_word ?? w.word,
      start: w.start,
      end: w.end,
      type: w.type ?? 'word',
    })),
    fillers,
    paragraphs:
      alt.paragraphs?.paragraphs?.map((p) => ({
        start: p.start,
        end: p.end,
        sentences: (p.sentences ?? []).map((s) => ({ text: s.text, start: s.start, end: s.end })),
      })) ?? [],
  }

  // Log the successful call AFTER Deepgram returns 200 — failures don't
  // consume quota. Insert errors are logged but don't fail the response: the
  // user already paid for this transcription, and a missing event row only
  // weakens the next gate check by one slot, never the other way around.
  const { error: logErr } = await admin
    .from('transcription_events')
    .insert({ user_id: user.id })
  if (logErr) console.error('[transcribe] failed to log event:', logErr.message)

  return json({ transcript, wordCount, transcriptData })
})
