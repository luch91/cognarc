import type { CognitiveScoreRequest, CognitiveScoreResponse } from '@cognarc/types'

export abstract class ScoringEngine {
  abstract score(request: CognitiveScoreRequest): Promise<CognitiveScoreResponse>
  abstract readonly engineName: string
}
