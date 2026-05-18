import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { fetchAuditLog, fetchManipulationFlags, fetchRemediations } from '../api/mock.js'
import { Card } from '../components/Card.js'
import { Spinner } from '../components/Spinner.js'
import { ZoneBadge } from '../components/ZoneBadge.js'

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  remediated: 'bg-green-100 text-green-700',
  monitoring: 'bg-yellow-100 text-yellow-700',
  clear: 'bg-green-100 text-green-700',
  reemergent: 'bg-red-100 text-red-700',
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function SafetyView() {
  const { data: flags, isLoading: flagLoading } = useQuery({ queryKey: ['manipulation-flags'], queryFn: fetchManipulationFlags })
  const { data: remediations, isLoading: remLoading } = useQuery({ queryKey: ['remediations'], queryFn: fetchRemediations })
  const { data: auditLog, isLoading: auditLoading } = useQuery({ queryKey: ['audit-log'], queryFn: fetchAuditLog })

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: auditLog?.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  })

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Safety / Red Team View</h1>

      {/* Manipulation Detection Feed */}
      <Card title="Manipulation Detection Feed">
        {flagLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <div className="space-y-4">
            {flags?.map((flag) => (
              <div key={flag.id} className="border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ${STATUS_STYLES[flag.status]}`}>
                    {flag.status.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-700">{flag.source}</p>
                    <p className="text-xs text-gray-400">{new Date(flag.timestamp).toLocaleString()}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-2xl font-bold tabular-nums text-danger">{flag.overall_risk}</span>
                    <p className="text-xs text-gray-400">overall risk</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {flag.categories.map((cat) => (
                    <span key={cat} className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">
                      {cat.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-500">Evidence:</p>
                  {flag.evidence.map((e, i) => (
                    <p key={i} className="text-xs text-gray-600 italic ml-2">"{e}"</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Post-Remediation Monitor */}
      <Card title="Post-Remediation Monitor">
        {remLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <div className="space-y-3">
            {remediations?.map((r) => (
              <div key={r.id} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                <span className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ${STATUS_STYLES[r.status]}`}>
                  {r.status.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{r.finding}</p>
                  <p className="text-xs text-gray-400">
                    Remediated: {new Date(r.remediated_at).toLocaleDateString()} ·
                    Last check: {new Date(r.last_check).toLocaleString()}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-bold tabular-nums text-gray-700">{r.reemergence_risk}</span>
                  <p className="text-xs text-gray-400">reemergence risk</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Audit Trail */}
      <Card
        title={`Full Audit Trail (${auditLog?.length ?? 0} entries)`}
        action={
          <button
            onClick={() => downloadJson(auditLog, 'cognarc-audit-export.json')}
            className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Export audit trail as JSON"
          >
            Export JSON
          </button>
        }
      >
        {auditLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_80px_120px_80px] text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 pb-1 mb-1 gap-2">
              <span>Action</span>
              <span>Zone</span>
              <span>Outcome</span>
              <span className="text-right">Time</span>
            </div>
            <div ref={parentRef} className="overflow-y-auto" style={{ height: 400 }} role="log" aria-label="Full audit trail">
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((vItem) => {
                  const entry = auditLog![vItem.index]!
                  return (
                    <div
                      key={vItem.key}
                      data-index={vItem.index}
                      ref={virtualizer.measureElement}
                      style={{ position: 'absolute', top: vItem.start, left: 0, right: 0 }}
                      className="grid grid-cols-[1fr_80px_120px_80px] gap-2 items-center py-2 border-b border-gray-50 hover:bg-gray-50 text-sm"
                    >
                      <span className="text-gray-700 truncate font-mono text-xs">{entry.action_type}</span>
                      <ZoneBadge zone={entry.zone} />
                      <span className="text-xs text-gray-500 truncate">{entry.outcome}</span>
                      <span className="text-xs text-gray-400 text-right tabular-nums">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
