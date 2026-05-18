import type { EvalScoreRequest, RegressionBaseline, RegressionResult } from './types.js'
import { scoreCognitive } from './scorer.js'

const LOAD_REGRESSION_THRESHOLD = 10      // +10pts cognitive load = regression
const COMPREHENSION_REGRESSION_THRESHOLD = 15  // -15pts comprehension = regression

// In-memory store — in production this would be PostgreSQL (same DB as audit log)
const baselines = new Map<string, RegressionBaseline>()

export function upsertBaseline(
  promptId: string,
  cognitive_load: number,
  comprehension_confidence: number,
): RegressionBaseline {
  const existing = baselines.get(promptId)
  const baseline: RegressionBaseline = {
    prompt_id: promptId,
    cognitive_load,
    comprehension_confidence,
    recorded_at: existing?.recorded_at ?? new Date().toISOString(),
  }
  baselines.set(promptId, baseline)
  return baseline
}

export function getBaseline(promptId: string): RegressionBaseline | undefined {
  return baselines.get(promptId)
}

export function deleteBaseline(promptId: string): void {
  baselines.delete(promptId)
}

/** For test isolation */
export function _clearBaselines(): void {
  baselines.clear()
}

export async function checkRegression(
  promptId: string,
  req: EvalScoreRequest,
): Promise<RegressionResult> {
  const scores = await scoreCognitive(req)
  const current = {
    cognitive_load: scores.cognitive_load,
    comprehension_confidence: scores.comprehension_confidence,
  }

  const baseline = baselines.get(promptId)

  // No baseline yet — record current scores as the new baseline
  if (!baseline) {
    upsertBaseline(promptId, current.cognitive_load, current.comprehension_confidence)
    return {
      prompt_id: promptId,
      regressed: false,
      load_delta: 0,
      comprehension_delta: 0,
      reason: null,
      current,
      baseline: current,
    }
  }

  const load_delta = current.cognitive_load - baseline.cognitive_load
  const comprehension_delta = current.comprehension_confidence - baseline.comprehension_confidence

  const loadRegressed = load_delta > LOAD_REGRESSION_THRESHOLD
  const comprehensionRegressed = comprehension_delta < -COMPREHENSION_REGRESSION_THRESHOLD
  const regressed = loadRegressed || comprehensionRegressed

  const reasons: string[] = []
  if (loadRegressed) reasons.push(`cognitive load +${load_delta}pts vs baseline (threshold: +${LOAD_REGRESSION_THRESHOLD})`)
  if (comprehensionRegressed) reasons.push(`comprehension ${comprehension_delta}pts vs baseline (threshold: -${COMPREHENSION_REGRESSION_THRESHOLD})`)

  return {
    prompt_id: promptId,
    regressed,
    load_delta,
    comprehension_delta,
    reason: reasons.length > 0 ? reasons.join('; ') : null,
    current,
    baseline: {
      cognitive_load: baseline.cognitive_load,
      comprehension_confidence: baseline.comprehension_confidence,
    },
  }
}
