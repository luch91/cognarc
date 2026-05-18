import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { approveActGated, fetchActGatedItems, rejectActGated } from '../api/mock.js'
import { Card } from '../components/Card.js'
import { ScoreGauge } from '../components/ScoreGauge.js'
import { Spinner } from '../components/Spinner.js'
import type { ActGatedItem } from '../api/types.js'

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

function DecisionModal({
  item,
  mode,
  onClose,
}: {
  item: ActGatedItem
  mode: 'approve' | 'reject'
  onClose: () => void
}) {
  const [justification, setJustification] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      mode === 'approve' ? approveActGated(item.id, justification) : rejectActGated(item.id, justification),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['act-gated'] })
      onClose()
    },
  })

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 id="modal-title" className="text-base font-semibold text-gray-800">
            {mode === 'approve' ? 'Approve action' : 'Reject action'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">×</button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-gray-600">{item.description}</p>
          <p className="text-xs text-gray-400">Proposed: <span className="text-gray-600">{item.proposed_action}</span></p>
          <div>
            <label htmlFor="justification" className="block text-xs font-semibold text-gray-500 mb-1">
              Justification <span className="text-danger">*</span>
            </label>
            <textarea
              id="justification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              placeholder="Enter your justification for this decision…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!justification.trim() || mutation.isPending}
            className={`text-sm px-4 py-2 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 ${
              mode === 'approve' ? 'bg-success hover:bg-green-600' : 'bg-danger hover:bg-red-600'
            }`}
          >
            {mutation.isPending ? 'Saving…' : mode === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ActGatedCard({ item }: { item: ActGatedItem }) {
  const [expanded, setExpanded] = useState(false)
  const [modal, setModal] = useState<'approve' | 'reject' | null>(null)

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-start gap-3">
        <span className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 mt-0.5 ${STATUS_BADGE[item.status]}`}>
          {item.status.toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-700">{item.description}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Requested: {new Date(item.requested_at).toLocaleString()} ·
            Type: <span className="font-mono">{item.action_type}</span>
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-brand-500 hover:text-brand-700 shrink-0 focus:outline-none focus:underline"
          aria-expanded={expanded}
        >
          {expanded ? 'Hide details' : 'View package'}
        </button>
      </div>

      {/* Decision package */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-4">
          {/* TRIBE scores */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">TRIBE Evidence — Cognitive Scores</p>
            <div className="flex flex-wrap gap-6 justify-around bg-white rounded-lg p-3 border border-gray-100">
              <ScoreGauge label="Cognitive Load" value={item.cognitive_scores.cognitive_load} invert size="sm" />
              <ScoreGauge label="Comprehension" value={item.cognitive_scores.comprehension} size="sm" />
              <ScoreGauge label="Trust" value={item.cognitive_scores.trust} size="sm" />
              <ScoreGauge label="Manipulation" value={item.cognitive_scores.manipulation_risk} invert size="sm" />
            </div>
          </div>

          {/* Evidence summary */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Evidence Summary</p>
            <p className="text-sm text-gray-600">{item.evidence_summary}</p>
          </div>

          {/* Proposed action */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Proposed Action</p>
            <p className="text-sm text-gray-700 font-medium">{item.proposed_action}</p>
          </div>

          {/* Alternatives */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Alternatives Considered</p>
            <ul className="space-y-1">
              {item.alternatives.map((alt, i) => (
                <li key={i} className="text-sm text-gray-600 flex gap-2">
                  <span className="text-gray-300">›</span>{alt}
                </li>
              ))}
            </ul>
          </div>

          {/* Decision if already resolved */}
          {item.status !== 'pending' ? (
            <div className="bg-white rounded-lg p-3 border border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {item.status === 'approved' ? '✓ Approved' : '✗ Rejected'} by {item.reviewer}
              </p>
              <p className="text-sm text-gray-600 italic">"{item.justification}"</p>
              <p className="text-xs text-gray-400 mt-1">{item.reviewed_at ? new Date(item.reviewed_at).toLocaleString() : ''}</p>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setModal('approve')}
                className="flex-1 text-sm py-2 rounded-lg bg-success text-white font-semibold hover:bg-green-600 transition-colors focus:outline-none focus:ring-2 focus:ring-success"
              >
                Approve
              </button>
              <button
                onClick={() => setModal('reject')}
                className="flex-1 text-sm py-2 rounded-lg bg-danger text-white font-semibold hover:bg-red-600 transition-colors focus:outline-none focus:ring-2 focus:ring-danger"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}

      {modal && (
        <DecisionModal item={item} mode={modal} onClose={() => setModal(null)} />
      )}
    </div>
  )
}

export function ApprovalsView() {
  const { data: items, isLoading } = useQuery({ queryKey: ['act-gated'], queryFn: fetchActGatedItems, refetchInterval: 15000 })

  const pending = items?.filter((i) => i.status === 'pending') ?? []
  const resolved = items?.filter((i) => i.status !== 'pending') ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-800">Act-Gated Approvals</h1>
        {pending.length > 0 && (
          <span className="bg-orange-100 text-orange-700 text-sm font-bold px-2.5 py-0.5 rounded-full animate-pulse">
            {pending.length} pending
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size={8} /></div>
      ) : (
        <>
          {/* Pending approvals */}
          {pending.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Pending Approval</h2>
              {pending.map((item) => <ActGatedCard key={item.id} item={item} />)}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
              <span className="text-3xl mb-2" aria-hidden>✓</span>
              <p className="text-sm font-medium">No pending approvals</p>
            </div>
          )}

          {/* Resolved */}
          {resolved.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Recently Resolved</h2>
              {resolved.map((item) => <ActGatedCard key={item.id} item={item} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
