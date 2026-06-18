import { useState } from 'react'
import { scoreText } from '../api/scoringApi.js'
import { rewrite } from '../api/rewriteApi.js'
import type { RewriteAlternative } from '../api/rewriteApi.js'
import type { LiveScoreResult } from '../api/scoringApi.js'
import { Spinner } from './Spinner.js'
import { CognitiveScoreCard } from './CognitiveScoreCard.js'
import type { CognitiveScores, CognitiveTaxonomy } from './CognitiveScoreCard.js'
import { useAppContext } from '../context/AppContext.js'

// ── Copy type mapping ─────────────────────────────────────────────────────────

const COPY_TYPES = [
  { label: 'Campaign copy',  value: 'campaign'      },
  { label: 'Landing page',   value: 'landing_page'  },
  { label: 'Email',          value: 'campaign'      },
  { label: 'Social ad',      value: 'campaign'      },
  { label: 'CTA',            value: 'microcopy'     },
] as const

type CopyTypeValue = typeof COPY_TYPES[number]['value']

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLiveHealth(s: LiveScoreResult): 'FLAGGED' | 'NEEDS_REVIEW' | 'CLEAR' {
  if (s.manipulation_risk > 60 || s.cognitive_load > 75 || s.comprehension_confidence < 40) return 'FLAGGED'
  if (s.manipulation_risk > 40 || s.cognitive_load > 60 || s.comprehension_confidence < 55 || s.trust_coherence < 50)
    return 'NEEDS_REVIEW'
  return 'CLEAR'
}

function toCardScores(s: LiveScoreResult): CognitiveScores {
  return {
    cognitiveLoad: s.cognitive_load,
    comprehensionConfidence: s.comprehension_confidence,
    trustCoherence: s.trust_coherence,
    manipulationRisk: s.manipulation_risk,
  }
}

function inferTaxonomy(s: LiveScoreResult): CognitiveTaxonomy {
  return {
    falseUrgency:           s.manipulation_risk > 50 ? 70 : 20,
    socialProofFabrication: s.manipulation_risk > 60 ? 55 : 10,
    ambiguityExploitation:  s.comprehension_confidence < 45 ? 65 : 15,
    authorityMimicry:       s.trust_coherence < 40 ? 60 : 10,
    sycophantidDrift:       0,
    obfuscation:            s.cognitive_load > 70 ? 55 : 10,
  }
}

function makeFallbackRewrites(s: LiveScoreResult): RewriteAlternative[] {
  const base: CognitiveScores = {
    cognitiveLoad:           Math.max(20, s.cognitive_load - 15),
    comprehensionConfidence: Math.min(90, s.comprehension_confidence + 12),
    trustCoherence:          Math.min(85, s.trust_coherence + 10),
    manipulationRisk:        Math.max(5, s.manipulation_risk - 38),
  }
  const delta = (b: CognitiveScores): RewriteAlternative['scoreDelta'] => ({
    cognitiveLoad:           b.cognitiveLoad - s.cognitive_load,
    comprehensionConfidence: b.comprehensionConfidence - s.comprehension_confidence,
    trustCoherence:          b.trustCoherence - s.trust_coherence,
    manipulationRisk:        b.manipulationRisk - s.manipulation_risk,
  })
  const cognitiveRisk = 'LOW' as const
  return [
    {
      text: 'See how this works in two minutes — no commitment required.',
      rationale: 'Removed urgency language and replaced with a specific, credible time estimate.',
      scores: { ...base, emotionalValence: s.emotional_valence, cognitiveRisk },
      scoreDelta: delta(base),
      confidence: 'HIGH',
    },
    {
      text: 'Join teams who use this to improve their results.',
      rationale: 'Replaced unverifiable social proof with a factual description of use case.',
      scores: { ...base, manipulationRisk: base.manipulationRisk + 5, emotionalValence: s.emotional_valence, cognitiveRisk },
      scoreDelta: delta({ ...base, manipulationRisk: base.manipulationRisk + 5 }),
      confidence: 'MEDIUM',
    },
    {
      text: 'Learn more about how this fits your workflow.',
      rationale: 'Replaced high-pressure CTA with a lower-friction, reader-led action.',
      scores: { ...base, manipulationRisk: base.manipulationRisk + 10, emotionalValence: s.emotional_valence, cognitiveRisk },
      scoreDelta: delta({ ...base, manipulationRisk: base.manipulationRisk + 10 }),
      confidence: 'LOW',
    },
  ]
}

const CONFIDENCE_BADGE: Record<string, string> = {
  HIGH:   'bg-emerald-100 text-emerald-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW:    'bg-gray-100 text-gray-500',
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="text-xs px-3 py-1.5 rounded-lg border border-teal-500 text-teal-600 hover:bg-teal-50 transition-colors font-medium"
    >
      {copied ? 'Copied ✓' : 'Use this version'}
    </button>
  )
}

// ── AlternativeCard ───────────────────────────────────────────────────────────

function AlternativeCard({
  alt,
  originalScores,
}: {
  alt: RewriteAlternative
  originalScores: LiveScoreResult
}) {
  const [showComparison, setShowComparison] = useState(false)
  const afterScores: CognitiveScores = {
    cognitiveLoad:           alt.scores.cognitiveLoad,
    comprehensionConfidence: alt.scores.comprehensionConfidence,
    trustCoherence:          alt.scores.trustCoherence,
    manipulationRisk:        alt.scores.manipulationRisk,
  }
  const beforeScores = toCardScores(originalScores)

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CONFIDENCE_BADGE[alt.confidence]}`}>
          {alt.confidence}
        </span>
        <span className="flex-1" />
        <button
          onClick={() => setShowComparison(true)}
          className="text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors font-medium"
        >
          Use this version
        </button>
        <CopyButton text={alt.text} />
      </div>
      <div className="px-4 py-3 space-y-2">
        <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-800 leading-relaxed border-l-4 border-teal-400">
          {alt.text}
        </div>
        <p className="text-xs text-gray-400 italic">{alt.rationale}</p>
      </div>
      {showComparison && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          <CognitiveScoreCard
            scores={afterScores}
            originalScores={beforeScores}
            showToggle={false}
            defaultMode="manager"
          />
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function MessageClarityScorer() {
  const { addAgentFeedEntry } = useAppContext()

  const [text, setText] = useState('')
  const [charCount, setCharCount] = useState(0)
  const [selectedType, setSelectedType] = useState<CopyTypeValue>('campaign')
  const [selectedTypeLabel, setSelectedTypeLabel] = useState('Campaign copy')

  const [scoring, setScoring] = useState(false)
  const [scores, setScores] = useState<LiveScoreResult | null>(null)
  const [scoreError, setScoreError] = useState<string | null>(null)

  const [rewriting, setRewriting] = useState(false)
  const [alternatives, setAlternatives] = useState<RewriteAlternative[] | null>(null)
  const [rewriteFallback, setRewriteFallback] = useState(false)

  const health = scores ? toLiveHealth(scores) : null
  const taxonomy = scores ? inferTaxonomy(scores) : undefined
  const needsRewrite = health === 'FLAGGED' || health === 'NEEDS_REVIEW'

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value.slice(0, 2000)
    setText(v)
    setCharCount(v.length)
  }

  async function handleScore() {
    if (!text.trim()) return
    setScoring(true)
    setScores(null)
    setScoreError(null)
    setAlternatives(null)
    setRewriteFallback(false)
    try {
      const result = await scoreText(text.trim())
      setScores(result)
    } catch (err) {
      setScoreError(err instanceof Error ? err.message : 'Scoring failed')
    } finally {
      setScoring(false)
    }
  }

  async function handleRewrite() {
    if (!scores) return
    setRewriting(true)
    setAlternatives(null)
    setRewriteFallback(false)
    try {
      const result = await rewrite({
        originalText: text.trim(),
        copyType: selectedType,
        scores: {
          cognitiveLoad:           scores.cognitive_load,
          comprehensionConfidence: scores.comprehension_confidence,
          emotionalValence:        scores.emotional_valence,
          trustCoherence:          scores.trust_coherence,
          manipulationRisk:        scores.manipulation_risk,
          cognitiveRisk:           scores.cognitive_risk,
        },
        ...(taxonomy ? { taxonomy } : {}),
        workspaceId: 'ws-1',
      })
      setAlternatives(result.alternatives)
      addAgentFeedEntry({
        action_type: 'PROMPT_EVALUATED',
        zone: 'RECOMMEND',
        status: 'executed',
        description: `3 safer ${selectedTypeLabel.toLowerCase()} alternatives generated via ${result.modelUsed}.`,
      })
    } catch {
      setAlternatives(makeFallbackRewrites(scores))
      setRewriteFallback(true)
    } finally {
      setRewriting(false)
    }
  }

  function handleClear() {
    setText('')
    setCharCount(0)
    setScores(null)
    setScoreError(null)
    setAlternatives(null)
    setRewriteFallback(false)
  }

  const headerLine = health === 'FLAGGED'
    ? '⚠ This copy needs work before it goes live.'
    : health === 'NEEDS_REVIEW'
    ? '⚠ This copy has some issues worth fixing.'
    : health === 'CLEAR'
    ? '✓ This copy looks good.'
    : null

  const headerColor = health === 'CLEAR' ? 'text-emerald-700' : 'text-amber-700'

  return (
    <div className="space-y-4">
      {/* Input */}
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={handleTextChange}
          rows={5}
          placeholder="Paste your copy here — headline, email subject line, value proposition, or any marketing copy..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 resize-y focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-400"
          aria-label="Copy to check"
        />
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1.5">
            {COPY_TYPES.map((ct) => (
              <button
                key={ct.label}
                onClick={() => { setSelectedType(ct.value); setSelectedTypeLabel(ct.label) }}
                className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                  selectedTypeLabel === ct.label
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                }`}
              >
                {ct.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400 tabular-nums shrink-0">{charCount}/2000</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { void handleScore() }}
            disabled={scoring || !text.trim()}
            className="flex items-center gap-1.5 text-sm bg-brand-500 text-white px-4 py-1.5 rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {scoring && <Spinner />}
            {scoring ? 'Analysing your copy...' : 'Check this copy'}
          </button>
          <button
            onClick={handleClear}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {scoreError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          {scoreError}
        </div>
      )}

      {/* Score result */}
      {scores && (
        <div className="space-y-3">
          {headerLine && (
            <p className={`text-sm font-bold ${headerColor}`}>{headerLine}</p>
          )}
          <CognitiveScoreCard
            scores={toCardScores(scores)}
            {...(taxonomy !== undefined ? { taxonomy } : {})}
            context={`${selectedTypeLabel} copy`}
          />

          {/* Rewrite trigger */}
          {needsRewrite && !alternatives && (
            <button
              onClick={() => { void handleRewrite() }}
              disabled={rewriting}
              className="w-full flex items-center justify-center gap-1.5 text-sm px-4 py-2.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {rewriting && <Spinner />}
              {rewriting ? 'Finding better ways to say this...' : 'Show me better alternatives'}
            </button>
          )}
        </div>
      )}

      {/* Alternatives */}
      {alternatives && (
        <div className="space-y-3">
          {rewriteFallback && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              (Example suggestions — rewrite service unavailable)
            </p>
          )}
          {alternatives.map((alt, i) => (
            <AlternativeCard key={i} alt={alt} originalScores={scores!} />
          ))}
        </div>
      )}
    </div>
  )
}
