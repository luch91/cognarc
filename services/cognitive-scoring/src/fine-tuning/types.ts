// ─── Fine-Tuning Pipeline Types ───────────────────────────────────────────────

export type SessionId = string
export type WorkspaceId = string
export type UserId = string
export type RunId = string
export type RecommendationId = string
export type DataHash = string

// ─── Training example ─────────────────────────────────────────────────────────

export interface BehavioralEvent {
  event_type: string
  timestamp: string
  payload: Record<string, unknown>
}

export interface ValidatedSession {
  session_id: SessionId
  workspace_id: WorkspaceId
  alignment_score: number
  behavioral_events: BehavioralEvent[]
  recorded_at: string
}

export interface TrainingExample {
  id: string
  session_id: SessionId
  workspace_id: WorkspaceId
  alignment_score: number
  event_count: number
  payload_hash: DataHash
  queued_at: string
}

// ─── Run recommendation ───────────────────────────────────────────────────────

export interface DiversityMetrics {
  workspace_count: number
  alignment_score_stddev: number
  event_type_coverage: number
}

export interface RunRecommendation {
  id: RecommendationId
  example_count: number
  diversity_metrics: DiversityMetrics
  estimated_accuracy_improvement: number
  estimated_compute_cost_usd: number
  training_data_hash: DataHash
  created_at: string
  status: 'pending' | 'approved' | 'rejected' | 'completed'
}

// ─── Training config ──────────────────────────────────────────────────────────

export interface TrainingConfig {
  learning_rate: number          // must be 1e-6 ≤ lr ≤ 1e-3
  epochs: number                 // must be 1-10
  batch_size: number             // must be 8-128
  warmup_steps: number
  max_gradient_norm: number      // must be ≤ 5.0
}

export const TRAINING_CONFIG_BOUNDS = {
  learning_rate: { min: 1e-6, max: 1e-3 },
  epochs: { min: 1, max: 10 },
  batch_size: { min: 8, max: 128 },
  max_gradient_norm: { max: 5.0 },
} as const

// ─── Approved run ─────────────────────────────────────────────────────────────

export interface ApprovedRun {
  id: RunId
  recommendation_id: RecommendationId
  ml_lead_id: UserId
  approved_training_data_hash: DataHash
  approved_parameters: TrainingConfig
  expected_accuracy_impact: string
  approved_at: string
  status: 'approved' | 'running' | 'completed' | 'quarantined'
}

// ─── Benchmark + validation ───────────────────────────────────────────────────

export interface BenchmarkResult {
  pearson_r: number
  mae: number
  rmse: number
  n_samples: number
  dimensions: Record<string, number>
}

export type ModelStatus = 'quarantined' | 'pending_promotion' | 'promoted' | 'rejected'

export interface ValidationReport {
  run_id: RunId
  baseline_pearson_r: number
  new_pearson_r: number
  delta: number
  benchmark: BenchmarkResult
  quarantined: boolean
  quarantine_reason?: string
  status: ModelStatus
  generated_at: string
}

// ─── Governance audit ─────────────────────────────────────────────────────────

export interface GovernanceRecord {
  id: string
  run_id: RunId
  recommendation_id: RecommendationId
  ml_lead_id: UserId
  data_hash: DataHash
  training_parameters: TrainingConfig
  pre_accuracy: number
  post_accuracy: number | null
  promoting_human_id: UserId | null
  decision: 'approved' | 'quarantined' | 'promoted' | 'rejected'
  notes: string
  created_at: string
}

// Human approval payload for approve_run()
export interface ApprovalPayload {
  approved_training_data_hash: DataHash
  approved_parameters: TrainingConfig
  expected_accuracy_impact: string
}

// Human approval payload for promote_model()
export interface PromotionPayload {
  promoting_human_id: UserId
  notes: string
}
