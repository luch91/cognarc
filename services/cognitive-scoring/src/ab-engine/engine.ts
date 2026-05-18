import type { CognitiveScoreResponse, CognitiveScoreRequest } from '@cognarc/types'
import type { ScoringEngine } from '../engines/ScoringEngine.js'
import { normaliseStimulus } from './stimulusLoader.js'
import { generateReport } from './reportGenerator.js'
import type {
  Stimulus, ABComparisonResult, Confidence, Winner,
  ComparisonDimension,
} from './types.js'
import { COMPARISON_DIMENSIONS, LOWER_IS_BETTER } from './types.js'

export class ABComparisonEngine {
  constructor(private readonly scorer: ScoringEngine) {}

  async compare(
    variantA: Stimulus,
    variantB: Stimulus,
    workspaceId = 'ab-engine',
  ): Promise<ABComparisonResult> {
    const [normA, normB] = await Promise.all([
      normaliseStimulus(variantA),
      normaliseStimulus(variantB),
    ])

    // Score both variants; for image/html inputs we pass the extracted text as a
    // fallback when the engine is the mock (text-only). The real TRIBE adapter
    // accepts image Buffers directly.
    const [scoresA, scoresB] = await Promise.all([
      this.score(normA.scorerInput, normA.extractedText, workspaceId),
      this.score(normB.scorerInput, normB.extractedText, workspaceId),
    ])

    const delta = computeDelta(scoresA, scoresB)
    const { winner, confidence } = determineWinner(delta)
    const rationale = buildRationale(winner, confidence, delta, scoresA, scoresB)
    const recommended_action = buildRecommendation(winner, confidence)

    const share_url = await generateReport({
      winner,
      confidence,
      scores_a: scoresA,
      scores_b: scoresB,
      delta,
      rationale,
      recommended_action,
      labelA: variantA.label ?? 'Variant A',
      labelB: variantB.label ?? 'Variant B',
      stimulusTypeA: variantA.type,
      stimulusTypeB: variantB.type,
    })

    const result: ABComparisonResult = {
      winner,
      confidence,
      scores_a: scoresA,
      scores_b: scoresB,
      delta,
      rationale,
      recommended_action,
      status: 'complete',
    }
    if (share_url !== undefined) result.share_url = share_url
    return result
  }

  private async score(
    stimulus: Stimulus,
    extractedText: string,
    workspaceId: string,
  ): Promise<CognitiveScoreResponse> {
    // If the engine is text-only (mock) and the input is an image/buffer,
    // fall back to the extracted text so tests work without Puppeteer.
    const isTextEngine = this.scorer.engineName.startsWith('mock')
    const useText = isTextEngine && stimulus.type === 'image' && extractedText.length > 0

    const req: CognitiveScoreRequest = useText
      ? { stimulus_type: 'text', content: extractedText, workspace_id: workspaceId }
      : {
          stimulus_type: stimulus.type === 'text' ? 'text' : 'image',
          content: stimulus.content,
          workspace_id: workspaceId,
        }

    return this.scorer.score(req)
  }
}

function computeDelta(
  a: CognitiveScoreResponse,
  b: CognitiveScoreResponse,
): Record<string, number> {
  const delta: Record<string, number> = {}
  for (const dim of COMPARISON_DIMENSIONS) {
    delta[dim] = Math.round(b[dim] - a[dim])
  }
  return delta
}

function determineWinner(delta: Record<string, number>): { winner: Winner; confidence: Confidence } {
  // For each dimension, compute how much "advantage" A has:
  //   lower-is-better dim: A advantage = delta[dim] (positive = B is worse = A wins)
  //   higher-is-better dim: A advantage = -delta[dim]  (negative = B is higher = B wins)
  const advantages: number[] = COMPARISON_DIMENSIONS.map((dim) => {
    const d = delta[dim] ?? 0
    return LOWER_IS_BETTER.has(dim as ComparisonDimension) ? d : -d
  })

  // Count significant advantages
  const highThreshold = 15
  const medThreshold = 10

  const aHighWins = advantages.filter((v) => v > highThreshold).length
  const bHighWins = advantages.filter((v) => v < -highThreshold).length
  const aMedWins = advantages.filter((v) => v > medThreshold).length
  const bMedWins = advantages.filter((v) => v < -medThreshold).length

  // HIGH confidence: ≥2 dimensions show >15pt advantage in same direction
  if (aHighWins >= 2 && aHighWins > bHighWins) {
    return { winner: 'A', confidence: 'HIGH' }
  }
  if (bHighWins >= 2 && bHighWins > aHighWins) {
    return { winner: 'B', confidence: 'HIGH' }
  }

  // MEDIUM confidence: ≥1 dimension shows >10pt advantage
  if (aMedWins >= 1 && aMedWins > bMedWins) {
    return { winner: 'A', confidence: 'MEDIUM' }
  }
  if (bMedWins >= 1 && bMedWins > aMedWins) {
    return { winner: 'B', confidence: 'MEDIUM' }
  }

  // Tie-break on net advantages
  const netA = advantages.reduce((sum, v) => sum + v, 0)
  if (netA > 0) return { winner: 'A', confidence: 'LOW' }
  if (netA < 0) return { winner: 'B', confidence: 'LOW' }

  return { winner: 'inconclusive', confidence: 'LOW' }
}

function buildRationale(
  winner: Winner,
  confidence: Confidence,
  delta: Record<string, number>,
  a: CognitiveScoreResponse,
  b: CognitiveScoreResponse,
): string {
  if (winner === 'inconclusive') {
    return `Both variants scored similarly across all dimensions (max delta: ${maxAbsDelta(delta)}pts). No clear cognitive winner could be determined.`
  }

  const better = winner === 'A' ? a : b
  const worse = winner === 'B' ? a : b
  const winnerLabel = winner === 'A' ? 'Variant A' : 'Variant B'

  const standoutDims = COMPARISON_DIMENSIONS.filter((dim) => {
    const d = delta[dim] ?? 0
    const advantage = LOWER_IS_BETTER.has(dim as ComparisonDimension)
      ? (winner === 'A' ? d : -d)
      : (winner === 'A' ? -d : d)
    return advantage > 10
  })

  const dimSummary = standoutDims
    .map((dim) => {
      const label = dim.replace(/_/g, ' ')
      const bv = better[dim]
      const wv = worse[dim]
      const d = Math.abs(delta[dim] ?? 0)
      return `${label} (${bv} vs ${wv}, Δ${d})`
    })
    .join('; ')

  const confidenceNote = confidence === 'HIGH'
    ? `${confidence} confidence: ${standoutDims.length} dimensions show >15pt advantage.`
    : confidence === 'MEDIUM'
    ? `${confidence} confidence: strong advantage on at least one dimension.`
    : `${confidence} confidence: marginal advantage — user research recommended.`

  return dimSummary.length > 0
    ? `${winnerLabel} outperforms on: ${dimSummary}. ${confidenceNote}`
    : `${winnerLabel} has a net cognitive advantage. ${confidenceNote}`
}

function buildRecommendation(winner: Winner, confidence: Confidence): string {
  if (winner === 'inconclusive') {
    return 'Run qualitative user research or expand the stimulus set — cognitive scores are too close to declare a winner.'
  }
  if (confidence === 'LOW') {
    return `Lean toward Variant ${winner} but validate with at least 50 real sessions before committing. Low confidence means the cognitive difference is marginal.`
  }
  if (confidence === 'MEDIUM') {
    return `Proceed with Variant ${winner}. Monitor comprehension and trust metrics in production for the first 2 weeks.`
  }
  return `Ship Variant ${winner}. High confidence based on multi-dimensional cognitive advantage. No further testing required before launch.`
}

function maxAbsDelta(delta: Record<string, number>): number {
  return Math.max(...Object.values(delta).map(Math.abs))
}
