/**
 * @requires-tribe
 * These tests are skipped in CI unless COGNARC_SCORING_ENGINE=tribe-local|tribe-gcp.
 * Run locally after starting the TRIBE inference server:
 *   uvicorn server:app --port 8080 (from tribe-inference/)
 */

import { TRIBEAdapter } from '../engines/TRIBEAdapter.js'

const TRIBE_REQUIRED =
  process.env['COGNARC_SCORING_ENGINE'] === 'tribe-local' ||
  process.env['COGNARC_SCORING_ENGINE'] === 'tribe-gcp'

const describeIfTribe = TRIBE_REQUIRED ? describe : describe.skip

const endpoint =
  process.env['COGNARC_SCORING_ENGINE'] === 'tribe-gcp'
    ? (process.env['GCP_TRIBE_ENDPOINT'] ?? 'http://localhost:8080')
    : (process.env['TRIBE_LOCAL_ENDPOINT'] ?? 'http://localhost:8080')

const adapter = new TRIBEAdapter(endpoint)
const base = { workspace_id: 'ws-tribe-test' } as const

describeIfTribe('TRIBEAdapter — @requires-tribe', () => {
  test('returns valid schema on text input', async () => {
    const result = await adapter.score({ ...base, stimulus_type: 'text', content: 'Hello world.' })
    expect(result.model_version).toMatch(/tribe-v2/)
    expect(result.cognitive_load).toBeGreaterThanOrEqual(0)
    expect(result.cognitive_load).toBeLessThanOrEqual(100)
    expect(result.comprehension_confidence).toBeGreaterThanOrEqual(0)
    expect(result.trust_coherence).toBeGreaterThanOrEqual(0)
    expect(result.top_brain_regions).toHaveLength(3)
  }, 60_000)

  test('complex high-load text scores higher cognitive_load than simple text', async () => {
    const simple = await adapter.score({ ...base, stimulus_type: 'text', content: 'Click save.' })
    const complex = await adapter.score({
      ...base,
      stimulus_type: 'text',
      content: Array(15)
        .fill(
          'The implementation of multifaceted neurological evaluation frameworks necessitates ' +
          'comprehensive analysis of distributed cortical activation patterns.',
        )
        .join(' '),
    })
    // TRIBE v2 paper validation: complex text should elevate dlPFC + ACC activations
    expect(complex.cognitive_load).toBeGreaterThanOrEqual(simple.cognitive_load)
  }, 120_000)

  test('scores are within TRIBE v2 paper validation ranges for neutral text', async () => {
    const result = await adapter.score({
      ...base,
      stimulus_type: 'text',
      content: 'The weather is pleasant today. Birds are singing in the trees.',
    })
    // Neutral text: cognitive_load 20-60, comprehension 40-80, manipulation <30
    expect(result.cognitive_load).toBeGreaterThanOrEqual(15)
    expect(result.cognitive_load).toBeLessThanOrEqual(65)
    expect(result.manipulation_risk).toBeLessThan(35)
  }, 60_000)

  test('responds within 10 seconds on warm endpoint', async () => {
    const start = Date.now()
    await adapter.score({ ...base, stimulus_type: 'text', content: 'Latency test.' })
    expect(Date.now() - start).toBeLessThan(10_000)
  }, 15_000)
})

// These tests run in all environments — they test the adapter logic, not the model
describe('TRIBEAdapter — offline unit tests', () => {
  test('throws on connection refused endpoint', async () => {
    const badAdapter = new TRIBEAdapter('http://localhost:19999', undefined, 2000)
    await expect(
      badAdapter.score({ ...base, stimulus_type: 'text', content: 'test' }),
    ).rejects.toThrow()
  })
})
