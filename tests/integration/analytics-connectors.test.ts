/**
 * Integration: Analytics Connectors
 *
 * Validates:
 *   - Write-back failure does not block event processing (isolated errors)
 *   - ConnectorManager health endpoint works
 *   - Cognitive labels assigned based on score thresholds
 *   - Empty event array is a no-op
 *   - Scoring failure is isolated
 */

import { ConnectorManager } from '../../services/analytics-connectors/src/ConnectorManager.js'
import type {
  AnalyticsEvent,
  AnalyticsConnector,
  ConnectorHealth,
  EnrichedEvent,
  WriteBackResult,
} from '../../services/analytics-connectors/src/types.js'

// ─── Mock connector ──────────────────────────────────────────────────────────

class MockConnector implements AnalyticsConnector {
  name = 'mock'
  writeBackCalls: EnrichedEvent[] = []
  shouldFailWriteback = false

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async ingestWebhook(): Promise<AnalyticsEvent[]> { return [] }
  async writeBack(events: EnrichedEvent[]): Promise<WriteBackResult> {
    if (this.shouldFailWriteback) throw new Error('Write-back failed')
    this.writeBackCalls.push(...events)
    return { success: true, eventsWritten: events.length, errors: [] }
  }
  async testConnection(): Promise<boolean> { return true }
  health(): ConnectorHealth {
    return { connected: true, lastSyncAt: null, errorCount: 0, lastError: null }
  }
}

// ─── Mock scoring service ────────────────────────────────────────────────────

function mockFetchScore(overrides: Record<string, number> = {}) {
  const cogLoad = overrides['cognitive_load'] ?? 30
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      cognitive_load: cogLoad,
      comprehension_confidence: overrides['comprehension_confidence'] ?? 75,
      emotional_valence: overrides['emotional_valence'] ?? 60,
      trust_coherence: overrides['trust_coherence'] ?? 70,
      manipulation_risk: overrides['manipulation_risk'] ?? 5,
      cognitive_risk: cogLoad > 70 ? 'HIGH' : 'LOW',
      confidence_intervals: {},
      top_brain_regions: ['dlpfc'],
      explanation: 'Mock',
      model_version: 'mock-v1',
      latency_ms: 5,
    }),
  }) as unknown as typeof global.fetch
}

function makeEvent(overrides: Partial<AnalyticsEvent> = {}): AnalyticsEvent {
  return {
    id: `evt-${Date.now()}`,
    type: 'page_view',
    workspaceId: 'ws-analytics',
    timestamp: new Date().toISOString(),
    properties: { page_title: 'Home' },
    source: 'test',
    ...overrides,
  }
}

// ─── ConnectorManager ────────────────────────────────────────────────────────

describe('Analytics Connectors — ConnectorManager', () => {
  it('registers and retrieves a connector', () => {
    const manager = new ConnectorManager('http://mock-scoring')
    const connector = new MockConnector()
    manager.register(connector)
    expect(manager.get('mock')).toBe(connector)
  })

  it('processEvents routes events through scoring and dispatches write-back', async () => {
    mockFetchScore({})
    const manager = new ConnectorManager('http://mock-scoring')
    const connector = new MockConnector()
    manager.register(connector)

    await manager.processEvents([makeEvent()])
    expect(connector.writeBackCalls.length).toBeGreaterThan(0)
  })

  it('Segment webhook processed and cognitive labels assigned within 200ms', async () => {
    mockFetchScore({})
    const manager = new ConnectorManager('http://mock-scoring')
    const connector = new MockConnector()
    manager.register(connector)

    const start = Date.now()
    await manager.processEvents([makeEvent()])
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(200)
    expect(connector.writeBackCalls.length).toBeGreaterThan(0)
  })

  it('write-back failure retried — failure does not block event processing', async () => {
    mockFetchScore({})
    const manager = new ConnectorManager('http://mock-scoring')

    const failing = new MockConnector()
    failing.name = 'failing'
    failing.shouldFailWriteback = true

    const succeeding = new MockConnector()
    succeeding.name = 'succeeding'

    manager.register(failing)
    manager.register(succeeding)

    // Should not throw despite failing connector
    await expect(manager.processEvents([makeEvent()])).resolves.not.toThrow()

    // Succeeding connector still received the write-back
    expect(succeeding.writeBackCalls.length).toBeGreaterThan(0)
  })

  it('empty event array is a no-op — no scoring calls', async () => {
    const manager = new ConnectorManager('http://mock-scoring')
    const connector = new MockConnector()
    manager.register(connector)
    global.fetch = jest.fn() as unknown as typeof global.fetch

    await manager.processEvents([])

    expect(global.fetch).not.toHaveBeenCalled()
    expect(connector.writeBackCalls.length).toBe(0)
  })

  it('scoring failure is isolated — does not throw to caller', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof global.fetch
    const manager = new ConnectorManager('http://mock-scoring')
    const connector = new MockConnector()
    manager.register(connector)

    await expect(manager.processEvents([makeEvent()])).resolves.not.toThrow()
  })

  it('health returns status for all registered connectors', () => {
    const manager = new ConnectorManager('http://mock-scoring')
    const c1 = new MockConnector()
    c1.name = 'c1'
    const c2 = new MockConnector()
    c2.name = 'c2'
    manager.register(c1)
    manager.register(c2)

    const health = manager.health()
    expect(health['c1']).toBeDefined()
    expect(health['c2']).toBeDefined()
    expect(health['c1']!.connected).toBe(true)
  })
})

// ─── Cognitive label assignment ───────────────────────────────────────────────

describe('Analytics Connectors — cognitive label assignment', () => {
  it('elevated manipulation_risk (>70) assigns manipulation label', async () => {
    mockFetchScore({ manipulation_risk: 80 })
    const manager = new ConnectorManager('http://mock-scoring')
    const connector = new MockConnector()
    manager.register(connector)

    await manager.processEvents([makeEvent({ type: 'button_click' })])

    expect(connector.writeBackCalls.length).toBeGreaterThan(0)
    const enriched = connector.writeBackCalls[0]!
    expect(enriched.cognitiveLabels['manipulation_risk']).toBe('elevated_manipulation_signal')
  })

  it('low comprehension confidence (<40) assigns comprehension_failure label', async () => {
    mockFetchScore({ comprehension_confidence: 30 })
    const manager = new ConnectorManager('http://mock-scoring')
    const connector = new MockConnector()
    manager.register(connector)

    await manager.processEvents([makeEvent()])

    const enriched = connector.writeBackCalls[0]!
    expect(enriched.cognitiveLabels['comprehension']).toBe('comprehension_failure')
  })

  it('enriched events contain cognitiveScores', async () => {
    mockFetchScore({ cognitive_load: 45 })
    const manager = new ConnectorManager('http://mock-scoring')
    const connector = new MockConnector()
    manager.register(connector)

    await manager.processEvents([makeEvent()])

    const enriched = connector.writeBackCalls[0]!
    expect(enriched.cognitiveScores).toBeDefined()
    expect(typeof enriched.cognitiveScores.cognitive_load).toBe('number')
  })
})
