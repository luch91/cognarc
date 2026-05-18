import { BaseConnector } from '../BaseConnector.js'
import { withRetry } from '../retry.js'
import type { AnalyticsEvent, EnrichedEvent, WriteBackResult } from '../types.js'

interface AmplitudeEvent {
  event_id?: number
  event_type?: string
  user_id?: string
  device_id?: string
  session_id?: number
  time?: number
  event_properties?: Record<string, unknown>
}

interface AmplitudeWebhookPayload {
  events?: AmplitudeEvent[]
}

interface AmplitudeHTTPResponse {
  code: number
  events_ingested?: number
  payload_size_bytes?: number
  server_upload_time?: number
}

export class AmplitudeConnector extends BaseConnector {
  readonly name = 'amplitude'

  protected async onConnect(): Promise<void> {
    this.requireCredential('apiKey')
    this.requireCredential('secretKey')
  }

  protected async onDisconnect(): Promise<void> {}

  async ingestWebhook(payload: unknown): Promise<AnalyticsEvent[]> {
    const workspaceId = this.requireCredential('workspaceId')
    const body = payload as AmplitudeWebhookPayload
    const ampEvents = body.events ?? []

    const events: AnalyticsEvent[] = ampEvents.map((e) => ({
      id: String(e.event_id ?? crypto.randomUUID()),
      type: e.event_type ?? 'unknown',
      userId: e.user_id,
      anonymousId: e.device_id,
      sessionId: e.session_id !== undefined ? String(e.session_id) : undefined,
      timestamp: e.time !== undefined ? new Date(e.time).toISOString() : new Date().toISOString(),
      properties: e.event_properties ?? {},
      source: 'amplitude',
      workspaceId,
    }))

    this.recordSync()
    return events
  }

  async writeBack(events: EnrichedEvent[]): Promise<WriteBackResult> {
    const apiKey = this.requireCredential('apiKey')
    const errors: string[] = []
    let eventsWritten = 0

    // Amplitude HTTP API v2 — batch up to 10 events per request
    const BATCH_SIZE = 10
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE)
      try {
        await withRetry(() =>
          fetch('https://api2.amplitude.com/2/httpapi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              api_key: apiKey,
              events: batch.map((event) => ({
                event_type: event.type,
                user_id: event.userId,
                device_id: event.anonymousId,
                time: new Date(event.timestamp).getTime(),
                event_properties: {
                  ...event.properties,
                  cognarc_cognitive_load: event.cognitiveScores.cognitive_load,
                  cognarc_comprehension_confidence: event.cognitiveScores.comprehension_confidence,
                  cognarc_emotional_valence: event.cognitiveScores.emotional_valence,
                  cognarc_trust_coherence: event.cognitiveScores.trust_coherence,
                  cognarc_manipulation_risk: event.cognitiveScores.manipulation_risk,
                  cognarc_cognitive_risk: event.cognitiveScores.cognitive_risk,
                },
                user_properties: {
                  cognarc_last_cognitive_risk: event.cognitiveScores.cognitive_risk,
                  cognarc_last_manipulation_risk: event.cognitiveScores.manipulation_risk,
                },
              })),
            }),
          }).then(async (res) => {
            const body = (await res.json()) as AmplitudeHTTPResponse
            if (!res.ok || body.code !== 200) {
              throw new Error(`Amplitude write-back HTTP ${res.status}, code ${body.code}`)
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
    try {
      const apiKey = this.requireCredential('apiKey')
      const res = await fetch('https://api2.amplitude.com/2/httpapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, events: [] }),
      })
      // 400 with "Request body missing" is still a valid auth response
      return res.status === 200 || res.status === 400
    } catch {
      return false
    }
  }
}
