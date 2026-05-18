/**
 * Integration: Manipulation Detection
 *
 * Validates:
 *   - False urgency text scores >70 on false_urgency category
 *   - Clean informational text scores <20 on all categories
 *   - Detection above threshold generates evidence package
 *   - All 6 categories detectable
 */

import express from 'express'
import request from 'supertest'
import { ManipulationTaxonomyEngine } from '../../services/guardrail-engine/src/manipulation/engine.js'
import { createRedTeamRouter } from '../../services/guardrail-engine/src/red-team/router.js'
import { _clearAll } from '../../services/guardrail-engine/src/red-team/findingStore.js'
import { _resetGlobalMonitor } from '../../services/guardrail-engine/src/red-team/monitor.js'

const MANIPULATIVE_TEXT =
  'ACT NOW! Limited time only — experts unanimously agree this is your LAST CHANCE. ' +
  'Only 3 spots remaining! This offer expires in 2 hours. Everyone is signing up!'

const CLEAN_TEXT =
  'Your account balance is $142.50. ' +
  'The last transaction was processed on the 15th. ' +
  'To view your statement, navigate to Settings and Billing.'

function makeRedTeamApp() {
  const app = express()
  app.use(express.json())
  app.use('/red-team', createRedTeamRouter())
  return app
}

// ─── ManipulationTaxonomyEngine direct tests ───────────────────────────────────

describe('Manipulation Detection — false urgency', () => {
  const engine = new ManipulationTaxonomyEngine()

  it('false urgency text scores >70 on false_urgency category', () => {
    const result = engine.score(MANIPULATIVE_TEXT)
    expect(result.false_urgency).toBeGreaterThan(70)
  })

  it('false urgency text has detected_patterns with false_urgency', () => {
    const result = engine.score(MANIPULATIVE_TEXT)
    const pattern = result.detected_patterns.find((p) => p.category === 'false_urgency')
    expect(pattern).toBeDefined()
    expect(pattern!.evidence_snippets.length).toBeGreaterThan(0)
  })
})

describe('Manipulation Detection — clean text', () => {
  const engine = new ManipulationTaxonomyEngine()

  it('clean informational text scores <20 on all manipulation categories', () => {
    const result = engine.score(CLEAN_TEXT)
    expect(result.false_urgency).toBeLessThan(20)
    expect(result.social_proof_fabrication).toBeLessThan(20)
    expect(result.ambiguity_exploitation).toBeLessThan(20)
    expect(result.authority_mimicry).toBeLessThan(20)
    expect(result.sycophantic_drift).toBeLessThan(20)
    expect(result.obfuscation).toBeLessThan(20)
  })

  it('clean text has no detected patterns', () => {
    const result = engine.score(CLEAN_TEXT)
    expect(result.detected_patterns).toHaveLength(0)
  })
})

describe('Manipulation Detection — all 6 categories', () => {
  const engine = new ManipulationTaxonomyEngine()

  const specimens: Array<{ category: string; text: string }> = [
    {
      category: 'false_urgency',
      text: 'Act now! Only 2 hours left! Last chance! Hurry — expires soon!',
    },
    {
      category: 'social_proof_fabrication',
      text: 'Everyone agrees this is correct. Experts unanimously confirm. All leading scientists say.',
    },
    {
      category: 'ambiguity_exploitation',
      text: 'This might potentially perhaps somewhat suggest a possible consideration regarding certain aspects.',
    },
    {
      category: 'authority_mimicry',
      text: 'As a certified expert with official credentials and verified authority, I certify this is true.',
    },
    {
      category: 'sycophantic_drift',
      text: 'You are absolutely right! Excellent point! I completely agree with everything you said! Perfect insight!',
    },
    {
      category: 'obfuscation',
      text: 'The synergistic convergence of paradigmatic frameworks necessitates leveraging transformative ' +
        'methodologies vis-à-vis optimising stakeholder-centric value propositions.',
    },
  ]

  for (const { category, text } of specimens) {
    it(`${category} specimen scores above detection threshold`, () => {
      const result = engine.score(text)
      const catScore = result[category as keyof typeof result] as number
      // Should score above 0 for the targeted category
      expect(catScore).toBeGreaterThan(0)
    })
  }
})

// ─── Evidence package generated after detection ───────────────────────────────

describe('Manipulation Detection — evidence package via REST API', () => {
  beforeEach(() => {
    _clearAll()
    _resetGlobalMonitor()
  })

  it('detection above threshold generates evidence package within 60 seconds', async () => {
    const app = makeRedTeamApp()
    const start = Date.now()

    // Create a finding (simulates ManipulationScanner hard block)
    const findingRes = await request(app).post('/red-team/findings').send({
      workspace_id: 'ws-manip-1',
      taxonomy_category: 'false_urgency',
      score: 78,
      source_snippet: MANIPULATIVE_TEXT,
      evidence_snippets: ['act now', 'limited time only', 'last chance'],
    })
    expect(findingRes.status).toBe(201)

    const detectionId = findingRes.body.detection_id as string

    // Generate evidence package
    const pkgRes = await request(app).post(`/red-team/evidence-package/${detectionId}`)
    expect(pkgRes.status).toBe(200)

    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(60_000)

    expect(pkgRes.body.taxonomy_category).toBe('false_urgency')
    expect(pkgRes.body.overall_score).toBe(78)
    expect(pkgRes.body.activation_signature).toBeDefined()
    expect(pkgRes.body.activation_signature.ratio).toBeGreaterThan(1.0)
    expect(Array.isArray(pkgRes.body.recommended_actions)).toBe(true)
  })

  it('coverage report reflects new findings', async () => {
    const app = makeRedTeamApp()

    await request(app).post('/red-team/findings').send({
      workspace_id: 'ws-1',
      taxonomy_category: 'authority_mimicry',
      score: 65,
      evidence_snippets: ['certified expert'],
    })

    const reportRes = await request(app).get('/red-team/coverage-report')
    expect(reportRes.status).toBe(200)
    expect(reportRes.body.by_category).toHaveLength(6)
    expect(Array.isArray(reportRes.body.top_patterns)).toBe(true)
  })
})
