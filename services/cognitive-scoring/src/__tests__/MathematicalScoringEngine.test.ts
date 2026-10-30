import type { CognitiveScoreRequest, CognitiveScoreResponse } from '@cognarc/types'
import { MathematicalScoringEngine } from '../engines/MathematicalScoringEngine.js'
import { FallbackScoringEngine } from '../engines/FallbackScoringEngine.js'
import { ScoringEngine } from '../engines/ScoringEngine.js'

const base = { workspace_id: 'test', stimulus_type: 'text' as const }
const math = new MathematicalScoringEngine()

describe('CME mathematical scoring', () => {
  test('scores are deterministic, finite and bounded', async () => {
    const content = 'Review the settings. Save your changes before leaving.'
    const a = await math.score({ ...base, content })
    const b = await math.score({ ...base, content })
    for (const key of ['cognitive_load', 'comprehension_confidence', 'trust_coherence', 'manipulation_risk'] as const) {
      expect(Number.isFinite(a[key])).toBe(true)
      expect(a[key]).toBeGreaterThanOrEqual(0)
      expect(a[key]).toBeLessThanOrEqual(100)
      expect(a[key]).toEqual(b[key])
    }
    expect(a.top_brain_regions).toEqual([])
    expect(a.confidence_intervals).toEqual({})
    expect(a.scoring_provenance?.neural_evidence).toBe(false)
    expect(a.scoring_provenance?.calibration_status).toBe('uncalibrated')
    expect(a.scoring_provenance?.unestimated_dimensions).toContain('emotional_valence')
  })

  test('pressure and claim language increases pattern risk', async () => {
    const clear = await math.score({ ...base, content: 'You can read the details and decide.' })
    const flagged = await math.score({ ...base, content: 'Act now! Limited time! Only 2 remaining. Experts agree. Guaranteed.' })
    expect(flagged.manipulation_risk).toBeGreaterThan(clear.manipulation_risk)
    expect(flagged.scoring_provenance?.evidence?.find(x => x.feature === 'pressure_language')?.count).toBeGreaterThan(0)
  })

  test('long complex sentences increase load index', async () => {
    const clear = await math.score({ ...base, content: 'Save the form. Check the result.' })
    const complex = await math.score({ ...base, content: 'The multifaceted implementation of interdisciplinary neurocomputational systems necessitates comprehensive contextualization and subsequent operationalization of substantially heterogeneous methodological requirements.' })
    expect(complex.cognitive_load).toBeGreaterThan(clear.cognitive_load)
  })

  test('rejects non-text inputs rather than inventing neural results', async () => {
    await expect(math.score({ workspace_id: 'test', stimulus_type: 'image', content: 'binary image' })).rejects.toThrow('CME_UNSUPPORTED_MODALITY')
    await expect(math.score({ ...base, content: '   ' })).rejects.toThrow('CME_EMPTY_INPUT')
  })

  test('a primary failure triggers labeled fallback', async () => {
    class Down extends ScoringEngine {
      readonly engineName = 'tribe-gcp'
      async score(_request: CognitiveScoreRequest): Promise<CognitiveScoreResponse> {
        throw new Error('TRIBE_TIMEOUT')
      }
    }
    const engine = new FallbackScoringEngine(new Down())
    const result = await engine.score({ ...base, content: 'Save changes.' })
    expect(result.model_version).toBe('cme-1.0.0')
    expect(result.scoring_provenance?.fallback_used).toBe(true)
    expect(result.scoring_provenance?.fallback_reason).toBe('TRIBE_TIMEOUT')
  })

  test('does not accept synthetic neural predictions', async () => {
    class Stub extends ScoringEngine {
      readonly engineName = 'tribe-gcp'
      async score(request: CognitiveScoreRequest): Promise<CognitiveScoreResponse> {
        return { ...(await math.score(request)), model_version: 'tribe-v2-stub-fp16' }
      }
    }
    const result = await new FallbackScoringEngine(new Stub()).score({ ...base, content: 'Continue.' })
    expect(result.scoring_provenance?.fallback_reason).toBe('TRIBE_INVALID_OUTPUT')
    expect(result.scoring_provenance?.neural_evidence).toBe(false)
  })

  test('never substitutes math text scoring for image inference', async () => {
    class Down extends ScoringEngine {
      readonly engineName = 'tribe-gcp'
      async score(_request: CognitiveScoreRequest): Promise<CognitiveScoreResponse> { throw new Error('offline') }
    }
    await expect(new FallbackScoringEngine(new Down()).score({
      workspace_id: 'test', stimulus_type: 'image', content: 'image bytes',
    })).rejects.toThrow('offline')
  })
})
