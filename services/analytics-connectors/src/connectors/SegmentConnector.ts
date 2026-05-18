import { createHmac, timingSafeEqual } from 'crypto'
import { BaseConnector } from '../BaseConnector.js'
import { withRetry } from '../retry.js'
import type { AnalyticsEvent, EnrichedEvent, WriteBackResult } from '../types.js'

// Segment webhook payload shapes (partial — only fields we use)
interface SegmentTrackPayload {
  messageId?: string
  type?: string
  event?: string
  userId?: string
  anonymousId?: string
  timestamp?: string
  properties?: Record<string, unknown>
  context?: { sessionId?: string }
}

interface SegmentBatchPayload {
  batch?: SegmentTrackPayload[]
}

export class SegmentConnector extends BaseConnector {
  readonly name = 'segment'

  protected async onConnect(): Promise<void> {
    // Validate that required credentials are present
    this.requireCredential('writeKey')
    this.requireCredential('webhookSecret')
  }

  protected async onDisconnect(): Promise<void> {
    // no persistent connection to tear down
  }

  validateSignature(rawBody: string, signatureHeader: string): boolean {
    const secret = this.requireCredential('webhookSecret')
    const expected = createHmac('sha1', secret).update(rawBody).digest('hex')
    const expectedBuf = Buffer.from(`sha1=${expected}`)
    const receivedBuf = Buffer.from(signatureHeader)
    if (expectedBuf.length !== receivedBuf.length) return false
    return timingSafeEqual(expectedBuf, receivedBuf)
  }

  async ingestWebhook(payload: unknown): Promise<AnalyticsEvent[]> {
    const workspaceId = this.requireCredential('workspaceId')
    const events: AnalyticsEvent[] = []

    const extractEvent = (msg: SegmentTrackPayload): AnalyticsEvent => ({
      id: msg.messageId ?? crypto.randomUUID(),
      type: msg.event ?? msg.type ?? 'unknown',
      userId: msg.userId,
      anonymousId: msg.anonymousId,
      sessionId: msg.context?.sessionId,
      timestamp: msg.timestamp ?? new Date().toISOString(),
      properties: msg.properties ?? {},
      source: 'segment',
      workspaceId,
    })

    const batch = payload as SegmentBatchPayload
    if (Array.isArray(batch.batch)) {
      for (const msg of batch.batch) events.push(extractEvent(msg))
    } else {
      events.push(extractEvent(payload as SegmentTrackPayload))
    }

    this.recordSync()
    return events
  }

  async writeBack(events: EnrichedEvent[]): Promise<WriteBackResult> {
    const writeKey = this.requireCredential('writeKey')
    const errors: string[] = []
    let eventsWritten = 0

    for (const event of events) {
      try {
        await withRetry(() =>
          fetch('https://api.segment.io/v1/track', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Basic ${Buffer.from(`${writeKey}:`).toString('base64')}`,
            },
            body: JSON.stringify({
              userId: event.userId ?? event.anonymousId ?? 'anonymous',
              anonymousId: event.anonymousId,
              event: event.type,
              timestamp: event.timestamp,
              properties: {
                ...event.properties,
                cognarc_cognitive_load: event.cognitiveScores.cognitive_load,
                cognarc_comprehension_confidence: event.cognitiveScores.comprehension_confidence,
                cognarc_emotional_valence: event.cognitiveScores.emotional_valence,
                cognarc_trust_coherence: event.cognitiveScores.trust_coherence,
                cognarc_manipulation_risk: event.cognitiveScores.manipulation_risk,
                cognarc_cognitive_risk: event.cognitiveScores.cognitive_risk,
                cognarc_labels: event.cognitiveLabels,
              },
            }),
          }).then(async (res) => {
            if (!res.ok) throw new Error(`Segment write-back HTTP ${res.status}`)
          }),
        )
        eventsWritten++
        this.recordSync()
      } catch (err) {
        this.recordError(err)
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }

    return { success: errors.length === 0, eventsWritten, errors }
  }

  async testConnection(): Promise<boolean> {
    try {
      const writeKey = this.requireCredential('writeKey')
      const res = await fetch('https://api.segment.io/v1/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${writeKey}:`).toString('base64')}`,
        },
        // Minimal valid identify — no actual data sent
        body: JSON.stringify({ userId: 'cognarc-test', type: 'identify', traits: {} }),
      })
      return res.ok
    } catch {
      return false
    }
  }
}
