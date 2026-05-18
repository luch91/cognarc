import { CognArcError } from '@cognarc/types'
import type { ScoringEngine } from './ScoringEngine.js'
import { MockScoringEngine } from './MockScoringEngine.js'
import { TRIBEAdapter } from './TRIBEAdapter.js'
import { TRIBEGCPAdapter } from '../adapters/TRIBEGCPAdapter.js'
import { env } from '../config/env.js'

export function createScoringEngine(): ScoringEngine {
  switch (env.COGNARC_SCORING_ENGINE) {
    case 'mock':
      return new MockScoringEngine()
    case 'tribe-local':
      return new TRIBEAdapter(env.TRIBE_LOCAL_ENDPOINT)
    case 'tribe-gcp': {
      if (!env.GCP_TRIBE_ENDPOINT) {
        throw new CognArcError(
          'GCP_TRIBE_ENDPOINT must be set when COGNARC_SCORING_ENGINE=tribe-gcp',
          'MISSING_ENV',
        )
      }
      return new TRIBEGCPAdapter(env.GCP_TRIBE_ENDPOINT)
    }
  }
}
