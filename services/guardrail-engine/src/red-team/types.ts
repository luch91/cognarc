import type { ManipulationCategory } from '../manipulation/types.js'

// ─── Core domain types ────────────────────────────────────────────────────────

export interface ManipulationPattern {
  taxonomy_category: ManipulationCategory
  evidence_snippets: string[]          // known phrases / patterns to watch for
  score_threshold: number              // min score to consider re-emerged (0-100)
}

export interface ReEmergenceResult {
  re_emerged: boolean
  confidence: number                   // 0-100
  matching_snippets: string[]
  original_finding_id: string
  alert_sent: boolean
}

// ─── Findings lifecycle ───────────────────────────────────────────────────────

export type FindingStatus = 'open' | 'remediated' | 'monitoring' | 'closed'

export interface Finding {
  id: string
  workspace_id: string
  created_at: string
  status: FindingStatus
  pattern: ManipulationPattern
  overall_score: number
  source_output_snippet: string
  remediated_at?: string
  remediated_by?: string
  last_check?: string
  re_emergences: number
}

// ─── Manipulation detection input ─────────────────────────────────────────────

export interface ManipulationDetection {
  id: string
  workspace_id: string
  source_output: string
  taxonomy_category: ManipulationCategory
  overall_score: number                // 0-100
  evidence_snippets: string[]
  detected_at: string
  model_version?: string
}

// ─── Evidence Package ─────────────────────────────────────────────────────────

export interface EvidencePackage {
  detection_id: string
  taxonomy_category: string
  overall_score: number
  confidence_interval: { low: number; high: number }
  activation_signature: {
    limbic_activation: number          // 0-100 (amygdala + vmPFC activity proxy)
    prefrontal_engagement: number      // 0-100 (dlPFC activity proxy)
    ratio: number                      // limbic / prefrontal; > 1.5 = manipulation signal
  }
  evidence_snippets: string[]
  plain_language_explanation: string
  population_variance: {
    aggregate_risk: number             // 0-100
    high_risk_subgroups: string[]
  }
  recommended_actions: string[]
  suitable_for_stakeholder_reporting: boolean
  generated_at: string
}

// ─── Coverage Report ──────────────────────────────────────────────────────────

export interface CategoryStat {
  category: ManipulationCategory
  count: number
  avg_score: number
  trend: 'up' | 'down' | 'stable'     // vs prior week
}

export interface ScaleCoverageReport {
  generated_at: string
  period_start: string
  period_end: string
  total_detections: number
  severity_distribution: {
    HIGH: number
    MEDIUM: number
    LOW: number
  }
  by_category: CategoryStat[]
  outputs_reviewed: number
  human_team_capacity: number          // estimated human-reviewable outputs/week
  coverage_gap_closed_pct: number      // (outputs_reviewed / what_humans_could_do) * 100
  week_over_week_delta: number         // total_detections this week - prior week
  top_patterns: string[]
}
