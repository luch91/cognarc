import type { CognitiveScoreResponse } from '@cognarc/types'

export interface ThresholdConfig {
  max?: number | undefined
  min?: number | undefined
  environment?: Record<string, number> | undefined
}

export interface CognArcConfig {
  version: '1.0'
  thresholds: {
    cognitive_load?: ThresholdConfig | undefined
    manipulation_risk?: ThresholdConfig | undefined
    comprehension_confidence?: ThresholdConfig | undefined
    trust_coherence?: ThresholdConfig | undefined
  }
  paths?: string[] | undefined
  on_breach?: {
    action: 'warn' | 'fail'
    alert?: {
      slack?: string | undefined
      email?: string | undefined
    } | undefined
  } | undefined
  environments?: string[] | undefined
}

export interface FileScore {
  path: string
  scores: CognitiveScoreResponse
  breaches: ThresholdBreach[]
  baselineDelta: BaselineDelta | null
}

export interface ThresholdBreach {
  metric: string
  value: number
  threshold: number
  direction: 'above_max' | 'below_min'
}

export interface BaselineDelta {
  cognitive_load: number
  manipulation_risk: number
  comprehension_confidence: number
  trust_coherence: number
}

export interface EvaluationResult {
  passed: boolean
  overridden: boolean
  overrideJustification: string | null
  fileScores: FileScore[]
  summary: string
}

export interface BaselineEntry {
  path: string
  scores: Pick<CognitiveScoreResponse, 'cognitive_load' | 'manipulation_risk' | 'comprehension_confidence' | 'trust_coherence'>
  createdAt: string
  commitSha: string | null
}

export interface BaselineStore {
  version: string
  entries: Record<string, BaselineEntry>
}
