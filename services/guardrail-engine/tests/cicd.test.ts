import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadConfig, resolveThreshold } from '../src/cicd/configLoader.js'
import { evaluateThresholds, formatScoreTable } from '../src/cicd/thresholdEvaluator.js'
import { BaselineManager } from '../src/cicd/baselineManager.js'
import { buildPRComment, runGate } from '../src/cicd/gate.js'
import type { CognArcConfig } from '../src/cicd/types.js'
import type { CognitiveScoreResponse } from '@cognarc/types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PASSING_SCORES: CognitiveScoreResponse = {
  cognitive_load: 55,
  comprehension_confidence: 75,
  emotional_valence: 60,
  trust_coherence: 70,
  manipulation_risk: 20,
  cognitive_risk: 'LOW',
  confidence_intervals: {},
  top_brain_regions: [],
  explanation: 'mock',
  model_version: 'mock-1.0',
  latency_ms: 10,
}

const FAILING_SCORES: CognitiveScoreResponse = {
  ...PASSING_SCORES,
  cognitive_load: 90,    // exceeds max 80
  manipulation_risk: 55, // exceeds max 40
  comprehension_confidence: 35, // below min 50
  cognitive_risk: 'HIGH',
}

const DEFAULT_CONFIG: CognArcConfig = {
  version: '1.0',
  thresholds: {
    cognitive_load: { max: 80 },
    manipulation_risk: { max: 40 },
    comprehension_confidence: { min: 50 },
    trust_coherence: { min: 40 },
  },
  on_breach: { action: 'fail' },
}

// ── configLoader ──────────────────────────────────────────────────────────────

describe('configLoader', () => {
  let tmpDir: string
  let configFile: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cognarc-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    configFile = join(tmpDir, '.cognarc.yml')
  })

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }))

  it('returns defaults when .cognarc.yml does not exist', () => {
    const config = loadConfig(join(tmpDir, 'nonexistent.yml'))
    expect(config.version).toBe('1.0')
    expect(config.thresholds.cognitive_load?.max).toBe(80)
    expect(config.on_breach?.action).toBe('fail')
  })

  it('parses valid .cognarc.yml', () => {
    writeFileSync(configFile, `
version: "1.0"
thresholds:
  cognitive_load:
    max: 70
  manipulation_risk:
    max: 30
on_breach:
  action: warn
`)
    const config = loadConfig(configFile)
    expect(config.thresholds.cognitive_load?.max).toBe(70)
    expect(config.thresholds.manipulation_risk?.max).toBe(30)
    expect(config.on_breach?.action).toBe('warn')
  })

  it('rejects unsupported version', () => {
    writeFileSync(configFile, 'version: "2.0"\nthresholds: {}')
    expect(() => loadConfig(configFile)).toThrow('Unsupported .cognarc.yml version')
  })

  it('resolves environment-specific threshold', () => {
    const config: CognArcConfig = {
      version: '1.0',
      thresholds: {
        cognitive_load: { max: 80, environment: { prod: 65, staging: 75 } },
      },
    }
    expect(resolveThreshold(config, 'cognitive_load', 'prod').max).toBe(65)
    expect(resolveThreshold(config, 'cognitive_load', 'staging').max).toBe(75)
    expect(resolveThreshold(config, 'cognitive_load').max).toBe(80)
  })
})

// ── thresholdEvaluator ────────────────────────────────────────────────────────

describe('thresholdEvaluator', () => {
  it('returns no breaches for passing scores', () => {
    const breaches = evaluateThresholds(PASSING_SCORES, DEFAULT_CONFIG)
    expect(breaches).toHaveLength(0)
  })

  it('detects above_max breach on cognitive_load', () => {
    const breaches = evaluateThresholds(FAILING_SCORES, DEFAULT_CONFIG)
    const clBreach = breaches.find((b) => b.metric === 'cognitive_load')
    expect(clBreach).toBeDefined()
    expect(clBreach?.direction).toBe('above_max')
    expect(clBreach?.value).toBe(90)
    expect(clBreach?.threshold).toBe(80)
  })

  it('detects below_min breach on comprehension_confidence', () => {
    const breaches = evaluateThresholds(FAILING_SCORES, DEFAULT_CONFIG)
    const ccBreach = breaches.find((b) => b.metric === 'comprehension_confidence')
    expect(ccBreach).toBeDefined()
    expect(ccBreach?.direction).toBe('below_min')
  })

  it('respects environment-specific threshold', () => {
    const config: CognArcConfig = {
      version: '1.0',
      thresholds: {
        cognitive_load: { max: 80, environment: { prod: 50 } },
      },
    }
    // 55 passes global (max 80) but breaches prod (max 50)
    const passGlobal = evaluateThresholds(PASSING_SCORES, config)
    expect(passGlobal).toHaveLength(0)
    const failProd = evaluateThresholds(PASSING_SCORES, config, 'prod')
    expect(failProd.some((b) => b.metric === 'cognitive_load')).toBe(true)
  })

  it('formatScoreTable produces markdown table', () => {
    const table = formatScoreTable([
      { path: 'prompts/signup.txt', scores: PASSING_SCORES, breaches: [], baselineDelta: null },
    ])
    expect(table).toContain('| prompts/signup.txt |')
    expect(table).toContain('✅')
    expect(table).toContain('Cognitive Load')
  })

  it('formatScoreTable shows warning icon on breach', () => {
    const table = formatScoreTable([
      {
        path: 'prompts/bad.txt',
        scores: FAILING_SCORES,
        breaches: [{ metric: 'cognitive_load', value: 90, threshold: 80, direction: 'above_max' }],
        baselineDelta: null,
      },
    ])
    expect(table).toContain('⚠️')
  })

  it('formatScoreTable includes baseline delta', () => {
    const table = formatScoreTable([
      {
        path: 'file.txt',
        scores: PASSING_SCORES,
        breaches: [],
        baselineDelta: { cognitive_load: 5.0, manipulation_risk: -2.0, comprehension_confidence: 0, trust_coherence: 0 },
      },
    ])
    expect(table).toContain('+5.0')
    expect(table).toContain('-2.0')
  })
})

// ── BaselineManager ───────────────────────────────────────────────────────────

describe('BaselineManager', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cognarc-baseline-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }))

  it('returns null for unknown path', () => {
    const bm = new BaselineManager(tmpDir)
    expect(bm.getBaseline('prompts/new.txt')).toBeNull()
  })

  it('upserts and retrieves baseline', () => {
    const bm = new BaselineManager(tmpDir)
    bm.upsertBaseline('prompts/test.txt', PASSING_SCORES, 'abc123')
    const entry = bm.getBaseline('prompts/test.txt')
    expect(entry).not.toBeNull()
    expect(entry?.scores.cognitive_load).toBe(55)
    expect(entry?.commitSha).toBe('abc123')
  })

  it('computeDelta returns null for first evaluation', () => {
    const bm = new BaselineManager(tmpDir)
    expect(bm.computeDelta('prompts/new.txt', PASSING_SCORES)).toBeNull()
  })

  it('computeDelta calculates correct delta', () => {
    const bm = new BaselineManager(tmpDir)
    bm.upsertBaseline('file.txt', PASSING_SCORES, null)
    const modified = { ...PASSING_SCORES, cognitive_load: 65 }
    const delta = bm.computeDelta('file.txt', modified)
    expect(delta?.cognitive_load).toBe(10)
  })

  it('persists baseline across instances', () => {
    const bm1 = new BaselineManager(tmpDir)
    bm1.upsertBaseline('prompts/a.txt', PASSING_SCORES, 'sha1')
    const bm2 = new BaselineManager(tmpDir)
    expect(bm2.getBaseline('prompts/a.txt')?.commitSha).toBe('sha1')
  })

  it('preserves original createdAt on update', () => {
    const bm = new BaselineManager(tmpDir)
    bm.upsertBaseline('file.txt', PASSING_SCORES, null)
    const first = bm.getBaseline('file.txt')!.createdAt
    bm.upsertBaseline('file.txt', FAILING_SCORES, 'new-sha')
    const second = bm.getBaseline('file.txt')!.createdAt
    expect(second).toBe(first)
  })
})

// ── gate (runGate + buildPRComment) ───────────────────────────────────────────

describe('runGate', () => {
  let tmpDir: string
  let promptFile: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `cognarc-gate-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    promptFile = join(tmpDir, 'prompt.txt')
    writeFileSync(promptFile, 'Hello, please sign up for our service today!')
  })

  afterEach(() => rmSync(tmpDir, { recursive: true, force: true }))

  it('passes when scoring returns passing scores', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(PASSING_SCORES),
    }) as unknown as typeof global.fetch

    const result = await runGate({
      changedFiles: [promptFile],
      scoringEndpoint: 'http://mock-scorer',
      baselineDir: tmpDir,
    })

    expect(result.passed).toBe(true)
    expect(result.overridden).toBe(false)
    expect(result.fileScores).toHaveLength(1)
  })

  it('fails when scoring returns breaching scores', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(FAILING_SCORES),
    }) as unknown as typeof global.fetch

    const result = await runGate({
      changedFiles: [promptFile],
      scoringEndpoint: 'http://mock-scorer',
      baselineDir: tmpDir,
    })

    expect(result.passed).toBe(false)
    expect(result.fileScores[0]?.breaches.length).toBeGreaterThan(0)
  })

  it('detects override from PR description', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(FAILING_SCORES),
    }) as unknown as typeof global.fetch

    const result = await runGate({
      changedFiles: [promptFile],
      scoringEndpoint: 'http://mock-scorer',
      overrideText: 'cognarc-override: emergency fix for production incident',
      baselineDir: tmpDir,
    })

    expect(result.passed).toBe(true)
    expect(result.overridden).toBe(true)
    expect(result.overrideJustification).toBe('emergency fix for production incident')
  })

  it('skips files that do not match monitored paths', async () => {
    const mockFetch = jest.fn() as unknown as typeof global.fetch
    global.fetch = mockFetch

    const result = await runGate({
      changedFiles: ['src/app.ts', 'package.json'],  // not in paths
      scoringEndpoint: 'http://mock-scorer',
      configPath: join(tmpDir, 'nonexistent.yml'),  // will load defaults with prompts/** paths
      baselineDir: tmpDir,
    })

    expect(result.fileScores).toHaveLength(0)
    expect(result.passed).toBe(true)
  })

  it('skips files that do not exist on disk', async () => {
    global.fetch = jest.fn() as unknown as typeof global.fetch

    const result = await runGate({
      changedFiles: ['/nonexistent/file.txt'],
      scoringEndpoint: 'http://mock-scorer',
      baselineDir: tmpDir,
    })

    expect(result.fileScores).toHaveLength(0)
  })

  it('continues when scoring service fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('service down')) as unknown as typeof global.fetch

    await expect(
      runGate({ changedFiles: [promptFile], scoringEndpoint: 'http://down', baselineDir: tmpDir })
    ).resolves.not.toThrow()
  })

  it('creates baseline on first run and computes delta on second run', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(PASSING_SCORES) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ ...PASSING_SCORES, cognitive_load: 65 }) }) as unknown as typeof global.fetch

    const r1 = await runGate({ changedFiles: [promptFile], scoringEndpoint: 'http://mock', baselineDir: tmpDir })
    expect(r1.fileScores[0]?.baselineDelta).toBeNull()

    const r2 = await runGate({ changedFiles: [promptFile], scoringEndpoint: 'http://mock', baselineDir: tmpDir })
    expect(r2.fileScores[0]?.baselineDelta?.cognitive_load).toBe(10)
  })
})

describe('buildPRComment', () => {
  it('includes pass message for passing result', () => {
    const result = {
      passed: true, overridden: false, overrideJustification: null,
      fileScores: [{ path: 'f.txt', scores: PASSING_SCORES, breaches: [], baselineDelta: null }],
      summary: '| f.txt | ✅ |',
    }
    const comment = buildPRComment(result, DEFAULT_CONFIG)
    expect(comment).toContain('All cognitive thresholds passed')
    expect(comment).toContain('✅')
  })

  it('includes breach details for failing result', () => {
    const result = {
      passed: false, overridden: false, overrideJustification: null,
      fileScores: [{
        path: 'bad.txt',
        scores: FAILING_SCORES,
        breaches: [{ metric: 'cognitive_load', value: 90, threshold: 80, direction: 'above_max' as const }],
        baselineDelta: null,
      }],
      summary: '| bad.txt | ⚠️ |',
    }
    const comment = buildPRComment(result, DEFAULT_CONFIG)
    expect(comment).toContain('Cognitive threshold breach')
    expect(comment).toContain('cognitive_load')
    expect(comment).toContain('cognarc-override')
  })

  it('includes override notice when overridden', () => {
    const result = {
      passed: true, overridden: true, overrideJustification: 'prod incident',
      fileScores: [],
      summary: '',
    }
    const comment = buildPRComment(result, DEFAULT_CONFIG)
    expect(comment).toContain('Override active')
    expect(comment).toContain('prod incident')
  })
})
