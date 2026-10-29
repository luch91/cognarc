import type { CognitiveScoreRequest, CognitiveScoreResponse } from '@cognarc/types'
import { ScoringEngine } from './ScoringEngine.js'
import { MathematicalScoringEngine } from './MathematicalScoringEngine.js'

export class FallbackScoringEngine extends ScoringEngine {
  readonly engineName: string
  constructor(
    private readonly primary: ScoringEngine,
    private readonly fallback: ScoringEngine = new MathematicalScoringEngine(),
  ) {
    super()
    this.engineName = primary.engineName + '+cme-fallback'
  }

  async score(request: CognitiveScoreRequest): Promise<CognitiveScoreResponse> {
    try {
      const result = await this.primary.score(request)
      if (result.model_version.toLowerCase().includes('stub') ||
          ![result.cognitive_load, result.comprehension_confidence,
            result.trust_coherence, result.manipulation_risk].every(Number.isFinite)) {
        throw new Error('TRIBE_INVALID_OUTPUT')
      }
      return result
    } catch (error) {
      // Auth, quota and bad-request responses must remain visible as failures.
      // Only inference outages, timeouts, network faults and invalid model
      // payloads are eligible for mathematical fallback.
      const message = error instanceof Error ? error.message : ''
      const explicitCode = error && typeof error === 'object' && 'code' in error
        ? String((error as {code: unknown}).code) : ''
      const status = /returned (\d{3})/.exec(message)?.[1]
      if (/GCP_AUTH_ERROR|MISSING_ENV/.test(explicitCode) ||
          (status && Number(status) >= 400 && Number(status) < 500)) throw error
      const eligible = /TRIBE_TIMEOUT|TRIBE_INVALID_OUTPUT/.test(explicitCode) ||
        (status !== undefined && Number(status) >= 500) ||
        /timeout|abort|stub|invalid.output|fetch failed|network|ECONN|ENOTFOUND/i.test(message) ||
        error instanceof TypeError
      if (!eligible) throw error
      // No synthetic image, audio or video scoring via text heuristics.
      if (request.stimulus_type !== 'text' || typeof request.content !== 'string') throw error
      const result = await this.fallback.score(request)
      const reason = error instanceof Error && /stub|invalid.output/i.test(error.message)
        ? 'TRIBE_INVALID_OUTPUT'
        : error instanceof Error && /timeout|abort/i.test(error.message)
          ? 'TRIBE_TIMEOUT' : 'TRIBE_UNAVAILABLE'
      return {
        ...result,
        scoring_provenance: {
          ...result.scoring_provenance!,
          fallback_used: true,
          fallback_reason: reason,
        },
      }
    }
  }
}
