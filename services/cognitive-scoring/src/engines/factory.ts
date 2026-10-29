import { CognArcError } from '@cognarc/types'
import type { ScoringEngine } from './ScoringEngine.js'
import { MockScoringEngine } from './MockScoringEngine.js'
import { MathematicalScoringEngine } from './MathematicalScoringEngine.js'
import { FallbackScoringEngine } from './FallbackScoringEngine.js'
import { TRIBEAdapter } from './TRIBEAdapter.js'
import { TRIBEGCPAdapter } from '../adapters/TRIBEGCPAdapter.js'
import { env } from '../config/env.js'

export function createScoringEngine(): ScoringEngine {
  switch (env.COGNARC_SCORING_ENGINE) {
    case 'math':
      return new MathematicalScoringEngine()
    case 'mock':
      return new MockScoringEngine()
    case 'tribe-local':
      return withFallback(new TRIBEAdapter(env.TRIBE_LOCAL_ENDPOINT))
    case 'tribe-gcp': {
      if (!env.GCP_TRIBE_ENDPOINT) {
        throw new CognArcError(
          'GCP_TRIBE_ENDPOINT must be set when COGNARC_SCORING_ENGINE=tribe-gcp',
          'MISSING_ENV',
        )
      }
      return withFallback(new TRIBEGCPAdapter(env.GCP_TRIBE_ENDPOINT))
    }
  }
}

function withFallback(primary: ScoringEngine): ScoringEngine {
  return env.COGNARC_FALLBACK_ENABLED === 'true' ? new FallbackScoringEngine(primary) : primary
}
