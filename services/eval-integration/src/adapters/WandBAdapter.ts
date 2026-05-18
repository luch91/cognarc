import { scoreCognitive } from '../scorer.js'
import type { WandBScore, EvalScoreRequest } from '../types.js'

/**
 * W&B Weave custom scorer.
 *
 * Usage in a Weave evaluation:
 *
 *   import { wandbScorer } from '@cognarc/eval-integration/adapters/wandb'
 *   @weave.op()
 *   async function evaluate(output: string) {
 *     return wandbScorer({ output })
 *   }
 *
 * Weave expects { score: number, explanation: string } or a number.
 * This adapter returns the full object for richer W&B run metadata.
 */
export async function wandbScorer(args: {
  output: string
  input?: string
  workspace_id?: string
}): Promise<WandBScore & { dimensions: Record<string, number>; cognitive_risk: string }> {
  const req: EvalScoreRequest = {
    output: args.output,
    workspace_id: args.workspace_id ?? 'wandb',
  }
  if (args.input !== undefined) req.input = args.input

  const result = await scoreCognitive(req)

  return {
    score: result.score,
    explanation: result.explanation,
    dimensions: {
      cognitive_load: result.cognitive_load,
      comprehension_confidence: result.comprehension_confidence,
      emotional_valence: result.emotional_valence,
      trust_coherence: result.trust_coherence,
      manipulation_risk: result.manipulation_risk,
    },
    cognitive_risk: result.cognitive_risk,
  }
}

/**
 * Returns only the 0-1 score — useful when Weave is configured to expect
 * a plain number from a scorer function.
 */
export async function wandbScoreOnly(args: {
  output: string
  workspace_id?: string
}): Promise<number> {
  const r = await wandbScorer(args)
  return r.score
}
