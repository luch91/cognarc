import { scoreCognitive } from '../scorer.js'
import type { LangfuseScore, EvalScoreRequest } from '../types.js'

/**
 * Langfuse custom evaluator.
 *
 * Usage with Langfuse SDK:
 *
 *   import { langfuseEvaluator } from '@cognarc/eval-integration/adapters/langfuse'
 *   const score = await langfuseEvaluator({ output, traceId, workspaceId })
 *   langfuse.score({ traceId, name: 'cognarc-cognitive', ...score })
 *
 * Langfuse expects score 0–1 and an optional comment string.
 */
export async function langfuseEvaluator(args: {
  output: string
  input?: string
  workspace_id?: string
  trace_id?: string
}): Promise<LangfuseScore & { dimension_scores: Record<string, number> }> {
  const req: EvalScoreRequest = {
    output: args.output,
    workspace_id: args.workspace_id ?? 'langfuse',
  }
  if (args.input !== undefined) req.input = args.input

  const result = await scoreCognitive(req)

  const comment = [
    `Cognitive Risk: ${result.cognitive_risk}`,
    `Load: ${result.cognitive_load}/100`,
    `Comprehension: ${result.comprehension_confidence}/100`,
    `Trust: ${result.trust_coherence}/100`,
    `Manipulation: ${result.manipulation_risk}/100`,
    ``,
    result.explanation,
  ].join(' | ')

  return {
    score: result.score,
    comment,
    dimension_scores: {
      cognitive_load: result.cognitive_load,
      comprehension_confidence: result.comprehension_confidence,
      emotional_valence: result.emotional_valence,
      trust_coherence: result.trust_coherence,
      manipulation_risk: result.manipulation_risk,
    },
  }
}

/**
 * Batch evaluator — scores an array of outputs and returns Langfuse score
 * objects ready for bulk upload.
 */
export async function langfuseBatchEvaluator(
  items: Array<{ output: string; trace_id: string; workspace_id?: string }>,
): Promise<Array<{ trace_id: string; name: string; score: number; comment: string }>> {
  const results = await Promise.allSettled(
    items.map((item) => langfuseEvaluator(item)),
  )

  return results.map((r, i) => ({
    trace_id: items[i]!.trace_id,
    name: 'cognarc-cognitive',
    score: r.status === 'fulfilled' ? r.value.score : 0,
    comment: r.status === 'fulfilled' ? r.value.comment : `Evaluation failed: ${r.reason}`,
  }))
}
