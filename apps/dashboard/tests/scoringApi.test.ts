import { parseScoreResult, scoreTextStream } from '../src/api/scoringApi.js'

const score = {
  cognitive_load: 38,
  comprehension_confidence: 67,
  emotional_valence: 50,
  trust_coherence: 72,
  manipulation_risk: 22,
  cognitive_risk: 'LOW',
  confidence_intervals: {},
  top_brain_regions: [],
  explanation: 'Heuristic engineering indices',
  model_version: 'cme-1.0.0',
  latency_ms: 3,
  scoring_provenance: {
    engine: 'mathematical',
    evidence_type: 'linguistic_heuristics',
    calibration_status: 'uncalibrated',
    policy_eligible: false,
    neural_evidence: false,
    unestimated_dimensions: ['emotional_valence'],
  },
}

describe('dashboard canonical scoring contract', () => {
  test('accepts valid, uncalibrated CME with provenance', () => {
    expect(parseScoreResult(score).scoring_provenance.engine).toBe('mathematical')
  })
  test('rejects raw cortical data, stub output and missing provenance', () => {
    expect(() => parseScoreResult({ model_version: 'tribe-stub', cortical_activations: [0] })).toThrow()
    expect(() => parseScoreResult({ ...score, scoring_provenance: undefined })).toThrow('provenance')
    expect(() => parseScoreResult({ ...score, model_version: 'tribe-stub' })).toThrow()
  })
  test('rejects invalid numeric values and mock outputs', () => {
    expect(() => parseScoreResult({ ...score, cognitive_load: Number.NaN })).toThrow()
    expect(() => parseScoreResult({ ...score, cognitive_load: 130 })).toThrow()
    expect(() => parseScoreResult({ ...score, scoring_provenance: {
      ...score.scoring_provenance, engine: 'mock', evidence_type: 'synthetic_test_data',
    } })).toThrow('Synthetic')
  })
  test('accepts SSE result split across network chunks', async () => {
    const progress = jest.fn()
    const input = [
      'event: progress\\ndata: {"phase":"Submitting","percent":5}\\n\\n',
      'event: res',
      'ult\\ndata: ' + JSON.stringify(score).slice(0, 45),
      JSON.stringify(score).slice(45) + '\\n\\n',
    ].map(s => s.replace(/\\n/g, '\n'))
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const part of input) controller.enqueue(encoder.encode(part))
        controller.close()
      },
    })
    const previous = globalThis.fetch
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, body }) as unknown as typeof fetch
    try {
      const result = await scoreTextStream('Hello.', progress)
      expect(result.scoring_provenance.engine).toBe('mathematical')
      expect(progress).toHaveBeenCalledWith({ phase: 'Submitting', percent: 5 })
    } finally {
      globalThis.fetch = previous
    }
  })
})
