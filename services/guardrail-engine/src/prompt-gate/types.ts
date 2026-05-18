import type { CognitiveScoreResponse } from '@cognarc/types'

export type PromptDecision = 'ALLOW' | 'BLOCK' | 'WARN'

export interface EvaluatePromptRequest {
  prompt: string
  workspace_id: string
  prompt_id?: string | undefined       // caller-supplied; falls back to SHA-256 of prompt
  system_prompt?: string | undefined   // used as the stable key for regression tracking
  context?: Record<string, unknown> | undefined
}

export interface EvaluatePromptResponse {
  prompt_id: string
  scores: CognitiveScoreResponse
  decision: PromptDecision
  reason?: string | undefined
  whitelist_match?: string | undefined
  regression?: RegressionResult | undefined
  latency_ms: number
}

export interface RegressionResult {
  detected: boolean
  cognitive_load_delta: number
  comprehension_confidence_delta: number
  baseline_created_at: string
}

// Human-configured; agent cannot modify
export interface WhitelistEntry {
  pattern: string
  type: 'exact' | 'prefix' | 'regex'
  author: string
  timestamp: string
  reason: string
}

export interface PromptBaseline {
  prompt_id: string
  scores: Pick<CognitiveScoreResponse, 'cognitive_load' | 'comprehension_confidence'>
  created_at: string
  workspace_id: string
}

export type TierName = 'free' | 'growth'

export interface RateLimitConfig {
  tier: TierName
  requests_per_minute: number
}

export interface ProxyTarget {
  provider: 'openai' | 'anthropic' | 'gemini'
  upstream: string
  authHeaderName: string
}
