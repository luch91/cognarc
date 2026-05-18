import { MockScoringEngine } from '../engines/MockScoringEngine.js'

const engine = new MockScoringEngine()

const base = {
  workspace_id: 'ws-test',
  stimulus_type: 'text' as const,
}

describe('MockScoringEngine', () => {
  test('returns valid schema on minimal input', async () => {
    const result = await engine.score({ ...base, content: 'Hello world.' })
    expect(result.model_version).toBe('mock-v1')
    expect(result.cognitive_load).toBeGreaterThanOrEqual(0)
    expect(result.cognitive_load).toBeLessThanOrEqual(100)
    expect(result.comprehension_confidence).toBeGreaterThanOrEqual(0)
    expect(result.comprehension_confidence).toBeLessThanOrEqual(100)
    expect(result.manipulation_risk).toBeGreaterThanOrEqual(0)
    expect(result.manipulation_risk).toBeLessThanOrEqual(100)
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result.cognitive_risk)
    expect(result.top_brain_regions).toHaveLength(3)
    expect(typeof result.explanation).toBe('string')
    expect(result.confidence_intervals).toHaveProperty('cognitive_load')
  })

  test('urgency language raises manipulation_risk', async () => {
    const clean = await engine.score({ ...base, content: 'Our product helps teams work better together.' })
    const urgent = await engine.score({
      ...base,
      content: 'Act now! Limited time offer. Only 2 left. Expires today. Don\'t wait — hurry!',
    })
    expect(urgent.manipulation_risk).toBeGreaterThan(clean.manipulation_risk)
    expect(urgent.manipulation_risk).toBeGreaterThan(30)
  })

  test('long complex text produces higher cognitive_load than short clear text', async () => {
    const simple = await engine.score({ ...base, content: 'Click here to start.' })
    const complex = await engine.score({
      ...base,
      content: Array(20)
        .fill(
          'The implementation of multifaceted cognitive evaluation frameworks necessitates comprehensive analysis of neurological activation patterns across distributed cortical surface representations.',
        )
        .join(' '),
    })
    expect(complex.cognitive_load).toBeGreaterThan(simple.cognitive_load)
  })

  test('short clear text produces higher comprehension_confidence', async () => {
    const clear = await engine.score({ ...base, content: 'Save your work. Click the blue button.' })
    const long = await engine.score({
      ...base,
      content: Array(30).fill('The system processes requests asynchronously via distributed queues.').join(' '),
    })
    expect(clear.comprehension_confidence).toBeGreaterThan(long.comprehension_confidence)
  })

  test('responds within 600ms', async () => {
    const start = Date.now()
    await engine.score({ ...base, content: 'Latency test content.' })
    expect(Date.now() - start).toBeLessThan(600)
  })

  test('confidence intervals bracket the point estimates', async () => {
    const result = await engine.score({ ...base, content: 'Test confidence intervals.' })
    const ci = result.confidence_intervals['cognitive_load']
    expect(ci).toBeDefined()
    expect(ci!.low).toBeLessThanOrEqual(result.cognitive_load)
    expect(ci!.high).toBeGreaterThanOrEqual(result.cognitive_load)
  })
})
