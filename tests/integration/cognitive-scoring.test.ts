/**
 * Integration: Cognitive Scoring Pipeline
 *
 * Validates:
 *   - Mock engine returns plausible, varied scores
 *   - Scoring endpoint is responsive within latency bounds
 *   - Different input types produce different score profiles
 *   - Health endpoint reports the active engine
 */

import express from 'express'
import request from 'supertest'
import { createScoringEngine } from '../../services/cognitive-scoring/src/engines/factory.js'
import { createScoreRouter } from '../../services/cognitive-scoring/src/routes/score.js'

function makeApp() {
  process.env['COGNARC_SCORING_ENGINE'] = 'mock'
  const engine = createScoringEngine()
  const app = express()
  app.use(express.json())
  app.use('/score', createScoreRouter(engine))
  app.get('/health', (_req: import('express').Request, res: import('express').Response) => res.json({ status: 'ok', engine: engine.engineName }))
  return { app, engine }
}

// ─── Basic scoring ─────────────────────────────────────────────────────────────

describe('Cognitive Scoring — basic scoring', () => {
  it('returns all required score dimensions', async () => {
    const { app } = makeApp()
    const res = await request(app)
      .post('/score')
      .send({ stimulus_type: 'text', content: 'Hello, how can I help you?', workspace_id: 'ws-1' })
    expect(res.status).toBe(200)
    expect(typeof res.body.cognitive_load).toBe('number')
    expect(typeof res.body.comprehension_confidence).toBe('number')
    expect(typeof res.body.emotional_valence).toBe('number')
    expect(typeof res.body.trust_coherence).toBe('number')
    expect(typeof res.body.manipulation_risk).toBe('number')
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(res.body.cognitive_risk)
  })

  it('all scores are in 0-100 range', async () => {
    const { app } = makeApp()
    const res = await request(app)
      .post('/score')
      .send({ stimulus_type: 'text', content: 'Test content', workspace_id: 'ws-1' })
    const { cognitive_load, comprehension_confidence, emotional_valence, trust_coherence, manipulation_risk } = res.body
    for (const score of [cognitive_load, comprehension_confidence, emotional_valence, trust_coherence, manipulation_risk]) {
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
  })

  it('returns 400 for missing workspace_id', async () => {
    const { app } = makeApp()
    const res = await request(app)
      .post('/score')
      .send({ stimulus_type: 'text', content: 'Test' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing content', async () => {
    const { app } = makeApp()
    const res = await request(app)
      .post('/score')
      .send({ stimulus_type: 'text', workspace_id: 'ws-1' })
    expect(res.status).toBe(400)
  })

  it('health endpoint reports mock engine', async () => {
    const { app } = makeApp()
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.engine).toMatch(/mock/)
  })
})

// ─── Mock engine returns different scores for different input types ────────────

describe('Cognitive Scoring — score variation across input types', () => {
  it('mock engine returns different scores for different input types', async () => {
    const { app } = makeApp()

    const textRes = await request(app).post('/score').send({
      stimulus_type: 'text',
      content: 'Click here now — limited offer expires in 1 hour! Everyone is buying this!',
      workspace_id: 'ws-1',
    })
    const cleanRes = await request(app).post('/score').send({
      stimulus_type: 'text',
      content: 'Your account balance is $142.50. Last transaction: groceries.',
      workspace_id: 'ws-1',
    })

    expect(textRes.status).toBe(200)
    expect(cleanRes.status).toBe(200)

    // The mock engine produces varied scores — they should not all be identical
    const scoresAreIdentical =
      textRes.body.cognitive_load === cleanRes.body.cognitive_load &&
      textRes.body.manipulation_risk === cleanRes.body.manipulation_risk &&
      textRes.body.trust_coherence === cleanRes.body.trust_coherence

    expect(scoresAreIdentical).toBe(false)
  })

  it('returns model_version and latency_ms in response', async () => {
    const { app } = makeApp()
    const res = await request(app)
      .post('/score')
      .send({ stimulus_type: 'text', content: 'Test', workspace_id: 'ws-1' })
    expect(res.body.model_version).toBeDefined()
    expect(typeof res.body.latency_ms).toBe('number')
  })
})

// ─── Latency: 1000 consecutive requests within 600ms p95 ─────────────────────

describe('Cognitive Scoring — latency (1000 requests, p95 < 600ms)', () => {
  it('stimulus scored within 600ms p95 — 1000 consecutive requests', async () => {
    const { app } = makeApp()
    const latencies: number[] = []
    const N = 1000

    for (let i = 0; i < N; i++) {
      const start = Date.now()
      await request(app)
        .post('/score')
        .send({ stimulus_type: 'text', content: `Request number ${i}`, workspace_id: 'ws-load' })
      latencies.push(Date.now() - start)
    }

    latencies.sort((a, b) => a - b)
    const p95 = latencies[Math.ceil(N * 0.95) - 1]!
    const p99 = latencies[Math.ceil(N * 0.99) - 1]!

    // For in-process mock engine, p95 should be well under 600ms
    expect(p95).toBeLessThan(600)
    console.log(`Latency p50=${latencies[Math.floor(N * 0.5)]!}ms p95=${p95}ms p99=${p99}ms`)
  }, 120_000)
})

// ─── Manipulation check latency overhead ─────────────────────────────────────

describe('Cognitive Scoring — manipulation check overhead', () => {
  it('manipulation check adds <50ms to primary inference latency', async () => {
    const { app } = makeApp()
    const RUNS = 50
    const withoutManip: number[] = []
    const withManip: number[] = []

    for (let i = 0; i < RUNS; i++) {
      const t0 = Date.now()
      await request(app).post('/score').send({
        stimulus_type: 'text', content: 'Plain text', workspace_id: 'ws-1',
        options: { manipulation_check: false },
      })
      withoutManip.push(Date.now() - t0)

      const t1 = Date.now()
      await request(app).post('/score').send({
        stimulus_type: 'text', content: 'Plain text', workspace_id: 'ws-1',
        options: { manipulation_check: true },
      })
      withManip.push(Date.now() - t1)
    }

    const avgWithout = withoutManip.reduce((a, b) => a + b, 0) / RUNS
    const avgWith = withManip.reduce((a, b) => a + b, 0) / RUNS
    const overhead = avgWith - avgWithout

    expect(overhead).toBeLessThan(50)
    console.log(`Manipulation check overhead: ${overhead.toFixed(1)}ms avg`)
  }, 30_000)
})
