export interface EvalScoreRequest {
  output: string
  input?: string
  context?: Record<string, unknown>
  workspace_id: string
}

export interface EvalScoreResponse {
  cognitive_load: number
  comprehension_confidence: number
  emotional_valence: number
  trust_coherence: number
  manipulation_risk: number
  cognitive_risk: 'LOW' | 'MEDIUM' | 'HIGH'
  explanation: string
  score: number           // 0–1 overall composite (for single-score platforms)
  reasoning: string       // alias for explanation
  metadata: {
    model_version: string
    latency_ms: number
    brain_regions: string[]
  }
}

// ─── Platform adapter interfaces ─────────────────────────────────────────────

/** Braintrust expects a scorer function returning { name, score, metadata } */
export interface BraintrustScore {
  name: string
  score: number           // 0–1
  metadata?: Record<string, unknown>
}

/** Langfuse expects { score, comment } for a named evaluator */
export interface LangfuseScore {
  score: number           // 0–1
  comment: string
}

/** W&B Weave scorer returns { score, explanation } */
export interface WandBScore {
  score: number           // 0–1
  explanation: string
}

/** Arize Phoenix evaluator returns { label, score, explanation } */
export interface ArizeScore {
  label: string           // "LOW" | "MEDIUM" | "HIGH"
  score: number           // 0–1
  explanation: string
}

// ─── Baseline for Prompt Regression Gate ────────────────────────────────────

export interface RegressionBaseline {
  prompt_id: string
  cognitive_load: number
  comprehension_confidence: number
  recorded_at: string
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
