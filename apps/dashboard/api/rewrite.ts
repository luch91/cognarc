import type { VercelRequest, VercelResponse } from '@vercel/node'

const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? ''

const GROQ_MODELS: Record<string, string> = {
  campaign: 'qwen/qwen3-32b',
  landing_page: 'qwen/qwen3-32b',
  voiceover: 'llama-3.3-70b-versatile',
  prompt: 'qwen/qwen3-32b',
  microcopy: 'llama-3.1-8b-instant',
  long_form: 'qwen/qwen3-32b',
}

const OPENROUTER_COPY_TYPES = new Set(['long_form'])

function resolveProvider(copyType: string): { url: string; key: string; model: string; provider: string } {
  if (OPENROUTER_COPY_TYPES.has(copyType) && OPENROUTER_API_KEY) {
    return { url: 'https://openrouter.ai/api/v1/chat/completions', key: OPENROUTER_API_KEY, model: 'qwen/qwen3-235b-a22b', provider: 'openrouter' }
  }
  return { url: 'https://api.groq.com/openai/v1/chat/completions', key: GROQ_API_KEY, model: GROQ_MODELS[copyType] ?? 'qwen/qwen3-32b', provider: 'groq' }
}

const COPY_TYPE_INSTRUCTIONS: Record<string, string> = {
  campaign: `- Remove or soften urgency language ("act now", "limited time", "only X left")
- Replace unsubstantiated authority claims with specific, verifiable ones or remove them
- Simplify sentence structure to reduce cognitive load
- Preserve the core value proposition exactly
- Match the original tone and brand voice
- Do not introduce new claims not present in the original`,
  landing_page: `- Lead with the clearest statement of value — not a question or teaser
- Remove jargon that requires domain knowledge to understand
- Each sentence should do one job: either inform, persuade, or direct
- CTA copy should describe the action, not create urgency
- Do not change the page structure or section order — rewrite copy only`,
  microcopy: `- Maximum clarity in minimum words
- Button labels should describe what happens when clicked
- Error messages should say what went wrong and what to do next
- Placeholder text should give an example, not state the obvious
- Avoid negative phrasing ("don't forget" → "remember to")`,
  voiceover: `- Write for how people speak, not how they read
- Short sentences. One idea per sentence.
- Remove urgency language entirely — it reads as pressure in audio
- The first 8 seconds must establish value, not build to it
- Pause points matter: a comma is a breath, a full stop is a beat`,
  prompt: `- Remove manipulative framing that might cause the model to produce biased outputs
- Clarify ambiguous instructions that could be interpreted multiple ways
- Reduce cognitive load by breaking compound instructions into sequential steps
- Remove sycophantic priming ("You are an expert..." type language)
- Preserve the semantic intent of the original prompt exactly`,
  long_form: `- Restructure if the argument is buried — lead with the conclusion
- Break sentences over 25 words into two sentences
- Replace passive voice with active voice throughout
- Remove hedging language that reduces trust coherence
- Every paragraph should earn its place — remove filler`,
}

interface Scores {
  cognitive_load: number
  comprehension_confidence: number
  emotional_valence: number
  trust_coherence: number
  manipulation_risk: number
  cognitive_risk: string
}

interface Taxonomy {
  false_urgency?: number
  social_proof_fabrication?: number
  ambiguity_exploitation?: number
  authority_mimicry?: number
  sycophantic_drift?: number
  obfuscation?: number
}

function buildDetectedPatterns(taxonomy: Taxonomy): string {
  const LABELS: Record<string, string> = {
    false_urgency: 'artificial urgency / manufactured scarcity',
    social_proof_fabrication: 'unverified social proof / fake consensus',
    ambiguity_exploitation: 'deliberately vague language',
    authority_mimicry: 'credential inflation / authority impersonation',
    sycophantic_drift: 'excessive validation without substance',
    obfuscation: 'complexity used to hide meaning',
  }
  const detected = Object.entries(LABELS)
    .filter(([field]) => (taxonomy[field as keyof Taxonomy] ?? 0) > 40)
    .map(([field, label]) => `  - ${label}: ${taxonomy[field as keyof Taxonomy]}/100`)
  return detected.length ? detected.join('\n') : '  - No specific patterns above threshold'
}

function buildTargets(scores: Scores): string {
  const targets: string[] = []
  if (scores.cognitive_load > 60) targets.push(`  - Cognitive Load: ${scores.cognitive_load} → target below 55`)
  if (scores.manipulation_risk > 40) targets.push(`  - Manipulation Risk: ${scores.manipulation_risk} → target below 35`)
  if (scores.comprehension_confidence < 60) targets.push(`  - Comprehension Confidence: ${scores.comprehension_confidence} → target above 65`)
  if (scores.trust_coherence < 55) targets.push(`  - Trust Coherence: ${scores.trust_coherence} → target above 60`)
  return targets.length ? targets.join('\n') : '  - All scores within acceptable range'
}

function buildPrompt(originalText: string, copyType: string, scores: Scores, taxonomy: Taxonomy, brandVoiceNotes?: string, maxLength?: number): string {
  const instructions = COPY_TYPE_INSTRUCTIONS[copyType] ?? COPY_TYPE_INSTRUCTIONS.campaign
  const brandVoice = brandVoiceNotes ? `\nBRAND VOICE NOTES:\n${brandVoiceNotes}` : ''
  const lengthConstraint = maxLength ? `\nLENGTH: Maximum ${maxLength} words per alternative.` : ''

  return `You are the cognitive copywriter for CognArc, an AI evaluation platform.
Your job is to rewrite copy to reduce cognitive harm while preserving intent.

ORIGINAL COPY:
"""${originalText}"""

COGNITIVE SCORES:
- Cognitive Load: ${scores.cognitive_load}/100
- Comprehension Confidence: ${scores.comprehension_confidence}/100
- Trust Coherence: ${scores.trust_coherence}/100
- Manipulation Risk: ${scores.manipulation_risk}/100

DETECTED MANIPULATION PATTERNS:
${buildDetectedPatterns(taxonomy)}

IMPROVEMENT TARGETS:
${buildTargets(scores)}

REWRITE INSTRUCTIONS for ${copyType.replace(/_/g, ' ')} copy:
${instructions}${brandVoice}${lengthConstraint}

ADDITIONAL RULES:
- Do not introduce claims not present in the original
- Do not change the fundamental message or value proposition
- Each alternative must be meaningfully different from the others
- Alternative 1: most conservative edit (least changed from original)
- Alternative 2: moderate rewrite
- Alternative 3: most aggressive cognitive optimisation

Return ONLY a valid JSON array with exactly 3 objects. No preamble. No text outside JSON.
Each object must have exactly these fields:
[
  {
    "text": "the rewritten copy",
    "rationale": "one sentence: what changed and why it improves the cognitive score",
    "predicted_improvement": {
      "cognitive_load": "-15 to -20 points",
      "manipulation_risk": "-40 to -50 points",
      "comprehension_confidence": "+10 to +15 points",
      "trust_coherence": "+8 to +12 points"
    }
  }
]`
}

function stripThinkTags(raw: string): string {
  if (raw.includes('<think>')) {
    const end = raw.lastIndexOf('</think>')
    if (end !== -1) return raw.slice(end + '</think>'.length).trim()
  }
  return raw
}

function stripMarkdownFences(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('```')) {
    const parts = s.split('```')
    s = parts[1] ?? s
    if (s.startsWith('json')) s = s.slice(4)
  }
  return s.trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  if (!GROQ_API_KEY && !OPENROUTER_API_KEY) { res.status(500).json({ error: 'No LLM API key configured' }); return }

  const body = req.body as Record<string, unknown> | undefined
  if (!body || typeof body.original_text !== 'string') {
    res.status(400).json({ error: 'Missing required field: original_text' })
    return
  }

  const originalText = body.original_text as string
  const copyType = (body.copy_type as string) ?? 'campaign'
  const scores = body.scores as Scores
  const taxonomy = (body.taxonomy as Taxonomy) ?? {}
  const brandVoiceNotes = body.brand_voice_notes as string | undefined
  const maxLength = body.max_length as number | undefined

  const { url: providerUrl, key: apiKey, model, provider } = resolveProvider(copyType)
  const prompt = buildPrompt(originalText, copyType, scores, taxonomy, brandVoiceNotes, maxLength)

  if (!apiKey) { res.status(500).json({ error: `${provider} API key not configured` }); return }

  try {
    const start = Date.now()
    const extraHeaders: Record<string, string> = provider === 'openrouter'
      ? { 'HTTP-Referer': 'https://cognarc.ai', 'X-Title': 'CognArc' }
      : {}
    const extraBody = provider === 'openrouter' ? { thinking: { type: 'disabled' } } : {}
    const groqRes = await fetch(providerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.7,
        ...extraBody,
      }),
      signal: AbortSignal.timeout(90_000),
    })

    if (!groqRes.ok) {
      const errBody = await groqRes.text()
      res.status(groqRes.status).json({ error: `Groq API error (${groqRes.status})`, details: errBody })
      return
    }

    const groqData = await groqRes.json() as { choices: { message: { content: string } }[] }
    let rawContent = groqData.choices?.[0]?.message?.content ?? ''
    rawContent = stripThinkTags(rawContent)
    rawContent = stripMarkdownFences(rawContent)

    const alternatives = JSON.parse(rawContent) as { text: string; rationale: string; predicted_improvement: Record<string, string> }[]

    const scored = alternatives.map((alt) => {
      const estLoad = Math.max(0, scores.cognitive_load - 15)
      const estCC = Math.min(100, scores.comprehension_confidence + 10)
      const estTC = Math.min(100, scores.trust_coherence + 8)
      const estMR = Math.max(0, scores.manipulation_risk - 30)
      return {
        text: alt.text,
        rationale: alt.rationale,
        confidence: scores.manipulation_risk > 40 ? 'HIGH' : scores.cognitive_load > 60 ? 'MEDIUM' : 'LOW',
        scores: {
          cognitive_load: estLoad,
          comprehension_confidence: estCC,
          emotional_valence: scores.emotional_valence,
          trust_coherence: estTC,
          manipulation_risk: estMR,
          cognitive_risk: estMR < 25 ? 'LOW' : estMR < 50 ? 'MEDIUM' : 'HIGH',
        },
        score_delta: {
          cognitive_load: estLoad - scores.cognitive_load,
          comprehension_confidence: estCC - scores.comprehension_confidence,
          trust_coherence: estTC - scores.trust_coherence,
          manipulation_risk: estMR - scores.manipulation_risk,
        },
      }
    })

    res.status(200).json({
      alternatives: scored,
      model_used: `${provider}/${model}`,
      original_scores: scores,
      processing_time_ms: Date.now() - start,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(500).json({ error: message })
  }
}
