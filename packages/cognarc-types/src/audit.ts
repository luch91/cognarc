// AuditEntry — APPEND ONLY. No update. No delete. Enforced by DB trigger.

import type { CognitiveScoreResponse } from './scoring'

export type AgentActionType =
  | 'SCORE_STIMULUS'
  | 'LABEL_BEHAVIORAL_EVENT'
  | 'POST_PR_COMMENT'
  | 'SEND_SLACK_ALERT'
  | 'FAIL_CICD_BUILD'
  | 'SOFT_BLOCK_OUTPUT'
  | 'HARD_BLOCK_OUTPUT'
  | 'DEPLOY_PROMPT_REWRITE'
  | 'EXECUTE_FINE_TUNING'
  | 'TRANSMIT_REGULATORY_REPORT'
  | 'GENERATE_RECOMMENDATION'

export type OversightZone = 'OBSERVE' | 'RECOMMEND' | 'ACT_AUTO' | 'ACT_GATED'

export interface AuditEntry {
  id: string                           // UUID, generated at append time
  timestamp: string                    // ISO 8601
  workspace_id: string
  action_type: AgentActionType
  oversight_zone: OversightZone
  triggering_scores?: CognitiveScoreResponse
  policy_rule_applied: string          // from .cognarc.yml
  alternatives_considered?: string[]
  authorising_human_or_policy: string  // human ID or "policy:v1.2"
  outcome: string
}
