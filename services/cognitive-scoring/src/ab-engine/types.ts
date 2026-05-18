import type { CognitiveScoreResponse } from '@cognarc/types'

export type StimulusType = 'text' | 'image' | 'html' | 'url'
export type Winner = 'A' | 'B' | 'inconclusive'
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface Stimulus {
  type: StimulusType
  // text: string content; image: Buffer or base64; html: HTML string; url: URL string
  content: string | Buffer
  label?: string
}

export interface ABComparisonResult {
  winner: Winner
  confidence: Confidence
  scores_a: CognitiveScoreResponse
  scores_b: CognitiveScoreResponse
  delta: Record<string, number>
  rationale: string
  recommended_action: string
  share_url?: string
  job_id?: string
  status: 'complete' | 'pending'
}

// Dimensions used for winner/confidence calculation
export const COMPARISON_DIMENSIONS = [
  'cognitive_load',
  'comprehension_confidence',
  'emotional_valence',
  'trust_coherence',
  'manipulation_risk',
] as const

export type ComparisonDimension = typeof COMPARISON_DIMENSIONS[number]

// For these dimensions, lower is better (A wins if A < B)
export const LOWER_IS_BETTER = new Set<ComparisonDimension>(['cognitive_load', 'manipulation_risk'])
