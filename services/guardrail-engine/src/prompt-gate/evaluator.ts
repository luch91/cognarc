import type { CognitiveScoreRequest, CognitiveScoreResponse } from '@cognarc/types'
import { hashPrompt } from './promptHash.js'
import { detectRegression, upsertBaseline } from './regressionMonitor.js'
import type { EvaluatePromptRequest, EvaluatePromptResponse, PromptDecision } from './types.js'
import type { WhitelistManager } from './whitelist.js'

export interface EvaluatorConfig {
  scoringEndpoint: string
  thresholds: {
    cognitive_load_max?: number
    manipulation_risk_max?: number
    comprehension_confidence_min?: number
    trust_coherence_min?: number
  }
  whitelist: WhitelistManager
}

export async function evaluatePrompt(
  req: EvaluatePromptRequest,
  config: EvaluatorConfig,
): Promise<EvaluatePromptResponse> {
  const start = Date.now()

  // Whitelist check first — fast path, no scoring needed
  const whitelistMatch = config.whitelist.match(req.prompt)
  if (whitelistMatch !== null) {
    // Still score for observability, but decision is always ALLOW
    const scores = await scorePrompt(req.prompt, req.workspace_id, config.scoringEndpoint)
    return {
      prompt_id: req.prompt_id ?? hashPrompt(req.system_prompt ?? req.prompt),
      scores,
      decision: 'ALLOW',
      reason: 'Prompt matches whitelist pattern',
      whitelist_match: whitelistMatch,
      latency_ms: Date.now() - start,
    }
  }

  const promptId = req.prompt_id ?? hashPrompt(req.system_prompt ?? req.prompt)
  const scores = await scorePrompt(req.prompt, req.workspace_id, config.scoringEndpoint)

  // Regression check (runs after scoring, before decision)
  const regression = detectRegression(promptId, scores)
  // Baseline created only on first evaluation
  upsertBaseline(promptId, req.workspace_id, scores)

  const { decision, reason } = makeDecision(scores, config.thresholds, regression?.detected === true)

  return {
    prompt_id: promptId,
    scores,
    decision,
    ...(reason !== undefined ? { reason } : {}),
    ...(regression !== null ? { regression } : {}),
    latency_ms: Date.now() - start,
  }
}

function makeDecision(
  scores: CognitiveScoreResponse,
  thresholds: EvaluatorConfig['thresholds'],
  hasRegression: boolean,
): { decision: PromptDecision; reason?: string } {
  const violations: string[] = []

  if (thresholds.cognitive_load_max !== undefined && scores.cognitive_load > thresholds.cognitive_load_max) {
    violations.push(`cognitive_load ${scores.cognitive_load.toFixed(1)} exceeds max ${thresholds.cognitive_load_max}`)
  }
  if (thresholds.manipulation_risk_max !== undefined && scores.manipulation_risk > thresholds.manipulation_risk_max) {
    violations.push(`manipulation_risk ${scores.manipulation_risk.toFixed(1)} exceeds max ${thresholds.manipulation_risk_max}`)
  }
  if (thresholds.comprehension_confidence_min !== undefined && scores.comprehension_confidence < thresholds.comprehension_confidence_min) {
    violations.push(`comprehension_confidence ${scores.comprehension_confidence.toFixed(1)} below min ${thresholds.comprehension_confidence_min}`)
  }
  if (thresholds.trust_coherence_min !== undefined && scores.trust_coherence < thresholds.trust_coherence_min) {
    violations.push(`trust_coherence ${scores.trust_coherence.toFixed(1)} below min ${thresholds.trust_coherence_min}`)
  }

  if (violations.length > 0) {
    return { decision: 'BLOCK', reason: violations.join('; ') }
  }
  if (hasRegression) {
    return { decision: 'WARN', reason: 'Prompt regression detected vs baseline' }
  }
  return { decision: 'ALLOW' }
}

async function scorePrompt(
  prompt: string,
  workspaceId: string,
  endpoint: string,
): Promise<CognitiveScoreResponse> {
  const req: CognitiveScoreRequest = {
    stimulus_type: 'text',
    content: prompt,
    workspace_id: workspaceId,
  }
  const res = await fetch(`${endpoint}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(`Scoring service HTTP ${res.status}`)
  return res.json() as Promise<CognitiveScoreResponse>
}
