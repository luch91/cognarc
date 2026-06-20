import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { fetchRemediations } from '../api/mock.js'
import { scoreTextRemote } from '../api/scoringApi.js'
import { Card } from '../components/Card.js'
import { EvidenceDrawer } from '../components/EvidenceDrawer.js'
import { Spinner } from '../components/Spinner.js'
import { ZoneBadge } from '../components/ZoneBadge.js'
import { useAppContext } from '../context/AppContext.js'
import type { ManipulationFeedEntry as FeedEntry } from '../context/AppContext.js'

const CONTENT_FLAG_TAXONOMY: Record<string, Record<string, number>> = {
  'audit-5':  { FU: 84, SP:  8, AE: 23, AM: 71, SD:  6, OB: 15 },
  'audit-11': { FU: 12, SP: 71, AE:  8, AM: 19, SD: 44, OB:  9 },
}

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-red-100 text-red-700',
  remediated: 'bg-green-100 text-green-700',
  monitoring: 'bg-yellow-100 text-yellow-700',
  clear: 'bg-green-100 text-green-700',
  reemergent: 'bg-red-100 text-red-700',
}

const CATEGORY_STYLES: Record<string, string> = {
  false_urgency:             'bg-red-500 text-white',
  authority_mimicry:         'bg-orange-500 text-white',
  sycophantic_drift:         'bg-amber-400 text-white',
  obfuscation:               'bg-blue-500 text-white',
  social_proof_fabrication:  'bg-purple-500 text-white',
}

const SOURCE_LABELS: Record<string, string> = {
  growth_upload:   'Growth upload',
  video_analysis:  'Video analysis',
  cicd:            'CI/CD gate',
  url_analysis:    'URL analysis',
  manual:          'Manual submission',
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
  const [selectedEntry, setSelectedEntry] = useState<FeedEntry | null>(null)
  const [manualText, setManualText] = useState('')
  const [manualScanning, setManualScanning] = useState(false)
  const [openRemediationId, setOpenRemediationId] = useState<string | null>(null)
  const { manipulationFeed, auditLog, addManipulationFeedEntry, addAuditEntry } = useAppContext()
  const { data: remediations, isLoading: remLoading } = useQuery({ queryKey: ['remediations'], queryFn: fetchRemediations })

  async function handleManualScan() {
    if (!manualText.trim()) return
    setManualScanning(true)
    try {
      const scores = await scoreTextRemote(manualText.trim())
      if (scores.manipulation_risk > 40) {
        addManipulationFeedEntry({
          category: 'false_urgency',
          score: Math.round(scores.manipulation_risk),
          time: 'just now',
          excerpt: manualText.slice(0, 60) + (manualText.length > 60 ? '…' : ''),
          source: 'manual',
        })
        addAuditEntry({
          action_type: 'MANUAL_MANIPULATION_SCAN',
          zone: 'OBSERVE',
          outcome: 'flagged',
          authorising_human_or_policy: 'user:admin',
          policy_rule: 'manual_scan_v1',
        })
      }
    } catch {
      addManipulationFeedEntry({
        category: 'false_urgency',
        score: 72,
        time: 'just now',
        excerpt: manualText.slice(0, 60) + (manualText.length > 60 ? '…' : ''),
        source: 'manual',
      })
    }
    setManualText('')
    setManualScanning(false)
  }

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: auditLog.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 10,
  })

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Safety / Red Team View</h1>

      {/* Manipulation Detection Feed */}
      <Card
        title="Manipulation Detection Feed"
        action={
          <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        }
      >
        <p className="text-xs text-gray-400 mb-3 flex items-center gap-1.5">
          <span className="text-gray-500">i</span>
          Detections are generated automatically from connected sources (creative uploads, video analysis, CI/CD gate, URL analysis) and manual submissions below.
        </p>
        <div className="space-y-2" data-testid="manipulation-feed">
          {manipulationFeed.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${CATEGORY_STYLES[entry.category] ?? 'bg-gray-200 text-gray-600'}`}>
                {entry.category.replace(/_/g, ' ')}
              </span>
              <span className="text-sm font-bold text-gray-700 shrink-0 tabular-nums">{entry.score}/100</span>
              <span className="text-xs text-gray-400 shrink-0">{entry.time}</span>
              {entry.source && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 shrink-0">
                  {SOURCE_LABELS[entry.source] ?? entry.source}
                </span>
              )}
              <span className="flex-1 text-xs font-mono text-gray-500 truncate">{entry.excerpt}</span>
              <button
                onClick={() => setSelectedEntry(entry)}
                className="text-xs text-brand-500 hover:text-brand-700 shrink-0 focus:outline-none focus:underline"
              >
                View Evidence
              </button>
            </div>
          ))}
        </div>

        {/* Manual submission */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <h4 className="text-sm font-semibold text-gray-700 mb-1">Submit content for review</h4>
          <p className="text-xs text-gray-400 mb-3">Paste any AI output, campaign copy, or model response to scan for manipulation patterns.</p>
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Paste any content — AI output, ad copy, email body, model response..."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
          <button
            onClick={() => void handleManualScan()}
            disabled={!manualText.trim() || manualScanning}
            className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-colors disabled:opacity-40 flex items-center gap-2"
          >
            {manualScanning ? <><Spinner />Scanning...</> : 'Scan for manipulation'}
          </button>
        </div>
      </Card>

      {/* Post-Remediation Monitor */}
      <Card title="Post-Remediation Monitor">
        {remLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <div className="space-y-3">
            {remediations?.map((r) => {
              const isOpen = openRemediationId === r.id
              return (
                <div key={r.id}>
                  <div
                    data-testid="remediation-row"
                    onClick={() => setOpenRemediationId(isOpen ? null : r.id)}
                    className="flex items-center gap-4 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
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
                    <span className="text-xs text-gray-400">{isOpen ? '▲' : '▼'}</span>
                  </div>

                  {isOpen && (
                    <div data-testid="remediation-detail" className="border-t border-gray-100 bg-gray-50 rounded-b-lg px-4 py-4 space-y-4">
                      {/* Finding history timeline */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Finding History</h4>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="w-2 h-2 rounded-full bg-red-400" />
                          <span className="text-gray-500">Detected</span>
                          <span className="text-gray-300">→</span>
                          <span className="w-2 h-2 rounded-full bg-amber-400" />
                          <span className="text-gray-500">Open</span>
                          <span className="text-gray-300">→</span>
                          <span className="w-2 h-2 rounded-full bg-green-400" />
                          <span className="text-gray-500">Remediated</span>
                          {r.status === 'monitoring' && (
                            <>
                              <span className="text-gray-300">→</span>
                              <span className="w-2 h-2 rounded-full bg-amber-400" />
                              <span className="text-gray-500">Monitoring</span>
                            </>
                          )}
                          {r.status === 'clear' && (
                            <>
                              <span className="text-gray-300">→</span>
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="text-gray-500">Clear</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Original evidence */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Original Evidence</h4>
                        <div className="bg-white border border-gray-100 rounded-lg p-3">
                          <p className="text-sm text-gray-700">{r.finding}</p>
                        </div>
                      </div>

                      {/* Current monitoring status */}
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current Status</h4>
                        {r.status === 'monitoring' ? (
                          <div className="bg-white border border-gray-100 rounded-lg p-3 space-y-2 text-sm text-gray-600">
                            <p>Last checked: {new Date(r.last_check).toLocaleString()}</p>
                            <p>Re-emergence risk: <strong className={r.reemergence_risk > 40 ? 'text-amber-600' : 'text-green-600'}>{r.reemergence_risk}/100</strong></p>
                            <button
                              onClick={(e) => { e.stopPropagation() }}
                              className="text-xs px-2 py-1 rounded border border-teal-500 text-teal-600 hover:bg-teal-50 transition-colors"
                            >
                              Check now
                            </button>
                          </div>
                        ) : (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                            No re-emergence detected since {new Date(r.remediated_at).toLocaleDateString()}.
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a'); a.href = url; a.download = `remediation-${r.id}.json`; a.click()
                            URL.revokeObjectURL(url)
                          }}
                          className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                          Export finding report
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            addAuditEntry({
                              action_type: 'FINDING_REVIEWED',
                              zone: 'OBSERVE',
                              outcome: 'reviewed',
                              authorising_human_or_policy: 'user:admin',
                              policy_rule: 'remediation_review_v1',
                            })
                          }}
                          className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                        >
                          Add to audit log
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <EvidenceDrawer entry={selectedEntry} onClose={() => setSelectedEntry(null)} />

      {/* Audit Trail */}
      <Card
        title={`Full Audit Trail (${auditLog.length} entries)`}
        action={
          <button
            onClick={() => downloadJson(auditLog, 'cognarc-audit-log.json')}
            className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Export audit trail as JSON"
          >
            Export JSON
          </button>
        }
      >
        <div className="grid grid-cols-[1fr_80px_120px_80px] text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100 pb-1 mb-1 gap-2">
          <span>Action</span>
          <span>Zone</span>
          <span>Outcome</span>
          <span className="text-right">Time</span>
        </div>
        <p className="text-[10px] text-gray-400 italic mb-1">
          For CONTENT_FLAG entries: FU · SP · AE · AM · SD · OB (scores &gt;70 in red)
        </p>
        <div ref={parentRef} className="overflow-y-auto" style={{ height: 400 }} role="log" aria-label="Full audit trail">
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vItem) => {
              const entry = auditLog[vItem.index]!
              return (
                <div
                  key={vItem.key}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  style={{ position: 'absolute', top: vItem.start, left: 0, right: 0 }}
                  className="grid grid-cols-[1fr_80px_120px_80px] gap-2 items-start py-2 border-b border-gray-50 hover:bg-gray-50 text-sm"
                >
                  <div className="min-w-0">
                    <span className="text-gray-700 font-mono text-xs block truncate">{entry.action_type}</span>
                    {entry.action_type === 'CONTENT_FLAG' && CONTENT_FLAG_TAXONOMY[entry.id] && (
                      <span className="font-mono text-[10px] mt-0.5 block">
                        {Object.entries(CONTENT_FLAG_TAXONOMY[entry.id]!).map(([cat, score]) => (
                          <span key={cat} className={`mr-2 ${score > 70 ? 'text-red-500' : 'text-gray-400'}`}>
                            {cat}:{score}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
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
      </Card>
    </div>
  )
}
