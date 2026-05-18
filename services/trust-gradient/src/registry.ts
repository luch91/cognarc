// Action registry — typed map of every agent action to its oversight zone.
// Existing zone assignments must never be downgraded without PM approval.
// Unregistered actions throw UnregisteredActionError at runtime.

import type { AgentActionType, OversightZone } from '@cognarc/types'

export const ACTION_REGISTRY: Readonly<Record<AgentActionType, OversightZone>> = {
  SCORE_STIMULUS: 'OBSERVE',
  LABEL_BEHAVIORAL_EVENT: 'OBSERVE',
  GENERATE_RECOMMENDATION: 'RECOMMEND',
  POST_PR_COMMENT: 'ACT_AUTO',
  SEND_SLACK_ALERT: 'ACT_AUTO',
  FAIL_CICD_BUILD: 'ACT_AUTO',
  SOFT_BLOCK_OUTPUT: 'ACT_AUTO',
  HARD_BLOCK_OUTPUT: 'ACT_GATED',
  DEPLOY_PROMPT_REWRITE: 'ACT_GATED',
  EXECUTE_FINE_TUNING: 'ACT_GATED',
  TRANSMIT_REGULATORY_REPORT: 'ACT_GATED',
} as const
