export interface CognArcClientOptions {
  apiKey?: string
  workspaceId?: string
  baseUrl?: string
}

export interface ScoreInput {
  output: string
  input?: string
  context?: Record<string, unknown>
}

export interface CognitiveScore {
  cognitive_load: number
  comprehension_confidence: number
  emotional_valence: number
  trust_coherence: number
  manipulation_risk: number
  cognitive_risk: 'LOW' | 'MEDIUM' | 'HIGH'
  explanation: string
  score: number
  reasoning: string
  metadata: {
    model_version: string
    latency_ms: number
    brain_regions: string[]
  }
}

export interface RegressionResult {
  prompt_id: string
  regressed: boolean
  load_delta: number
  comprehension_delta: number
  reason: string | null
  current: { cognitive_load: number; comprehension_confidence: number }
  baseline: { cognitive_load: number; comprehension_confidence: number }
}

export class CognArcError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = 'CognArcError'
  }
}
