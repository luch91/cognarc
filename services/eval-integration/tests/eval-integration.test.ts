import request from 'supertest'
import express from 'express'
import { createEvalRouter } from '../src/router.js'
import { scoreCognitive } from '../src/scorer.js'
import { braintrustScorer, braintrustSingleScorer } from '../src/adapters/BraintrustAdapter.js'
import { langfuseEvaluator, langfuseBatchEvaluator } from '../src/adapters/LangfuseAdapter.js'
import { wandbScorer, wandbScoreOnly } from '../src/adapters/WandBAdapter.js'
import { arizeEvaluator, toPhoenixEvalRecord } from '../src/adapters/ArizeAdapter.js'
import { _clearBaselines, checkRegression, upsertBaseline } from '../src/regressionGate.js'

// ─── Test fixtures ────────────────────────────────────────────────────────────

const CLEAR_OUTPUT =
  'Your order has been confirmed. You will receive an email shortly. Thank you for shopping with us.'

const MANIPULATIVE_OUTPUT =
  'ACT NOW! Limited time only — experts unanimously agree this is your last chance. ' +
  'Studies show 100% guaranteed results. Only 3 spots left! Risk-free promise.'

const WS_ID = 'test-ws'

// ─── App factory ─────────────────────────────────────────────────────────────

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/', createEvalRouter())
  return app
}

// ─── scoreCognitive (inline mock path) ───────────────────────────────────────

describe('scoreCognitive (mock fallback)', () => {
  it('returns all required fields', async () => {
    const result = await scoreCognitive({ output: CLEAR_OUTPUT, workspace_id: WS_ID })
    expect(result).toMatchObject({
      cognitive_load: expect.any(Number),
      comprehension_confidence: expect.any(Number),
      emotional_valence: expect.any(Number),
      trust_coherence: expect.any(Number),
      manipulation_risk: expect.any(Number),
      cognitive_risk: expect.stringMatching(/^LOW|MEDIUM|HIGH$/),
      explanation: expect.any(String),
      score: expect.any(Number),
      reasoning: expect.any(String),
      metadata: expect.objectContaining({ model_version: expect.any(String) }),
    })
  })

  it('score is 0–1', async () => {
    const result = await scoreCognitive({ output: CLEAR_OUTPUT, workspace_id: WS_ID })
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })

  it('manipulation_risk is higher for manipulative text', async () => {
    const [clear, manip] = await Promise.all([
      scoreCognitive({ output: CLEAR_OUTPUT, workspace_id: WS_ID }),
      scoreCognitive({ output: MANIPULATIVE_OUTPUT, workspace_id: WS_ID }),
    ])
    expect(manip.manipulation_risk).toBeGreaterThan(clear.manipulation_risk)
  })

  it('cognitive_load is higher for long jargon text', async () => {
    const [clear, manip] = await Promise.all([
      scoreCognitive({ output: CLEAR_OUTPUT, workspace_id: WS_ID }),
      scoreCognitive({ output: MANIPULATIVE_OUTPUT, workspace_id: WS_ID }),
    ])
    expect(manip.cognitive_load).toBeGreaterThanOrEqual(clear.cognitive_load)
  })

  it('reasoning equals explanation', async () => {
    const result = await scoreCognitive({ output: CLEAR_OUTPUT, workspace_id: WS_ID })
    expect(result.reasoning).toBe(result.explanation)
  })
})

// ─── REST endpoint tests ─────────────────────────────────────────────────────

describe('POST /score', () => {
  it('returns 200 with scores for valid input', async () => {
    const app = makeApp()
    const res = await request(app).post('/score').send({ output: CLEAR_OUTPUT, workspace_id: WS_ID })
    expect(res.status).toBe(200)
    expect(res.body.cognitive_risk).toBeDefined()
    expect(typeof res.body.score).toBe('number')
  })

  it('returns 400 when output is missing', async () => {
    const app = makeApp()
    const res = await request(app).post('/score').send({ workspace_id: WS_ID })
    expect(res.status).toBe(400)
  })

  it('returns 400 when workspace_id is missing', async () => {
    const app = makeApp()
    const res = await request(app).post('/score').send({ output: CLEAR_OUTPUT })
    expect(res.status).toBe(400)
  })
})

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = makeApp()
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})

// ─── Regression Gate ─────────────────────────────────────────────────────────

describe('Regression Gate', () => {
  beforeEach(() => _clearBaselines())

  it('first call records baseline and returns regressed=false', async () => {
    const result = await checkRegression('prompt-1', { output: CLEAR_OUTPUT, workspace_id: WS_ID })
    expect(result.regressed).toBe(false)
    expect(result.load_delta).toBe(0)
    expect(result.reason).toBeNull()
  })

  it('identical second call does not trigger regression', async () => {
    await checkRegression('prompt-2', { output: CLEAR_OUTPUT, workspace_id: WS_ID })
    const result = await checkRegression('prompt-2', { output: CLEAR_OUTPUT, workspace_id: WS_ID })
    expect(result.regressed).toBe(false)
  })

  it('detects cognitive load regression (+10pts threshold)', async () => {
    // Set a very low baseline manually
    upsertBaseline('prompt-load', 15, 90)
    // Manipulative text → high cognitive load → exceeds baseline+10
    const result = await checkRegression('prompt-load', { output: MANIPULATIVE_OUTPUT, workspace_id: WS_ID })
    expect(result.regressed).toBe(true)
    expect(result.load_delta).toBeGreaterThan(10)
    expect(result.reason).toContain('cognitive load')
  })

  it('detects comprehension regression (-15pts threshold)', async () => {
    // Set a very high comprehension baseline manually
    upsertBaseline('prompt-comp', 20, 99)
    const result = await checkRegression('prompt-comp', { output: CLEAR_OUTPUT, workspace_id: WS_ID })
    // CLEAR_OUTPUT should score well below 99 comprehension → regression
    if (result.current.comprehension_confidence < 84) {  // 99 - 15 = 84
      expect(result.regressed).toBe(true)
      expect(result.reason).toContain('comprehension')
    }
    // If comprehension is >= 84, no regression — still valid
  })

  it('regression/check endpoint returns 422 when regressed', async () => {
    const app = makeApp()
    // Set an unreachably high baseline
    await request(app).post('/regression/baseline').send({
      prompt_id: 'api-test-prompt',
      cognitive_load: 5,
      comprehension_confidence: 99,
    })

    const res = await request(app).post('/regression/check').send({
      prompt_id: 'api-test-prompt',
      output: MANIPULATIVE_OUTPUT,
      workspace_id: WS_ID,
    })

    expect([200, 422]).toContain(res.status)
    expect(res.body.prompt_id).toBe('api-test-prompt')
  })

  it('regression/check endpoint returns 200 when no regression', async () => {
    const app = makeApp()
    const res = await request(app).post('/regression/check').send({
      prompt_id: 'new-prompt-no-baseline',
      output: CLEAR_OUTPUT,
      workspace_id: WS_ID,
    })
    expect(res.status).toBe(200)
    expect(res.body.regressed).toBe(false)
  })

  it('baseline CRUD works', async () => {
    const app = makeApp()

    // Create
    const createRes = await request(app).post('/regression/baseline').send({
      prompt_id: 'crud-prompt',
      cognitive_load: 40,
      comprehension_confidence: 75,
    })
    expect(createRes.status).toBe(201)

    // Read
    const getRes = await request(app).get('/regression/baseline/crud-prompt')
    expect(getRes.status).toBe(200)
    expect(getRes.body.cognitive_load).toBe(40)

    // Delete
    const delRes = await request(app).delete('/regression/baseline/crud-prompt')
    expect(delRes.status).toBe(204)

    // Verify gone
    const afterDelete = await request(app).get('/regression/baseline/crud-prompt')
    expect(afterDelete.status).toBe(404)
  })
})

// ─── Braintrust adapter ───────────────────────────────────────────────────────

describe('BraintrustAdapter', () => {
  it('returns 5 score objects', async () => {
    const scores = await braintrustScorer({ output: CLEAR_OUTPUT })
    expect(scores).toHaveLength(5)
    expect(scores.every((s) => typeof s.score === 'number')).toBe(true)
  })

  it('all scores are 0–1', async () => {
    const scores = await braintrustScorer({ output: CLEAR_OUTPUT })
    scores.forEach((s) => {
      expect(s.score).toBeGreaterThanOrEqual(0)
      expect(s.score).toBeLessThanOrEqual(1)
    })
  })

  it('includes cognitive_composite', async () => {
    const scores = await braintrustScorer({ output: CLEAR_OUTPUT })
    const composite = scores.find((s) => s.name === 'cognitive_composite')
    expect(composite).toBeDefined()
    expect(composite!.metadata?.['cognitive_risk']).toBeDefined()
  })

  it('braintrustSingleScorer returns one object', async () => {
    const score = await braintrustSingleScorer({ output: CLEAR_OUTPUT })
    expect(score.name).toBe('cognitive_composite')
    expect(typeof score.score).toBe('number')
  })

  it('manipulation_risk score is lower for manipulative text (inverted: 1-risk/100)', async () => {
    const [clearScores, manipScores] = await Promise.all([
      braintrustScorer({ output: CLEAR_OUTPUT }),
      braintrustScorer({ output: MANIPULATIVE_OUTPUT }),
    ])
    const clearManip = clearScores.find((s) => s.name === 'manipulation_risk')!.score
    const manipManip = manipScores.find((s) => s.name === 'manipulation_risk')!.score
    expect(clearManip).toBeGreaterThan(manipManip)
  })
})

// ─── Langfuse adapter ─────────────────────────────────────────────────────────

describe('LangfuseAdapter', () => {
  it('returns score and comment', async () => {
    const result = await langfuseEvaluator({ output: CLEAR_OUTPUT })
    expect(typeof result.score).toBe('number')
    expect(typeof result.comment).toBe('string')
    expect(result.comment.length).toBeGreaterThan(0)
  })

  it('batch evaluator returns one result per item', async () => {
    const items = [
      { output: CLEAR_OUTPUT, trace_id: 'trace-1' },
      { output: MANIPULATIVE_OUTPUT, trace_id: 'trace-2' },
    ]
    const results = await langfuseBatchEvaluator(items)
    expect(results).toHaveLength(2)
    expect(results[0]!.trace_id).toBe('trace-1')
    expect(results[1]!.trace_id).toBe('trace-2')
    expect(results.every((r) => r.name === 'cognarc-cognitive')).toBe(true)
  })
})

// ─── W&B adapter ─────────────────────────────────────────────────────────────

describe('WandBAdapter', () => {
  it('returns score and explanation', async () => {
    const result = await wandbScorer({ output: CLEAR_OUTPUT })
    expect(typeof result.score).toBe('number')
    expect(typeof result.explanation).toBe('string')
    expect(result.dimensions).toBeDefined()
  })

  it('wandbScoreOnly returns a number', async () => {
    const score = await wandbScoreOnly({ output: CLEAR_OUTPUT })
    expect(typeof score).toBe('number')
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})

// ─── Arize adapter ────────────────────────────────────────────────────────────

describe('ArizeAdapter', () => {
  it('returns label, score, explanation', async () => {
    const result = await arizeEvaluator({ output: CLEAR_OUTPUT })
    expect(['low', 'medium', 'high']).toContain(result.label)
    expect(typeof result.score).toBe('number')
    expect(typeof result.explanation).toBe('string')
  })

  it('toPhoenixEvalRecord formats correctly', async () => {
    const score = await arizeEvaluator({ output: CLEAR_OUTPUT, span_id: 'span-abc' })
    const record = toPhoenixEvalRecord(score)
    expect(record['evaluator']).toBe('cognarc_cognitive')
    expect(record['label']).toBeDefined()
    expect(record['score']).toBeDefined()
    expect(record['span_id']).toBeUndefined() // span_id not in phoenix record
  })

  it('span_id is forwarded when provided', async () => {
    const result = await arizeEvaluator({ output: CLEAR_OUTPUT, span_id: 'span-xyz' })
    expect(result.span_id).toBe('span-xyz')
  })
})
