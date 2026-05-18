import type { CognitiveScoreResponse } from '@cognarc/types'
import type { CognArcConfig, ThresholdBreach } from './types.js'
import { resolveThreshold } from './configLoader.js'

type ScoredMetric = 'cognitive_load' | 'manipulation_risk' | 'comprehension_confidence' | 'trust_coherence'

const METRICS: ScoredMetric[] = ['cognitive_load', 'manipulation_risk', 'comprehension_confidence', 'trust_coherence']

export function evaluateThresholds(
  scores: CognitiveScoreResponse,
  config: CognArcConfig,
  environment?: string,
): ThresholdBreach[] {
  const breaches: ThresholdBreach[] = []

  for (const metric of METRICS) {
    const { max, min } = resolveThreshold(config, metric, environment)
    const value = scores[metric]

    if (max !== undefined && value > max) {
      breaches.push({ metric, value, threshold: max, direction: 'above_max' })
    }
    if (min !== undefined && value < min) {
      breaches.push({ metric, value, threshold: min, direction: 'below_min' })
    }
  }

  return breaches
}

export function formatScoreTable(fileScores: Array<{ path: string; scores: CognitiveScoreResponse; breaches: ThresholdBreach[]; baselineDelta: { cognitive_load: number; manipulation_risk: number; comprehension_confidence: number; trust_coherence: number } | null }>): string {
  const rows = fileScores.map((fs) => {
    const delta = (val: number, key: keyof typeof fs.scores) => {
      if (fs.baselineDelta === null) return ''
      const d = fs.baselineDelta[key as keyof typeof fs.baselineDelta]
      if (d === undefined) return ''
      const sign = d > 0 ? '+' : ''
      return ` (${sign}${d.toFixed(1)})`
    }
    const breach = fs.breaches.length > 0 ? '⚠️' : '✅'
    return `| ${fs.path} | ${breach} | ${fs.scores.cognitive_load.toFixed(1)}${delta(fs.scores.cognitive_load, 'cognitive_load')} | ${fs.scores.manipulation_risk.toFixed(1)}${delta(fs.scores.manipulation_risk, 'manipulation_risk')} | ${fs.scores.comprehension_confidence.toFixed(1)}${delta(fs.scores.comprehension_confidence, 'comprehension_confidence')} | ${fs.scores.cognitive_risk} |`
  })

  return [
    '## CognArc Cognitive Gate Report',
    '',
    '| File | Status | Cognitive Load | Manipulation Risk | Comprehension | Risk Level |',
    '|------|--------|---------------|-------------------|---------------|------------|',
    ...rows,
  ].join('\n')
}
