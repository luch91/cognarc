export type Zone = 'OBSERVE' | 'RECOMMEND' | 'ACT_AUTO' | 'ACT_GATED'
export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'executed'
export type ConnectorName = 'segment' | 'amplitude' | 'mixpanel' | 'posthog' | 'ga4'
export type CognitivRisk = 'LOW' | 'MEDIUM' | 'HIGH'

export interface HealthPoint {
  date: string
  cognitive_load: number
  comprehension: number
  trust: number
  manipulation_risk: number
}

export interface AgentAction {
  id: string
  timestamp: string
  action_type: string
  zone: Zone
  status: ActionStatus
  description: string
  workspace_id: string
  justification?: string
}

export interface KillSwitchState {
  active: boolean
  activated_at: string | null
  activated_by: string | null
}

export interface ConnectedSurface {
  id: string
  name: string
  type: string
  last_seen: string
  status: 'healthy' | 'degraded' | 'offline'
}

export interface PromptBaseline {
  id: string
  hash: string
  label: string
  cognitive_load: number
  comprehension: number
  delta_cl: number
  delta_cc: number
  last_evaluated: string
  status: 'ok' | 'warn' | 'block'
}

export interface CicdRun {
  id: string
  pr_number: number
  pr_title: string
  branch: string
  result: 'pass' | 'fail' | 'warn'
  overall_score: number
  evaluated_at: string
  breaches: string[]
}

export interface AuditEntry {
  id: string
  timestamp: string
  workspace_id: string
  action_type: string
  zone: Zone
  policy_rule: string
  outcome: string
  authorising_human_or_policy: string
}

export interface ConnectorStatus {
  name: ConnectorName
  healthy: boolean
  last_sync: string
  events_today: number
  write_back_enabled: boolean
}

export interface AlignmentPoint {
  date: string
  score: number
  sessions: number
}

export interface ModelProfile {
  id: string
  name: string
  provider: string
  cognitive_load_avg: number
  comprehension_avg: number
  trust_avg: number
  manipulation_avg: number
  benchmark_date: string
}

export interface VideoMomentFinding {
  timestamp_start: number
  timestamp_end: number
  component: string
  severity: 'critical' | 'warning' | 'ok'
  finding: string
  recommendation: string
  cognitive_load: number
  manipulation_risk: number
  trust_coherence: number
  attention_engagement: number
  voiceover_segment?: string
}

export interface VideoAnalysisResult {
  filename: string
  duration_seconds: number
  analysis_mode: string
  overall_cognitive_load: number
  overall_manipulation_risk: number
  overall_trust_coherence: number
  overall_attention_engagement: number
  cognitive_risk: CognitivRisk
  moment_findings: VideoMomentFinding[]
  rewrite_candidates: string[]
  recommended_actions: string[]
}

export interface CreativeAsset {
  id: string
  name: string
  type: 'image' | 'copy' | 'video'
  uploaded_at: string
  status: 'queued' | 'processing' | 'complete'
  cognitive_load?: number
  trust?: number
  risk: CognitivRisk
  videoAnalysis?: VideoAnalysisResult
  videoAnalysisDemoMode?: boolean
}

export interface TrustDriftPoint {
  date: string
  trust: number
  campaign: string
}

export interface ManipulationFlag {
  id: string
  timestamp: string
  source: string
  overall_risk: number
  categories: string[]
  evidence: string[]
  status: 'open' | 'remediated' | 'monitoring'
}

export interface RemediationItem {
  id: string
  original_flag_id: string
  finding: string
  remediated_at: string
  reemergence_risk: number
  last_check: string
  status: 'clear' | 'reemergent' | 'monitoring'
}

export interface ActGatedItem {
  id: string
  requested_at: string
  action_type: string
  description: string
  proposed_action: string
  alternatives: string[]
  evidence_summary: string
  cognitive_scores: {
    cognitive_load: number
    comprehension: number
    trust: number
    manipulation_risk: number
  }
  status: 'pending' | 'approved' | 'rejected'
  reviewer?: string
  justification?: string
  reviewed_at?: string
}
