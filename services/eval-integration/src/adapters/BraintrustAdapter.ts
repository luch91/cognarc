import { scoreCognitive } from '../scorer.js'
import type { BraintrustScore, EvalScoreRequest } from '../types.js'

/**
 * Braintrust custom scorer.
 *
 * Usage in a Braintrust eval:
 *
 *   import { braintrustScorer } from '@cognarc/eval-integration/adapters/braintrust'
 *   Eval('my-eval', { scores: [braintrustScorer] })
 *
 * Returns one score object per cognitive dimension plus a composite.
 */
export async function braintrustScorer(args: {
  output: string
  input?: string
  expected?: string
  metadata?: Record<string, unknown>
}): Promise<BraintrustScore[]> {
  const req: EvalScoreRequest = {
    output: args.output,
    workspace_id: (args.metadata?.['workspace_id'] as string | undefined) ?? 'braintrust',
  }
  if (args.input !== undefined) req.input = args.input

  const result = await scoreCognitive(req)

  return [
    { name: 'cognitive_load', score: 1 - result.cognitive_load / 100, metadata: { raw: result.cognitive_load } },
    { name: 'comprehension_confidence', score: result.comprehension_confidence / 100, metadata: { raw: result.comprehension_confidence } },
    { name: 'trust_coherence', score: result.trust_coherence / 100, metadata: { raw: result.trust_coherence } },
    { name: 'manipulation_risk', score: 1 - result.manipulation_risk / 100, metadata: { raw: result.manipulation_risk } },
    {
      name: 'cognitive_composite',
      score: result.score,
      metadata: {
        cognitive_risk: result.cognitive_risk,
        explanation: result.explanation,
        model_version: result.metadata.model_version,
        latency_ms: result.metadata.latency_ms,
      },
    },
  ]
}

/**
 * Single-score variant for simpler Braintrust setups.
 */
export async function braintrustSingleScorer(args: {
  output: string
  input?: string
  metadata?: Record<string, unknown>
}): Promise<BraintrustScore> {
  const [, , , , composite] = await braintrustScorer(args)
  return composite!
}
