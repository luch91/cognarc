import type { CognitiveScoreRequest, CognitiveScoreResponse } from '@cognarc/types'
import { ScoringEngine } from './ScoringEngine.js'

const URGENCY_PATTERNS = [
  /\b(urgent|urgently|immediately|asap|hurry|limited time|act now|expires?|deadline|last chance|don't wait|running out)\b/i,
  /\b(only \d+ left|selling fast|almost gone|won't last|today only|hours? left|minutes? left)\b/i,
]

const MANIPULATIVE_PATTERNS = [
  /\b(everyone knows|studies show|experts agree|scientists say|most people)\b/i,
  /\b(guaranteed|100%|never fail|always works|risk.?free)\b/i,
]

function countUrgencySignals(text: string): number {
  return URGENCY_PATTERNS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0)
}

function countManipulationSignals(text: string): number {
  return MANIPULATIVE_PATTERNS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0)
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(v)))
}

function cognitiveRisk(load: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (load >= 70) return 'HIGH'
  if (load >= 45) return 'MEDIUM'
  return 'LOW'
}

export class MockScoringEngine extends ScoringEngine {
  readonly engineName = 'mock-v1'

  async score(request: CognitiveScoreRequest): Promise<CognitiveScoreResponse> {
    const start = Date.now()

    const text = request.stimulus_type === 'text' ? String(request.content) : ''
    const wordCount = text.split(/\s+/).filter(Boolean).length
    const sentenceCount = Math.max(1, text.split(/[.!?]+/).filter(Boolean).length)
    const avgWordsPerSentence = wordCount / sentenceCount

    // longer, complex text → higher cognitive load
    const lengthLoad = Math.min(40, wordCount * 0.15)
    const complexityLoad = Math.min(30, Math.max(0, (avgWordsPerSentence - 10) * 2))
    const urgencyBoost = countUrgencySignals(text) * 8
    const cognitive_load = clamp(20 + lengthLoad + complexityLoad + urgencyBoost)

    // short, clear text → higher comprehension
    const comprehension_confidence = clamp(
      85 - Math.min(35, wordCount * 0.1) - Math.max(0, (avgWordsPerSentence - 12) * 1.5),
    )

    // urgency language → higher manipulation risk
    const manipSignals = countManipulationSignals(text)
    const manipulation_risk = clamp(
      countUrgencySignals(text) * 18 + manipSignals * 12 + (wordCount > 200 ? 10 : 0),
    )

    const emotional_valence = clamp(
      50 + urgencyBoost * 0.8 - (manipulation_risk > 40 ? 10 : 0),
    )

    const trust_coherence = clamp(
      70 - manipulation_risk * 0.3 - (cognitive_load > 60 ? 10 : 0),
    )

    const latency_ms = Date.now() - start

    return {
      cognitive_load,
      comprehension_confidence,
      emotional_valence,
      trust_coherence,
      manipulation_risk,
      cognitive_risk: cognitiveRisk(cognitive_load),
      confidence_intervals: {
        cognitive_load: { low: clamp(cognitive_load - 8), high: clamp(cognitive_load + 8) },
        comprehension_confidence: {
          low: clamp(comprehension_confidence - 8),
          high: clamp(comprehension_confidence + 8),
        },
        manipulation_risk: {
          low: clamp(manipulation_risk - 6),
          high: clamp(manipulation_risk + 6),
        },
      },
      top_brain_regions: this.topRegions(cognitive_load, comprehension_confidence, emotional_valence),
      explanation: this.buildExplanation(cognitive_load, comprehension_confidence, manipulation_risk),
      model_version: this.engineName,
      latency_ms,
    }
  }

  private topRegions(load: number, comprehension: number, valence: number): string[] {
    const regions: Array<[string, number]> = [
      ['dorsolateral prefrontal cortex', load],
      ['anterior cingulate cortex', load * 0.8],
      ["Wernicke's area", comprehension],
      ['amygdala', valence > 60 ? valence : 100 - valence],
      ['ventromedial prefrontal cortex', 100 - load],
      ['posterior cingulate cortex', 60],
    ]
    return regions
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name)
  }

  private buildExplanation(load: number, comprehension: number, manipulation: number): string {
    const parts: string[] = []
    if (load >= 70) parts.push('High cognitive load detected — content is complex or lengthy.')
    else if (load <= 30) parts.push('Low cognitive load — content is clear and concise.')
    if (comprehension >= 70) parts.push('Strong comprehension signals.')
    else if (comprehension <= 40) parts.push('Comprehension may be challenging for general audiences.')
    if (manipulation >= 50) parts.push('Elevated manipulation risk — urgency or authority signals detected.')
    return parts.length > 0 ? parts.join(' ') : 'Scores within normal ranges.'
  }
}
