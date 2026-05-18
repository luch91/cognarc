import type { CognitiveScoreResponse } from '@cognarc/types'

export interface AnalyticsEvent {
  id: string
  type: string
  userId?: string | undefined
  anonymousId?: string | undefined
  sessionId?: string | undefined
  timestamp: string
  properties: Record<string, unknown>
  source: string
  workspaceId: string
}

export interface EnrichedEvent extends AnalyticsEvent {
  cognitiveScores: CognitiveScoreResponse
  cognitiveLabels: Record<string, string>
}

export interface WriteBackResult {
  success: boolean
  eventsWritten: number
  errors: string[]
}

export interface ConnectorHealth {
  connected: boolean
  lastSyncAt: string | null
  errorCount: number
  lastError: string | null
}

export interface AnalyticsConnector {
  readonly name: string
  connect(credentials: Record<string, string>): Promise<void>
  disconnect(): Promise<void>
  ingestWebhook(payload: unknown): Promise<AnalyticsEvent[]>
  writeBack(events: EnrichedEvent[]): Promise<WriteBackResult>
  testConnection(): Promise<boolean>
  health(): ConnectorHealth
}
