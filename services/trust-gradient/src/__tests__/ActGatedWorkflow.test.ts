import { ActGatedWorkflow } from '../ActGatedWorkflow.js'
import { CognArcError } from '@cognarc/types'

describe('ActGatedWorkflow', () => {
  let workflow: ActGatedWorkflow

  beforeEach(() => {
    workflow = new ActGatedWorkflow()
  })

  test('createDecisionPackage returns a PENDING package', () => {
    const pkg = workflow.createDecisionPackage('HARD_BLOCK_OUTPUT', { evidence: 'test' }, ['alt-1'])
    expect(pkg.status).toBe('PENDING')
    expect(pkg.action).toBe('HARD_BLOCK_OUTPUT')
    expect(pkg.alternatives).toEqual(['alt-1'])
  })

  test('submitForApproval returns the package id', () => {
    const pkg = workflow.createDecisionPackage('EXECUTE_FINE_TUNING', {}, [])
    const id = workflow.submitForApproval(pkg)
    expect(id).toBe(pkg.id)
  })

  test('approve transitions package to APPROVED with humanId recorded', () => {
    const pkg = workflow.createDecisionPackage('DEPLOY_PROMPT_REWRITE', {}, [])
    workflow.approve(pkg.id, 'human-alice')
    const resolved = workflow.getPackage(pkg.id)
    expect(resolved?.status).toBe('APPROVED')
    expect(resolved?.resolved_by).toBe('human-alice')
  })

  test('reject transitions package to REJECTED with reason recorded', () => {
    const pkg = workflow.createDecisionPackage('TRANSMIT_REGULATORY_REPORT', {}, [])
    workflow.reject(pkg.id, 'human-bob', 'Not enough evidence')
    const resolved = workflow.getPackage(pkg.id)
    expect(resolved?.status).toBe('REJECTED')
    expect(resolved?.rejection_reason).toBe('Not enough evidence')
  })

  test('action cannot be approved twice', () => {
    const pkg = workflow.createDecisionPackage('HARD_BLOCK_OUTPUT', {}, [])
    workflow.approve(pkg.id, 'human-alice')
    expect(() => workflow.approve(pkg.id, 'human-alice')).toThrow(CognArcError)
  })

  test('approve throws on unknown approvalRequestId', () => {
    expect(() => workflow.approve('nonexistent-id', 'human-alice')).toThrow(CognArcError)
  })

  test('no action executes without recorded human approval — package stays PENDING until resolved', () => {
    const pkg = workflow.createDecisionPackage('EXECUTE_FINE_TUNING', {}, [])
    const retrieved = workflow.getPackage(pkg.id)
    // Package exists but is PENDING — the caller must check status before executing
    expect(retrieved?.status).toBe('PENDING')
  })
})
