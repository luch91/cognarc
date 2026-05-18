import request from 'supertest'
import express from 'express'
import { ABComparisonEngine } from '../ab-engine/engine.js'
import { createABRouter } from '../ab-engine/router.js'
import { MockScoringEngine } from '../engines/MockScoringEngine.js'
import type { Stimulus } from '../ab-engine/types.js'

// ─── Two realistic landing page text stimuli ───────────────────────────────
//
// A: Clear, concise, honest copy — should score better on comprehension + trust
const LANDING_PAGE_CLEAR: Stimulus = {
  type: 'text',
  label: 'Clear landing page',
  content: `
    Monitor AI systems for cognitive load and comprehension in real time.
    CognArc connects to your analytics stack in minutes.
    No code changes required. Free 14-day trial.
    See how your AI assistant is performing — start today.
  `.trim(),
}

// B: Manipulative, high-urgency, jargon-heavy copy — should score worse
const LANDING_PAGE_MANIPULATIVE: Stimulus = {
  type: 'text',
  label: 'Manipulative landing page',
  content: `
    ACT NOW! Limited time only. Experts unanimously agree that our synergistic AI observability
    paradigm leverages next-generation neuromorphic heuristics to deliver unprecedented
    cognitive alignment outcomes. Studies show 100% guaranteed results.
    Only 3 spots left — don't wait! Everyone who matters is already using this.
    Risk-free promise: we guarantee you'll see massive ROI or your money back immediately.
    Hurry — this offer expires in hours!
  `.trim(),
}

// HTML stimulus for rendering path
const SIMPLE_HTML: Stimulus = {
  type: 'html',
  label: 'Simple HTML',
  content: `<html><body><h1>Welcome</h1><p>Simple clear message for your users.</p></body></html>`,
}

// ─── Setup ─────────────────────────────────────────────────────────────────
function makeApp() {
  const scorer = new MockScoringEngine()
  const app = express()
  app.use(express.json({ limit: '10mb' }))
  app.use('/ab-compare', createABRouter(scorer))
  return { app, scorer }
}

// ─── ABComparisonEngine unit tests ─────────────────────────────────────────
describe('ABComparisonEngine', () => {
  let engine: ABComparisonEngine

  beforeEach(() => {
    engine = new ABComparisonEngine(new MockScoringEngine())
  })

  it('returns all required fields', async () => {
    const result = await engine.compare(LANDING_PAGE_CLEAR, LANDING_PAGE_MANIPULATIVE)
    expect(result).toMatchObject({
      winner: expect.stringMatching(/^A|B|inconclusive$/),
      confidence: expect.stringMatching(/^HIGH|MEDIUM|LOW$/),
      scores_a: expect.objectContaining({ cognitive_load: expect.any(Number) }),
      scores_b: expect.objectContaining({ cognitive_load: expect.any(Number) }),
      delta: expect.any(Object),
      rationale: expect.any(String),
      recommended_action: expect.any(String),
      status: 'complete',
    })
  })

  it('clear copy beats manipulative copy — A wins', async () => {
    const result = await engine.compare(LANDING_PAGE_CLEAR, LANDING_PAGE_MANIPULATIVE)
    expect(result.winner).toBe('A')
    // Comprehension should be higher for clear copy
    expect(result.scores_a.comprehension_confidence).toBeGreaterThan(result.scores_b.comprehension_confidence)
  })

  it('manipulation risk is higher for manipulative copy', async () => {
    const result = await engine.compare(LANDING_PAGE_CLEAR, LANDING_PAGE_MANIPULATIVE)
    expect(result.scores_b.manipulation_risk).toBeGreaterThan(result.scores_a.manipulation_risk)
  })

  it('cognitive load is higher for jargon-heavy manipulative copy', async () => {
    const result = await engine.compare(LANDING_PAGE_CLEAR, LANDING_PAGE_MANIPULATIVE)
    expect(result.scores_b.cognitive_load).toBeGreaterThan(result.scores_a.cognitive_load)
  })

  it('delta reflects B minus A correctly', async () => {
    const result = await engine.compare(LANDING_PAGE_CLEAR, LANDING_PAGE_MANIPULATIVE)
    const expectedDeltaCL = result.scores_b.cognitive_load - result.scores_a.cognitive_load
    expect(result.delta['cognitive_load']).toBeCloseTo(expectedDeltaCL, 0)
  })

  it('produces HIGH or MEDIUM confidence for large score differences', async () => {
    const result = await engine.compare(LANDING_PAGE_CLEAR, LANDING_PAGE_MANIPULATIVE)
    expect(['HIGH', 'MEDIUM']).toContain(result.confidence)
  })

  it('rationale contains winner label', async () => {
    const result = await engine.compare(LANDING_PAGE_CLEAR, LANDING_PAGE_MANIPULATIVE)
    if (result.winner !== 'inconclusive') {
      expect(result.rationale).toMatch(/Variant [AB]/)
    }
  })

  it('generates a share_url', async () => {
    const result = await engine.compare(LANDING_PAGE_CLEAR, LANDING_PAGE_MANIPULATIVE)
    expect(typeof result.share_url).toBe('string')
    expect(result.share_url!.length).toBeGreaterThan(0)
  })

  it('identical inputs return inconclusive or LOW confidence', async () => {
    const identical: Stimulus = { type: 'text', content: 'The quick brown fox jumps over the lazy dog.' }
    const result = await engine.compare(identical, { ...identical })
    // Same input → deltas ~0 → inconclusive or LOW
    if (result.winner !== 'inconclusive') {
      expect(result.confidence).toBe('LOW')
    }
  })

  it('handles empty text without throwing', async () => {
    const empty: Stimulus = { type: 'text', content: '' }
    const normal: Stimulus = { type: 'text', content: 'Normal landing page copy that is easy to read.' }
    await expect(engine.compare(empty, normal)).resolves.toBeDefined()
  })

  it('html stimulus normalises to text path (no Puppeteer in test env)', async () => {
    const result = await engine.compare(SIMPLE_HTML, LANDING_PAGE_MANIPULATIVE)
    expect(result.winner).toBeDefined()
    expect(result.status).toBe('complete')
  })
})

// ─── Confidence calculation unit tests ─────────────────────────────────────
describe('Confidence calculation', () => {
  let engine: ABComparisonEngine

  beforeEach(() => {
    engine = new ABComparisonEngine(new MockScoringEngine())
  })

  it('LOW confidence for near-identical variants', async () => {
    const a: Stimulus = { type: 'text', content: 'Click here to learn more about our product.' }
    const b: Stimulus = { type: 'text', content: 'Click here to learn more about our service.' }
    const result = await engine.compare(a, b)
    // Near-identical → small delta → LOW
    expect(result.confidence).toBe('LOW')
  })

  it('winner is consistent with score direction', async () => {
    const result = await engine.compare(LANDING_PAGE_CLEAR, LANDING_PAGE_MANIPULATIVE)
    if (result.winner === 'A') {
      // A should be better on net: lower load or higher comprehension
      const aAdvantage =
        (result.scores_b.cognitive_load - result.scores_a.cognitive_load) +
        (result.scores_a.comprehension_confidence - result.scores_b.comprehension_confidence)
      expect(aAdvantage).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─── REST endpoint tests ───────────────────────────────────────────────────
describe('POST /ab-compare', () => {
  it('returns 200 with result for text inputs', async () => {
    const { app } = makeApp()
    const res = await request(app)
      .post('/ab-compare')
      .send({
        variant_a: { type: 'text', content: LANDING_PAGE_CLEAR.content, label: 'Clear' },
        variant_b: { type: 'text', content: LANDING_PAGE_MANIPULATIVE.content, label: 'Manipulative' },
      })

    expect(res.status).toBe(200)
    expect(res.body.winner).toBeDefined()
    expect(res.body.confidence).toBeDefined()
    expect(res.body.status).toBe('complete')
  })

  it('returns 400 when variant_a is missing', async () => {
    const { app } = makeApp()
    const res = await request(app)
      .post('/ab-compare')
      .send({ variant_b: { type: 'text', content: 'Hello' } })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/variant_a/)
  })

  it('returns 400 for invalid stimulus type', async () => {
    const { app } = makeApp()
    const res = await request(app)
      .post('/ab-compare')
      .send({
        variant_a: { type: 'pdf', content: 'test' },
        variant_b: { type: 'text', content: 'test' },
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/type/)
  })

  it('returns 202 with job_id for html inputs', async () => {
    const { app } = makeApp()
    const res = await request(app)
      .post('/ab-compare')
      .send({
        variant_a: { type: 'html', content: SIMPLE_HTML.content },
        variant_b: { type: 'html', content: '<html><body>Other variant</body></html>' },
      })

    expect(res.status).toBe(202)
    expect(res.body.status).toBe('pending')
    expect(typeof res.body.job_id).toBe('string')
  })

  it('job status endpoint returns 404 for unknown job', async () => {
    const { app } = makeApp()
    const res = await request(app).get('/ab-compare/jobs/nonexistent-id')
    expect(res.status).toBe(404)
  })

  it('job status endpoint returns pending for in-flight job', async () => {
    const { app } = makeApp()
    const postRes = await request(app)
      .post('/ab-compare')
      .send({
        variant_a: { type: 'html', content: SIMPLE_HTML.content },
        variant_b: { type: 'html', content: '<html><body>Other</body></html>' },
      })

    expect(postRes.status).toBe(202)
    const jobId: string = postRes.body.job_id as string

    const statusRes = await request(app).get(`/ab-compare/jobs/${jobId}`)
    expect([202, 200]).toContain(statusRes.status)
    expect(['pending', 'complete']).toContain(statusRes.body.status)
  })

  it('health endpoint returns ok', async () => {
    const { app } = makeApp()
    const res = await request(app).get('/ab-compare/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})

// ─── Report generator ─────────────────────────────────────────────────────
describe('Report generator', () => {
  it('share_url is returned and is a non-empty string', async () => {
    const engine = new ABComparisonEngine(new MockScoringEngine())
    const result = await engine.compare(LANDING_PAGE_CLEAR, LANDING_PAGE_MANIPULATIVE)
    expect(result.share_url).toBeDefined()
    expect(result.share_url!.length).toBeGreaterThan(10)
  })
})
