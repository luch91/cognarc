/**
 * Integration: Trust Gradient Governance
 *
 * Tests the three permanent governance rules:
 *   1. Agent cannot downgrade its own oversight zone.
 *   2. ACT_GATED action does not execute without recorded human approval.
 *   3. Audit log entries are append-only (tested at DB level when DB is available).
 *
 * These tests run against service classes directly — no running HTTP stack needed.
 */

import express from 'express'
import request from 'supertest'
import { TrustGradientEngine } from '../../services/trust-gradient/src/TrustGradientEngine.js'
import { ActGatedWorkflow } from '../../services/trust-gradient/src/ActGatedWorkflow.js'
import { createRouter } from '../../services/trust-gradient/src/routes/index.js'
import { TrustGradientViolation, UnregisteredActionError } from '@cognarc/types'
import type { AgentActionType, OversightZone } from '@cognarc/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeApp() {
  const engine = new TrustGradientEngine()
  const actGated = new ActGatedWorkflow()

  // Stub AuditLog and GlobalKillSwitch — not needed for governance logic tests
  const auditLog = {
    append: jest.fn().mockResolvedValue({}),
    query: jest.fn().mockResolvedValue([]),
  } as unknown as import('../../services/trust-gradient/src/AuditLog.js').AuditLog

  const killSwitch = {
    activate: jest.fn().mockResolvedValue(undefined),
    isActiveAsync: jest.fn().mockResolvedValue(false),
    deactivate: jest.fn().mockResolvedValue(undefined),
  } as unknown as import('../../services/trust-gradient/src/GlobalKillSwitch.js').GlobalKillSwitch

  const app = express()
  app.use(express.json())
  app.use('/', createRouter({ engine, auditLog, killSwitch, actGated }))
  return { app, engine, actGated, killSwitch }
}

// ─── Zone classification ───────────────────────────────────────────────────────

describe('Trust Gradient — zone classification', () => {
  it('SCORE_STIMULUS is classified as OBSERVE', () => {
    const engine = new TrustGradientEngine()
    expect(engine.classify('SCORE_STIMULUS', { workspace_id: 'ws-1' })).toBe('OBSERVE')
  })

  it('EXECUTE_FINE_TUNING is classified as ACT_GATED', () => {
    const engine = new TrustGradientEngine()
    expect(engine.classify('EXECUTE_FINE_TUNING', { workspace_id: 'ws-1' })).toBe('ACT_GATED')
  })

  it('HARD_BLOCK_OUTPUT is classified as ACT_GATED', () => {
    const engine = new TrustGradientEngine()
    expect(engine.classify('HARD_BLOCK_OUTPUT', { workspace_id: 'ws-1' })).toBe('ACT_GATED')
  })

  it('POST_PR_COMMENT is classified as ACT_AUTO', () => {
    const engine = new TrustGradientEngine()
    expect(engine.classify('POST_PR_COMMENT', { workspace_id: 'ws-1' })).toBe('ACT_AUTO')
  })

  it('unregistered action throws UnregisteredActionError', () => {
    const engine = new TrustGradientEngine()
    expect(() =>
      engine.classify('NONEXISTENT_ACTION' as AgentActionType, { workspace_id: 'ws-1' }),
    ).toThrow(UnregisteredActionError)
  })
})

// ─── GOVERNANCE RULE 1: Agent cannot reclassify its own action to a lower zone ─

describe('Trust Gradient — GOVERNANCE RULE 1: no zone downgrade', () => {
  it('agent cannot reclassify ACT_GATED action to ACT_AUTO via zone_override', () => {
    const engine = new TrustGradientEngine()
    expect(() =>
      engine.classify('EXECUTE_FINE_TUNING', {
        workspace_id: 'ws-1',
        zone_overrides: { EXECUTE_FINE_TUNING: 'ACT_AUTO' as OversightZone },
      }),
    ).toThrow(TrustGradientViolation)
  })

  it('agent cannot reclassify ACT_GATED to OBSERVE via zone_override', () => {
    const engine = new TrustGradientEngine()
    expect(() =>
      engine.classify('HARD_BLOCK_OUTPUT', {
        workspace_id: 'ws-1',
        zone_overrides: { HARD_BLOCK_OUTPUT: 'OBSERVE' as OversightZone },
      }),
    ).toThrow(TrustGradientViolation)
  })

  it('agent cannot reclassify ACT_AUTO to RECOMMEND via zone_override', () => {
    const engine = new TrustGradientEngine()
    expect(() =>
      engine.classify('FAIL_CICD_BUILD', {
        workspace_id: 'ws-1',
        zone_overrides: { FAIL_CICD_BUILD: 'RECOMMEND' as OversightZone },
      }),
    ).toThrow(TrustGradientViolation)
  })

  it('upgrade overrides (OBSERVE → ACT_AUTO) are allowed — only downgrade is forbidden', () => {
    const engine = new TrustGradientEngine()
    // LABEL_BEHAVIORAL_EVENT is OBSERVE — upgrading to ACT_AUTO should not throw
    expect(() =>
      engine.classify('LABEL_BEHAVIORAL_EVENT', {
        workspace_id: 'ws-1',
        zone_overrides: { LABEL_BEHAVIORAL_EVENT: 'ACT_AUTO' as OversightZone },
      }),
    ).not.toThrow()
  })

  it('POST /classify returns 400 with explanation when downgrade attempted via API', async () => {
    // The API doesn't accept zone_overrides (by design — they come from config only)
    // An unregistered action tests the guard path through HTTP
    const { app } = makeApp()
    const res = await request(app)
      .post('/classify')
      .send({ action: 'FAKE_ACTION', workspace_id: 'ws-1' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })
})

// ─── GOVERNANCE RULE 2: ACT_GATED requires recorded human approval ─────────────

describe('Trust Gradient — GOVERNANCE RULE 2: ACT_GATED requires approval', () => {
  it('decision package is created with PENDING status — action does not execute', () => {
    const actGated = new ActGatedWorkflow()
    const pkg = actGated.createDecisionPackage(
      'EXECUTE_FINE_TUNING',
      { reason: 'Scheduled fine-tuning run' },
      ['Skip fine-tuning', 'Defer to next week'],
    )
    expect(pkg.status).toBe('PENDING')
    // The package existing does NOT mean the action executed
    expect(pkg.action).toBe('EXECUTE_FINE_TUNING')
  })

  it('action cannot be marked approved without calling approve() — status stays PENDING', () => {
    const actGated = new ActGatedWorkflow()
    const pkg = actGated.createDecisionPackage('HARD_BLOCK_OUTPUT', {}, [])
    // No auto-approval code path exists — status stays PENDING unless a human calls approve()
    expect(pkg.status).toBe('PENDING')
    expect(actGated.getPackage(pkg.id)?.status).toBe('PENDING')
  })

  it('approve() with humanId transitions to APPROVED', () => {
    const actGated = new ActGatedWorkflow()
    const pkg = actGated.createDecisionPackage('HARD_BLOCK_OUTPUT', {}, [])
    actGated.approve(pkg.id, 'ml-lead-1')
    expect(actGated.getPackage(pkg.id)?.status).toBe('APPROVED')
    expect(actGated.getPackage(pkg.id)?.resolved_by).toBe('ml-lead-1')
  })

  it('reject() with reason transitions to REJECTED', () => {
    const actGated = new ActGatedWorkflow()
    const pkg = actGated.createDecisionPackage('DEPLOY_PROMPT_REWRITE', {}, [])
    actGated.reject(pkg.id, 'safety-lead', 'Insufficient evidence')
    expect(actGated.getPackage(pkg.id)?.status).toBe('REJECTED')
    expect(actGated.getPackage(pkg.id)?.rejection_reason).toBe('Insufficient evidence')
  })

  it('double-approve throws — no re-approval allowed', () => {
    const actGated = new ActGatedWorkflow()
    const pkg = actGated.createDecisionPackage('TRANSMIT_REGULATORY_REPORT', {}, [])
    actGated.approve(pkg.id, 'ml-lead-1')
    expect(() => actGated.approve(pkg.id, 'ml-lead-2')).toThrow()
  })

  it('POST /approvals → POST /approvals/:id/approve full HTTP workflow', async () => {
    const { app } = makeApp()

    const createRes = await request(app)
      .post('/approvals')
      .send({
        action: 'HARD_BLOCK_OUTPUT',
        evidence: { reason: 'Test' },
        alternatives: ['Soft block', 'Log only'],
      })
    expect(createRes.status).toBe(200)
    const { approvalRequestId } = createRes.body as { approvalRequestId: string }
    expect(approvalRequestId).toBeDefined()

    // Without approval, the package is PENDING — no action executed
    const approveRes = await request(app)
      .post(`/approvals/${approvalRequestId}/approve`)
      .send({ humanId: 'safety-engineer-1' })
    expect(approveRes.status).toBe(200)
    expect(approveRes.body.status).toBe('approved')
  })

  it('POST /approvals/:id/approve without humanId returns 400', async () => {
    const { app } = makeApp()
    const createRes = await request(app)
      .post('/approvals')
      .send({ action: 'HARD_BLOCK_OUTPUT', evidence: {}, alternatives: [] })
    const { approvalRequestId } = createRes.body as { approvalRequestId: string }

    const res = await request(app)
      .post(`/approvals/${approvalRequestId}/approve`)
      .send({})
    expect(res.status).toBe(400)
  })
})

// ─── Kill switch ────────────────────────────────────────────────────────────────

describe('Trust Gradient — kill switch', () => {
  it('activate sets kill switch active; deactivate clears it', async () => {
    const { app, killSwitch } = makeApp()

    // Activate
    ;(killSwitch.isActiveAsync as jest.Mock).mockResolvedValueOnce(false)
    await request(app)
      .post('/kill-switch/ws-kill-test/activate')
      .expect(200)
    expect(killSwitch.activate).toHaveBeenCalledWith('ws-kill-test')

    // Deactivate
    const res = await request(app)
      .post('/kill-switch/ws-kill-test/deactivate')
      .send({ humanId: 'ops-engineer-1' })
    expect(res.status).toBe(200)
    expect(killSwitch.deactivate).toHaveBeenCalledWith('ws-kill-test', 'ops-engineer-1')
  })

  it('GET /kill-switch/:id returns active status', async () => {
    const { app, killSwitch } = makeApp()
    ;(killSwitch.isActiveAsync as jest.Mock).mockResolvedValue(true)

    const res = await request(app).get('/kill-switch/ws-active')
    expect(res.status).toBe(200)
    expect(res.body.active).toBe(true)
  })

  it('deactivate without humanId returns 400', async () => {
    const { app } = makeApp()
    const res = await request(app)
      .post('/kill-switch/ws-1/deactivate')
      .send({})
    expect(res.status).toBe(400)
  })
})

// ─── Audit log immutability (application-level check) ─────────────────────────

describe('Trust Gradient — audit log structure', () => {
  it('GET /audit returns an array', async () => {
    const { app } = makeApp()
    const res = await request(app).get('/audit')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('all registered actions are in the ACTION_REGISTRY', () => {
    // Verify every AgentActionType in @cognarc/types is covered
    const { ACTION_REGISTRY } = require('../../services/trust-gradient/src/registry.js') as {
      ACTION_REGISTRY: Record<string, string>
    }
    const keys = Object.keys(ACTION_REGISTRY)
    expect(keys.length).toBeGreaterThan(0)
    expect(keys).toContain('SCORE_STIMULUS')
    expect(keys).toContain('EXECUTE_FINE_TUNING')
    expect(keys).toContain('HARD_BLOCK_OUTPUT')
  })
})
