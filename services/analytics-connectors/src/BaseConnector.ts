import type { AnalyticsConnector, AnalyticsEvent, ConnectorHealth, EnrichedEvent, WriteBackResult } from './types.js'

export abstract class BaseConnector implements AnalyticsConnector {
  abstract readonly name: string

  protected credentials: Record<string, string> = {}
  protected _connected = false

  private _lastSyncAt: string | null = null
  private _errorCount = 0
  private _lastError: string | null = null

  async connect(credentials: Record<string, string>): Promise<void> {
    this.credentials = credentials
    await this.onConnect()
    this._connected = true
  }

  async disconnect(): Promise<void> {
    await this.onDisconnect()
    this._connected = false
    this.credentials = {}
  }

  abstract ingestWebhook(payload: unknown): Promise<AnalyticsEvent[]>
  abstract writeBack(events: EnrichedEvent[]): Promise<WriteBackResult>
  abstract testConnection(): Promise<boolean>

  protected abstract onConnect(): Promise<void>
  protected abstract onDisconnect(): Promise<void>

  health(): ConnectorHealth {
    return {
      connected: this._connected,
      lastSyncAt: this._lastSyncAt,
      errorCount: this._errorCount,
      lastError: this._lastError,
    }
  }

  protected recordSync(): void {
    this._lastSyncAt = new Date().toISOString()
  }

  protected recordError(err: unknown): void {
    this._errorCount++
    this._lastError = err instanceof Error ? err.message : String(err)
  }

  protected requireCredential(key: string): string {
    const value = this.credentials[key]
    if (value === undefined || value === '') {
      throw new Error(`Missing required credential: ${key} for connector ${this.name}`)
    }
    return value
  }
}
