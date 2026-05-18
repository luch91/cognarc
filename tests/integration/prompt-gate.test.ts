/**
 * Integration: Prompt Evaluation Gate
 *
 * Validates:
 *   - Gate returns pre-flight score within 200ms
 *   - Blocked prompt (exceeds threshold) returns BLOCK decision
 *   - Prompt regression detected when cognitive_load increases >10pts vs baseline
 *   - Whitelist match bypasses scoring decision but still scores
 */

import express from 'express'
import request from 'supertest'
import { createPromptGateRouter } from '../../services/guardrail-engine/src/prompt-gate/router.js'
import { WhitelistManager } from '../../services/guardrail-engine/src/prompt-gate/whitelist.js'
import { _clearBaselinesForTest as _clearBaselines } from '../../services/guardrail-engine/src/prompt-gate/regressionMonitor.js'
import type { EvaluatorConfig } from '../../services/guardrail-engine/src/prompt-gate/evaluator.js'

// ─── Mock scoring endpoint ─────────────────────────────────────────────────────

function mockScoringServer(overrides: Record<string, number> = {}) {
  const scoreApp = express()
  scoreApp.use(express.json())
  scoreApp.post('/score', (_req: import('express').Request, res: import('express').Response) => {
    res.json({
      cognitive_load: overrides['cognitive_load'] ?? 30,
      comprehension_confidence: overrides['comprehension_confidence'] ?? 80,
      emotional_valence: overrides['emotional_valence'] ?? 60,
      trust_coherence: overrides['trust_coherence'] ?? 75,
      manipulation_risk: overrides['manipulation_risk'] ?? 10,
      cognitive_risk: overrides['cognitive_load'] !== undefined && overrides['cognitive_load'] > 70 ? 'HIGH' : 'LOW',
      confidence_intervals: {},
      top_brain_regions: ['dlpfc'],
      explanation: 'Mock score',
      model_version: 'mock-v1',
      latency_ms: 5,
    })
  })
  return scoreApp
}

function makeGateApp(scoreOverrides: Record<string, number> = {}, thresholds: EvaluatorConfig['thresholds'] = {}) {
  const whitelist = new WhitelistManager([
    {
      pattern: 'system: you are a helpful assistant',
      type: 'prefix',
      author: 'admin',
      timestamp: new Date().toISOString(),
      reason: 'Standard system prompt',
    },
  ])

  const scoringServer = mockScoringServer(scoreOverrides)
  // @ts-ignore — we're injecting a test server by reference
  const scoringEndpoint = 'mock'

  // Config that calls our inline mock server via patched fetch
  const config: EvaluatorConfig = {
    scoringEndpoint,
    thresholds,
    whitelist,
  }

  const gateApp = express()
  gateApp.use(express.json())
  gateApp.use('/', createPromptGateRouter(config))
  return { gateApp, scoringServer, config }
}

// Patch global fetch to route scoring calls to our mock express app
function patchFetch(scoreOverrides: Record<string, number>) {
  const mockResponse = {
    ok: true,
    status: 200,
    json: async () => ({
      cognitive_load: scoreOverrides['cognitive_load'] ?? 30,
      comprehension_confidence: scoreOverrides['comprehension_confidence'] ?? 80,
      emotional_valence: scoreOverrides['emotional_valence'] ?? 60,
      trust_coherence: scoreOverrides['trust_coherence'] ?? 75,
      manipulation_risk: scoreOverrides['manipulation_risk'] ?? 10,
      cognitive_risk: (scoreOverrides['cognitive_load'] ?? 30) > 70 ? 'HIGH' : 'LOW',
      confidence_intervals: {},
      top_brain_regions: ['dlpfc'],
      explanation: 'Mock',
      model_version: 'mock-v1',
      latency_ms: 5,
    }),
  }
  global.fetch = jest.fn().mockResolvedValue(mockResponse) as unknown as typeof global.fetch
}

// ─── Basic gate functionality ─────────────────────────────────────────────────

describe('Prompt Gate — basic evaluation', () => {
  beforeAll(async () => {
    // Warm up module loading so the latency test doesn't include Jest's cold start
    patchFetch({})
    const { gateApp: warmApp } = makeGateApp()
    await request(warmApp).post('/evaluate-prompt').send({ prompt: 'warmup', workspace_id: 'ws-warmup' })
    _clearBaselines()
  })

  beforeEach(() => {
    _clearBaselines()
    patchFetch({})
  })

  it('gate returns pre-flight score within 200ms', async () => {
    const { gateApp } = makeGateApp()
    const start = Date.now()
    const res = await request(gateApp)
      .post('/evaluate-prompt')
      .send({ prompt: 'What is the weather today?', workspace_id: 'ws-gate-1' })
    const elapsed = Date.now() - start

    expect(res.status).toBe(200)
    expect(elapsed).toBeLessThan(200)
    expect(res.body.decision).toBeDefined()
    expect(res.body.scores).toBeDefined()
    expect(res.body.latency_ms).toBeDefined()
  })

  it('returns 400 when prompt is missing', async () => {
    const { gateApp } = makeGateApp()
    const res = await request(gateApp)
      .post('/evaluate-prompt')
      .send({ workspace_id: 'ws-1' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when workspace_id is missing', async () => {
    const { gateApp } = makeGateApp()
    const res = await request(gateApp)
      .post('/evaluate-prompt')
      .send({ prompt: 'Hello' })
    expect(res.status).toBe(400)
  })
})

// ─── Threshold blocking ───────────────────────────────────────────────────────

describe('Prompt Gate — blocked prompt does not forward to LLM', () => {
  beforeEach(() => {
    _clearBaselines()
  })

  it('prompt exceeding manipulation_risk threshold returns BLOCK decision', async () => {
    patchFetch({ manipulation_risk: 90 })
    const { gateApp } = makeGateApp({}, { manipulation_risk_max: 70 })

    const res = await request(gateApp)
      .post('/evaluate-prompt')
      .send({ prompt: 'ACT NOW! Only 1 hour left!', workspace_id: 'ws-gate-2' })

    expect(res.status).toBe(200)
    expect(res.body.decision).toBe('BLOCK')
    expect(res.body.reason).toMatch(/manipulation_risk/)
  })

  it('prompt exceeding cognitive_load threshold returns BLOCK', async () => {
    patchFetch({ cognitive_load: 95 })
    const { gateApp } = makeGateApp({}, { cognitive_load_max: 80 })

    const res = await request(gateApp)
      .post('/evaluate-prompt')
      .send({ prompt: 'Complex prompt here', workspace_id: 'ws-gate-3' })

    expect(res.status).toBe(200)
    expect(res.body.decision).toBe('BLOCK')
    expect(res.body.reason).toMatch(/cognitive_load/)
  })

  it('prompt below all thresholds returns ALLOW', async () => {
    patchFetch({ cognitive_load: 30, manipulation_risk: 10 })
    const { gateApp } = makeGateApp({}, { cognitive_load_max: 80, manipulation_risk_max: 70 })

    const res = await request(gateApp)
      .post('/evaluate-prompt')
      .send({ prompt: 'How do I reset my password?', workspace_id: 'ws-gate-4' })

    expect(res.status).toBe(200)
    expect(res.body.decision).toBe('ALLOW')
  })
})

// ─── Regression detection ─────────────────────────────────────────────────────

describe('Prompt Gate — prompt regression detection', () => {
  const SYSTEM_PROMPT = 'system: you are a helpful assistant'

  beforeEach(() => {
    _clearBaselines()
  })

  it('baseline created on first evaluation, delta shown on subsequent', async () => {
    // First call: establishes baseline at cognitive_load=40
    patchFetch({ cognitive_load: 40, comprehension_confidence: 75 })
    const { gateApp } = makeGateApp()

    const firstRes = await request(gateApp).post('/evaluate-prompt').send({
      prompt: 'What is the capital of France?',
      workspace_id: 'ws-regression',
      system_prompt: SYSTEM_PROMPT,
    })
    expect(firstRes.status).toBe(200)
    // No regression on first call (no prior baseline)
    expect(firstRes.body.regression).toBeUndefined()

    // Second call: cognitive_load jumps to 65 (+25 pts > 10pt threshold)
    patchFetch({ cognitive_load: 65, comprehension_confidence: 50 })

    const secondRes = await request(gateApp).post('/evaluate-prompt').send({
      prompt: 'What is the capital of France?',
      workspace_id: 'ws-regression',
      system_prompt: SYSTEM_PROMPT,
    })
    expect(secondRes.status).toBe(200)
    expect(secondRes.body.regression).toBeDefined()
    expect(secondRes.body.regression.detected).toBe(true)
    expect(secondRes.body.regression.cognitive_load_delta).toBeGreaterThan(10)
    expect(secondRes.body.decision).toBe('WARN')
  })

  it('regression NOT detected when delta is <10pts', async () => {
    // Establish baseline at 40
    patchFetch({ cognitive_load: 40, comprehension_confidence: 75 })
    const { gateApp } = makeGateApp()

    await request(gateApp).post('/evaluate-prompt').send({
      prompt: 'Stable prompt text',
      workspace_id: 'ws-stable',
      system_prompt: 'stable-system',
    })

    // Second call: only +5pt change
    patchFetch({ cognitive_load: 45, comprehension_confidence: 72 })

    const secondRes = await request(gateApp).post('/evaluate-prompt').send({
      prompt: 'Stable prompt text',
      workspace_id: 'ws-stable',
      system_prompt: 'stable-system',
    })

    // Regression not triggered — ALLOW decision
    expect(secondRes.body.decision).toBe('ALLOW')
    if (secondRes.body.regression !== undefined) {
      expect(secondRes.body.regression.detected).toBe(false)
    }
  })
})

// ─── Whitelist bypass ─────────────────────────────────────────────────────────

describe('Prompt Gate — whitelist', () => {
  beforeEach(() => {
    _clearBaselines()
    patchFetch({ cognitive_load: 90, manipulation_risk: 95 })
  })

  it('whitelist match returns ALLOW even when scores would block', async () => {
    const { gateApp } = makeGateApp({}, { cognitive_load_max: 50, manipulation_risk_max: 50 })

    const res = await request(gateApp).post('/evaluate-prompt').send({
      prompt: 'system: you are a helpful assistant — do the task',
      workspace_id: 'ws-whitelist',
    })
    expect(res.status).toBe(200)
    expect(res.body.decision).toBe('ALLOW')
    expect(res.body.whitelist_match).toBeDefined()
  })
})
