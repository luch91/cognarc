import type { CognitiveScoreRequest, CognitiveScoreResponse, ScoringEvidence } from '@cognarc/types'
import { ScoringEngine } from './ScoringEngine.js'

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))
const score100 = (x: number): number => Math.round(clamp01(x) * 100)
const tokenize = (text: string): string[] => text.match(/[A-Za-z]+(?:'[A-Za-z]+)?|\d+/g) ?? []

// English-language syllable approximation for readability. It is not an
// observed comprehension outcome or a validated estimate of mental workload.
function syllables(word: string): number {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!letters) return 1
  if (letters.length <= 3) return 1
  const withoutSilentE = letters.replace(/[^aeiou]e$/, '')
  return Math.max(1, (withoutSilentE.match(/[aeiouy]+/g) ?? []).length)
}

function examples(text: string, patterns: RegExp[]): string[] {
  const found = new Set<string>()
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, 'gi')
    for (const match of text.matchAll(re)) {
      if (match[0]) found.add(match[0].trim())
      if (found.size >= 10) break
    }
    if (found.size >= 10) break
  }
  return [...found]
}

const PRESSURE = [
  /\bact now\b/, /\bonly \d+ (left|remaining|available)\b/,
  /\b(last chance|hurry|now or never|don't miss out)\b/,
  /\b(limited time|time is running out|today only)\b/,
  /\bexpires? (today|tonight|soon|in \d+)\b/,
]
const CLAIMS = [
  /\bexperts? (agree|recommend|confirm)\b/,
  /\bscientists? (say|prove|confirm)\b/,
  /\b(trusted by|joined by) \d+[\d,]*\b/,
  /\b(guaranteed|risk.free|100% effective)\b/,
  /\b(everyone knows|studies show|clinically proven)\b/,
]
const AMBIGUITY = [
  /\b(many|various|numerous) (experts|studies|sources)\b/,
  /\b(under certain circumstances|somehow|something like)\b/,
  /\b(up to \d+%|results may vary)\b/,
]
const CONTRADICTION = [
  /\b(no risk|risk.free)\b/, /\b(always works|never fails)\b/,
]

// Coefficients and thresholds are an engineering baseline, not fitted
// statistical parameters. Validate against task outcomes before policy use.
export class MathematicalScoringEngine extends ScoringEngine {
  readonly engineName = 'cme-1.0.0'

  async score(request: CognitiveScoreRequest): Promise<CognitiveScoreResponse> {
    if (request.stimulus_type !== 'text' || typeof request.content !== 'string') {
      throw new Error('CME_UNSUPPORTED_MODALITY: text input is required')
    }
    const input = request.content.normalize('NFC').trim()
    if (!input) throw new Error('CME_EMPTY_INPUT: text is required')

    const start = Date.now()
    const words = tokenize(input)
    if (words.length === 0) throw new Error('CME_EMPTY_INPUT: no scorable words')
    const sentences = input.split(/[.!?]+/).filter(s => tokenize(s).length > 0)
    const sentenceCount = Math.max(1, sentences.length)
    const avgSentenceLength = words.length / sentenceCount
    const syllableCount = words.reduce((n, w) => n + syllables(w), 0)
    const readingEase = 206.835 - 1.015 * avgSentenceLength - 84.6 * syllableCount / words.length

    const difficulty = clamp01((100 - readingEase) / 100)
    const sentenceComplexity = clamp01((avgSentenceLength - 10) / 25)
    const longWordRatio = clamp01(3 * words.filter(w => w.length >= 8).length / words.length)
    const longParagraphs = input.split(/\n\s*\n/).filter(p => tokenize(p).length > 90).length
    const structure = clamp01(longParagraphs * 0.3 + Math.max(0, words.length - 250) / 1000)

    const pressureMatches = examples(input, PRESSURE)
    const claimMatches = examples(input, CLAIMS)
    const ambiguityMatches = examples(input, AMBIGUITY)
    const contradictionMatches = examples(input, CONTRADICTION)
    const density = (hits: number): number => clamp01((hits / words.length) * 100 / 6)
    const pressure = density(pressureMatches.length)
    const claims = density(claimMatches.length)
    const ambiguity = density(ambiguityMatches.length)
    const contradictions = density(contradictionMatches.length)

    const cognitive_load = score100(
      0.40 * difficulty + 0.25 * sentenceComplexity +
      0.20 * longWordRatio + 0.15 * structure,
    )
    const comprehension_confidence = score100(1 -
      (0.43 * difficulty + 0.25 * sentenceComplexity +
       0.17 * longWordRatio + 0.15 * ambiguity),
    )
    const manipulation_risk = score100(
      0.55 * pressure + 0.30 * claims + 0.15 * ambiguity,
    )
    const trust_coherence = score100(1 -
      (0.50 * claims + 0.30 * contradictions + 0.20 * ambiguity),
    )

    const evidence: ScoringEvidence[] = [
      { feature: 'pressure_language', count: pressureMatches.length, examples: pressureMatches },
      { feature: 'claims_requiring_verification', count: claimMatches.length, examples: claimMatches },
      { feature: 'ambiguity_markers', count: ambiguityMatches.length, examples: ambiguityMatches },
      { feature: 'absolute_claims', count: contradictionMatches.length, examples: contradictionMatches },
    ]
    const riskIndex = Math.max(cognitive_load, manipulation_risk)
    const cognitive_risk = riskIndex >= 70 ? 'HIGH' : riskIndex >= 45 ? 'MEDIUM' : 'LOW'
    return {
      cognitive_load,
      comprehension_confidence,
      emotional_valence: 50, // compatibility placeholder; explicitly unestimated below
      trust_coherence,
      manipulation_risk,
      cognitive_risk,
      confidence_intervals: {}, // never fabricate statistical confidence bands
      top_brain_regions: [], // no neuroimaging measurements or predictions
      explanation: 'CME heuristic indices from English readability, complexity, claim and pressure-language signals. These are not measurements of brain activity, comprehension or human trust. Review evidence in context.',
      model_version: this.engineName,
      latency_ms: Date.now() - start,
      scoring_provenance: {
        engine: 'mathematical',
        evidence_type: 'linguistic_heuristics',
        calibration_status: 'uncalibrated',
        neural_evidence: false,
        policy_eligible: false,
        unestimated_dimensions: ['emotional_valence'],
        feature_values: {
          reading_ease_estimate: Number(readingEase.toFixed(2)),
          sentence_complexity: score100(sentenceComplexity),
          long_word_ratio: score100(longWordRatio),
          structure: score100(structure),
          pressure_language: score100(pressure),
          claims_requiring_verification: score100(claims),
          ambiguity: score100(ambiguity),
        },
        evidence,
      },
    }
  }
}
