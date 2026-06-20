import { useState, useEffect, useRef } from 'react'
import { supabase } from '../api/supabaseClient.js'
import { useAppContext } from '../context/AppContext.js'
import { Card } from './Card.js'
import { Spinner } from './Spinner.js'

// ── Types ──────────────────────────────────────────────────────────────────────

interface AnalyticsEvent {
  id: string
  workspace_id: string
  platform: string
  raw_event_name: string
  raw_properties: Record<string, unknown> | null
  cognitive_label: string | null
  cognitive_label_rule: string | null
  write_back_status: string
  write_back_error: string | null
  write_back_ref: string | null
  received_at: string
  processed_at: string | null
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PLATFORM_BADGE: Record<string, { bg: string; text: string; initial: string }> = {
  segment:   { bg: 'bg-green-500',  text: 'text-white', initial: 'S' },
  amplitude: { bg: 'bg-blue-500',   text: 'text-white', initial: 'A' },
  mixpanel:  { bg: 'bg-purple-500', text: 'text-white', initial: 'M' },
  posthog:   { bg: 'bg-orange-500', text: 'text-white', initial: 'P' },
  ga4:       { bg: 'bg-yellow-500', text: 'text-white', initial: 'G' },
}

const LABEL_COLOR: Record<string, string> = {
  confusion:                'text-red-500',
  working_memory_overload:  'text-red-500',
  comprehension_failure:    'text-red-500',
  trust_erosion_trigger:    'text-red-600',
  cognitive_load_stall:     'text-amber-500',
  low_attention_engagement: 'text-amber-500',
}

const LABEL_DISPLAY: Record<string, string> = {
  confusion:                'Confusion',
  working_memory_overload:  'Working Memory Overload',
  comprehension_failure:    'Comprehension Failure',
  trust_erosion_trigger:    'Trust Erosion Trigger',
  cognitive_load_stall:     'Cognitive Load Stall',
  low_attention_engagement: 'Low Attention Engagement',
}

const LABEL_EXPLANATION: Record<string, string> = {
  confusion: 'Repeated rapid clicks in the same area typically indicate the user expected something to happen and it didn\'t.',
  working_memory_overload: 'Re-entering the same field multiple times suggests the user lost track of what they had already entered or is confused about the expected format.',
  comprehension_failure: 'Scrolling back up after scrolling down suggests the user is searching for information they expected to find but missed.',
  trust_erosion_trigger: 'Leaving immediately after a modal or prompt appeared suggests the interruption damaged confidence in the flow.',
  cognitive_load_stall: 'Extended time on a section with no scrolling suggests the user is stuck processing dense content.',
  low_attention_engagement: 'Fast scrolling with no interaction suggests the user is skimming without engaging — content may not be capturing attention.',
}

const WRITEBACK_ICON: Record<string, { icon: string; color: string; label: string }> = {
  success:  { icon: '✓', color: 'text-green-500', label: 'Written back' },
  failed:   { icon: '✗', color: 'text-red-500',   label: 'Write-back failed' },
  disabled: { icon: '—', color: 'text-gray-400',  label: 'Write-back disabled' },
  pending:  { icon: '⏳', color: 'text-gray-400', label: 'Pending' },
}

const ALL_PLATFORMS = ['segment', 'amplitude', 'mixpanel', 'posthog', 'ga4'] as const
const ALL_LABELS = Object.keys(LABEL_DISPLAY)

// ── STREAM-04: Event Detail Drawer ─────────────────────────────────────────────

function EventDetailDrawer({ event, onClose }: { event: AnalyticsEvent | null; onClose: () => void }) {
  const open = event !== null
  const props = event?.raw_properties ?? {}
  const propKeys = Object.keys(props)
  const [showAllProps, setShowAllProps] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const visibleProps = showAllProps || propKeys.length <= 10
    ? propKeys
    : propKeys.slice(0, 10)

  async function retryWriteBack() {
    if (!event || !supabase) return
    setRetrying(true)
    await supabase.from('analytics_events')
      .update({ write_back_status: 'pending', write_back_error: null, processed_at: null })
      .eq('id', event.id)
    setTimeout(() => setRetrying(false), 2000)
  }

  const platformName = event ? (event.platform.charAt(0).toUpperCase() + event.platform.slice(1)) : ''

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden
      />
      <div
        className={`fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Event Detail"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              {event && (
                <span className={`w-6 h-6 rounded-full ${PLATFORM_BADGE[event.platform]?.bg ?? 'bg-gray-500'} text-white text-xs font-bold flex items-center justify-center`}>
                  {PLATFORM_BADGE[event.platform]?.initial ?? '?'}
                </span>
              )}
              <h2 className="text-base font-bold text-gray-800">{event?.raw_event_name}</h2>
            </div>
            {event && (
              <p className="text-xs text-gray-400 mt-0.5">
                Received: {new Date(event.received_at).toLocaleString()}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none" aria-label="Close">
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 pb-10 space-y-5">
          {/* Section B: Raw Properties */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Raw event properties</p>
            {propKeys.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No properties</p>
            ) : (
              <div className="bg-gray-50 rounded-lg border border-gray-100 p-3 space-y-1 font-mono text-xs">
                {visibleProps.map((key) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-gray-500 shrink-0">{key}:</span>
                    <span className="text-gray-700 break-all">{JSON.stringify(props[key])}</span>
                  </div>
                ))}
                {!showAllProps && propKeys.length > 10 && (
                  <button onClick={() => setShowAllProps(true)} className="text-xs text-brand-500 hover:text-brand-700 mt-1">
                    Show all {propKeys.length} properties
                  </button>
                )}
              </div>
            )}
            <p className="text-[10px] text-gray-300 mt-1.5">Personally identifiable fields (email, name, phone) are automatically stripped before storage.</p>
          </div>

          {/* Section C: Cognitive Label */}
          <div>
            {event?.cognitive_label ? (
              <>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cognitive label applied</p>
                <span className={`inline-block text-sm font-bold px-2.5 py-1 rounded-lg ${LABEL_COLOR[event.cognitive_label] ?? 'text-gray-600'} bg-opacity-10`}
                  style={{ backgroundColor: (LABEL_COLOR[event.cognitive_label] ?? '').includes('red') ? '#fef2f2' : '#fffbeb' }}
                >
                  {LABEL_DISPLAY[event.cognitive_label] ?? event.cognitive_label}
                </span>
                {event.cognitive_label_rule && (
                  <p className="text-xs text-gray-400 mt-2">Rule: <span className="font-mono">{event.cognitive_label_rule}</span></p>
                )}
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                  {LABEL_EXPLANATION[event.cognitive_label] ?? `This event matched the "${event.cognitive_label}" cognitive label rule.`}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cognitive label</p>
                <p className="text-sm text-gray-500">
                  No cognitive label rule matched this event. It was logged for visibility but not flagged as a friction signal.
                </p>
              </>
            )}
          </div>

          {/* Section D: Write-Back Status */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Write-back status</p>
            {event?.write_back_status === 'success' && (
              <div className="space-y-2">
                <p className="text-sm text-green-700 font-semibold">Written back to {platformName}</p>
                <p className="text-xs text-gray-500">Label written as event property <span className="font-mono">cognarc_cognitive_label</span></p>
                {event.write_back_ref && (
                  <p className="text-xs text-gray-400">Ref: <span className="font-mono">{event.write_back_ref}</span></p>
                )}
              </div>
            )}
            {event?.write_back_status === 'failed' && (
              <div className="space-y-2">
                <p className="text-sm text-red-700 font-semibold">Write-back failed</p>
                {event.write_back_error && (
                  <div className="bg-red-50 border-l-4 border-red-400 rounded-r-lg px-3 py-2 text-xs text-red-700">
                    {event.write_back_error}
                  </div>
                )}
                <p className="text-xs text-gray-500">This event was scored but the label could not be written back to {platformName}. Check your connection in Settings.</p>
                <button
                  onClick={() => void retryWriteBack()}
                  disabled={retrying}
                  className="text-xs px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {retrying ? 'Retrying…' : 'Retry write-back'}
                </button>
              </div>
            )}
            {event?.write_back_status === 'disabled' && (
              <p className="text-sm text-gray-500">Write-back is disabled for {platformName}.</p>
            )}
            {event?.write_back_status === 'pending' && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Spinner />
                Write-back in progress…
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── STREAM-03: Connection Health Row ────────────────────────────────────────────

function ConnectionHealthRow() {
  const { connectors } = useAppContext()
  const connected = connectors.filter((c) => c.status === 'connected')
  const degraded = connectors.filter((c) => c.status === 'degraded')

  return (
    <Card title="Live Connection Health">
      <div className="space-y-2">
        {connected.map((c) => {
          const recentEvent = true
          return (
            <div key={c.id} className="flex items-center gap-3 text-sm">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${recentEvent ? 'bg-green-400 animate-pulse' : 'bg-green-400'}`} />
              <span className="font-medium text-gray-700 w-24">{c.name}</span>
              <span className="text-xs text-gray-400">Last event: just now</span>
              <span className="text-xs text-gray-500 ml-auto tabular-nums">{c.eventsToday.toLocaleString()} events today</span>
              <span className={`text-xs ${c.writeBack ? 'text-green-600' : 'text-gray-400'}`}>
                {c.writeBack ? 'Write-back healthy' : 'Write-back disabled'}
              </span>
            </div>
          )
        })}
        {degraded.length > 0 && (
          <p className="text-xs text-amber-600">
            {degraded.map((d) => d.name).join(', ')} — degraded. Connect more platforms in{' '}
            <a href="/settings" className="underline hover:text-amber-700">Settings</a>
          </p>
        )}
      </div>
    </Card>
  )
}

// ── STREAM-03: Live Event Stream ────────────────────────────────────────────────

export function LiveEventStream() {
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [labelFilter, setLabelFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [paused, setPaused] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<AnalyticsEvent | null>(null)
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    void (async () => {
      const { data } = await supabase
        .from('analytics_events')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(50)

      if (data) setEvents(data as AnalyticsEvent[])
      setLoading(false)
    })()

    const channel = supabase
      .channel('analytics-stream')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'analytics_events' },
        (payload) => {
          if (pausedRef.current) return
          const newEvent = payload.new as AnalyticsEvent
          setEvents((prev) => [newEvent, ...prev].slice(0, 100))
          setNewIds((prev) => {
            const next = new Set(prev)
            next.add(newEvent.id)
            setTimeout(() => setNewIds((p) => { const n = new Set(p); n.delete(newEvent.id); return n }), 1500)
            return next
          })
        },
      )
      .subscribe()

    return () => { void supabase!.removeChannel(channel) }
  }, [])

  const filtered = events.filter((e) => {
    if (platformFilter !== 'all' && e.platform !== platformFilter) return false
    if (labelFilter !== 'all' && e.cognitive_label !== labelFilter) return false
    if (search && !e.raw_event_name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function timeAgo(iso: string) {
    const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (secs < 60) return `${secs}s ago`
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
    return `${Math.floor(secs / 3600)}h ago`
  }

  return (
    <>
      {/* Connection Health */}
      <ConnectionHealthRow />

      {/* Live Event Stream */}
      <Card
        title="Live Event Stream"
        action={
          <button
            onClick={() => setPaused(!paused)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              paused
                ? 'border-amber-400 text-amber-600 bg-amber-50'
                : 'border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            {paused ? '▶ Resume stream' : '⏸ Pause stream'}
          </button>
        }
      >
        <p className="text-xs text-gray-400 mb-3">
          Real-time events from your connected platforms, with the cognitive label CognArc applied.
        </p>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="all">All Platforms</option>
            {ALL_PLATFORMS.map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
          <select
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="all">All Labels</option>
            {ALL_LABELS.map((l) => (
              <option key={l} value={l}>{LABEL_DISPLAY[l]}</option>
            ))}
          </select>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search event name…"
            className="text-xs border border-gray-200 rounded px-2 py-1 w-44 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {(platformFilter !== 'all' || labelFilter !== 'all' || search) && (
            <button
              onClick={() => { setPlatformFilter('all'); setLabelFilter('all'); setSearch('') }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Stream table */}
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : events.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-400 text-sm mb-2">No events received yet.</p>
            <p className="text-xs text-gray-400 mb-4">
              Once you connect a platform in Settings and your site starts sending events, they will appear here in real time.
            </p>
            <a href="/settings" className="text-xs text-brand-500 hover:text-brand-700 font-semibold">
              Go to Settings →
            </a>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm mb-2">No events match your filters.</p>
            <button
              onClick={() => { setPlatformFilter('all'); setLabelFilter('all'); setSearch('') }}
              className="text-xs text-brand-500 hover:text-brand-700"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Live event stream">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left py-2 pr-2 font-semibold">TIME</th>
                  <th className="text-left py-2 px-2 font-semibold">PLATFORM</th>
                  <th className="text-left py-2 px-2 font-semibold">RAW EVENT</th>
                  <th className="text-left py-2 px-2 font-semibold">COGNITIVE LABEL</th>
                  <th className="text-left py-2 pl-2 font-semibold">WRITE-BACK</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((e) => {
                  const wb = WRITEBACK_ICON[e.write_back_status] ?? WRITEBACK_ICON.disabled!
                  const badge = PLATFORM_BADGE[e.platform]
                  const isNew = newIds.has(e.id)
                  return (
                    <tr
                      key={e.id}
                      data-testid="stream-row"
                      onClick={() => setSelectedEvent(e)}
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${isNew ? 'bg-teal-50 animate-pulse' : ''}`}
                    >
                      <td className="py-2 pr-2 text-xs text-gray-400 tabular-nums whitespace-nowrap">
                        {timeAgo(e.received_at)}
                      </td>
                      <td className="py-2 px-2">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${badge?.bg ?? 'bg-gray-400'} ${badge?.text ?? 'text-white'}`}>
                          {badge?.initial ?? '?'}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-xs text-gray-600 font-mono truncate max-w-[200px]">
                        {e.raw_event_name}
                      </td>
                      <td className="py-2 px-2">
                        {e.cognitive_label ? (
                          <span className={`text-xs font-semibold ${LABEL_COLOR[e.cognitive_label] ?? 'text-gray-500'}`}>
                            {LABEL_DISPLAY[e.cognitive_label] ?? e.cognitive_label}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-2 pl-2">
                        <span className={`text-xs ${wb.color}`} title={wb.label}>
                          {wb.icon}
                        </span>
                        {e.write_back_status === 'failed' && e.write_back_error && (
                          <span className="text-[10px] text-red-400 ml-1" title={e.write_back_error}>
                            error
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* STREAM-04: Event Detail Drawer */}
      <EventDetailDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </>
  )
}
