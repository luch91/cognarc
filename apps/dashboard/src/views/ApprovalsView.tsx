import { useRef, useState } from 'react'
import { Card } from '../components/Card.js'
import { ScoreGauge } from '../components/ScoreGauge.js'
import { Spinner } from '../components/Spinner.js'
import { useAppContext } from '../context/AppContext.js'
import { rewrite } from '../api/rewriteApi.js'
import type { RewriteAlternative } from '../api/rewriteApi.js'
import type { ActGatedItem } from '../api/types.js'

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const CONFIDENCE_BADGE: Record<string, string> = {
  HIGH:   'bg-emerald-100 text-emerald-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW:    'bg-gray-100 text-gray-500',
}

const DECISION_DEADLINES: Record<string, string> = {
  'ag1': '5/20/2026, 2:13 PM',
  'ag2': '5/20/2026, 1:23 PM',
}

// Extract the original copy text from the item for rewriting.
// For CONTENT_FLAG items the evidence_summary contains the flagged copy.
// For THRESHOLD_BREACH items we use the description as the prompt text.
function originalTextFor(item: ActGatedItem): string {
  if (item.action_type === 'CONTENT_FLAG') {
    // Pull the quoted/italic copy from evidence_summary if present, else use the whole summary
    const match = item.evidence_summary.match(/"([^"]+)"/)
    return match ? match[1]! : item.evidence_summary
  }
  return item.description
}

function copyTypeFor(item: ActGatedItem): 'campaign' | 'prompt' {
  return item.action_type === 'THRESHOLD_BREACH' ? 'prompt' : 'campaign'
}

function taxonomyFor(item: ActGatedItem) {
  const s = item.cognitive_scores
  return {
    falseUrgency:           s.manipulation_risk > 60 ? 84 : 20,
    authorityMimicry:       s.trust < 50 ? 71 : 15,
    ambiguityExploitation:  s.comprehension < 50 ? 60 : 10,
    socialProofFabrication: s.manipulation_risk > 70 ? 55 : 10,
  }
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
  const [saving, setSaving] = useState(false)
  const { resolveActGatedItem } = useAppContext()

  function handleConfirm() {
    if (!justification.trim()) return
    setSaving(true)
    setTimeout(() => {
      resolveActGatedItem(item.id, mode === 'approve' ? 'approved' : 'rejected')
      onClose()
    }, 400)
  }

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
            onClick={handleConfirm}
            disabled={!justification.trim() || saving}
            className={`text-sm px-4 py-2 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 ${
              mode === 'approve' ? 'bg-success hover:bg-green-600' : 'bg-danger hover:bg-red-600'
            }`}
          >
            {saving ? 'Saving…' : mode === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AlternativeRow({ index, alt }: { index: number; alt: RewriteAlternative }) {
  const [copied, setCopied] = useState(false)
  const d = alt.scoreDelta
  return (
    <div className="rounded-lg border border-gray-100 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 bg-gray-50">
        <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">
          {index}
        </span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CONFIDENCE_BADGE[alt.confidence]}`}>
          {alt.confidence}
        </span>
        <span className="flex-1" />
        <button
          onClick={() => { void navigator.clipboard.writeText(alt.text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className="text-xs px-2 py-0.5 rounded border border-teal-500 text-teal-600 hover:bg-teal-50 transition-colors"
        >
          {copied ? 'Copied ✓' : 'Use this'}
        </button>
      </div>
      <div className="px-3 py-2.5 space-y-1.5">
        <p className="text-sm text-gray-700">{alt.text}</p>
        <p className="text-xs text-gray-400 italic">{alt.rationale}</p>
        <p className="text-xs text-gray-500">
          Load: <strong>{Math.round(alt.scores.cognitiveLoad)}</strong>
          {d.cognitiveLoad !== 0 && (
            <span className={d.cognitiveLoad < 0 ? 'text-emerald-600' : 'text-red-500'}>
              {' '}({d.cognitiveLoad > 0 ? '+' : ''}{Math.round(d.cognitiveLoad)})
            </span>
          )}
          {' · '}Manip: <strong>{Math.round(alt.scores.manipulationRisk)}</strong>
          {d.manipulationRisk !== 0 && (
            <span className={d.manipulationRisk < 0 ? 'text-emerald-600' : 'text-red-500'}>
              {' '}({d.manipulationRisk > 0 ? '+' : ''}{Math.round(d.manipulationRisk)})
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

function ActGatedCard({ item }: { item: ActGatedItem }) {
  const [expanded, setExpanded] = useState(false)
  const [modal, setModal] = useState<'approve' | 'reject' | null>(null)

  // Per-item rewrite cache — survives collapse/expand cycles
  const altCache = useRef<RewriteAlternative[] | null>(null)
  const [altsLoading, setAltsLoading] = useState(false)
  const [alternatives, setAlternatives] = useState<RewriteAlternative[] | null>(null)
  const [altsFallback, setAltsFallback] = useState(false)

  function handleToggle() {
    const next = !expanded
    setExpanded(next)
    if (next && !altCache.current) {
      void loadAlternatives()
    }
  }

  async function loadAlternatives() {
    setAltsLoading(true)
    const s = item.cognitive_scores
    try {
      const res = await rewrite({
        originalText: originalTextFor(item),
        copyType: copyTypeFor(item),
        scores: {
          cognitiveLoad: s.cognitive_load,
          comprehensionConfidence: s.comprehension,
          emotionalValence: 50,
          trustCoherence: s.trust,
          manipulationRisk: s.manipulation_risk,
          cognitiveRisk: s.cognitive_load > 70 || s.manipulation_risk > 60 ? 'HIGH' : 'MEDIUM',
        },
        taxonomy: taxonomyFor(item),
        workspaceId: 'ws-1',
      })
      altCache.current = res.alternatives
      setAlternatives(res.alternatives)
    } catch {
      // Fallback: convert existing string alternatives to RewriteAlternative shape
      const fb: RewriteAlternative[] = item.alternatives.map((text) => ({
        text,
        rationale: 'Fallback alternative — live generation requires the rewrite service.',
        confidence: 'MEDIUM' as const,
        scores: {
          cognitiveLoad: Math.max(20, s.cognitive_load - 15),
          comprehensionConfidence: Math.min(90, s.comprehension + 10),
          emotionalValence: 50,
          trustCoherence: Math.min(80, s.trust + 8),
          manipulationRisk: Math.max(5, s.manipulation_risk - 35),
          cognitiveRisk: 'LOW' as const,
        },
        scoreDelta: {
          cognitiveLoad: -15,
          comprehensionConfidence: 10,
          trustCoherence: 8,
          manipulationRisk: -35,
        },
      }))
      altCache.current = fb
      setAlternatives(fb)
      setAltsFallback(true)
    } finally {
      setAltsLoading(false)
    }
  }

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
          {item.status === 'pending' && DECISION_DEADLINES[item.id] && (
            <p className="text-xs text-orange-500 font-medium mt-0.5">
              Decision required by: {DECISION_DEADLINES[item.id]}
            </p>
          )}
        </div>
        <button
          onClick={handleToggle}
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
              <div className="flex flex-col items-center">
                <ScoreGauge label="Cognitive Load" value={item.cognitive_scores.cognitive_load} invert size="sm" />
                <span className="text-xs text-gray-400 mt-0.5">± 7</span>
              </div>
              <div className="flex flex-col items-center">
                <ScoreGauge label="Comprehension" value={item.cognitive_scores.comprehension} size="sm" />
                <span className="text-xs text-gray-400 mt-0.5">± 9</span>
              </div>
              <div className="flex flex-col items-center">
                <ScoreGauge label="Trust" value={item.cognitive_scores.trust} size="sm" />
                <span className="text-xs text-gray-400 mt-0.5">± 6</span>
              </div>
              <div className="flex flex-col items-center">
                <ScoreGauge label="Manipulation" value={item.cognitive_scores.manipulation_risk} invert size="sm" />
                <span className="text-xs text-gray-400 mt-0.5">± 5</span>
              </div>
            </div>
          </div>

          {/* Top brain regions */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Top Brain Regions</p>
            <p className="text-sm text-gray-600">Prefrontal cortex · Anterior cingulate · Limbic system</p>
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

          {/* Alternatives Considered */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Alternatives Considered</p>
              {altsLoading && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Spinner />
                  Generating alternatives…
                </span>
              )}
            </div>

            {altsFallback && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1 mb-2">
                (Demo mode — live generation requires rewrite service)
              </p>
            )}

            {/* Loading skeleton */}
            {altsLoading && (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="animate-pulse rounded-lg bg-gray-100 h-14" />
                ))}
              </div>
            )}

            {/* Live or fallback alternatives */}
            {!altsLoading && alternatives && (
              <div className="space-y-2">
                {alternatives.map((alt, i) => (
                  <AlternativeRow key={i} index={i + 1} alt={alt} />
                ))}
              </div>
            )}
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
  const { actGatedQueue } = useAppContext()

  const pending = actGatedQueue.filter((i) => i.status === 'pending')
  const resolved = actGatedQueue.filter((i) => i.status !== 'pending')

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
    </div>
  )
}
