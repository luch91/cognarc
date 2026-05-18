import { TrustGradientEngine } from '../TrustGradientEngine.js'
import { UnregisteredActionError, TrustGradientViolation } from '@cognarc/types'

const engine = new TrustGradientEngine()
const ctx = { workspace_id: 'ws-test' }

describe('TrustGradientEngine', () => {
  test('SCORE_STIMULUS classifies as OBSERVE', () => {
    expect(engine.classify('SCORE_STIMULUS', ctx)).toBe('OBSERVE')
  })

  test('GENERATE_RECOMMENDATION classifies as RECOMMEND', () => {
    expect(engine.classify('GENERATE_RECOMMENDATION', ctx)).toBe('RECOMMEND')
  })

  test('SEND_SLACK_ALERT classifies as ACT_AUTO', () => {
    expect(engine.classify('SEND_SLACK_ALERT', ctx)).toBe('ACT_AUTO')
  })

  test('HARD_BLOCK_OUTPUT classifies as ACT_GATED', () => {
    expect(engine.classify('HARD_BLOCK_OUTPUT', ctx)).toBe('ACT_GATED')
  })

  test('EXECUTE_FINE_TUNING classifies as ACT_GATED', () => {
    expect(engine.classify('EXECUTE_FINE_TUNING', ctx)).toBe('ACT_GATED')
  })

  test('unregistered action throws UnregisteredActionError', () => {
    expect(() =>
      engine.classify('UNKNOWN_ACTION' as Parameters<typeof engine.classify>[0], ctx),
    ).toThrow(UnregisteredActionError)
  })

  test('all registered actions have a valid zone', () => {
    const validZones = new Set(['OBSERVE', 'RECOMMEND', 'ACT_AUTO', 'ACT_GATED'])
    const actions = [
      'SCORE_STIMULUS', 'LABEL_BEHAVIORAL_EVENT', 'POST_PR_COMMENT',
      'SEND_SLACK_ALERT', 'FAIL_CICD_BUILD', 'SOFT_BLOCK_OUTPUT',
      'HARD_BLOCK_OUTPUT', 'DEPLOY_PROMPT_REWRITE', 'EXECUTE_FINE_TUNING',
      'TRANSMIT_REGULATORY_REPORT', 'GENERATE_RECOMMENDATION',
    ] as const
    for (const action of actions) {
      expect(validZones.has(engine.classify(action, ctx))).toBe(true)
    }
  })

  test('agent cannot downgrade zone via override — throws TrustGradientViolation', () => {
    expect(() =>
      engine.classify('HARD_BLOCK_OUTPUT', {
        workspace_id: 'ws-test',
        zone_overrides: { HARD_BLOCK_OUTPUT: 'ACT_AUTO' },
      }),
    ).toThrow(TrustGradientViolation)
  })

  test('human can upgrade zone via override', () => {
    const zone = engine.classify('POST_PR_COMMENT', {
      workspace_id: 'ws-test',
      zone_overrides: { POST_PR_COMMENT: 'ACT_GATED' },
    })
    expect(zone).toBe('ACT_GATED')
  })
})
