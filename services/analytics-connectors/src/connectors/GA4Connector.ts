import { BaseConnector } from '../BaseConnector.js'
import { withRetry } from '../retry.js'
import type { AnalyticsEvent, EnrichedEvent, WriteBackResult } from '../types.js'

// GA4 is write-back only (Measurement Protocol v2)
// Ingest is not supported — GA4 does not offer a webhook push model

export class GA4Connector extends BaseConnector {
  readonly name = 'ga4'

  protected async onConnect(): Promise<void> {
    this.requireCredential('measurementId')
    this.requireCredential('apiSecret')
  }

  protected async onDisconnect(): Promise<void> {}

  // GA4 does not push events — ingest always returns empty
  async ingestWebhook(_payload: unknown): Promise<AnalyticsEvent[]> {
    return []
  }

  async writeBack(events: EnrichedEvent[]): Promise<WriteBackResult> {
    const measurementId = this.requireCredential('measurementId')
    const apiSecret = this.requireCredential('apiSecret')
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`

    const errors: string[] = []
    let eventsWritten = 0

    // GA4 Measurement Protocol: max 25 events per request, max 25 params per event
    const BATCH_SIZE = 25
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE)
      try {
        await withRetry(() =>
          fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: batch[0]?.userId ?? batch[0]?.anonymousId ?? 'anonymous',
              events: batch.map((event) => ({
                name: event.type.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40),
                params: {
                  // GA4 custom params: max 25, values must be string|number
                  cognarc_cognitive_load: event.cognitiveScores.cognitive_load,
                  cognarc_comprehension: event.cognitiveScores.comprehension_confidence,
                  cognarc_valence: event.cognitiveScores.emotional_valence,
                  cognarc_trust: event.cognitiveScores.trust_coherence,
                  cognarc_manip_risk: event.cognitiveScores.manipulation_risk,
                  cognarc_risk_level: event.cognitiveScores.cognitive_risk,
                  engagement_time_msec: 1,
                },
              })),
            }),
          }).then(async (res) => {
            // GA4 returns 204 on success; 400 for validation errors
            if (res.status !== 204 && res.status !== 200) {
              const body = await res.text()
              throw new Error(`GA4 write-back HTTP ${res.status}: ${body}`)
            }
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
    const measurementId = this.requireCredential('measurementId')
    const apiSecret = this.requireCredential('apiSecret')
    try {
      // GA4 validation endpoint — returns validation messages without recording data
      const res = await fetch(
        `https://www.google-analytics.com/debug/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: 'cognarc-test',
            events: [{ name: 'cognarc_test', params: {} }],
          }),
        },
      )
      return res.ok
    } catch {
      return false
    }
  }
}
