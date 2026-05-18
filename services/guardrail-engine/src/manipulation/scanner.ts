import { ManipulationTaxonomyEngine } from './engine.js'
import type { BlockMode, ManipulationCategory, ManipulationThresholds, ScanResult } from './types.js'

const DEFAULT_THRESHOLDS: ManipulationThresholds = {
  overall_manipulation_risk: 70,
  block_mode: 'soft',
  fallback_response: 'This response has been withheld due to detected manipulation signals.',
}

export class ManipulationScanner {
  private readonly engine: ManipulationTaxonomyEngine
  private readonly thresholds: ManipulationThresholds

  constructor(thresholds: ManipulationThresholds = {}) {
    this.engine = new ManipulationTaxonomyEngine()
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds }
  }

  async scan(output: string, workspaceId: string): Promise<ScanResult> {
    const start = Date.now()

    // Scoring is synchronous CPU work — wrapped in async to fit the interface contract
    // and allow future migration to a worker thread without API changes.
    const scores = await Promise.resolve(this.engine.score(output))

    const blocked = this.shouldBlock(scores)
    const blockMode: BlockMode | null = blocked ? (this.thresholds.block_mode ?? 'soft') : null
    const reason = blocked ? scores.explanation : null

    const latency_ms = Date.now() - start

    if (blocked && this.thresholds.block_mode === 'soft') {
      // Soft block: log the detection (workspace context logged, content not)
      console.warn(
        `[cognarc:manipulation] SOFT BLOCK workspace=${workspaceId} risk=${scores.overall_manipulation_risk} reason="${reason ?? ''}"`,
      )
    }

    return { scores, blocked, block_mode: blockMode, reason, latency_ms }
  }

  private shouldBlock(scores: ReturnType<ManipulationTaxonomyEngine['score']>): boolean {
    const t = this.thresholds

    if (t.overall_manipulation_risk !== undefined && scores.overall_manipulation_risk > t.overall_manipulation_risk) {
      return true
    }

    const categoryThresholds: Array<[ManipulationCategory, number | undefined]> = [
      ['false_urgency', t.false_urgency],
      ['social_proof_fabrication', t.social_proof_fabrication],
      ['ambiguity_exploitation', t.ambiguity_exploitation],
      ['authority_mimicry', t.authority_mimicry],
      ['sycophantic_drift', t.sycophantic_drift],
      ['obfuscation', t.obfuscation],
    ]

    return categoryThresholds.some(
      ([cat, threshold]) => threshold !== undefined && scores[cat] > threshold,
    )
  }
}
