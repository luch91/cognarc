import express from 'express'
import type { Server } from 'http'
import { hashPrompt } from '../src/prompt-gate/promptHash.js'
import { WhitelistManager } from '../src/prompt-gate/whitelist.js'
import {
  detectRegression,
  upsertBaseline,
  _clearBaselinesForTest,
} from '../src/prompt-gate/regressionMonitor.js'
import { RateLimiter } from '../src/prompt-gate/rateLimiter.js'
import { evaluatePrompt, type EvaluatorConfig } from '../src/prompt-gate/evaluator.js'
import { createPromptGateRouter } from '../src/prompt-gate/router.js'
import type { CognitiveScoreResponse } from '@cognarc/types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PASSING_SCORES: CognitiveScoreResponse = {
  cognitive_load: 45,
  comprehension_confidence: 80,
  emotional_valence: 60,
  trust_coherence: 75,
  manipulation_risk: 15,
  cognitive_risk: 'LOW',
  confidence_intervals: {},
  top_brain_regions: [],
  explanation: 'mock',
  model_version: 'mock-1.0',
  latency_ms: 5,
}

const BLOCKING_SCORES: CognitiveScoreResponse = {
  ...PASSING_SCORES,
  cognitive_load: 92,
  manipulation_risk: 78,
  comprehension_confidence: 30,
  cognitive_risk: 'HIGH',
}

function mockFetch(scores: CognitiveScoreResponse, delayMs = 0): jest.MockedFunction<typeof global.fetch> {
  return jest.fn().mockImplementation(() =>
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(scores),
          } as unknown as Response),
        delayMs,
      ),
    ),
  ) as unknown as jest.MockedFunction<typeof global.fetch>
}

function makeConfig(scores: CognitiveScoreResponse, delayMs = 0): EvaluatorConfig {
  global.fetch = mockFetch(scores, delayMs)
  return {
    scoringEndpoint: 'http://mock-scorer',
    thresholds: {
      cognitive_load_max: 80,
      manipulation_risk_max: 40,
      comprehension_confidence_min: 50,
    },
    whitelist: new WhitelistManager([]),
  }
}

// ── promptHash ────────────────────────────────────────────────────────────────

describe('hashPrompt', () => {
  it('is deterministic across calls', () => {
    const p = 'You are a helpful assistant.'
    expect(hashPrompt(p)).toBe(hashPrompt(p))
  })

  it('produces different hashes for different prompts', () => {
    expect(hashPrompt('prompt A')).not.toBe(hashPrompt('prompt B'))
  })

  it('returns a 64-char hex string (SHA-256)', () => {
    expect(hashPrompt('test')).toMatch(/^[0-9a-f]{64}$/)
  })
})

// ── WhitelistManager ──────────────────────────────────────────────────────────

describe('WhitelistManager', () => {
  it('returns null when no entries', () => {
    const wl = new WhitelistManager([])
    expect(wl.match('any prompt')).toBeNull()
  })

  it('exact match', () => {
    const wl = new WhitelistManager([
      { pattern: 'You are a helpful assistant.', type: 'exact', author: 'alice', timestamp: '', reason: 'test' },
    ])
    expect(wl.match('You are a helpful assistant.')).toBe('You are a helpful assistant.')
    expect(wl.match('You are a helpful assistant. More text.')).toBeNull()
  })

  it('prefix match', () => {
    const wl = new WhitelistManager([
      { pattern: 'System:', type: 'prefix', author: 'alice', timestamp: '', reason: 'test' },
    ])
    expect(wl.match('System: You are an assistant.')).toBe('System:')
    expect(wl.match('User: Hello')).toBeNull()
  })

  it('regex match', () => {
    const wl = new WhitelistManager([
      { pattern: '^You are .+ assistant', type: 'regex', author: 'alice', timestamp: '', reason: 'test' },
    ])
    expect(wl.match('You are a helpful assistant')).not.toBeNull()
    expect(wl.match('Hello world')).toBeNull()
  })

  it('invalid regex does not throw', () => {
    const wl = new WhitelistManager([
      { pattern: '[invalid', type: 'regex', author: 'alice', timestamp: '', reason: 'test' },
    ])
    expect(() => wl.match('anything')).not.toThrow()
    expect(wl.match('anything')).toBeNull()
  })
})

// ── regressionMonitor ─────────────────────────────────────────────────────────

describe('regressionMonitor', () => {
  beforeEach(() => _clearBaselinesForTest())

  it('returns null when no baseline exists', () => {
    expect(detectRegression('no-baseline', PASSING_SCORES)).toBeNull()
  })

  it('creates baseline and detects no regression on small change', () => {
    upsertBaseline('pid-1', 'ws-1', PASSING_SCORES)
    const slightly_higher = { ...PASSING_SCORES, cognitive_load: 50 }  // +5, under threshold
    const r = detectRegression('pid-1', slightly_higher)
    expect(r).not.toBeNull()
    expect(r!.detected).toBe(false)
    expect(r!.cognitive_load_delta).toBe(5)
  })

  it('detects cognitive_load regression (>10 pts increase)', () => {
    upsertBaseline('pid-2', 'ws-1', PASSING_SCORES)  // baseline CL=45
    const regressed = { ...PASSING_SCORES, cognitive_load: 58 }       // +13
    const r = detectRegression('pid-2', regressed)
    expect(r!.detected).toBe(true)
    expect(r!.cognitive_load_delta).toBe(13)
  })

  it('detects comprehension_confidence regression (>15 pts drop)', () => {
    upsertBaseline('pid-3', 'ws-1', PASSING_SCORES)  // baseline CC=80
    const regressed = { ...PASSING_SCORES, comprehension_confidence: 60 }  // -20
    const r = detectRegression('pid-3', regressed)
    expect(r!.detected).toBe(true)
    expect(r!.comprehension_confidence_delta).toBe(-20)
  })

  it('does not overwrite existing baseline', () => {
    upsertBaseline('pid-4', 'ws-1', PASSING_SCORES)
    const first = detectRegression('pid-4', PASSING_SCORES)!.baseline_created_at
    upsertBaseline('pid-4', 'ws-1', BLOCKING_SCORES)  // should be ignored
    const second = detectRegression('pid-4', PASSING_SCORES)!.baseline_created_at
    expect(second).toBe(first)
  })
})

// ── RateLimiter ───────────────────────────────────────────────────────────────

describe('RateLimiter', () => {
  it('allows requests up to the limit', () => {
    const rl = new RateLimiter()
    rl.setTier('ws-free', 'free')
    // Drain 100 tokens
    for (let i = 0; i < 100; i++) {
      expect(rl.consume('ws-free').allowed).toBe(true)
    }
    const result = rl.consume('ws-free')
    expect(result.allowed).toBe(false)
  })

  it('returns retryAfterMs when rate-limited', () => {
    const rl = new RateLimiter()
    rl.setTier('ws-x', 'free')
    for (let i = 0; i < 100; i++) rl.consume('ws-x')
    const result = rl.consume('ws-x')
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.retryAfterMs).toBeGreaterThan(0)
  })

  it('growth tier allows 1000 rps before blocking', () => {
    const rl = new RateLimiter()
    rl.setTier('ws-growth', 'growth')
    // Drain exactly the bucket (1000 tokens); the 1001st should be denied.
    // We don't assert each individual call to avoid timing-refill interference
    // from the loop itself running in <1ms — just verify the bucket eventually empties.
    let allowed = 0
    for (let i = 0; i < 1002; i++) {
      if (rl.consume('ws-growth').allowed) allowed++
    }
    // Should have allowed exactly 1000 (or very close — refill during loop is <1 token)
    expect(allowed).toBeGreaterThanOrEqual(999)
    expect(allowed).toBeLessThanOrEqual(1001)
    // After draining, further requests must be denied
    expect(rl.consume('ws-growth').allowed).toBe(false)
  })

  it('defaults to free tier for unknown workspace', () => {
    const rl = new RateLimiter()
    for (let i = 0; i < 100; i++) rl.consume('unknown-ws')
    expect(rl.consume('unknown-ws').allowed).toBe(false)
  })
})

// ── evaluatePrompt ────────────────────────────────────────────────────────────

describe('evaluatePrompt', () => {
  beforeEach(() => _clearBaselinesForTest())

  it('returns ALLOW for passing scores', async () => {
    const config = makeConfig(PASSING_SCORES)
    const result = await evaluatePrompt(
      { prompt: 'Hello world', workspace_id: 'ws-1' },
      config,
    )
    expect(result.decision).toBe('ALLOW')
    expect(result.scores.cognitive_load).toBe(45)
  })

  it('returns BLOCK when thresholds breached', async () => {
    const config = makeConfig(BLOCKING_SCORES)
    const result = await evaluatePrompt(
      { prompt: 'Manipulative prompt text', workspace_id: 'ws-1' },
      config,
    )
    expect(result.decision).toBe('BLOCK')
    expect(result.reason).toContain('cognitive_load')
  })

  it('returns ALLOW with whitelist_match for whitelisted prompt', async () => {
    global.fetch = mockFetch(BLOCKING_SCORES)  // would BLOCK without whitelist
    const config: EvaluatorConfig = {
      scoringEndpoint: 'http://mock',
      thresholds: { cognitive_load_max: 80 },
      whitelist: new WhitelistManager([
        { pattern: 'You are a helpful assistant', type: 'prefix', author: 'alice', timestamp: '', reason: 'standard prompt' },
      ]),
    }
    const result = await evaluatePrompt(
      { prompt: 'You are a helpful assistant. Do X.', workspace_id: 'ws-1' },
      config,
    )
    expect(result.decision).toBe('ALLOW')
    expect(result.whitelist_match).toBe('You are a helpful assistant')
  })

  it('returns WARN on regression', async () => {
    const config = makeConfig(PASSING_SCORES)
    // First evaluation: creates baseline
    await evaluatePrompt({ prompt: 'System prompt v1', workspace_id: 'ws-1' }, config)

    // Second evaluation: regressed scores
    global.fetch = mockFetch({ ...PASSING_SCORES, cognitive_load: 60 })  // +15 → regression
    const result2 = await evaluatePrompt({ prompt: 'System prompt v1', workspace_id: 'ws-1' }, config)
    expect(result2.decision).toBe('WARN')
    expect(result2.regression?.detected).toBe(true)
  })

  it('uses SHA-256 of system_prompt for stable prompt_id', async () => {
    const config = makeConfig(PASSING_SCORES)
    const systemPrompt = 'You are a helpful assistant.'
    const r1 = await evaluatePrompt(
      { prompt: 'User question 1', system_prompt: systemPrompt, workspace_id: 'ws-1' },
      config,
    )
    global.fetch = mockFetch(PASSING_SCORES)
    const r2 = await evaluatePrompt(
      { prompt: 'User question 2', system_prompt: systemPrompt, workspace_id: 'ws-1' },
      config,
    )
    expect(r1.prompt_id).toBe(r2.prompt_id)
    expect(r1.prompt_id).toBe(hashPrompt(systemPrompt))
  })

  it('latency_ms is populated', async () => {
    const config = makeConfig(PASSING_SCORES, 10)
    const result = await evaluatePrompt({ prompt: 'test', workspace_id: 'ws-1' }, config)
    expect(result.latency_ms).toBeGreaterThanOrEqual(0)
  })
})

// ── HTTP router ───────────────────────────────────────────────────────────────

// Capture real fetch (Node 18 built-in) before any mock replaces it
const realFetch = globalThis.fetch

describe('POST /evaluate-prompt (HTTP)', () => {
  let gateServer: Server
  let scoringServer: Server
  let gateUrl: string

  beforeAll((done) => {
    // Restore real fetch so the gate server can make real HTTP calls to scoring server
    globalThis.fetch = realFetch
    _clearBaselinesForTest()

    // Spin up a mock scoring server on a random port
    const scoringApp = express()
    scoringApp.use(express.json())
    scoringApp.post('/score', (_req, res) => res.json(PASSING_SCORES))

    scoringServer = scoringApp.listen(0, () => {
      const scoringAddr = scoringServer.address()
      const scoringUrl = `http://127.0.0.1:${typeof scoringAddr === 'object' && scoringAddr !== null ? scoringAddr.port : 0}`

      // Spin up the gate server pointing at the real mock scoring server
      const gateApp = express()
      gateApp.use(express.json())
      const cfg: EvaluatorConfig = {
        scoringEndpoint: scoringUrl,
        thresholds: { cognitive_load_max: 80, manipulation_risk_max: 40, comprehension_confidence_min: 50 },
        whitelist: new WhitelistManager([]),
      }
      gateApp.use(createPromptGateRouter(cfg))

      gateServer = gateApp.listen(0, () => {
        const addr = gateServer.address()
        gateUrl = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`
        done()
      })
    })
  })

  afterAll((done) => {
    gateServer.close(() => scoringServer.close(() => done()))
  })

  it('returns 400 for missing prompt', async () => {
    const res = await fetch(`${gateUrl}/evaluate-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: 'ws-1' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing workspace_id', async () => {
    const res = await fetch(`${gateUrl}/evaluate-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 200 with decision for valid request', async () => {
    const res = await fetch(`${gateUrl}/evaluate-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Tell me a joke', workspace_id: 'ws-test' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { decision: string }
    expect(['ALLOW', 'WARN', 'BLOCK']).toContain(body.decision)
  })
})

// ── <200ms latency requirement under load ─────────────────────────────────────

describe('latency requirement: <200ms p95 under 50 concurrent evaluations', () => {
  beforeEach(() => _clearBaselinesForTest())

  it('p95 evaluation latency stays under 200ms when scoring takes <50ms', async () => {
    // Mock scoring service with ~10ms simulated latency
    global.fetch = mockFetch(PASSING_SCORES, 10)
    const config = makeConfig(PASSING_SCORES, 10)

    const N = 50
    const latencies: number[] = []

    // Run N concurrent evaluations
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        evaluatePrompt({ prompt: `Prompt number ${i}`, workspace_id: 'ws-load' }, config),
      ),
    )

    for (const r of results) latencies.push(r.latency_ms)

    latencies.sort((a, b) => a - b)
    const p95Index = Math.ceil(N * 0.95) - 1
    const p95 = latencies[p95Index] ?? latencies[latencies.length - 1] ?? 0

    // P95 should be well under 200ms; 10ms mock latency + overhead
    expect(p95).toBeLessThan(200)
    // Sanity check: all requests completed
    expect(results).toHaveLength(N)
    // All should be ALLOW (passing scores, no previous baseline for most)
    const allowCount = results.filter((r) => r.decision === 'ALLOW').length
    expect(allowCount).toBeGreaterThan(0)
  }, 10000)
})
