import type { CognitiveScoreResponse } from '@cognarc/types'
import type { PromptBaseline, RegressionResult } from './types.js'

const COGNITIVE_LOAD_REGRESSION_THRESHOLD = 10   // pts increase triggers regression
const COMPREHENSION_REGRESSION_THRESHOLD = 15    // pts drop triggers regression

// In-memory store — replace with Redis/Postgres in production for cross-instance consistency
const baselineStore = new Map<string, PromptBaseline>()

export function getBaseline(promptId: string): PromptBaseline | null {
  return baselineStore.get(promptId) ?? null
}

export function upsertBaseline(
  promptId: string,
  workspaceId: string,
  scores: CognitiveScoreResponse,
): void {
  // Only create baseline on first evaluation; never overwrite.
  // Baseline represents the "known good" state at first deployment.
  if (baselineStore.has(promptId)) return
  baselineStore.set(promptId, {
    prompt_id: promptId,
    workspace_id: workspaceId,
    scores: {
      cognitive_load: scores.cognitive_load,
      comprehension_confidence: scores.comprehension_confidence,
    },
    created_at: new Date().toISOString(),
  })
}

export function detectRegression(
  promptId: string,
  current: CognitiveScoreResponse,
): RegressionResult | null {
  const baseline = baselineStore.get(promptId)
  if (baseline === null || baseline === undefined) return null

  const clDelta = current.cognitive_load - baseline.scores.cognitive_load
  const ccDelta = current.comprehension_confidence - baseline.scores.comprehension_confidence

  const detected = clDelta > COGNITIVE_LOAD_REGRESSION_THRESHOLD || ccDelta < -COMPREHENSION_REGRESSION_THRESHOLD

  return {
    detected,
    cognitive_load_delta: parseFloat(clDelta.toFixed(2)),
    comprehension_confidence_delta: parseFloat(ccDelta.toFixed(2)),
    baseline_created_at: baseline.created_at,
  }
}

// Exposed for testing only — clears in-memory store
export function _clearBaselinesForTest(): void {
  baselineStore.clear()
}
