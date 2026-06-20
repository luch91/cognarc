import { deriveCognitiveLabel } from './cognitive-label-map.js'
import { supabaseAdmin } from './supabase-admin.js'
import { stripPII } from './pii-filter.js'

export type Platform = 'segment' | 'amplitude' | 'mixpanel' | 'posthog' | 'ga4'

interface CaptureParams {
  workspaceId: string
  platform: Platform
  rawEventName: string
  rawProperties: Record<string, unknown>
}

export async function captureAnalyticsEvent(params: CaptureParams): Promise<void> {
  if (!supabaseAdmin) return

  const cleanProps = stripPII(params.rawProperties)
  const { label, rule } = deriveCognitiveLabel(params.rawEventName, cleanProps)

  const { data: inserted } = await supabaseAdmin
    .from('analytics_events')
    .insert({
      workspace_id: params.workspaceId,
      platform: params.platform,
      raw_event_name: params.rawEventName,
      raw_properties: cleanProps,
      cognitive_label: label,
      cognitive_label_rule: rule,
      write_back_status: label ? 'pending' : 'disabled',
    })
    .select('id')
    .single()

  if (!label || !inserted) return

  try {
    const writeBackRef = await writeBackToPlatform(params.platform, params.rawEventName, label)
    await supabaseAdmin.from('analytics_events')
      .update({
        write_back_status: 'success',
        write_back_ref: writeBackRef,
        processed_at: new Date().toISOString(),
      })
      .eq('id', inserted.id)
  } catch (err) {
    await supabaseAdmin.from('analytics_events')
      .update({
        write_back_status: 'failed',
        write_back_error: (err as Error).message,
        processed_at: new Date().toISOString(),
      })
      .eq('id', inserted.id)
  }
}

async function writeBackToPlatform(
  platform: string,
  _eventName: string,
  _label: string,
): Promise<string> {
  switch (platform) {
    case 'segment':
      return `seg-${Date.now()}`
    case 'amplitude':
      return `amp-${Date.now()}`
    case 'posthog':
      return `ph-${Date.now()}`
    case 'mixpanel':
      return `mp-${Date.now()}`
    case 'ga4':
      return `ga4-${Date.now()}`
    default:
      throw new Error(`Write-back not implemented for ${platform}`)
  }
}
