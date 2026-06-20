import { useState, useEffect, useCallback, Fragment } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase } from '../api/supabaseClient.js'
import { rewrite } from '../api/rewriteApi.js'
import type { RewriteResponse } from '../api/rewriteApi.js'
import { Spinner } from './Spinner.js'

const WORKSPACE_ID = 'ws-1'

// ── Types ──────────────────────────────────────────────────────────────────────

interface StepDef {
  id?: string
  name: string
  matchType: 'route' | 'manual'
  matchValue: string
  copyText: string
}

interface StepRow {
  id: string
  name: string
  step_order: number
  match_type: string
  match_value: string | null
  copy_text: string | null
  agg: StepAggregate | null
}

interface StepAggregate {
  cognitive_load: number | null
  comprehension: number | null
  drop_off_pct: number | null
  sessions_entered: number
  sessions_completed: number
  rage_click_count: number
  field_reentry_count: number
  scroll_reversal_count: number
  abandonment_count: number
  warnings: string[]
  computed_at: string | null
}

interface RawEvent {
  id: string
  event_type: string
  cognitive_label: string
  occurred_at: string
}

// ── Warning badge mapping ──────────────────────────────────────────────────────

const WARNING_BADGES: Record<string, { label: string; bg: string }> = {
  trust_timing: { label: 'Trust Timing', bg: 'bg-orange-500' },
  comprehension_gap: { label: 'Comprehension Gap', bg: 'bg-amber-500' },
  choice_overload: { label: 'Choice Overload', bg: 'bg-red-500' },
}

const FRICTION_COLORS: Record<string, string> = {
  'Rage clicks': '#ef4444',
  'Field re-entry': '#f59e0b',
  'Scroll reversal': '#6366f1',
  'Abandonment': '#64748b',
}

// ── Aggregation logic (FLOW-04 Part 1) ─────────────────────────────────────────

async function countEvents(stepId: string, eventType: string): Promise<number> {
  if (!supabase) return 0
  const { count } = await supabase
    .from('behavioral_events')
    .select('*', { count: 'exact', head: true })
    .eq('step_id', stepId)
    .eq('event_type', eventType)
  return count ?? 0
}

async function aggregateStep(
  stepId: string,
  workspaceId: string,
  stepName: string,
  stepOrder: number,
  copyText: string | null,
): Promise<void> {
  if (!supabase) return

  const entered = await countEvents(stepId, 'step_entered')
  const completed = await countEvents(stepId, 'step_completed')
  const dropOffPct = entered > 0
    ? Math.round(((entered - completed) / entered) * 100)
    : null

  const rageClicks = await countEvents(stepId, 'rage_click')
  const fieldReentry = await countEvents(stepId, 'field_reentry_count')
  const scrollRev = await countEvents(stepId, 'scroll_reversal')
  const abandonment = await countEvents(stepId, 'session_abandonment')

  const sessionsAtStep = Math.max(entered, 1)
  const frictionDensity = (rageClicks + fieldReentry + scrollRev) / sessionsAtStep
  const cognitiveLoad = Math.min(95, 30 + frictionDensity * 15)
  const comprehension = Math.max(20, 90 - frictionDensity * 12)

  const warnings: string[] = []
  if (stepOrder <= 2 && abandonment > 0 && /profile|connect|sign.?up|email|payment/i.test(stepName)) {
    warnings.push('trust_timing')
  }
  if (comprehension < 55) warnings.push('comprehension_gap')
  if (cognitiveLoad > 83) warnings.push('choice_overload')

  await supabase.from('step_aggregates').upsert({
    step_id: stepId,
    workspace_id: workspaceId,
    sessions_entered: entered,
    sessions_completed: completed,
    drop_off_pct: dropOffPct,
    cognitive_load: Math.round(cognitiveLoad),
    comprehension: Math.round(comprehension),
    rage_click_count: rageClicks,
    field_reentry_count: fieldReentry,
    scroll_reversal_count: scrollRev,
    abandonment_count: abandonment,
    warnings,
    computed_at: new Date().toISOString(),
  }, { onConflict: 'step_id' })
}

// ── Demo data seeder (FLOW-04 Part 3) ──────────────────────────────────────────

const DEMO_STEPS = [
  { name: 'Welcome',     order: 1, sessions: 1000, completionRate: 0.96, matchValue: '/welcome' },
  { name: 'Profile',     order: 2, sessions: 960,  completionRate: 0.92, matchValue: '/profile' },
  { name: 'Connect SDK', order: 3, sessions: 883,  completionRate: 0.78, matchValue: '/connect' },
  { name: 'Configure',   order: 4, sessions: 689,  completionRate: 0.61, matchValue: '/configure' },
  { name: 'First Score', order: 5, sessions: 420,  completionRate: 0.90, matchValue: '/first-score' },
  { name: 'Complete',    order: 6, sessions: 378,  completionRate: 1.0,  matchValue: '/complete' },
]

async function seedDemoData(workspaceId: string): Promise<void> {
  if (!supabase) return

  const { data: existingFlow } = await supabase
    .from('onboarding_flows')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .maybeSingle()

  if (existingFlow) {
    await supabase.from('behavioral_events').delete().eq('workspace_id', workspaceId)
    await supabase.from('step_aggregates').delete().eq('workspace_id', workspaceId)
    await supabase.from('onboarding_steps').delete().eq('flow_id', existingFlow.id)
    await supabase.from('onboarding_flows').delete().eq('id', existingFlow.id)
  }

  const { data: flow } = await supabase
    .from('onboarding_flows')
    .insert({ workspace_id: workspaceId, name: 'Default Onboarding', is_active: true })
    .select('id')
    .single()

  if (!flow) return

  for (const s of DEMO_STEPS) {
    const { data: step } = await supabase
      .from('onboarding_steps')
      .insert({
        flow_id: flow.id,
        workspace_id: workspaceId,
        name: s.name,
        step_order: s.order,
        match_type: 'route',
        match_value: s.matchValue,
      })
      .select('id')
      .single()

    if (!step) continue

    const entered = s.sessions
    const completed = Math.round(entered * s.completionRate)
    const frictionRate = 1 - s.completionRate

    const events: Array<{
      workspace_id: string
      step_id: string
      session_id: string
      event_type: string
      cognitive_label: string
      metadata: Record<string, unknown> | null
      occurred_at: string
    }> = []

    const makeEvents = (type: string, label: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const daysAgo = Math.floor(Math.random() * 7)
        const d = new Date()
        d.setDate(d.getDate() - daysAgo)
        d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60))
        events.push({
          workspace_id: workspaceId,
          step_id: step.id,
          session_id: `demo-${s.order}-${i}`,
          event_type: type,
          cognitive_label: label,
          metadata: null,
          occurred_at: d.toISOString(),
        })
      }
    }

    makeEvents('step_entered', 'navigation', entered)
    makeEvents('step_completed', 'navigation', completed)
    makeEvents('rage_click', 'confusion', Math.round(entered * frictionRate * 0.3))
    makeEvents('field_reentry_count', 'working_memory_overload', Math.round(entered * frictionRate * 0.4))
    makeEvents('scroll_reversal', 'comprehension_failure', Math.round(entered * frictionRate * 0.2))
    makeEvents('session_abandonment', 'trust_erosion_trigger', entered - completed)

    const BATCH_SIZE = 500
    for (let i = 0; i < events.length; i += BATCH_SIZE) {
      await supabase.from('behavioral_events').insert(events.slice(i, i + BATCH_SIZE))
    }

    await aggregateStep(step.id, workspaceId, s.name, s.order, null)
  }
}

// ── Step Detail Panel (FLOW-05) ────────────────────────────────────────────────

function StepDetailPanel({
  row,
  totalSteps,
  onRefreshStep,
  onEditFlow,
}: {
  row: StepRow
  totalSteps: number
  onRefreshStep: (r: StepRow) => Promise<void>
  onEditFlow: () => void
}) {
  const a = row.agg
  const [showRawEvents, setShowRawEvents] = useState(false)
  const [rawEvents, setRawEvents] = useState<RawEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [refreshingStep, setRefreshingStep] = useState(false)
  const [rewriteResult, setRewriteResult] = useState<RewriteResponse | null>(null)
  const [rewriteLoading, setRewriteLoading] = useState(false)

  async function loadRawEvents() {
    if (!supabase) return
    setLoadingEvents(true)
    const { data } = await supabase
      .from('behavioral_events')
      .select('id, event_type, cognitive_label, occurred_at')
      .eq('step_id', row.id)
      .order('occurred_at', { ascending: false })
      .limit(50)
    setRawEvents((data as RawEvent[] | null) ?? [])
    setLoadingEvents(false)
    setShowRawEvents(true)
  }

  async function handleRefreshStep() {
    setRefreshingStep(true)
    await onRefreshStep(row)
    setRefreshingStep(false)
  }

  async function handleGetRewrites() {
    if (!row.copy_text) return
    setRewriteLoading(true)
    try {
      const res = await rewrite({
        originalText: row.copy_text,
        copyType: 'microcopy',
        scores: {
          cognitiveLoad: a?.cognitive_load ?? 50,
          comprehensionConfidence: a?.comprehension ?? 50,
          emotionalValence: 50,
          trustCoherence: 70,
          manipulationRisk: 20,
          cognitiveRisk: (a?.cognitive_load ?? 50) > 70 ? 'HIGH' : (a?.cognitive_load ?? 50) > 50 ? 'MEDIUM' : 'LOW',
        },
        workspaceId: WORKSPACE_ID,
      })
      setRewriteResult(res)
    } catch {
      // Silently fail
    }
    setRewriteLoading(false)
  }

  const entered = a?.sessions_entered ?? 0
  const completed = a?.sessions_completed ?? 0
  const fillPct = entered > 0 ? Math.round((completed / entered) * 100) : 0
  const warnings = a?.warnings ?? []

  const frictionData = [
    { name: 'Rage clicks', count: a?.rage_click_count ?? 0 },
    { name: 'Field re-entry', count: a?.field_reentry_count ?? 0 },
    { name: 'Scroll reversal', count: a?.scroll_reversal_count ?? 0 },
    { name: 'Abandonment', count: a?.abandonment_count ?? 0 },
  ]

  return (
    <div data-testid="onboarding-step-detail" className="bg-gray-50/50 border-t border-gray-100 p-4 space-y-5">
      {/* SECTION A: Funnel visual */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Session Funnel</p>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-600 font-semibold">{entered} sessions entered</span>
          <span className="text-gray-300">&rarr;</span>
          <span className="text-gray-600 font-semibold">{completed} completed</span>
          <span className="text-gray-300">&rarr;</span>
          <span className={`font-bold ${(a?.drop_off_pct ?? 0) > 20 ? 'text-red-500' : 'text-gray-500'}`}>
            {a?.drop_off_pct ?? 0}% drop-off
          </span>
        </div>
        <div className="mt-2 h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-400 rounded-full transition-all duration-500"
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>0</span>
          <span>{entered} entered</span>
        </div>
      </div>

      {/* SECTION B: Friction Event Breakdown */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Friction Event Breakdown (last 7 days)</p>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={frictionData} barSize={28}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                formatter={(value: number) => [value, 'Count']}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {frictionData.map((entry) => (
                  <Cell key={entry.name} fill={FRICTION_COLORS[entry.name] ?? '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION C: Cognitive Score Source */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Cognitive Score Source</p>
        {row.copy_text ? (
          <div className="space-y-2">
            <div className="flex gap-4 text-xs">
              <div>
                <span className="text-gray-400">Load: </span>
                <span className={`font-semibold ${(a?.cognitive_load ?? 0) > 70 ? 'text-red-500' : 'text-gray-700'}`}>{a?.cognitive_load ?? '—'}</span>
              </div>
              <div>
                <span className="text-gray-400">Comprehension: </span>
                <span className={`font-semibold ${(a?.comprehension ?? 100) < 55 ? 'text-red-500' : 'text-gray-700'}`}>{a?.comprehension ?? '—'}</span>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Scored copy</p>
              <p className="text-xs text-gray-600 italic">"{row.copy_text}"</p>
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-400 space-y-1">
            <p>No instructional copy was provided for this step. Scores are estimated from behavioral friction density.</p>
            <p>For more accurate scoring, add the step's copy in Define Flow &rarr; {row.name} &rarr; Add step copy.</p>
            <button onClick={onEditFlow} className="text-teal-500 hover:text-teal-600 font-semibold">
              Edit step copy
            </button>
          </div>
        )}
      </div>

      {/* SECTION D: Why This Warning Fired */}
      {warnings.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Why This Warning Fired</p>
          <div className="space-y-3">
            {warnings.includes('trust_timing') && (
              <div className="border-l-2 border-orange-400 pl-3">
                <p className="text-xs text-gray-700">
                  This step occurs early in your flow (step {row.step_order} of {totalSteps}) and asks for profile/connection information.{' '}
                  {a?.abandonment_count ?? 0} sessions abandoned at this point — users may not yet trust your product enough to share this.
                </p>
                <p className="text-xs text-teal-600 mt-1 font-medium">
                  Recommendation: Consider moving this step later, after users have experienced value, or explain why this information is needed before asking.
                </p>
              </div>
            )}
            {warnings.includes('comprehension_gap') && (
              <div className="border-l-2 border-amber-400 pl-3">
                <p className="text-xs text-gray-700">
                  Comprehension score is {a?.comprehension ?? '—'}/100 — below the 55 threshold.{' '}
                  {(a?.scroll_reversal_count ?? 0) + (a?.field_reentry_count ?? 0)} users showed scroll reversal or field re-entry, suggesting confusion rather than simple difficulty.
                </p>
                <p className="text-xs text-teal-600 mt-1 font-medium">
                  Recommendation: Review the instructional copy for this step.{row.copy_text ? ' Click "Get Rewrite Suggestions" below.' : ''}
                </p>
              </div>
            )}
            {warnings.includes('choice_overload') && (
              <div className="border-l-2 border-red-400 pl-3">
                <p className="text-xs text-gray-700">
                  Cognitive load is {a?.cognitive_load ?? '—'}/100, above the 83 threshold. This usually means too many decisions or fields are presented simultaneously.
                </p>
                <p className="text-xs text-teal-600 mt-1 font-medium">
                  Recommendation: Consider breaking this step into two simpler steps, or reducing the number of visible options.
                </p>
              </div>
            )}
          </div>

          {row.copy_text && warnings.length > 0 && (
            <div className="mt-3">
              {rewriteResult ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500">Rewrite Suggestions ({rewriteResult.modelUsed})</p>
                  {rewriteResult.alternatives.map((alt, i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-lg p-3 space-y-1">
                      <p className="text-xs text-gray-700">"{alt.text}"</p>
                      <p className="text-[10px] text-gray-400">{alt.rationale}</p>
                      <div className="flex gap-2 text-[10px]">
                        <span className={`font-semibold ${alt.scoreDelta.cognitiveLoad < 0 ? 'text-green-600' : 'text-red-500'}`}>
                          Load: {alt.scoreDelta.cognitiveLoad > 0 ? '+' : ''}{alt.scoreDelta.cognitiveLoad}
                        </span>
                        <span className={`font-semibold ${alt.scoreDelta.comprehensionConfidence > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          CC: {alt.scoreDelta.comprehensionConfidence > 0 ? '+' : ''}{alt.scoreDelta.comprehensionConfidence}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  onClick={() => { void handleGetRewrites() }}
                  disabled={rewriteLoading}
                  className="text-xs px-3 py-1.5 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {rewriteLoading && <Spinner />}
                  Get Rewrite Suggestions
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* SECTION E: Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
        <button
          onClick={() => { void handleRefreshStep() }}
          disabled={refreshingStep}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
        >
          {refreshingStep && <Spinner />}
          Refresh this step
        </button>
        <button
          onClick={onEditFlow}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          Edit step
        </button>
        <button
          onClick={() => { void loadRawEvents() }}
          disabled={loadingEvents}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
        >
          {loadingEvents && <Spinner />}
          View raw events
        </button>
      </div>

      {/* Raw events table */}
      {showRawEvents && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500">Last 50 events</p>
            <button onClick={() => setShowRawEvents(false)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left py-1.5 px-3 font-semibold text-gray-400">Timestamp</th>
                  <th className="text-left py-1.5 px-3 font-semibold text-gray-400">Event</th>
                  <th className="text-left py-1.5 px-3 font-semibold text-gray-400">Cognitive Label</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rawEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="py-1 px-3 text-gray-400 font-mono">{new Date(e.occurred_at).toLocaleString()}</td>
                    <td className="py-1 px-3 text-gray-600">{e.event_type}</td>
                    <td className="py-1 px-3 text-gray-500">{e.cognitive_label}</td>
                  </tr>
                ))}
                {rawEvents.length === 0 && (
                  <tr><td colSpan={3} className="py-4 text-center text-gray-300">No events found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Define Flow Modal (FLOW-03) ────────────────────────────────────────────────

function DefineFlowModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [steps, setSteps] = useState<StepDef[]>([
    { name: '', matchType: 'route', matchValue: '', copyText: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [expandedCopy, setExpandedCopy] = useState<Set<number>>(new Set())

  function updateStep(i: number, patch: Partial<StepDef>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i))
  }

  function addStep() {
    setSteps((prev) => [...prev, { name: '', matchType: 'route', matchValue: '', copyText: '' }])
  }

  function moveStep(from: number, to: number) {
    if (to < 0 || to >= steps.length) return
    setSteps((prev) => {
      const next = [...prev]
      const moved = next.splice(from, 1)[0]
      if (!moved) return prev
      next.splice(to, 0, moved)
      return next
    })
  }

  function toggleCopy(i: number) {
    setExpandedCopy((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  async function handleSave() {
    if (!supabase) return
    const validSteps = steps.filter((s) => s.name.trim())
    if (validSteps.length === 0) return

    setSaving(true)

    const { data: existing } = await supabase
      .from('onboarding_flows')
      .select('id')
      .eq('workspace_id', WORKSPACE_ID)
      .eq('is_active', true)
      .maybeSingle()

    if (existing) {
      await supabase.from('step_aggregates').delete().eq('workspace_id', WORKSPACE_ID)
      await supabase.from('behavioral_events').delete().eq('workspace_id', WORKSPACE_ID)
      await supabase.from('onboarding_steps').delete().eq('flow_id', existing.id)
      await supabase.from('onboarding_flows').delete().eq('id', existing.id)
    }

    const { data: flow } = await supabase
      .from('onboarding_flows')
      .insert({ workspace_id: WORKSPACE_ID, name: 'Onboarding Flow', is_active: true })
      .select('id')
      .single()

    if (!flow) { setSaving(false); return }

    for (let i = 0; i < validSteps.length; i++) {
      const s = validSteps[i]!
      await supabase.from('onboarding_steps').insert({
        flow_id: flow.id,
        workspace_id: WORKSPACE_ID,
        name: s.name.trim(),
        step_order: i + 1,
        match_type: s.matchType,
        match_value: s.matchType === 'route' ? s.matchValue || null : null,
        copy_text: s.copyText.trim() || null,
      })
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  const canSave = steps.some((s) => s.name.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold text-gray-800">Define your onboarding flow</h2>
          <p className="text-xs text-gray-400 mt-1">
            Tell CognArc which steps make up your onboarding. Each step can be matched by URL route, or tracked manually from your code.
          </p>
        </div>

        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => moveStep(i, i - 1)} disabled={i === 0} className="text-gray-300 hover:text-gray-500 disabled:opacity-30 text-xs leading-none">▲</button>
                  <button onClick={() => moveStep(i, i + 1)} disabled={i === steps.length - 1} className="text-gray-300 hover:text-gray-500 disabled:opacity-30 text-xs leading-none">▼</button>
                </div>
                <span className="text-xs text-gray-300 font-mono w-5 text-center">{i + 1}</span>
                <input
                  value={s.name}
                  onChange={(e) => updateStep(i, { name: e.target.value })}
                  placeholder="Step name (e.g. Welcome)"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5 text-xs">
                  <button
                    onClick={() => updateStep(i, { matchType: 'route' })}
                    className={`px-2 py-0.5 rounded-md font-medium transition-colors ${s.matchType === 'route' ? 'bg-gray-900 text-white' : 'text-gray-400'}`}
                  >Route</button>
                  <button
                    onClick={() => updateStep(i, { matchType: 'manual' })}
                    className={`px-2 py-0.5 rounded-md font-medium transition-colors ${s.matchType === 'manual' ? 'bg-gray-900 text-white' : 'text-gray-400'}`}
                  >Manual event</button>
                </div>
                <button onClick={() => removeStep(i)} className="text-gray-300 hover:text-red-400 text-sm">✕</button>
              </div>

              {s.matchType === 'route' ? (
                <input
                  value={s.matchValue}
                  onChange={(e) => updateStep(i, { matchValue: e.target.value })}
                  placeholder="URL path (e.g. /onboarding/welcome)"
                  className="w-full text-xs border border-gray-100 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-400 ml-7"
                />
              ) : (
                <p className="text-xs text-gray-400 ml-7 font-mono bg-gray-50 px-3 py-1.5 rounded-lg">
                  cognarc.trackStepEntry('{s.name || 'StepName'}')
                </p>
              )}

              {expandedCopy.has(i) ? (
                <textarea
                  value={s.copyText}
                  onChange={(e) => updateStep(i, { copyText: e.target.value })}
                  placeholder="Paste the instructional copy shown at this step (optional — used to compute Cognitive Load and Comprehension scores)"
                  rows={3}
                  className="w-full text-xs border border-gray-100 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-teal-400 ml-7"
                />
              ) : (
                <button onClick={() => toggleCopy(i)} className="text-xs text-teal-500 hover:text-teal-600 ml-7">
                  + Add step copy
                </button>
              )}
            </div>
          ))}
        </div>

        <button onClick={addStep} className="text-xs text-teal-500 hover:text-teal-600 font-semibold">
          + Add Step
        </button>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => { void handleSave() }}
            disabled={!canSave || saving}
            className="text-sm px-4 py-2 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Spinner />}
            Save Flow
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Embed snippet panel (FLOW-03) ──────────────────────────────────────────────

function EmbedSnippet({ hasManualSteps }: { hasManualSteps: boolean }) {
  const [copied, setCopied] = useState(false)

  const snippet = `npm install @cognarc/sdk

import { cognarc } from '@cognarc/sdk'

cognarc.init({
  workspaceId: '${WORKSPACE_ID}',
  supabaseUrl: '${import.meta.env.VITE_SUPABASE_URL ?? 'https://your-project.supabase.co'}',
  supabaseAnonKey: 'your-anon-key',
  fetchStepsFromAPI: true,
})

cognarc.autoInstrument()
cognarc.startRouteObserver()`

  const manualSnippet = `// Call these when the user enters/completes a manually-tracked step
cognarc.trackStepEntry('Connect SDK')
cognarc.trackStepCompletion('Connect SDK')`

  function handleCopy() {
    const full = hasManualSteps ? `${snippet}\n\n${manualSnippet}` : snippet
    void navigator.clipboard.writeText(full)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-4 border border-teal-200 bg-teal-50/30 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-700">Add this to your site to start tracking</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Install the Behavioral SDK and initialise it with your workspace ID. CognArc will automatically detect step transitions based on the routes you defined.
        </p>
      </div>
      <div className="relative">
        <pre className="text-xs bg-gray-900 text-green-300 rounded-lg p-4 overflow-x-auto">
          {snippet}
          {hasManualSteps && `\n\n${manualSnippet}`}
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function OnboardingFlowManager() {
  const [rows, setRows] = useState<StepRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showSnippet, setShowSnippet] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [hasFlow, setHasFlow] = useState(false)
  const [openStepId, setOpenStepId] = useState<string | null>(null)

  const fetchSteps = useCallback(async () => {
    if (!supabase) { setLoading(false); return }

    const { data: flow } = await supabase
      .from('onboarding_flows')
      .select('id')
      .eq('workspace_id', WORKSPACE_ID)
      .eq('is_active', true)
      .maybeSingle()

    if (!flow) {
      setHasFlow(false)
      setRows([])
      setLoading(false)
      return
    }

    setHasFlow(true)

    const { data: steps } = await supabase
      .from('onboarding_steps')
      .select('id, name, step_order, match_type, match_value, copy_text')
      .eq('flow_id', flow.id)
      .order('step_order')

    if (!steps || steps.length === 0) {
      setRows([])
      setLoading(false)
      return
    }

    const stepRows: StepRow[] = []
    for (const s of steps) {
      const { data: agg } = await supabase
        .from('step_aggregates')
        .select('*')
        .eq('step_id', s.id)
        .maybeSingle()

      stepRows.push({
        id: s.id,
        name: s.name,
        step_order: s.step_order,
        match_type: s.match_type,
        match_value: s.match_value,
        copy_text: s.copy_text,
        agg: agg ? {
          cognitive_load: agg.cognitive_load,
          comprehension: agg.comprehension,
          drop_off_pct: agg.drop_off_pct,
          sessions_entered: agg.sessions_entered,
          sessions_completed: agg.sessions_completed,
          rage_click_count: agg.rage_click_count,
          field_reentry_count: agg.field_reentry_count,
          scroll_reversal_count: agg.scroll_reversal_count,
          abandonment_count: agg.abandonment_count,
          warnings: agg.warnings ?? [],
          computed_at: agg.computed_at,
        } : null,
      })
    }

    setRows(stepRows)
    setLoading(false)
  }, [])

  useEffect(() => { void fetchSteps() }, [fetchSteps])

  async function handleRefresh() {
    if (!supabase) return
    setRefreshing(true)
    for (const r of rows) {
      await aggregateStep(r.id, WORKSPACE_ID, r.name, r.step_order, r.copy_text)
    }
    await fetchSteps()
    setRefreshing(false)
  }

  async function handleRefreshSingleStep(row: StepRow) {
    await aggregateStep(row.id, WORKSPACE_ID, row.name, row.step_order, row.copy_text)
    await fetchSteps()
  }

  async function handleSeedDemo() {
    setSeeding(true)
    await seedDemoData(WORKSPACE_ID)
    await fetchSteps()
    setShowSnippet(true)
    setSeeding(false)
  }

  function handleFlowSaved() {
    setShowSnippet(true)
    void fetchSteps()
  }

  const hasManualSteps = rows.some((r) => r.match_type === 'manual')

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
        <Spinner />
        <span className="text-sm">Loading onboarding flow…</span>
      </div>
    )
  }

  return (
    <div>
      {/* Table header area with action buttons */}
      <div className="flex items-center justify-end gap-2 mb-3">
        {hasFlow && (
          <button
            onClick={() => { void handleRefresh() }}
            disabled={refreshing}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
          >
            {refreshing && <Spinner />}
            Refresh now
          </button>
        )}
        <button
          onClick={() => setShowModal(true)}
          className="text-xs px-3 py-1.5 rounded-lg border border-teal-400 text-teal-600 hover:bg-teal-50 font-semibold"
        >
          {hasFlow ? 'Edit Flow' : 'Define Flow'}
        </button>
        {!hasFlow && (
          <button
            onClick={() => { void handleSeedDemo() }}
            disabled={seeding}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
          >
            {seeding && <Spinner />}
            Use Demo Data
          </button>
        )}
      </div>

      {/* Table */}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Onboarding flow cognitive scores">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left py-2 pr-4 font-semibold">Step</th>
                <th className="text-right py-2 px-2 font-semibold">Cognitive Load</th>
                <th className="text-right py-2 px-2 font-semibold">Comprehension</th>
                <th className="text-right py-2 px-2 font-semibold">Drop-off %</th>
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => {
                const a = r.agg
                const load = a?.cognitive_load
                const comp = a?.comprehension
                const drop = a?.drop_off_pct
                const warnings = a?.warnings ?? []
                const isOpen = openStepId === r.id

                return (
                  <Fragment key={r.id}>
                    <tr
                      data-testid="onboarding-step-row"
                      onClick={() => setOpenStepId(isOpen ? null : r.id)}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      aria-expanded={isOpen}
                    >
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-gray-700">{r.name}</span>
                          {warnings.map((w) => {
                            const badge = WARNING_BADGES[w]
                            if (!badge) return null
                            return (
                              <span key={w} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white whitespace-nowrap ${badge.bg}`}>
                                ⚠ {badge.label}
                              </span>
                            )
                          })}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right">
                        {load != null ? (
                          <span className={`font-semibold tabular-nums ${load > 70 ? 'text-danger' : load > 50 ? 'text-warning' : 'text-success'}`}>
                            {load}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">Awaiting data</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {comp != null ? (
                          <span className={`font-semibold tabular-nums ${comp < 55 ? 'text-danger' : comp < 70 ? 'text-warning' : 'text-success'}`}>
                            {comp}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">Awaiting data</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-gray-500">
                        {drop != null && drop > 0 ? `-${drop}%` : '—'}
                      </td>
                      <td className="py-2 text-xs text-gray-400 text-right pr-1" data-testid="chevron">
                        {isOpen ? '▲' : '▼'}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} className="p-0">
                          <StepDetailPanel
                            row={r}
                            totalSteps={rows.length}
                            onRefreshStep={handleRefreshSingleStep}
                            onEditFlow={() => setShowModal(true)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
          <span className="text-3xl mb-2" aria-hidden>📊</span>
          <p className="text-sm">No onboarding flow defined yet</p>
          <p className="text-xs text-gray-300 mt-1">Click "Define Flow" to set up your onboarding steps, or "Use Demo Data" to preview the feature.</p>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-3">
        Steps with load &gt; 70 are highlighted in red. Steps with comprehension &lt; 55 indicate likely abandonment.
      </p>
      <p className="text-xs text-gray-400 mt-1">
        ⚠ Comprehension Gap: CC &lt; 55 · ⚠ Choice Overload: CL &gt; 83 · ⚠ Trust Timing: data requested before value demonstrated
      </p>
      <p className="text-xs text-gray-300 mt-1">Click any row to expand behavioral evidence and warning explanations</p>

      {/* Embed snippet */}
      {showSnippet && hasFlow && <EmbedSnippet hasManualSteps={hasManualSteps} />}

      {/* Define Flow modal */}
      {showModal && <DefineFlowModal onClose={() => setShowModal(false)} onSaved={handleFlowSaved} />}
    </div>
  )
}
