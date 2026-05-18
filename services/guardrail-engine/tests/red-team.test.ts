import request from 'supertest'
import express from 'express'
import { PostRemediationMonitor, _resetGlobalMonitor } from '../src/red-team/monitor.js'
import { NeuralEvidencePackageGenerator } from '../src/red-team/evidencePackage.js'
import { generateCoverageReport } from '../src/red-team/coverageReport.js'
import { createRedTeamRouter } from '../src/red-team/router.js'
import { _clearAll, createFinding, markRemediated } from '../src/red-team/findingStore.js'
import type { ManipulationDetection, ManipulationPattern } from '../src/red-team/types.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CLEAN_OUTPUT = 'Here is how to reset your password: click Settings, then Security, then Reset.'

const MANIPULATIVE_OUTPUT =
  'ACT NOW! Limited time only — experts unanimously agree this is your last chance. ' +
  'Only 3 spots left! Hurry — this offer expires in hours!'

const URGENCY_PATTERN: ManipulationPattern = {
  taxonomy_category: 'false_urgency',
  evidence_snippets: ['act now', 'limited time only', 'last chance'],
  score_threshold: 30,
}

function makeApp() {
  const app = express()
  app.use(express.json())
  app.use('/red-team', createRedTeamRouter())
  return app
}

// ─── PostRemediationMonitor ───────────────────────────────────────────────────

describe('PostRemediationMonitor', () => {
  let monitor: PostRemediationMonitor

  beforeEach(() => {
    monitor = new PostRemediationMonitor()
    monitor._resetDebounce()
    monitor._resetMonitors()
    _clearAll()
  })

  it('activate() registers a pattern; isActive() returns true', () => {
    monitor.activate('finding-1', URGENCY_PATTERN)
    expect(monitor.isActive('finding-1')).toBe(true)
  })

  it('deactivate() removes the monitor', () => {
    monitor.activate('finding-1', URGENCY_PATTERN)
    monitor.deactivate('finding-1')
    expect(monitor.isActive('finding-1')).toBe(false)
  })

  it('clean output → no re-emergence detected', async () => {
    monitor.activate('finding-clean', URGENCY_PATTERN)
    const results = await monitor.checkOutput(CLEAN_OUTPUT, 'ws-test')
    const result = results.find((r) => r.original_finding_id === 'finding-clean')!
    expect(result.re_emerged).toBe(false)
    expect(result.confidence).toBe(0)
    expect(result.matching_snippets).toHaveLength(0)
  })

  it('manipulative output → re-emergence detected with known snippets', async () => {
    monitor.activate('finding-manip', URGENCY_PATTERN)
    const results = await monitor.checkOutput(MANIPULATIVE_OUTPUT, 'ws-test')
    const result = results.find((r) => r.original_finding_id === 'finding-manip')!
    expect(result.re_emerged).toBe(true)
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.matching_snippets.length).toBeGreaterThan(0)
  })

  it('confidence is 0–100', async () => {
    monitor.activate('finding-conf', URGENCY_PATTERN)
    const results = await monitor.checkOutput(MANIPULATIVE_OUTPUT, 'ws-test')
    const result = results.find((r) => r.original_finding_id === 'finding-conf')!
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(100)
  })

  it('idempotent: alert sent only once within 60s debounce window', async () => {
    monitor.activate('finding-debounce', URGENCY_PATTERN)

    const r1 = await monitor.checkPattern('finding-debounce', URGENCY_PATTERN, MANIPULATIVE_OUTPUT, 'ws-test')
    const r2 = await monitor.checkPattern('finding-debounce', URGENCY_PATTERN, MANIPULATIVE_OUTPUT, 'ws-test')

    // Both may re_emerge, but second alert should be suppressed by debounce
    if (r1.re_emerged && r2.re_emerged) {
      expect(r1.alert_sent).toBe(true)
      expect(r2.alert_sent).toBe(false)
    }
  })

  it('no monitors active → checkOutput returns empty array', async () => {
    const results = await monitor.checkOutput(MANIPULATIVE_OUTPUT, 'ws-test')
    expect(results).toHaveLength(0)
  })

  it('multiple monitors → results array has one entry per monitor', async () => {
    monitor.activate('m1', URGENCY_PATTERN)
    monitor.activate('m2', { taxonomy_category: 'authority_mimicry', evidence_snippets: ['certified expert'], score_threshold: 25 })
    const results = await monitor.checkOutput(CLEAN_OUTPUT, 'ws-test')
    expect(results).toHaveLength(2)
  })
})

// ─── NeuralEvidencePackageGenerator ──────────────────────────────────────────

describe('NeuralEvidencePackageGenerator', () => {
  const gen = new NeuralEvidencePackageGenerator()

  const detection: ManipulationDetection = {
    id: 'det-001',
    workspace_id: 'ws-1',
    source_output: MANIPULATIVE_OUTPUT,
    taxonomy_category: 'false_urgency',
    overall_score: 74,
    evidence_snippets: ['act now', 'limited time only'],
    detected_at: new Date().toISOString(),
  }

  it('returns all required fields', () => {
    const pkg = gen.generatePackage(detection)
    expect(pkg.detection_id).toBe('det-001')
    expect(pkg.taxonomy_category).toBe('false_urgency')
    expect(typeof pkg.overall_score).toBe('number')
    expect(pkg.confidence_interval).toHaveProperty('low')
    expect(pkg.confidence_interval).toHaveProperty('high')
    expect(pkg.activation_signature).toHaveProperty('limbic_activation')
    expect(pkg.activation_signature).toHaveProperty('prefrontal_engagement')
    expect(pkg.activation_signature).toHaveProperty('ratio')
    expect(Array.isArray(pkg.evidence_snippets)).toBe(true)
    expect(typeof pkg.plain_language_explanation).toBe('string')
    expect(typeof pkg.suitable_for_stakeholder_reporting).toBe('boolean')
    expect(Array.isArray(pkg.recommended_actions)).toBe(true)
  })

  it('confidence_interval low < high', () => {
    const pkg = gen.generatePackage(detection)
    expect(pkg.confidence_interval.low).toBeLessThan(pkg.confidence_interval.high)
  })

  it('high score → suitable_for_stakeholder_reporting = true', () => {
    const highScoreDet = { ...detection, overall_score: 75 }
    const pkg = gen.generatePackage(highScoreDet)
    expect(pkg.suitable_for_stakeholder_reporting).toBe(true)
  })

  it('low score → suitable_for_stakeholder_reporting = false', () => {
    const lowDet = { ...detection, overall_score: 20, evidence_snippets: [] }
    const pkg = gen.generatePackage(lowDet)
    expect(pkg.suitable_for_stakeholder_reporting).toBe(false)
  })

  it('false_urgency has higher limbic than prefrontal ratio (> 1.0)', () => {
    const pkg = gen.generatePackage(detection)
    expect(pkg.activation_signature.ratio).toBeGreaterThan(1.0)
  })

  it('plain_language_explanation mentions the score', () => {
    const pkg = gen.generatePackage(detection)
    expect(pkg.plain_language_explanation).toMatch(/74/)
  })

  it('recommended_actions contains at least one action', () => {
    const pkg = gen.generatePackage(detection)
    expect(pkg.recommended_actions.length).toBeGreaterThan(0)
  })

  it('high-risk population subgroups are identified for high scores', () => {
    const pkg = gen.generatePackage({ ...detection, overall_score: 80 })
    expect(pkg.population_variance.high_risk_subgroups.length).toBeGreaterThan(0)
  })

  it('works for all 6 taxonomy categories', () => {
    const categories = [
      'false_urgency', 'social_proof_fabrication', 'ambiguity_exploitation',
      'authority_mimicry', 'sycophantic_drift', 'obfuscation',
    ] as const
    for (const cat of categories) {
      const det = { ...detection, taxonomy_category: cat }
      expect(() => gen.generatePackage(det)).not.toThrow()
    }
  })
})

// ─── ScaleCoverageReport ──────────────────────────────────────────────────────

describe('ScaleCoverageReport', () => {
  beforeEach(() => _clearAll())

  it('returns all required fields', () => {
    const report = generateCoverageReport()
    expect(report.generated_at).toBeDefined()
    expect(report.period_start).toBeDefined()
    expect(report.period_end).toBeDefined()
    expect(typeof report.total_detections).toBe('number')
    expect(report.severity_distribution).toHaveProperty('HIGH')
    expect(report.severity_distribution).toHaveProperty('MEDIUM')
    expect(report.severity_distribution).toHaveProperty('LOW')
    expect(Array.isArray(report.by_category)).toBe(true)
    expect(report.by_category).toHaveLength(6)
    expect(typeof report.coverage_gap_closed_pct).toBe('number')
    expect(typeof report.outputs_reviewed).toBe('number')
    expect(Array.isArray(report.top_patterns)).toBe(true)
  })

  it('coverage_gap_closed_pct is 0–100', () => {
    const report = generateCoverageReport()
    expect(report.coverage_gap_closed_pct).toBeGreaterThanOrEqual(0)
    expect(report.coverage_gap_closed_pct).toBeLessThanOrEqual(100)
  })

  it('counts findings correctly after creating some', () => {
    createFinding('ws-1', { taxonomy_category: 'false_urgency', evidence_snippets: ['act now'], score_threshold: 40 }, 75, 'snippet')
    createFinding('ws-1', { taxonomy_category: 'false_urgency', evidence_snippets: ['hurry'], score_threshold: 40 }, 60, 'snippet2')
    createFinding('ws-1', { taxonomy_category: 'authority_mimicry', evidence_snippets: ['expert'], score_threshold: 30 }, 55, 'snippet3')

    const report = generateCoverageReport()
    const urgencyCat = report.by_category.find((c) => c.category === 'false_urgency')!
    expect(urgencyCat.count).toBeGreaterThanOrEqual(2)
  })

  it('severity distribution sums to total_detections', () => {
    createFinding('ws-1', { taxonomy_category: 'false_urgency', evidence_snippets: [], score_threshold: 30 }, 80, '')
    createFinding('ws-1', { taxonomy_category: 'obfuscation', evidence_snippets: [], score_threshold: 30 }, 50, '')
    createFinding('ws-1', { taxonomy_category: 'sycophantic_drift', evidence_snippets: [], score_threshold: 30 }, 30, '')
    const report = generateCoverageReport()
    const sum = report.severity_distribution.HIGH + report.severity_distribution.MEDIUM + report.severity_distribution.LOW
    expect(sum).toBe(report.total_detections)
  })
})

// ─── REST API tests ───────────────────────────────────────────────────────────

describe('Red Team REST API', () => {
  let app: ReturnType<typeof makeApp>

  beforeEach(() => {
    _clearAll()
    _resetGlobalMonitor()
    app = makeApp()
  })

  describe('POST /red-team/findings', () => {
    it('creates a finding', async () => {
      const res = await request(app).post('/red-team/findings').send({
        workspace_id: 'ws-1',
        taxonomy_category: 'false_urgency',
        score: 72,
        source_snippet: 'ACT NOW!',
        evidence_snippets: ['act now'],
      })
      expect(res.status).toBe(201)
      expect(res.body.finding.id).toBeDefined()
      expect(res.body.detection_id).toBeDefined()
    })

    it('returns 400 for missing workspace_id', async () => {
      const res = await request(app).post('/red-team/findings').send({
        taxonomy_category: 'false_urgency',
        score: 72,
      })
      expect(res.status).toBe(400)
    })

    it('returns 400 for invalid taxonomy_category', async () => {
      const res = await request(app).post('/red-team/findings').send({
        workspace_id: 'ws-1',
        taxonomy_category: 'not_a_category',
        score: 72,
      })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /red-team/findings/:id/remediate', () => {
    it('marks remediated and activates monitor', async () => {
      const createRes = await request(app).post('/red-team/findings').send({
        workspace_id: 'ws-1',
        taxonomy_category: 'false_urgency',
        score: 72,
        evidence_snippets: ['act now'],
      })
      const findingId = createRes.body.finding.id as string

      const remRes = await request(app)
        .post(`/red-team/findings/${findingId}/remediate`)
        .send({ remediated_by: 'user:safety-team' })

      expect(remRes.status).toBe(200)
      expect(remRes.body.monitor_active).toBe(true)
      expect(remRes.body.finding.status).toBe('monitoring')
    })

    it('returns 404 for unknown finding', async () => {
      const res = await request(app)
        .post('/red-team/findings/nonexistent/remediate')
        .send({})
      expect(res.status).toBe(404)
    })
  })

  describe('GET /red-team/findings/:id/status', () => {
    it('returns finding status', async () => {
      const createRes = await request(app).post('/red-team/findings').send({
        workspace_id: 'ws-1',
        taxonomy_category: 'authority_mimicry',
        score: 58,
        evidence_snippets: [],
      })
      const id = createRes.body.finding.id as string

      const res = await request(app).get(`/red-team/findings/${id}/status`)
      expect(res.status).toBe(200)
      expect(res.body.id).toBe(id)
      expect(res.body.status).toBe('open')
      expect(typeof res.body.monitor_active).toBe('boolean')
    })

    it('returns 404 for unknown id', async () => {
      const res = await request(app).get('/red-team/findings/nope/status')
      expect(res.status).toBe(404)
    })
  })

  describe('GET /red-team/coverage-report', () => {
    it('returns coverage report', async () => {
      const res = await request(app).get('/red-team/coverage-report')
      expect(res.status).toBe(200)
      expect(res.body.generated_at).toBeDefined()
      expect(Array.isArray(res.body.by_category)).toBe(true)
    })
  })

  describe('POST /red-team/evidence-package/:detectionId', () => {
    it('returns evidence package for valid detection', async () => {
      const createRes = await request(app).post('/red-team/findings').send({
        workspace_id: 'ws-1',
        taxonomy_category: 'false_urgency',
        score: 74,
        source_snippet: MANIPULATIVE_OUTPUT,
        evidence_snippets: ['act now', 'limited time only'],
      })
      const detectionId = createRes.body.detection_id as string

      const res = await request(app).post(`/red-team/evidence-package/${detectionId}`)
      expect(res.status).toBe(200)
      expect(res.body.taxonomy_category).toBe('false_urgency')
      expect(res.body.overall_score).toBe(74)
      expect(res.body.activation_signature).toBeDefined()
      expect(Array.isArray(res.body.recommended_actions)).toBe(true)
    })

    it('returns 404 for unknown detection', async () => {
      const res = await request(app).post('/red-team/evidence-package/nonexistent')
      expect(res.status).toBe(404)
    })
  })

  describe('POST /red-team/check-output', () => {
    it('returns re-emergence results', async () => {
      const res = await request(app).post('/red-team/check-output').send({
        output: CLEAN_OUTPUT,
        workspace_id: 'ws-1',
      })
      expect(res.status).toBe(200)
      expect(typeof res.body.checked_monitors).toBe('number')
      expect(Array.isArray(res.body.results)).toBe(true)
    })

    it('returns 400 when output is missing', async () => {
      const res = await request(app).post('/red-team/check-output').send({ workspace_id: 'ws-1' })
      expect(res.status).toBe(400)
    })
  })

  describe('Full remediation + re-emergence workflow', () => {
    it('clean model → no re-emergence after remediation', async () => {
      // Create finding
      const createRes = await request(app).post('/red-team/findings').send({
        workspace_id: 'ws-1',
        taxonomy_category: 'false_urgency',
        score: 72,
        evidence_snippets: ['act now', 'limited time only'],
      })
      const findingId = createRes.body.finding.id as string

      // Remediate → activates monitor
      await request(app)
        .post(`/red-team/findings/${findingId}/remediate`)
        .send({ remediated_by: 'user:safety' })

      // Check clean output → should not trigger
      const checkRes = await request(app).post('/red-team/check-output').send({
        output: CLEAN_OUTPUT,
        workspace_id: 'ws-1',
      })
      const triggered = checkRes.body.results.filter((r: { re_emerged: boolean }) => r.re_emerged)
      expect(triggered).toHaveLength(0)
    })

    it('model regression → re-emergence detected', async () => {
      // Create and remediate a finding
      const createRes = await request(app).post('/red-team/findings').send({
        workspace_id: 'ws-1',
        taxonomy_category: 'false_urgency',
        score: 72,
        evidence_snippets: ['act now', 'limited time only', 'last chance'],
      })
      const findingId = createRes.body.finding.id as string

      await request(app)
        .post(`/red-team/findings/${findingId}/remediate`)
        .send({ remediated_by: 'user:safety' })

      // New model output reintroduces manipulative patterns
      const checkRes = await request(app).post('/red-team/check-output').send({
        output: MANIPULATIVE_OUTPUT,
        workspace_id: 'ws-1',
      })
      const triggered = checkRes.body.results.filter((r: { re_emerged: boolean }) => r.re_emerged)
      expect(triggered.length).toBeGreaterThan(0)
      expect(triggered[0].original_finding_id).toBe(findingId)
    })
  })
})
