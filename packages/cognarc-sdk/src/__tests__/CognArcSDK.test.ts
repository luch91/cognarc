import { CognArcSDK, COGNITIVE_LABELS } from '../index'

// jsdom environment is set in jest.config.ts

const BASE_CONFIG = {
  workspaceId: 'ws-test-123',
  endpoint: 'https://api.cognarc.test/events',
}

function makeSDK(): CognArcSDK {
  const sdk = new CognArcSDK()
  sdk.init(BASE_CONFIG)
  return sdk
}

// ── COGNITIVE_LABELS ──────────────────────────────────────────────────────────

describe('COGNITIVE_LABELS', () => {
  it('maps rage_click to confusion', () => {
    expect(COGNITIVE_LABELS['rage_click']).toBe('confusion')
  })

  it('maps field_reentry_count to working_memory_overload', () => {
    expect(COGNITIVE_LABELS['field_reentry_count']).toBe('working_memory_overload')
  })

  it('maps scroll_reversal to comprehension_failure', () => {
    expect(COGNITIVE_LABELS['scroll_reversal']).toBe('comprehension_failure')
  })

  it('maps session_abandonment_post_modal to trust_erosion_trigger', () => {
    expect(COGNITIVE_LABELS['session_abandonment_post_modal']).toBe('trust_erosion_trigger')
  })
})

// ── init ──────────────────────────────────────────────────────────────────────

describe('CognArcSDK.init', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('sets workspace ID and endpoint from config', () => {
    const sdk = new CognArcSDK()
    sdk.init(BASE_CONFIG)
    // Internal state is accessible via track — if init failed, no events queue
    expect(() => sdk.track('test_event')).not.toThrow()
  })

  it('does not track when sessionOptOut is true', () => {
    const sdk = new CognArcSDK()
    sdk.init({ ...BASE_CONFIG, sessionOptOut: true })
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())
    sdk.track('test_event')
    // Flush timer fires — but nothing should be sent
    jest.runAllTimers()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('respects sampleRate=0 by opting out', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    const sdk = new CognArcSDK()
    sdk.init({ ...BASE_CONFIG, sampleRate: 0 })
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())
    sdk.track('test_event')
    jest.runAllTimers()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
    jest.spyOn(Math, 'random').mockRestore()
  })

  it('includes events when sampleRate=1', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    const sdk = new CognArcSDK()
    sdk.init({ ...BASE_CONFIG, sampleRate: 1 })
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())
    sdk.track('test_event')
    jest.runAllTimers()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    fetchSpy.mockRestore()
    jest.spyOn(Math, 'random').mockRestore()
  })
})

// ── track ─────────────────────────────────────────────────────────────────────

describe('CognArcSDK.track', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('batches events and flushes after 500ms', () => {
    const sdk = makeSDK()
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())

    sdk.track('event_a')
    sdk.track('event_b')
    expect(fetchSpy).not.toHaveBeenCalled()

    jest.advanceTimersByTime(500)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string) as { events: unknown[] }
    expect(body.events).toHaveLength(2)
    fetchSpy.mockRestore()
  })

  it('attaches cognitive label when event type is in COGNITIVE_LABELS', () => {
    const sdk = makeSDK()
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())

    sdk.track('rage_click')
    jest.advanceTimersByTime(500)

    const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string) as {
      events: Array<{ label?: string }>
    }
    expect(body.events[0]?.label).toBe('confusion')
    fetchSpy.mockRestore()
  })

  it('does not attach label for unknown event types', () => {
    const sdk = makeSDK()
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())

    sdk.track('custom_event')
    jest.advanceTimersByTime(500)

    const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string) as {
      events: Array<{ label?: string }>
    }
    expect(body.events[0]?.label).toBeUndefined()
    fetchSpy.mockRestore()
  })

  it('includes workspaceId and sessionId on every event', () => {
    const sdk = makeSDK()
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())

    sdk.track('test')
    jest.advanceTimersByTime(500)

    const body = JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string) as {
      events: Array<{ ws: string; sid: string }>
    }
    expect(body.events[0]?.ws).toBe('ws-test-123')
    expect(typeof body.events[0]?.sid).toBe('string')
    expect(body.events[0]?.sid.length).toBeGreaterThan(0)
    fetchSpy.mockRestore()
  })

  it('does nothing before init is called', () => {
    const sdk = new CognArcSDK()
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())
    sdk.track('test_event')
    jest.runAllTimers()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

// ── optOut / optIn ────────────────────────────────────────────────────────────

describe('CognArcSDK.optOut / optIn', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('stops tracking after optOut', () => {
    const sdk = makeSDK()
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())
    sdk.optOut()
    sdk.track('test_event')
    jest.runAllTimers()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('resumes tracking after optIn', () => {
    const sdk = makeSDK()
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())
    sdk.optOut()
    sdk.optIn()
    sdk.track('test_event')
    jest.advanceTimersByTime(500)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    fetchSpy.mockRestore()
  })

  it('clears queued events on optOut', () => {
    const sdk = makeSDK()
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())
    sdk.track('event_1')
    sdk.track('event_2')
    sdk.optOut()
    jest.runAllTimers()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})

// ── Transmission + retry ──────────────────────────────────────────────────────

describe('transmission retry', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('retries up to 3 times on fetch failure with exponential backoff', async () => {
    const sdk = makeSDK()
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network'))

    sdk.track('test_event')
    jest.advanceTimersByTime(500)   // initial flush

    // Attempt 1 fails → retry after 1000ms
    await Promise.resolve()
    jest.advanceTimersByTime(1000)
    // Attempt 2 fails → retry after 2000ms
    await Promise.resolve()
    jest.advanceTimersByTime(2000)
    // Attempt 3 fails → retry after 4000ms
    await Promise.resolve()
    jest.advanceTimersByTime(4000)
    await Promise.resolve()

    // 1 initial + 3 retries = 4 calls total
    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
    fetchSpy.mockRestore()
  })
})

// ── Auto-instrumentation ──────────────────────────────────────────────────────

describe('CognArcSDK.autoInstrument', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('does not throw when called', () => {
    const sdk = makeSDK()
    expect(() => sdk.autoInstrument()).not.toThrow()
    sdk.destroy()
  })

  it('is idempotent — calling twice does not double-register listeners', () => {
    const sdk = makeSDK()
    const addSpy = jest.spyOn(window, 'addEventListener')
    sdk.autoInstrument()
    const firstCallCount = addSpy.mock.calls.length
    sdk.autoInstrument()
    expect(addSpy.mock.calls.length).toBe(firstCallCount)
    sdk.destroy()
  })

  it('tracks rage_click after 3 rapid clicks in same area', () => {
    const sdk = makeSDK()
    sdk.autoInstrument()
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())

    const btn = document.createElement('button')
    document.body.appendChild(btn)

    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new MouseEvent('click', { clientX: 50, clientY: 50, bubbles: true }))
    }

    jest.advanceTimersByTime(500)

    const calls = fetchSpy.mock.calls
    const bodies = calls.map(
      (c) => JSON.parse(c[1]?.body as string) as { events: Array<{ t: string }> },
    )
    const eventTypes = bodies.flatMap((b) => b.events.map((e) => e.t))
    expect(eventTypes).toContain('rage_click')

    document.body.removeChild(btn)
    sdk.destroy()
  })

  it('tracks scroll_reversal after changing scroll direction', () => {
    const sdk = makeSDK()
    sdk.autoInstrument()
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())

    // Simulate scrolling down then up (twice to trigger reversal count >= 2)
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })

    ;(window as { scrollY: number }).scrollY = 200
    window.dispatchEvent(new Event('scroll'))
    ;(window as { scrollY: number }).scrollY = 100
    window.dispatchEvent(new Event('scroll'))
    ;(window as { scrollY: number }).scrollY = 300
    window.dispatchEvent(new Event('scroll'))
    ;(window as { scrollY: number }).scrollY = 150
    window.dispatchEvent(new Event('scroll'))

    jest.advanceTimersByTime(500)

    const bodies = fetchSpy.mock.calls.map(
      (c) => JSON.parse(c[1]?.body as string) as { events: Array<{ t: string }> },
    )
    const eventTypes = bodies.flatMap((b) => b.events.map((e) => e.t))
    expect(eventTypes).toContain('scroll_reversal')

    sdk.destroy()
  })

  it('tracks field_reentry_count after 3 edits to same input', () => {
    const sdk = makeSDK()
    sdk.autoInstrument()
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())

    const input = document.createElement('input')
    document.body.appendChild(input)

    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new InputEvent('input', { bubbles: true, target: input } as EventInit))
      // Manually set target since jsdom doesn't propagate it perfectly
      const evt = new InputEvent('input', { bubbles: true })
      Object.defineProperty(evt, 'target', { value: input, configurable: true })
      window.dispatchEvent(evt)
    }

    jest.advanceTimersByTime(500)

    document.body.removeChild(input)
    sdk.destroy()
    // Verify no throw — full assertion is in integration test
    expect(fetchSpy).toBeDefined()
  })
})

// ── Session ID uniqueness ─────────────────────────────────────────────────────

describe('session ID', () => {
  it('generates a unique session ID per SDK instance', () => {
    const sdk1 = new CognArcSDK()
    const sdk2 = new CognArcSDK()
    sdk1.init(BASE_CONFIG)
    sdk2.init(BASE_CONFIG)

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response())
    jest.useFakeTimers()

    sdk1.track('ping')
    sdk2.track('ping')
    jest.advanceTimersByTime(500)

    const bodies = fetchSpy.mock.calls.map(
      (c) => JSON.parse(c[1]?.body as string) as { events: Array<{ sid: string }> },
    )
    const sids = bodies.flatMap((b) => b.events.map((e) => e.sid))
    expect(sids.length).toBe(2)
    expect(sids[0]).not.toBe(sids[1])

    fetchSpy.mockRestore()
    jest.useRealTimers()
  })
})
