import type { CognitiveScoreRequest, CognitiveScoreResponse } from '@cognarc/types'
import { COGNITIVE_LABELS } from './cognitiveLabels.js'
import type { AnalyticsConnector, AnalyticsEvent, ConnectorHealth, EnrichedEvent } from './types.js'

export interface ManagerHealth {
  [connectorName: string]: ConnectorHealth
}

export class ConnectorManager {
  private connectors = new Map<string, AnalyticsConnector>()
  private scoringEndpoint: string

  constructor(scoringEndpoint: string) {
    this.scoringEndpoint = scoringEndpoint
  }

  register(connector: AnalyticsConnector): void {
    this.connectors.set(connector.name, connector)
  }

  get(name: string): AnalyticsConnector | undefined {
    return this.connectors.get(name)
  }

  // Route incoming events through cognitive scoring, then write back enriched events
  async processEvents(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return

    const enriched: EnrichedEvent[] = []

    for (const event of events) {
      try {
        const scores = await this.scoreEvent(event)
        const labels: Record<string, string> = {}
        if (scores.cognitive_risk === 'HIGH') labels['cognitive_risk'] = 'high_cognitive_load'
        if (scores.manipulation_risk > 70) labels['manipulation_risk'] = 'elevated_manipulation_signal'
        if (scores.comprehension_confidence < 40) labels['comprehension'] = 'comprehension_failure'

        // Map to semantic COGNITIVE_LABELS where applicable
        const semanticLabel = COGNITIVE_LABELS[event.type]
        if (semanticLabel !== undefined) labels['semantic'] = semanticLabel

        enriched.push({ ...event, cognitiveScores: scores, cognitiveLabels: labels })
      } catch {
        // Scoring failure must not block event processing
      }
    }

    if (enriched.length === 0) return

    // Dispatch write-back to all connectors for this workspace — failures are isolated
    const writeBackPromises = Array.from(this.connectors.values()).map((connector) =>
      connector.writeBack(enriched).catch(() => {
        // Write-back failure never propagates — by design
      }),
    )
    await Promise.allSettled(writeBackPromises)
  }

  health(): ManagerHealth {
    const result: ManagerHealth = {}
    for (const [name, connector] of this.connectors) {
      result[name] = connector.health()
    }
    return result
  }

  // Route events through cognitive-scoring service (POST /score)
  private async scoreEvent(event: AnalyticsEvent): Promise<CognitiveScoreResponse> {
    const text = event.type + (event.properties['page_title'] !== undefined ? ` ${String(event.properties['page_title'])}` : '')
    const req: CognitiveScoreRequest = {
      stimulus_type: 'text',
      content: text,
      workspace_id: event.workspaceId,
    }

    const res = await fetch(`${this.scoringEndpoint}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })

    if (!res.ok) throw new Error(`Cognitive scoring HTTP ${res.status}`)
    return res.json() as Promise<CognitiveScoreResponse>
  }
}
