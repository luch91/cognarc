import { createHash, randomUUID } from 'crypto'
import type {
  RunRecommendation,
  RecommendationId,
  DiversityMetrics,
  TrainingExample,
} from './types.js'

const QUEUE_THRESHOLD = 10_000

// In-memory recommendation store (append-only: no delete/update)
const recommendations = new Map<RecommendationId, RunRecommendation>()

function computeDiversity(examples: readonly TrainingExample[]): DiversityMetrics {
  const workspaces = new Set(examples.map((e) => e.workspace_id))
  const scores = examples.map((e) => e.alignment_score)
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length
  const stddev = Math.sqrt(variance)

  const eventTypes = new Set(examples.flatMap((e) =>
    Array.from({ length: e.event_count }, (_, i) => `type_${i % 8}`),
  ))

  return {
    workspace_count: workspaces.size,
    alignment_score_stddev: Math.round(stddev * 10000) / 10000,
    event_type_coverage: Math.min(1, eventTypes.size / 8),
  }
}

function computeDataHash(examples: readonly TrainingExample[]): string {
  const content = examples.map((e) => e.id + e.payload_hash).join('|')
  return createHash('sha256').update(content).digest('hex').slice(0, 32)
}

// ─── FineTuningRunRecommender ─────────────────────────────────────────────────

export class FineTuningRunRecommender {
  /**
   * Check whether the queue has reached the 10,000-example threshold.
   * If so, create and store a RunRecommendation (NOT a run).
   * Returns the recommendation if created, null otherwise.
   */
  checkAndRecommend(examples: readonly TrainingExample[]): RunRecommendation | null {
    if (examples.length < QUEUE_THRESHOLD) return null

    const diversity = computeDiversity(examples)
    const dataHash = computeDataHash(examples)

    const recommendation: RunRecommendation = {
      id: randomUUID() as RecommendationId,
      example_count: examples.length,
      diversity_metrics: diversity,
      estimated_accuracy_improvement: this.estimateAccuracyImprovement(examples.length),
      estimated_compute_cost_usd: this.estimateComputeCost(examples.length),
      training_data_hash: dataHash,
      created_at: new Date().toISOString(),
      status: 'pending',
    }

    recommendations.set(recommendation.id, recommendation)
    return recommendation
  }

  getRecommendation(id: RecommendationId): RunRecommendation | undefined {
    return recommendations.get(id)
  }

  allRecommendations(): RunRecommendation[] {
    return Array.from(recommendations.values())
  }

  /** Mark a recommendation's status — called by HumanApprovalGate. */
  updateStatus(id: RecommendationId, status: RunRecommendation['status']): void {
    const rec = recommendations.get(id)
    if (rec) rec.status = status
  }

  _clearRecommendations(): void {
    recommendations.clear()
  }

  private estimateAccuracyImprovement(exampleCount: number): number {
    // Logarithmic scaling: 2% base + 1% per doubling above 10k, capped at 8%
    const improvement = 2 + Math.log2(exampleCount / QUEUE_THRESHOLD)
    return Math.round(Math.min(8, improvement) * 100) / 100
  }

  private estimateComputeCost(exampleCount: number): number {
    // ~$0.003 per example on L4 GPU (rough estimate)
    return Math.round(exampleCount * 0.003 * 100) / 100
  }
}
