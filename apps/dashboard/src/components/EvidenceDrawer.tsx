interface FeedEntry {
  id: number
  category: string
  score: number
  time: string
  excerpt: string
}

interface Props {
  entry: FeedEntry | null
  onClose: () => void
}

const TAXONOMY = [
  { key: 'false_urgency',            label: 'False Urgency',            score: 84 },
  { key: 'authority_mimicry',        label: 'Authority Mimicry',        score: 12 },
  { key: 'ambiguity_exploitation',   label: 'Ambiguity Exploitation',   score: 23 },
  { key: 'social_proof_fabrication', label: 'Social Proof Fabrication', score:  8 },
  { key: 'sycophantic_drift',        label: 'Sycophantic Drift',        score:  6 },
  { key: 'obfuscation',              label: 'Obfuscation',              score: 15 },
]

const HIGHLIGHTED_PHRASES = ['Act now', 'experts unanimously agree', 'Limited time only']
const FULL_TEXT = 'Act now — experts unanimously agree. Limited time only applies to all new accounts.'

function HighlightedText({ text }: { text: string }) {
  const parts: { text: string; highlight: boolean }[] = []
  let remaining = text
  while (remaining.length > 0) {
    let earliest = -1
    let earliestPhrase = ''
    for (const phrase of HIGHLIGHTED_PHRASES) {
      const idx = remaining.indexOf(phrase)
      if (idx !== -1 && (earliest === -1 || idx < earliest)) {
        earliest = idx
        earliestPhrase = phrase
      }
    }
    if (earliest === -1) {
      parts.push({ text: remaining, highlight: false })
      break
    }
    if (earliest > 0) parts.push({ text: remaining.slice(0, earliest), highlight: false })
    parts.push({ text: earliestPhrase, highlight: true })
    remaining = remaining.slice(earliest + earliestPhrase.length)
  }

  return (
    <p className="text-sm text-gray-700 leading-relaxed font-mono">
      {parts.map((p, i) =>
        p.highlight
          ? <mark key={i} className="bg-red-100 text-red-700 rounded px-0.5 not-italic">{p.text}</mark>
          : <span key={i}>{p.text}</span>
      )}
    </p>
  )
}

export function EvidenceDrawer({ entry, onClose }: Props) {
  const open = entry !== null

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Neural Evidence Package"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-800">Neural Evidence Package</h2>
            {entry && (
              <p className="text-xs text-gray-400 mt-0.5">{entry.category.replace(/_/g, ' ')} · score {entry.score}/100 · {entry.time}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none focus:outline-none"
            aria-label="Close drawer"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Section 1: Cognitive Scores */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Neural Evidence — Cognitive Scores</p>
            <div className="grid grid-cols-4 gap-3 bg-gray-50 rounded-xl p-3 border border-gray-100">
              {[
                { label: 'Cognitive Load', value: 71, color: 'text-amber-600' },
                { label: 'Comprehension',  value: 38, color: 'text-red-500'  },
                { label: 'Trust',          value: 29, color: 'text-red-500'  },
                { label: 'Manipulation',   value: 84, color: 'text-danger'   },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 2: Taxonomy Breakdown */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Taxonomy Breakdown</p>
            <div className="space-y-1.5">
              {TAXONOMY.map(({ key, label, score }) => (
                <div key={key} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm ${score >= 70 ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <span className={score >= 70 ? 'text-red-700 font-semibold' : 'text-gray-600'}>{label}</span>
                  <span className={`font-bold tabular-nums ${score >= 70 ? 'text-red-600' : 'text-gray-500'}`}>{score}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Activation Signature */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Activation Signature</p>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Limbic activation</span>
                  <span className="font-bold text-red-600">0.82</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: '82%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Prefrontal engagement</span>
                  <span className="font-bold text-blue-600">0.31</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: '31%' }} />
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2 italic">High limbic / low prefrontal ratio = manipulation signal</p>
          </div>

          {/* Section 4: Evidence Snippets */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Evidence Snippets</p>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <HighlightedText text={FULL_TEXT} />
            </div>
          </div>

          {/* Section 5: Plain-Language Explanation */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Plain-Language Explanation</p>
            <p className="text-sm text-gray-600 leading-relaxed">
              TRIBE detected false urgency patterns in this output. The high limbic activation combined with low prefrontal engagement indicates the output is designed to trigger emotional response and bypass rational evaluation. Two manipulation taxonomy categories exceeded the 70/100 threshold.
            </p>
          </div>

          {/* Section 6: Recommended Actions */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recommended Actions</p>
            <ul className="space-y-2">
              {[
                'Review and rewrite the urgency language before deployment',
                'Flag this output pattern for red team review',
                'Add this pattern to the post-remediation monitoring queue',
              ].map((action) => (
                <li key={action} className="flex gap-2 text-sm text-gray-600">
                  <span className="text-brand-500 shrink-0">›</span>
                  {action}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}
