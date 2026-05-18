export type ManipulationCategory =
  | 'false_urgency'
  | 'social_proof_fabrication'
  | 'ambiguity_exploitation'
  | 'authority_mimicry'
  | 'sycophantic_drift'
  | 'obfuscation'

export interface DetectedPattern {
  category: ManipulationCategory
  score: number
  evidence_snippets: string[]
  explanation: string
}

export interface ManipulationScores {
  false_urgency: number
  social_proof_fabrication: number
  ambiguity_exploitation: number
  authority_mimicry: number
  sycophantic_drift: number
  obfuscation: number
  overall_manipulation_risk: number    // weighted composite 0–100
  detected_patterns: DetectedPattern[]
  explanation: string
}

export type BlockMode = 'soft' | 'hard'

export interface ManipulationThresholds {
  overall_manipulation_risk?: number | undefined
  false_urgency?: number | undefined
  social_proof_fabrication?: number | undefined
  ambiguity_exploitation?: number | undefined
  authority_mimicry?: number | undefined
  sycophantic_drift?: number | undefined
  obfuscation?: number | undefined
  block_mode?: BlockMode | undefined
  fallback_response?: string | undefined
}

export interface ScanResult {
  scores: ManipulationScores
  blocked: boolean
  block_mode: BlockMode | null
  reason: string | null
  latency_ms: number
}
