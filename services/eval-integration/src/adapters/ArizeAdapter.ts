import { scoreCognitive } from '../scorer.js'
import type { ArizeScore, EvalScoreRequest } from '../types.js'

/**
 * Arize Phoenix custom evaluator.
 *
 * Usage with Arize Phoenix:
 *
 *   import { arizeEvaluator } from '@cognarc/eval-integration/adapters/arize'
 *   const result = await arizeEvaluator({ output, span_id })
 *   // log result.label, result.score, result.explanation to your Phoenix span
 *
 * Phoenix expects { label, score, explanation } where label is a string
 * category. We map cognitive_risk → label.
 */
export async function arizeEvaluator(args: {
  output: string
  input?: string
  workspace_id?: string
  span_id?: string
}): Promise<ArizeScore & { dimensions: Record<string, number>; span_id?: string }> {
  const req: EvalScoreRequest = {
    output: args.output,
    workspace_id: args.workspace_id ?? 'arize',
  }
  if (args.input !== undefined) req.input = args.input

  const result = await scoreCognitive(req)

  // Phoenix label conventions: short, lowercase category strings
  const label = result.cognitive_risk.toLowerCase() as 'low' | 'medium' | 'high'

  const returnValue: ArizeScore & { dimensions: Record<string, number>; span_id?: string } = {
    label,
    score: result.score,
    explanation: result.explanation,
    dimensions: {
      cognitive_load: result.cognitive_load,
      comprehension_confidence: result.comprehension_confidence,
      emotional_valence: result.emotional_valence,
      trust_coherence: result.trust_coherence,
      manipulation_risk: result.manipulation_risk,
    },
  }

  if (args.span_id !== undefined) returnValue.span_id = args.span_id
  return returnValue
}

/**
 * Formats the Arize score into a Phoenix-compatible eval record for bulk logging.
 */
export function toPhoenixEvalRecord(
  score: Awaited<ReturnType<typeof arizeEvaluator>>,
  evaluatorName = 'cognarc_cognitive',
): Record<string, unknown> {
  return {
    evaluator: evaluatorName,
    label: score.label,
    score: score.score,
    explanation: score.explanation,
    metadata: score.dimensions,
  }
}
