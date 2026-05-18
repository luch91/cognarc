import { BaseConnector } from '../BaseConnector.js'
import { withRetry } from '../retry.js'
import type { AnalyticsEvent, EnrichedEvent, WriteBackResult } from '../types.js'

interface MixpanelEventPayload {
  event?: string
  properties?: {
    distinct_id?: string
    $insert_id?: string
    time?: number
    $session_id?: string
    [key: string]: unknown
  }
}

export class MixpanelConnector extends BaseConnector {
  readonly name = 'mixpanel'

  protected async onConnect(): Promise<void> {
    this.requireCredential('projectToken')
    this.requireCredential('serviceAccountUsername')
    this.requireCredential('serviceAccountSecret')
  }

  protected async onDisconnect(): Promise<void> {}

  async ingestWebhook(payload: unknown): Promise<AnalyticsEvent[]> {
    const workspaceId = this.requireCredential('workspaceId')
    const rawEvents = Array.isArray(payload) ? (payload as MixpanelEventPayload[]) : [payload as MixpanelEventPayload]

    const events: AnalyticsEvent[] = rawEvents.map((e) => ({
      id: e.properties?.$insert_id ?? crypto.randomUUID(),
      type: e.event ?? 'unknown',
      userId: e.properties?.distinct_id,
      anonymousId: e.properties?.distinct_id,
      sessionId: e.properties?.$session_id !== undefined ? String(e.properties.$session_id) : undefined,
      timestamp: e.properties?.time !== undefined
        ? new Date((e.properties.time as number) * 1000).toISOString()
        : new Date().toISOString(),
      properties: e.properties ?? {},
      source: 'mixpanel',
      workspaceId,
    }))

    this.recordSync()
    return events
  }

  async writeBack(events: EnrichedEvent[]): Promise<WriteBackResult> {
    const projectToken = this.requireCredential('projectToken')
    const username = this.requireCredential('serviceAccountUsername')
    const secret = this.requireCredential('serviceAccountSecret')
    const authHeader = `Basic ${Buffer.from(`${username}:${secret}`).toString('base64')}`

    const errors: string[] = []
    let eventsWritten = 0

    const BATCH_SIZE = 50
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      const batch = events.slice(i, i + BATCH_SIZE)
      try {
        await withRetry(() =>
          fetch('https://api.mixpanel.com/import', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: authHeader,
            },
            body: JSON.stringify(
              batch.map((event) => ({
                event: event.type,
                properties: {
                  token: projectToken,
                  distinct_id: event.userId ?? event.anonymousId ?? 'anonymous',
                  $insert_id: event.id,
                  time: Math.floor(new Date(event.timestamp).getTime() / 1000),
                  ...event.properties,
                  cognarc_cognitive_load: event.cognitiveScores.cognitive_load,
                  cognarc_comprehension_confidence: event.cognitiveScores.comprehension_confidence,
                  cognarc_emotional_valence: event.cognitiveScores.emotional_valence,
                  cognarc_trust_coherence: event.cognitiveScores.trust_coherence,
                  cognarc_manipulation_risk: event.cognitiveScores.manipulation_risk,
                  cognarc_cognitive_risk: event.cognitiveScores.cognitive_risk,
                  cognarc_labels: JSON.stringify(event.cognitiveLabels),
                },
              })),
            ),
          }).then(async (res) => {
            if (!res.ok) throw new Error(`Mixpanel write-back HTTP ${res.status}`)
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
      const username = this.requireCredential('serviceAccountUsername')
      const secret = this.requireCredential('serviceAccountSecret')
      const authHeader = `Basic ${Buffer.from(`${username}:${secret}`).toString('base64')}`
      // Import endpoint with empty array — 400 means auth worked, credentials valid
      const res = await fetch('https://api.mixpanel.com/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify([]),
      })
      return res.status !== 401 && res.status !== 403
    } catch {
      return false
    }
  }
}
