import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { fetchCicdRuns, fetchPromptBaselines } from '../api/mock.js'
import { Card } from '../components/Card.js'
import { Spinner } from '../components/Spinner.js'
import { ZoneBadge } from '../components/ZoneBadge.js'
import { useAppContext } from '../context/AppContext.js'
import type { Zone } from '../api/types.js'

function deltaChip(val: number, invert = false) {
  if (val === 0) return <span className="text-xs text-gray-400">—</span>
  const bad = invert ? val > 0 : val < 0
  return (
    <span className={`text-xs font-semibold ${bad ? 'text-danger' : 'text-success'}`}>
      {val > 0 ? '+' : ''}{val}
    </span>
  )
}

const STATUS_BADGE: Record<string, string> = {
  ok: 'bg-green-100 text-green-700',
  warn: 'bg-yellow-100 text-yellow-700',
  block: 'bg-red-100 text-red-700',
}

const CICD_BADGE: Record<string, string> = {
  pass: 'bg-green-100 text-green-700',
  warn: 'bg-yellow-100 text-yellow-700',
  fail: 'bg-red-100 text-red-700',
}

const CICD_BASELINE_DELTA: Record<string, { delta: number; color: string }> = {
  r1: { delta: +18, color: 'text-red-500'   },
  r2: { delta: -12, color: 'text-green-600' },
  r3: { delta:  -3, color: 'text-green-600' },
  r4: { delta: +11, color: 'text-amber-500' },
}

const CICD_REWRITES: Record<string, { text: string; load: number; cc: number; risk: string }[]> = {
  r1: [
    { text: 'You can complete this setup in a few steps.',       load: 52, cc: 71, risk: 'LOW' },
    { text: "Let's walk through the configuration together.",    load: 48, cc: 76, risk: 'LOW' },
    { text: 'Configure your workspace (3 steps).',               load: 44, cc: 79, risk: 'LOW' },
  ],
  r4: [
    { text: 'See how teams are using this feature.',             load: 41, cc: 72, risk: 'LOW' },
    { text: 'Used by product teams to improve onboarding.',      load: 38, cc: 75, risk: 'LOW' },
    { text: 'Learn how this works with a quick example.',        load: 36, cc: 78, risk: 'LOW' },
  ],
}

function CicdRewritePanel({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false)
  const rewrites = CICD_REWRITES[runId]
  if (!rewrites) return null
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-brand-500 hover:text-brand-700 focus:outline-none focus:underline"
      >
        {open ? '▲ Hide suggested rewrites' : `▼ View suggested rewrites (${rewrites.length})`}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {rewrites.map((r, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
              <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <p className="flex-1 text-xs text-gray-700 italic min-w-0">"{r.text}"</p>
              <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">
                Load: {r.load} · CC: {r.cc} ·{' '}
                <span className="text-green-600 font-semibold">{r.risk}</span>
              </span>
              <button className="text-xs px-2 py-1 rounded border border-teal-500 text-teal-600 hover:bg-teal-50 transition-colors shrink-0">
                Use this
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const ALL_ZONES: Zone[] = ['OBSERVE', 'RECOMMEND', 'ACT_AUTO', 'ACT_GATED']

export function EngineerView() {
  const { data: baselines, isLoading: blLoading } = useQuery({ queryKey: ['prompt-baselines'], queryFn: fetchPromptBaselines })
  const { data: cicdRuns, isLoading: cicdLoading } = useQuery({ queryKey: ['cicd-runs'], queryFn: fetchCicdRuns })
  const { auditLog, thresholds } = useAppContext()

  // Audit log filters
  const [zoneFilter, setZoneFilter] = useState<Zone | 'ALL'>('ALL')
  const [typeFilter, setTypeFilter] = useState('')

  const filtered = auditLog.filter((e) => {
    if (zoneFilter !== 'ALL' && e.zone !== zoneFilter) return false
    if (typeFilter && !e.action_type.toLowerCase().includes(typeFilter.toLowerCase())) return false
    return true
  })

  // Virtual scroll
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  })

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Engineer View</h1>

      {/* Prompt Regression Monitor */}
      <Card title="Prompt Regression Monitor">
        {blLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Prompt baselines">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left py-2 pr-4 font-semibold">Prompt</th>
                  <th className="text-right py-2 px-2 font-semibold">CL</th>
                  <th className="text-right py-2 px-2 font-semibold">ΔCL</th>
                  <th className="text-right py-2 px-2 font-semibold">CC</th>
                  <th className="text-right py-2 px-2 font-semibold">ΔCC</th>
                  <th className="text-left py-2 px-2 font-semibold">Status</th>
                  <th className="text-left py-2 pl-2 font-semibold">Evaluated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {baselines?.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-4">
                      <div className="font-medium text-gray-700 truncate max-w-[160px]">{b.label}</div>
                      <div className="text-xs text-gray-400 font-mono">{b.hash}</div>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{b.cognitive_load}</td>
                    <td className="py-2 px-2 text-right">{deltaChip(b.delta_cl, true)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{b.comprehension}</td>
                    <td className="py-2 px-2 text-right">{deltaChip(b.delta_cc)}</td>
                    <td className="py-2 px-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${STATUS_BADGE[b.status]}`}>
                        {b.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 pl-2 text-xs text-gray-400">
                      {new Date(b.last_evaluated).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-50">
              Thresholds: CL max <strong className="text-gray-600">{thresholds.cognitiveLoadMax}</strong>
              {' · '}Manip max <strong className="text-gray-600">{thresholds.manipulationRiskMax}</strong>
              {' · '}CC min <strong className="text-gray-600">{thresholds.comprehensionConfidenceMin}</strong>
            </p>
          </div>
        )}
      </Card>

      {/* CI/CD Gate */}
      <Card title="CI/CD Gate — Recent Evaluations">
        {cicdLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <div className="space-y-3">
            {cicdRuns?.map((run) => (
              <div key={run.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                <span className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 mt-0.5 ${CICD_BADGE[run.result]}`}>
                  {run.result.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700">PR #{run.pr_number}</span>
                    <span className="text-sm text-gray-500 truncate">{run.pr_title}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5 font-mono">{run.branch}</div>
                  {run.breaches.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {run.breaches.map((b, i) => (
                        <span key={i} className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">{b}</span>
                      ))}
                    </div>
                  )}
                  <CicdRewritePanel runId={run.id} />
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold tabular-nums text-gray-700">{run.overall_score}</div>
                  <div className="text-xs text-gray-400">risk score</div>
                  {CICD_BASELINE_DELTA[run.id] && (
                    <div className={`text-xs font-semibold tabular-nums ${CICD_BASELINE_DELTA[run.id]!.color}`}>
                      {CICD_BASELINE_DELTA[run.id]!.delta > 0 ? '+' : ''}{CICD_BASELINE_DELTA[run.id]!.delta} vs baseline
                    </div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">{new Date(run.evaluated_at).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Audit Log */}
      <Card
        title={`Audit Log (${filtered.length} entries)`}
        action={
          <div className="flex items-center gap-2">
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value as Zone | 'ALL')}
              className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              aria-label="Filter by zone"
            >
              <option value="ALL">All zones</option>
              {ALL_ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            <input
              type="search"
              placeholder="Filter action type…"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded px-2 py-1 w-40 focus:outline-none focus:ring-1 focus:ring-brand-500"
              aria-label="Filter by action type"
            />
          </div>
        }
      >
        <>
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_120px_120px_80px] text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 pb-1 mb-1 gap-2">
            <span>Action</span>
            <span>Zone</span>
            <span>Outcome</span>
            <span>Authorised by</span>
            <span className="text-right">Time</span>
          </div>
            {/* Virtualized rows */}
            <div ref={parentRef} className="overflow-y-auto" style={{ height: 360 }} role="log" aria-label="Audit log entries">
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((vItem) => {
                  const entry = filtered[vItem.index]!
                  return (
                    <div
                      key={vItem.key}
                      data-index={vItem.index}
                      ref={virtualizer.measureElement}
                      style={{ position: 'absolute', top: vItem.start, left: 0, right: 0 }}
                      className="grid grid-cols-[1fr_80px_120px_120px_80px] gap-2 items-center py-2 border-b border-gray-50 hover:bg-gray-50 text-sm"
                    >
                      <span className="text-gray-700 truncate font-mono text-xs">{entry.action_type}</span>
                      <ZoneBadge zone={entry.zone} />
                      <span className="text-xs text-gray-500 truncate">{entry.outcome}</span>
                      <span className="text-xs text-gray-400 truncate">{entry.authorising_human_or_policy}</span>
                      <span className="text-xs text-gray-400 text-right tabular-nums">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
      </Card>
    </div>
  )
}
