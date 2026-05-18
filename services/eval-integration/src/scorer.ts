/**
 * CognitiveScorer — calls services/cognitive-scoring /score and converts the
 * response to the eval-integration EvalScoreResponse shape.
 *
 * Configured via environment variables:
 *   COGNARC_SCORING_URL  — base URL of cognitive-scoring service (default: http://localhost:3001)
 *   COGNARC_API_KEY      — API key forwarded as Authorization: Bearer <key>
 */

import type { EvalScoreRequest, EvalScoreResponse } from './types.js'

const SCORING_URL = process.env['COGNARC_SCORING_URL'] ?? 'http://localhost:3001'

interface ScoringServiceResponse {
  cognitive_load: number
  comprehension_confidence: number
  emotional_valence: number
  trust_coherence: number
  manipulation_risk: number
  cognitive_risk: 'LOW' | 'MEDIUM' | 'HIGH'
  confidence_intervals: Record<string, { low: number; high: number }>
  top_brain_regions: string[]
  explanation: string
  model_version: string
  latency_ms: number
}

function compositeScore(r: ScoringServiceResponse): number {
  // Higher comprehension + trust = better; lower load + manipulation = better
  const positive = (r.comprehension_confidence + r.trust_coherence + r.emotional_valence) / 3
  const negative = (r.cognitive_load + r.manipulation_risk) / 2
  return Math.max(0, Math.min(1, Math.round((positive - negative * 0.4) / 100 * 100) / 100))
}

export async function scoreCognitive(req: EvalScoreRequest): Promise<EvalScoreResponse> {
  const start = Date.now()
  const apiKey = process.env['COGNARC_API_KEY']

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const body = JSON.stringify({
    stimulus_type: 'text',
    content: req.output,
    workspace_id: req.workspace_id,
    options: { manipulation_check: true },
  })

  let raw: ScoringServiceResponse

  try {
    const res = await fetch(`${SCORING_URL}/score`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`Scoring service responded ${res.status}`)
    raw = await res.json() as ScoringServiceResponse
  } catch (err) {
    // Network failure — fall back to mock so eval pipelines don't hard-crash
    raw = mockScore(req.output, Date.now() - start)
  }

  const score = compositeScore(raw)

  return {
    cognitive_load: raw.cognitive_load,
    comprehension_confidence: raw.comprehension_confidence,
    emotional_valence: raw.emotional_valence,
    trust_coherence: raw.trust_coherence,
    manipulation_risk: raw.manipulation_risk,
    cognitive_risk: raw.cognitive_risk,
    explanation: raw.explanation,
    score,
    reasoning: raw.explanation,
    metadata: {
      model_version: raw.model_version,
      latency_ms: raw.latency_ms ?? (Date.now() - start),
      brain_regions: raw.top_brain_regions ?? [],
    },
  }
}

// ─── Inline mock for when the scoring service is unreachable ─────────────────

const URGENCY = /\b(act now|limited time|expires?|last chance|hurry|immediately|asap)\b/i
const MANIPULATIVE = /\b(everyone knows|studies show|experts agree|guaranteed|100%|risk.?free)\b/i
const JARGON = /\b(synergistic|paradigm|leverage|holistic|utilize|impactful|bandwidth|scalab)\b/gi

function clamp(v: number) { return Math.max(0, Math.min(100, Math.round(v))) }

function mockScore(text: string, elapsed: number): ScoringServiceResponse {
  const words = text.split(/\s+/).filter(Boolean).length
  const sentences = Math.max(1, text.split(/[.!?]+/).filter(Boolean).length)
  const avgWps = words / sentences
  const urgencyHits = (text.match(URGENCY) ?? []).length
  const manipHits = (text.match(MANIPULATIVE) ?? []).length
  const jargonHits = (text.match(JARGON) ?? []).length

  const cognitive_load = clamp(20 + Math.min(40, words * 0.15) + Math.min(20, (avgWps - 10) * 2) + urgencyHits * 8 + jargonHits * 3)
  const comprehension_confidence = clamp(85 - Math.min(35, words * 0.1) - Math.max(0, (avgWps - 12) * 1.5))
  const manipulation_risk = clamp(urgencyHits * 18 + manipHits * 12)
  const trust_coherence = clamp(80 - manipulation_risk * 0.4)
  const emotional_valence = clamp(65 - urgencyHits * 5)
  const cognitive_risk: 'LOW' | 'MEDIUM' | 'HIGH' = cognitive_load >= 70 ? 'HIGH' : cognitive_load >= 45 ? 'MEDIUM' : 'LOW'

  return {
    cognitive_load,
    comprehension_confidence,
    emotional_valence,
    trust_coherence,
    manipulation_risk,
    cognitive_risk,
    confidence_intervals: {},
    top_brain_regions: ['dorsolateral prefrontal cortex'],
    explanation: `Cognitive load ${cognitive_load}/100, comprehension ${comprehension_confidence}/100 (mock engine).`,
    model_version: 'mock-v1',
    latency_ms: elapsed,
  }
}
