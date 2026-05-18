import { createHmac, timingSafeEqual } from 'crypto'
import { BaseConnector } from '../BaseConnector.js'
import { withRetry } from '../retry.js'
import type { AnalyticsEvent, EnrichedEvent, WriteBackResult } from '../types.js'

interface PostHogWebhookPayload {
  event?: string
  distinct_id?: string
  uuid?: string
  timestamp?: string
  properties?: Record<string, unknown>
}

export class PostHogConnector extends BaseConnector {
  readonly name = 'posthog'

  // PostHog supports self-hosted; default to cloud
  private get apiHost(): string {
    return this.credentials['apiHost'] ?? 'https://app.posthog.com'
  }

  protected async onConnect(): Promise<void> {
    this.requireCredential('apiKey')
    // webhookSecret is optional (PostHog does not mandate signatures on all plans)
  }

  protected async onDisconnect(): Promise<void> {}

  validateSignature(rawBody: string, signatureHeader: string): boolean {
    const secret = this.credentials['webhookSecret']
    if (secret === undefined || secret === '') return true  // signature check disabled
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    const expectedBuf = Buffer.from(expected)
    const receivedBuf = Buffer.from(signatureHeader)
    if (expectedBuf.length !== receivedBuf.length) return false
    return timingSafeEqual(expectedBuf, receivedBuf)
  }

  async ingestWebhook(payload: unknown): Promise<AnalyticsEvent[]> {
    const workspaceId = this.requireCredential('workspaceId')
    const rawEvents = Array.isArray(payload) ? (payload as PostHogWebhookPayload[]) : [payload as PostHogWebhookPayload]

    const events: AnalyticsEvent[] = rawEvents.map((e) => ({
      id: e.uuid ?? crypto.randomUUID(),
      type: e.event ?? 'unknown',
      userId: e.distinct_id,
      anonymousId: e.distinct_id,
      timestamp: e.timestamp ?? new Date().toISOString(),
      properties: e.properties ?? {},
      source: 'posthog',
      workspaceId,
    }))

    this.recordSync()
    return events
  }

  async writeBack(events: EnrichedEvent[]): Promise<WriteBackResult> {
    const apiKey = this.requireCredential('apiKey')
    const errors: string[] = []
    let eventsWritten = 0

    // PostHog Capture API — batch endpoint
    const BATCH_SIZE = 50
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE)
      try {
        await withRetry(() =>
          fetch(`${this.apiHost}/batch/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: apiKey,
              batch: batch.map((event) => ({
                event: `${event.type}_enriched`,
                distinct_id: event.userId ?? event.anonymousId ?? 'anonymous',
                timestamp: event.timestamp,
                properties: {
                  ...event.properties,
                  $cognarc_original_event: event.type,
                  $cognarc_cognitive_load: event.cognitiveScores.cognitive_load,
                  $cognarc_comprehension_confidence: event.cognitiveScores.comprehension_confidence,
                  $cognarc_emotional_valence: event.cognitiveScores.emotional_valence,
                  $cognarc_trust_coherence: event.cognitiveScores.trust_coherence,
                  $cognarc_manipulation_risk: event.cognitiveScores.manipulation_risk,
                  $cognarc_cognitive_risk: event.cognitiveScores.cognitive_risk,
                  $cognarc_labels: event.cognitiveLabels,
                },
              })),
            }),
          }).then(async (res) => {
            if (!res.ok) throw new Error(`PostHog write-back HTTP ${res.status}`)
          }),
        )
        eventsWritten += batch.length
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
      const apiKey = this.requireCredential('apiKey')
      const res = await fetch(`${this.apiHost}/decide/?v=3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, distinct_id: 'cognarc-test' }),
      })
      return res.ok
    } catch {
      return false
    }
  }
}
