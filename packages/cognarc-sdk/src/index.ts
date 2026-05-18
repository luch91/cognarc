// CognArc Behavioral SDK — <8KB gzipped, zero PII
// Tree-shakeable ES module. Works with React 16+, Vue 3+, Angular 14+, vanilla JS.

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SDKConfig {
  workspaceId: string
  endpoint: string
  sessionOptOut?: boolean | undefined
  sampleRate?: number | undefined   // 0–1, default 1.0
}

export interface BehavioralEvent {
  t: string            // event type
  ts: number           // timestamp (ms since page load — NOT wall clock, no PII)
  ws: string           // workspaceId
  sid: string          // anonymous session id (random, not tied to user)
  meta?: Record<string, unknown> | undefined
  label?: string | undefined   // cognitive label if mapped
}

// ── Cognitive label mapping ────────────────────────────────────────────────────

export const COGNITIVE_LABELS: Readonly<Record<string, string>> = {
  rage_click: 'confusion',
  field_reentry_count: 'working_memory_overload',
  scroll_reversal: 'comprehension_failure',
  session_abandonment_post_modal: 'trust_erosion_trigger',
}

// ── Session ID ─────────────────────────────────────────────────────────────────

function makeSessionId(): string {
  // crypto.randomUUID is available in all modern browsers + Node 15+
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ── Main SDK class ─────────────────────────────────────────────────────────────

export class CognArcSDK {
  private config: SDKConfig | null = null
  private sessionId = makeSessionId()
  private optedOut = false
  private queue: BehavioralEvent[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private isInstrumented = false

  // Scroll tracking state
  private lastScrollY = 0
  private lastScrollTime = 0
  private lastScrollDir: 'up' | 'down' | 'none' = 'none'
  private scrollReversalCount = 0

  // Rage-click tracking state
  private lastClickX = 0
  private lastClickY = 0
  private clickCount = 0
  private clickWindowTimer: ReturnType<typeof setTimeout> | null = null

  // Field re-entry tracking: element → edit count (keyed by element index, no PII)
  private fieldEditCounts = new WeakMap<Element, number>()

  // Element dwell tracking
  private dwellTarget: Element | null = null
  private dwellStart = 0

  // Bound listener references for clean teardown
  private readonly _onScroll = this._handleScroll.bind(this)
  private readonly _onClick = this._handleClick.bind(this)
  private readonly _onFocusIn = this._handleFocusIn.bind(this)
  private readonly _onInput = this._handleInput.bind(this)
  private readonly _onFocusOut = this._handleFocusOut.bind(this)
  private readonly _onVisibilityChange = this._handleVisibilityChange.bind(this)
  private readonly _onBeforeUnload = this._handleBeforeUnload.bind(this)

  init(config: SDKConfig): void {
    this.config = config
    this.optedOut = config.sessionOptOut === true

    // Sample rate: skip initialisation for this session if outside sample window
    const rate = config.sampleRate ?? 1.0
    if (rate < 1.0 && Math.random() > rate) {
      this.optedOut = true
    }
  }

  track(eventType: string, metadata?: Record<string, unknown>): void {
    if (this.optedOut || this.config === null) return

    const event: BehavioralEvent = {
      t: eventType,
      ts: typeof performance !== 'undefined' ? Math.round(performance.now()) : Date.now(),
      ws: this.config.workspaceId,
      sid: this.sessionId,
    }
    if (metadata !== undefined) event.meta = metadata
    const label = COGNITIVE_LABELS[eventType]
    if (label !== undefined) event.label = label

    this.queue.push(event)
    this._scheduleFlush()
  }

  optOut(): void {
    this.optedOut = true
    this.queue = []
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  optIn(): void {
    this.optedOut = false
  }

  // ── Auto-instrumentation ─────────────────────────────────────────────────────

  autoInstrument(): void {
    if (this.isInstrumented || typeof window === 'undefined') return
    this.isInstrumented = true

    // Passive listeners keep P99 overhead <2ms
    window.addEventListener('scroll', this._onScroll, { passive: true })
    window.addEventListener('click', this._onClick, { passive: true })
    window.addEventListener('focusin', this._onFocusIn, { passive: true })
    window.addEventListener('focusout', this._onFocusOut, { passive: true })
    window.addEventListener('input', this._onInput, { passive: true })
    document.addEventListener('visibilitychange', this._onVisibilityChange)
    window.addEventListener('beforeunload', this._onBeforeUnload)
  }

  destroy(): void {
    if (!this.isInstrumented || typeof window === 'undefined') return
    window.removeEventListener('scroll', this._onScroll)
    window.removeEventListener('click', this._onClick)
    window.removeEventListener('focusin', this._onFocusIn)
    window.removeEventListener('focusout', this._onFocusOut)
    window.removeEventListener('input', this._onInput)
    document.removeEventListener('visibilitychange', this._onVisibilityChange)
    window.removeEventListener('beforeunload', this._onBeforeUnload)
    this.isInstrumented = false
    this._flush(true)
  }

  // ── Event handlers ───────────────────────────────────────────────────────────

  private _handleScroll(): void {
    const y = window.scrollY
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const dt = now - this.lastScrollTime
    const dy = y - this.lastScrollY

    if (dy !== 0) {
      const dir: 'up' | 'down' = dy < 0 ? 'up' : 'down'

      // Velocity spike — frustration signal (>2px/ms and significant movement)
      if (dt > 0) {
        const velocity = Math.abs(dy) / dt   // px/ms
        if (velocity > 2 && Math.abs(dy) > 100) {
          this.track('scroll_velocity_change', { velocity: Math.round(velocity * 100) / 100 })
        }
      }

      // Scroll reversal — comprehension failure signal
      if (this.lastScrollDir !== 'none' && dir !== this.lastScrollDir && Math.abs(dy) > 80) {
        this.scrollReversalCount++
        if (this.scrollReversalCount >= 2) {
          this.track('scroll_reversal', { reversals: this.scrollReversalCount })
          this.scrollReversalCount = 0
        }
      }

      this.lastScrollDir = dir
    }

    this.lastScrollY = y
    this.lastScrollTime = now
  }

  private _handleClick(e: Event): void {
    const target = e.target instanceof Element ? e.target : null
    const x = (e as MouseEvent).clientX
    const y = (e as MouseEvent).clientY

    // Click error rate — clicking non-interactive areas
    if (target !== null && !this._isInteractive(target)) {
      this.track('click_error_rate', {})
    }

    // Rage click detection — 3+ clicks in same area within 500ms
    const dist = Math.sqrt(Math.pow(x - this.lastClickX, 2) + Math.pow(y - this.lastClickY, 2))
    if (dist < 30) {
      this.clickCount++
    } else {
      this.clickCount = 1
      this.lastClickX = x
      this.lastClickY = y
    }

    if (this.clickWindowTimer !== null) clearTimeout(this.clickWindowTimer)
    this.clickWindowTimer = setTimeout(() => {
      this.clickCount = 0
    }, 500)

    if (this.clickCount >= 3) {
      this.track('rage_click', { count: this.clickCount })
      this.clickCount = 0
    }
  }

  private _handleFocusIn(e: Event): void {
    const target = e.target instanceof Element ? e.target : null
    if (target === null || !this._isFormField(target)) return
    this.dwellTarget = target
    this.dwellStart = typeof performance !== 'undefined' ? performance.now() : Date.now()
  }

  private _handleFocusOut(e: Event): void {
    const target = e.target instanceof Element ? e.target : null
    if (target === null) return

    // Dwell time on element
    if (this.dwellTarget === target && this.dwellStart > 0) {
      const dwell = Math.round(
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - this.dwellStart,
      )
      if (dwell > 500) {
        this.track('time_on_element', { ms: dwell })
      }
      this.dwellTarget = null
      this.dwellStart = 0
    }
  }

  private _handleInput(e: Event): void {
    const target = e.target instanceof Element ? e.target : null
    if (target === null || !this._isFormField(target)) return

    const count = (this.fieldEditCounts.get(target) ?? 0) + 1
    this.fieldEditCounts.set(target, count)

    if (count >= 3) {
      this.track('field_reentry_count', { edits: count })
    }
  }

  private _handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      this.track('session_abandonment', {})
      this._flush(true)
    }
  }

  private _handleBeforeUnload(): void {
    this.track('session_abandonment', {})
    this._flush(true)
  }

  // ── Batching + transmission ──────────────────────────────────────────────────

  private _scheduleFlush(): void {
    if (this.flushTimer !== null) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this._flush(false)
    }, 500)
  }

  private _flush(useBeacon: boolean): void {
    if (this.queue.length === 0 || this.config === null) return

    const batch = this.queue.splice(0, this.queue.length)
    const payload = JSON.stringify({ events: batch })

    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' })
      const sent = navigator.sendBeacon(this.config.endpoint, blob)
      if (!sent) this._sendWithRetry(payload, 0)
    } else {
      this._sendWithRetry(payload, 0)
    }
  }

  private _sendWithRetry(payload: string, attempt: number): void {
    if (this.config === null) return

    // Re-queue on network outage (navigator.onLine check)
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const events = (JSON.parse(payload) as { events: BehavioralEvent[] }).events
      this.queue.unshift(...events)

      // Flush when network comes back
      window.addEventListener(
        'online',
        () => { this._flush(false) },
        { once: true },
      )
      return
    }

    fetch(this.config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      if (attempt < 3) {
        setTimeout(() => { this._sendWithRetry(payload, attempt + 1) }, 1000 * Math.pow(2, attempt))
      }
    })
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private _isInteractive(el: Element): boolean {
    const tag = el.tagName?.toLowerCase() ?? ''
    if (['a', 'button', 'input', 'select', 'textarea', 'label'].includes(tag)) return true
    if (el.getAttribute('role') === 'button') return true
    if (el.getAttribute('tabindex') !== null) return true
    // Check closest interactive ancestor (within 3 levels for perf)
    let parent = el.parentElement
    for (let i = 0; i < 3 && parent !== null; i++, parent = parent.parentElement) {
      const ptag = parent.tagName.toLowerCase()
      if (['a', 'button'].includes(ptag) || parent.getAttribute('role') === 'button') return true
    }
    return false
  }

  private _isFormField(el: Element): boolean {
    const tag = el.tagName?.toLowerCase() ?? ''
    return ['input', 'textarea', 'select'].includes(tag)
  }
}

// ── Default singleton export ───────────────────────────────────────────────────

export const cognarc = new CognArcSDK()
