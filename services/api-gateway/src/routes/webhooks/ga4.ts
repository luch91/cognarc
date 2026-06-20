import type { Request, Response } from 'express'
import { captureAnalyticsEvent } from '../../lib/capture-analytics-event.js'

export async function ga4Webhook(req: Request, res: Response): Promise<void> {
  const payload = req.body as Record<string, unknown>
  const workspaceId = (req.params.workspaceId ?? req.headers['x-workspace-id'] ?? 'ws-1') as string

  const eventName = (payload.name as string) ?? (payload.event_name as string) ?? 'unknown'
  const properties = (payload.params as Record<string, unknown>)
    ?? (payload.properties as Record<string, unknown>)
    ?? {}

  await captureAnalyticsEvent({
    workspaceId,
    platform: 'ga4',
    rawEventName: eventName,
    rawProperties: properties,
  })

  res.status(200).json({ ok: true })
}
