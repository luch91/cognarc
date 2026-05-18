// CognitiveScoreRequest / CognitiveScoreResponse — the contract that never changes.
// Add fields; never remove or rename existing ones.

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
}
