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

const CATEGORY_LABELS: Record<string, string> = {
  false_urgency: 'False Urgency',
  authority_mimicry: 'Authority Mimicry',
  ambiguity_exploitation: 'Ambiguity Exploitation',
  social_proof_fabrication: 'Social Proof Fabrication',
  sycophantic_drift: 'Sycophantic Drift',
  obfuscation: 'Obfuscation',
}

const CATEGORY_EXPLANATIONS: Record<string, string> = {
  false_urgency: 'Analysis detected artificial urgency patterns designed to pressure action before rational evaluation. The high emotional activation combined with low rational engagement indicates the output is engineered to trigger impulsive responses.',
  authority_mimicry: 'Analysis detected unverified authority claims and credential inflation. The output references experts or institutions without substantiation, designed to bypass critical evaluation through false credibility.',
  ambiguity_exploitation: 'Analysis detected deliberately vague language that allows multiple interpretations. This exploits ambiguity to avoid accountability while steering the reader toward a desired conclusion.',
  social_proof_fabrication: 'Analysis detected unverified social proof and fabricated consensus claims. The output manufactures agreement or popularity to override independent judgment.',
  sycophantic_drift: 'Analysis detected excessive validation without substance. The output prioritizes agreement over accuracy, reinforcing the reader\'s existing beliefs rather than providing honest assessment.',
  obfuscation: 'Analysis detected unnecessary complexity used to obscure meaning. Dense jargon and convoluted structure make it difficult to evaluate the actual claims being made.',
}

const CATEGORY_ACTIONS: Record<string, string[]> = {
  false_urgency: [
    'Review and rewrite urgency language before deployment',
    'Remove or soften time-pressure phrases ("act now", "limited time")',
    'Add this pattern to the post-remediation monitoring queue',
  ],
  authority_mimicry: [
    'Verify or remove unsubstantiated authority claims',
    'Replace vague expert references with specific, verifiable sources',
    'Flag for red team review of credential claims',
  ],
  ambiguity_exploitation: [
    'Rewrite vague statements with specific, measurable claims',
    'Ensure each sentence has a single clear interpretation',
    'Flag ambiguous terms for editorial review',
  ],
  social_proof_fabrication: [
    'Verify all social proof claims with actual data',
    'Remove unsubstantiated popularity or consensus claims',
    'Replace fabricated testimonials with verified ones',
  ],
  sycophantic_drift: [
    'Reduce validating language and add substantive content',
    'Ensure the output provides honest assessment, not flattery',
    'Flag for calibration review — model may need alignment tuning',
  ],
  obfuscation: [
    'Simplify sentence structure — one idea per sentence',
    'Replace jargon with plain-language equivalents',
    'Break complex paragraphs into scannable bullet points',
  ],
}

function deriveTaxonomy(category: string, score: number) {
  const all = Object.keys(CATEGORY_LABELS)
  return all.map((key) => ({
    key,
    label: CATEGORY_LABELS[key] ?? key.replace(/_/g, ' '),
    score: key === category ? score : Math.max(3, Math.round(score * (0.05 + Math.random() * 0.25))),
  }))
}

function deriveScores(score: number) {
  const manipulationRisk = score
  const cognitiveLoad = Math.min(95, Math.round(40 + score * 0.45 + Math.random() * 10))
  const comprehension = Math.max(15, Math.round(85 - score * 0.55 - Math.random() * 8))
  const trust = Math.max(10, Math.round(80 - score * 0.6 - Math.random() * 10))
  return [
    { label: 'Cognitive Load', value: cognitiveLoad, color: cognitiveLoad > 65 ? 'text-amber-600' : 'text-teal-600' },
    { label: 'Comprehension', value: comprehension, color: comprehension < 50 ? 'text-red-500' : 'text-teal-600' },
    { label: 'Trust', value: trust, color: trust < 40 ? 'text-red-500' : 'text-teal-600' },
    { label: 'Manipulation', value: manipulationRisk, color: manipulationRisk > 60 ? 'text-red-600' : 'text-amber-600' },
  ]
}

function HighlightedExcerpt({ text }: { text: string }) {
  const words = text.split(/(\s+)/)
  const triggerWords = new Set(['act now', 'limited time', 'only', 'experts', 'unanimously', 'agree', 'verified', 'guaranteed', 'absolutely', 'right', 'spot on', 'synergistic', 'multifaceted', 'leverages', 'dynamic', 'remaining', 'expires', 'midnight', 'tonight', 'leading', 'institutions'])
  return (
    <p className="text-sm text-gray-700 leading-relaxed font-mono">
      {words.map((w, i) => {
        const lower = w.toLowerCase().replace(/[.,!…"'—]/g, '')
        return triggerWords.has(lower)
          ? <mark key={i} className="bg-red-100 text-red-700 rounded px-0.5">{w}</mark>
          : <span key={i}>{w}</span>
      })}
    </p>
  )
}

export function EvidenceDrawer({ entry, onClose }: Props) {
  const open = entry !== null

  const taxonomy = entry ? deriveTaxonomy(entry.category, entry.score) : []
  const scores = entry ? deriveScores(entry.score) : []
  const emotionalActivation = entry ? Math.min(0.98, entry.score / 100 + 0.05) : 0
  const rationalEngagement = entry ? Math.max(0.1, 1 - entry.score / 100 - 0.1) : 0
  const explanation = entry ? (CATEGORY_EXPLANATIONS[entry.category] ?? `Analysis detected ${entry.category.replace(/_/g, ' ')} patterns in this output.`) : ''
  const actions = entry ? (CATEGORY_ACTIONS[entry.category] ?? ['Review this output before deployment', 'Flag for red team review', 'Add to post-remediation monitoring queue']) : []

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
        aria-label="Cognitive Evidence Package"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-800">Cognitive Evidence Package</h2>
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
        <div className="flex-1 overflow-y-auto p-5 pb-10 space-y-5">

          {/* Section 1: Cognitive Scores */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cognitive Scores</p>
            <div className="grid grid-cols-4 gap-3 bg-gray-50 rounded-xl p-3 border border-gray-100">
              {scores.map(({ label, value, color }) => (
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
              {taxonomy.map(({ key, label, score }) => (
                <div key={key} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm ${score >= 70 ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <span className={score >= 70 ? 'text-red-700 font-semibold' : 'text-gray-600'}>{label}</span>
                  <span className={`font-bold tabular-nums ${score >= 70 ? 'text-red-600' : 'text-gray-500'}`}>{score}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Risk Signature */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Risk Signature</p>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Emotional activation</span>
                  <span className="font-bold text-red-600">{emotionalActivation.toFixed(2)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${emotionalActivation * 100}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Rational engagement</span>
                  <span className="font-bold text-blue-600">{rationalEngagement.toFixed(2)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${rationalEngagement * 100}%` }} />
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2 italic">High emotional / low rational ratio = manipulation signal</p>
          </div>

          {/* Section 4: Evidence Snippets */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Evidence Snippets</p>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              {entry ? <HighlightedExcerpt text={entry.excerpt} /> : null}
            </div>
          </div>

          {/* Section 5: Plain-Language Explanation */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Plain-Language Explanation</p>
            <p className="text-sm text-gray-600 leading-relaxed">{explanation}</p>
          </div>

          {/* Section 6: Recommended Actions */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recommended Actions</p>
            <ul className="space-y-2">
              {actions.map((action) => (
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
