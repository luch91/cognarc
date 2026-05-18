import { SegmentConnector } from '../src/connectors/SegmentConnector.js'
import { AmplitudeConnector } from '../src/connectors/AmplitudeConnector.js'
import { MixpanelConnector } from '../src/connectors/MixpanelConnector.js'
import { PostHogConnector } from '../src/connectors/PostHogConnector.js'
import { GA4Connector } from '../src/connectors/GA4Connector.js'
import { ConnectorManager } from '../src/ConnectorManager.js'
import type { EnrichedEvent } from '../src/types.js'

const WORKSPACE = 'ws-test-001'

const MOCK_SCORES = {
  cognitive_load: 55,
  comprehension_confidence: 70,
  emotional_valence: 50,
  trust_coherence: 65,
  manipulation_risk: 20,
  cognitive_risk: 'LOW' as const,
  confidence_intervals: {},
  top_brain_regions: [],
  explanation: 'mock',
  model_version: 'mock-1.0',
  latency_ms: 10,
}

function makeEnrichedEvent(overrides: Partial<EnrichedEvent> = {}): EnrichedEvent {
  return {
    id: 'evt-001',
    type: 'page_view',
    userId: 'user-123',
    anonymousId: 'anon-456',
    timestamp: '2026-05-15T10:00:00.000Z',
    properties: { page: '/dashboard' },
    source: 'test',
    workspaceId: WORKSPACE,
    cognitiveScores: MOCK_SCORES,
    cognitiveLabels: { semantic: 'confusion' },
    ...overrides,
  }
}

// ── SegmentConnector ──────────────────────────────────────────────────────────

describe('SegmentConnector', () => {
  it('connects with valid credentials', async () => {
    const c = new SegmentConnector()
    await expect(c.connect({ workspaceId: WORKSPACE, writeKey: 'wk-test', webhookSecret: 's3cr3t' })).resolves.not.toThrow()
    expect(c.health().connected).toBe(true)
  })

  it('rejects missing credentials', async () => {
    const c = new SegmentConnector()
    await expect(c.connect({ workspaceId: WORKSPACE })).rejects.toThrow('writeKey')
  })

  it('ingests single track event', async () => {
    const c = new SegmentConnector()
    await c.connect({ workspaceId: WORKSPACE, writeKey: 'wk', webhookSecret: 's' })
    const events = await c.ingestWebhook({
      messageId: 'msg-001',
      type: 'track',
      event: 'Button Clicked',
      userId: 'u1',
      timestamp: '2026-05-15T10:00:00Z',
      properties: { label: 'Sign Up' },
    })
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('Button Clicked')
    expect(events[0]?.userId).toBe('u1')
    expect(events[0]?.workspaceId).toBe(WORKSPACE)
  })

  it('ingests batch payload', async () => {
    const c = new SegmentConnector()
    await c.connect({ workspaceId: WORKSPACE, writeKey: 'wk', webhookSecret: 's' })
    const events = await c.ingestWebhook({
      batch: [
        { messageId: 'm1', event: 'page_view', userId: 'u1' },
        { messageId: 'm2', event: 'click', userId: 'u1' },
      ],
    })
    expect(events).toHaveLength(2)
  })

  it('validates webhook signature correctly', async () => {
    const secret = 'my-webhook-secret'
    const c = new SegmentConnector()
    await c.connect({ workspaceId: WORKSPACE, writeKey: 'wk', webhookSecret: secret })

    const { createHmac } = await import('crypto')
    const body = '{"event":"test"}'
    const sig = 'sha1=' + createHmac('sha1', secret).update(body).digest('hex')

    expect(c.validateSignature(body, sig)).toBe(true)
    expect(c.validateSignature(body, 'sha1=wrong')).toBe(false)
  })

  it('write-back failure returns error list without throwing', async () => {
    const c = new SegmentConnector()
    await c.connect({ workspaceId: WORKSPACE, writeKey: 'bad-key', webhookSecret: 's' })

    global.fetch = jest.fn().mockRejectedValue(new Error('network error')) as unknown as typeof global.fetch

    const result = await c.writeBack([makeEnrichedEvent()])
    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.eventsWritten).toBe(0)
  })

  it('health tracks lastSyncAt after ingest', async () => {
    const c = new SegmentConnector()
    await c.connect({ workspaceId: WORKSPACE, writeKey: 'wk', webhookSecret: 's' })
    expect(c.health().lastSyncAt).toBeNull()
    await c.ingestWebhook({ messageId: 'm1', event: 'ping' })
    expect(c.health().lastSyncAt).not.toBeNull()
  })
})

// ── AmplitudeConnector ────────────────────────────────────────────────────────

describe('AmplitudeConnector', () => {
  it('connects with valid credentials', async () => {
    const c = new AmplitudeConnector()
    await c.connect({ workspaceId: WORKSPACE, apiKey: 'amp-key', secretKey: 'amp-secret' })
    expect(c.health().connected).toBe(true)
  })

  it('ingests amplitude webhook payload', async () => {
    const c = new AmplitudeConnector()
    await c.connect({ workspaceId: WORKSPACE, apiKey: 'amp-key', secretKey: 'amp-secret' })
    const events = await c.ingestWebhook({
      events: [
        { event_id: 1, event_type: 'purchase', user_id: 'u1', device_id: 'd1', time: 1715000000000, event_properties: { amount: 99 } },
        { event_id: 2, event_type: 'view_item', user_id: 'u2', time: 1715000001000 },
      ],
    })
    expect(events).toHaveLength(2)
    expect(events[0]?.type).toBe('purchase')
    expect(events[0]?.userId).toBe('u1')
    expect(events[1]?.type).toBe('view_item')
  })

  it('write-back failure is non-blocking', async () => {
    const c = new AmplitudeConnector()
    await c.connect({ workspaceId: WORKSPACE, apiKey: 'key', secretKey: 'secret' })
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof global.fetch
    const result = await c.writeBack([makeEnrichedEvent()])
    expect(result.success).toBe(false)
    expect(result.eventsWritten).toBe(0)
  })
})

// ── MixpanelConnector ─────────────────────────────────────────────────────────

describe('MixpanelConnector', () => {
  it('connects with valid credentials', async () => {
    const c = new MixpanelConnector()
    await c.connect({ workspaceId: WORKSPACE, projectToken: 'tok', serviceAccountUsername: 'u', serviceAccountSecret: 's' })
    expect(c.health().connected).toBe(true)
  })

  it('ingests array of mixpanel events', async () => {
    const c = new MixpanelConnector()
    await c.connect({ workspaceId: WORKSPACE, projectToken: 'tok', serviceAccountUsername: 'u', serviceAccountSecret: 's' })
    const events = await c.ingestWebhook([
      { event: 'Sign Up', properties: { distinct_id: 'u1', $insert_id: 'ins-1', time: 1715000000 } },
    ])
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('Sign Up')
    expect(events[0]?.userId).toBe('u1')
    expect(events[0]?.id).toBe('ins-1')
  })
})

// ── PostHogConnector ──────────────────────────────────────────────────────────

describe('PostHogConnector', () => {
  it('connects with valid credentials', async () => {
    const c = new PostHogConnector()
    await c.connect({ workspaceId: WORKSPACE, apiKey: 'phc_key' })
    expect(c.health().connected).toBe(true)
  })

  it('ingests posthog webhook payload', async () => {
    const c = new PostHogConnector()
    await c.connect({ workspaceId: WORKSPACE, apiKey: 'phc_key' })
    const events = await c.ingestWebhook({
      event: '$pageview',
      distinct_id: 'user-ph-1',
      uuid: 'uuid-ph-1',
      timestamp: '2026-05-15T10:00:00Z',
      properties: { $current_url: 'https://app.example.com' },
    })
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('$pageview')
    expect(events[0]?.userId).toBe('user-ph-1')
  })

  it('signature check passes when no secret configured', async () => {
    const c = new PostHogConnector()
    await c.connect({ workspaceId: WORKSPACE, apiKey: 'key' })
    expect(c.validateSignature('body', 'anything')).toBe(true)
  })
})

// ── GA4Connector ──────────────────────────────────────────────────────────────

describe('GA4Connector', () => {
  it('connects with valid credentials', async () => {
    const c = new GA4Connector()
    await c.connect({ workspaceId: WORKSPACE, measurementId: 'G-XXXXXX', apiSecret: 'secret' })
    expect(c.health().connected).toBe(true)
  })

  it('ingestWebhook always returns empty (write-back only)', async () => {
    const c = new GA4Connector()
    await c.connect({ workspaceId: WORKSPACE, measurementId: 'G-XXXXXX', apiSecret: 'secret' })
    const events = await c.ingestWebhook({ anything: 'here' })
    expect(events).toHaveLength(0)
  })

  it('write-back truncates event name to 40 chars', async () => {
    const c = new GA4Connector()
    await c.connect({ workspaceId: WORKSPACE, measurementId: 'G-XXXXXX', apiSecret: 'secret' })

    let sentBody = ''
    global.fetch = jest.fn().mockImplementation((_url: string, init: RequestInit) => {
      sentBody = init.body as string
      return Promise.resolve({ ok: true, status: 204, text: () => Promise.resolve('') })
    }) as unknown as typeof global.fetch

    const longEvent = makeEnrichedEvent({ type: 'a'.repeat(50) })
    await c.writeBack([longEvent])
    const parsed = JSON.parse(sentBody) as { events: Array<{ name: string }> }
    expect(parsed.events[0]?.name.length).toBeLessThanOrEqual(40)
  })
})

// ── ConnectorManager ──────────────────────────────────────────────────────────

describe('ConnectorManager', () => {
  it('registers and retrieves connectors', async () => {
    const manager = new ConnectorManager('http://localhost:3001')
    const segment = new SegmentConnector()
    await segment.connect({ workspaceId: WORKSPACE, writeKey: 'wk', webhookSecret: 's' })
    manager.register(segment)
    expect(manager.get('segment')).toBe(segment)
  })

  it('health returns per-connector status', async () => {
    const manager = new ConnectorManager('http://localhost:3001')
    const segment = new SegmentConnector()
    await segment.connect({ workspaceId: WORKSPACE, writeKey: 'wk', webhookSecret: 's' })
    manager.register(segment)
    const health = manager.health()
    expect(health['segment']).toBeDefined()
    expect(health['segment']?.connected).toBe(true)
  })

  it('processEvents routes through scoring and dispatches write-back', async () => {
    const manager = new ConnectorManager('http://scoring-service')
    const posthog = new PostHogConnector()
    await posthog.connect({ workspaceId: WORKSPACE, apiKey: 'phc_key' })
    manager.register(posthog)

    const writeBackSpy = jest.spyOn(posthog, 'writeBack').mockResolvedValue({ success: true, eventsWritten: 1, errors: [] })

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_SCORES),
    }) as unknown as typeof global.fetch

    await manager.processEvents([
      {
        id: 'e1',
        type: 'page_view',
        userId: 'u1',
        timestamp: '2026-05-15T10:00:00Z',
        properties: {},
        source: 'posthog',
        workspaceId: WORKSPACE,
      },
    ])

    expect(writeBackSpy).toHaveBeenCalledTimes(1)
    const enriched = writeBackSpy.mock.calls[0]?.[0]
    expect(enriched?.[0]?.cognitiveScores).toEqual(MOCK_SCORES)
  })

  it('processEvents does not throw when scoring fails', async () => {
    const manager = new ConnectorManager('http://scoring-service')
    global.fetch = jest.fn().mockRejectedValue(new Error('scoring down')) as unknown as typeof global.fetch
    await expect(
      manager.processEvents([
        { id: 'e1', type: 'click', userId: 'u1', timestamp: new Date().toISOString(), properties: {}, source: 'segment', workspaceId: WORKSPACE },
      ]),
    ).resolves.not.toThrow()
  })

  it('processEvents does not throw when write-back fails', async () => {
    const manager = new ConnectorManager('http://scoring-service')
    const ga4 = new GA4Connector()
    await ga4.connect({ workspaceId: WORKSPACE, measurementId: 'G-X', apiSecret: 's' })
    manager.register(ga4)

    jest.spyOn(ga4, 'writeBack').mockRejectedValue(new Error('GA4 down'))
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(MOCK_SCORES),
    }) as unknown as typeof global.fetch

    await expect(
      manager.processEvents([
        { id: 'e1', type: 'view', userId: 'u1', timestamp: new Date().toISOString(), properties: {}, source: 'ga4', workspaceId: WORKSPACE },
      ]),
    ).resolves.not.toThrow()
  })
})
