// CognitiveScoreRequest / CognitiveScoreResponse — the contract that never changes.
// Add fields; never remove or rename existing ones.

export interface ScoringEvidence {
  feature: string
  count: number
  examples: string[]
}

export interface ScoringProvenance {
  engine: 'mathematical' | 'tribe' | 'mock'
  evidence_type: 'linguistic_heuristics' | 'predicted_cortical_activations' | 'synthetic_test_data'
  calibration_status: 'uncalibrated' | 'validated'
  neural_evidence: boolean
  policy_eligible: boolean
  unestimated_dimensions?: string[]
  feature_values?: Record<string, number>
  evidence?: ScoringEvidence[]
  fallback_used?: boolean
  fallback_reason?: 'TRIBE_TIMEOUT' | 'TRIBE_UNAVAILABLE' | 'TRIBE_INVALID_OUTPUT'
}

export interface CognitiveScoreRequest {
  stimulus_type: 'text' | 'image' | 'audio' | 'video'
  content: string | Buffer
  workspace_id: string
  options?: {
    manipulation_check?: boolean | undefined
    population_model?: boolean | undefined
    async?: boolean | undefined
  }
}

export interface CognitiveScoreResponse {
  cognitive_load: number            // 0-100
  comprehension_confidence: number  // 0-100
  emotional_valence: number         // 0-100
  trust_coherence: number           // 0-100
  manipulation_risk: number         // 0-100
  cognitive_risk: 'LOW' | 'MEDIUM' | 'HIGH'
  confidence_intervals: Record<string, { low: number; high: number }>
  top_brain_regions: string[]
  explanation: string
  model_version: string
  latency_ms: number
  scoring_provenance?: ScoringProvenance
}
