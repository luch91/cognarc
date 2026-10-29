import { useState } from 'react'
import { rewrite } from '../api/rewriteApi.js'
import type { RewriteAlternative } from '../api/rewriteApi.js'
import { useAppContext } from '../context/AppContext.js'
import { Card } from './Card.js'
import { Spinner } from './Spinner.js'

const RISK_COLOR: Record<string, string> = {
  LOW: 'text-green-600 bg-green-50',
  MEDIUM: 'text-amber-600 bg-amber-50',
  HIGH: 'text-red-600 bg-red-50',
}

function Gauge({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  const bad = invert ? value > 65 : value < 40
  const warn = invert ? value > 45 : value < 60
  const color = bad ? 'bg-red-400' : warn ? 'bg-amber-400' : 'bg-teal-400'
  const textColor = bad ? 'text-red-600' : warn ? 'text-amber-600' : 'text-teal-600'
  return (
    <div className="flex flex-col gap-1 min-w-[90px]">
      <span className="text-xs text-gray-400 font-medium whitespace-nowrap">{label}</span>
      <div className="flex items-end gap-1.5">
        <span className={`text-2xl font-bold tabular-nums ${textColor}`}>{value}</span>
        <span className="text-xs text-gray-400 mb-0.5">/100</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

const EXAMPLE_PROMPTS = [
  'Complete your setup now — only 3 spots remaining before midnight!',
  'Welcome! Here are three quick things you can do to get started.',
  'As leading neuroscientists unanimously confirm, this decision framework guarantees success.',
]

function explainCognitiveLoad(v: number): string {
  return v > 75 ? 'Elevated complexity index. Review sentence length, reading difficulty and structure.'
    : v > 55 ? 'Elevated complexity index. Simplifying structure may improve readability.'
    : v > 35 ? 'Moderate complexity index; actual mental workload has not been measured.'
    : 'Low complexity index; actual mental workload has not been measured.'
}

function explainComprehension(v: number): string {
  return v > 75 ? 'High clarity proxy; actual comprehension requires user testing.'
    : v > 55 ? 'Moderate clarity proxy; check ambiguous wording with users.'
    : v > 35 ? 'Low clarity proxy; simplify the language and test comprehension.'
    : 'Low clarity proxy; user comprehension is unverified.'
}

function explainTrust(v: number): string {
  return v > 75 ? 'Few claim-pattern indicators identified; user trust remains unmeasured.'
    : v > 55 ? 'Some claim-pattern indicators identified; verify evidence and context.'
    : v > 35 ? 'Several claim-pattern indicators require contextual review.'
    : 'Multiple claim-pattern indicators require verification; intent is unknown.'
}

function explainManipulation(v: number): string {
  return v > 60 ? 'High pressure-language indicator; review context before assessing manipulation.'
    : v > 35 ? 'Moderate pressure-language indicator; context and intent are not verified.'
    : 'Few pressure-language markers found; absence does not establish safety.'
}

const CONFIDENCE_COLOR: Record<string, string> = {
  HIGH:   'bg-emerald-100 text-emerald-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW:    'bg-gray-100 text-gray-500',
}

export function LiveScorePanel() {
  const {
    lastLiveScoreResult: result, lastLiveScoreText,
    liveScoreLoading: loading, liveScoreProgress: progress, liveScoreError: error,
    runLiveScore,
  } = useAppContext()
  const [text, setText] = useState(lastLiveScoreText)

  const [rewrites, setRewrites] = useState<RewriteAlternative[] | null>(null)
  const [rewriteLoading, setRewriteLoading] = useState(false)
  const [rewriteFallback, setRewriteFallback] = useState(false)

  function handleScore() {
    if (!text.trim() || loading) return
    setRewrites(null)
    setRewriteFallback(false)
    runLiveScore(text.trim(), 'accurate')
  }

  async function handleGetRewrites() {
    if (!result || rewriteLoading || rewrites) return
    setRewriteLoading(true)
    try {
      const res = await rewrite({
        originalText: lastLiveScoreText,
        copyType: 'microcopy',
        scores: {
          cognitiveLoad: result.cognitive_load,
          comprehensionConfidence: result.comprehension_confidence,
          emotionalValence: result.emotional_valence,
          trustCoherence: result.trust_coherence,
          manipulationRisk: result.manipulation_risk,
          cognitiveRisk: result.cognitive_risk,
        },
        taxonomy: {},
        workspaceId: 'ws-1',
      })
      setRewrites(res.alternatives)
    } catch {
      setRewriteFallback(true)
      setRewrites(null)
    } finally {
      setRewriteLoading(false)
    }
  }

  return (
    <Card
      title="Live Cognitive Score"
      action={
        result ? (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RISK_COLOR[result.cognitive_risk]}`}>
            {result.cognitive_risk} {result.scoring_provenance.policy_eligible ? 'RISK' : 'INDEX'}
          </span>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {/* Examples */}
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_PROMPTS.map((p, i) => (
            <button
              key={i}
              onClick={() => { setText(p); setRewrites(null) }}
              className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors truncate max-w-[220px]"
              title={p}
            >
              {p.slice(0, 40)}…
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-500">
          Engine routing is configured on the scoring service. Mathematical fallback for
          supported text is reported with its provenance after evaluation.
        </p>

        {/* Input */}
        <div className="flex gap-2 items-start">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste any text, prompt, or UI copy to score…"
            rows={3}
            disabled={loading}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleScore()
            }}
          />
          <button
            onClick={handleScore}
            disabled={!text.trim() || loading}
            className="shrink-0 text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? <Spinner /> : 'Score'}
          </button>
        </div>

        {/* Loading state with progress */}
        {loading && progress && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Spinner />
              <p className="text-xs text-gray-600 font-medium">{progress.phase}</p>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-400 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400">
              {progress.elapsed_s != null ? `${progress.elapsed_s}s elapsed · ` : ''}
              Cold start ~5 min · warm requests ~30s
            </p>
          </div>
        )}
        {loading && !progress && (
          <p className="text-xs text-gray-400 animate-pulse">
            Connecting to scoring service…
          </p>
        )}

        {/* Error */}
        {!loading && error && (
          <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        {/* Results */}
        {!loading && result && (
          <div className="space-y-4 pt-1">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs" role="status">
              <div className="flex flex-wrap gap-2 items-center text-amber-900 font-semibold">
                <span>Engine: {result.scoring_provenance.engine === 'mathematical' ? 'CME mathematical' : 'TRIBE experimental'}</span>
                <span className="px-2 py-0.5 rounded bg-amber-100">{result.scoring_provenance.calibration_status}</span>
                {result.scoring_provenance.fallback_used && <span>Fallback: {result.scoring_provenance.fallback_reason}</span>}
              </div>
              <p className="mt-1 text-amber-800">
                {result.scoring_provenance.policy_eligible
                  ? 'Validated scores may be eligible for policy checks.'
                  : 'Advisory indices only. No automatic enforcement or verified claims about human comprehension, trust or brain activity.'}
              </p>
              {result.scoring_provenance.unestimated_dimensions?.length ? (
                <p className="mt-1 text-amber-800">Not estimated: {result.scoring_provenance.unestimated_dimensions.join(', ')}.</p>
              ) : null}
              {result.scoring_provenance.evidence?.length ? (
                <details className="mt-2">
                  <summary className="cursor-pointer font-semibold">Show linguistic evidence</summary>
                  <ul className="list-disc pl-5 mt-1">
                    {result.scoring_provenance.evidence.map(feature => (
                      <li key={feature.feature}>{feature.feature.replace(/_/g, ' ')}: {feature.count} marker(s)
                        {feature.examples.length ? ' (' + feature.examples.join('; ') + ')' : ''}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-6">
              <Gauge label="Cognitive Load" value={result.cognitive_load} invert />
              <Gauge label="Comprehension" value={result.comprehension_confidence} />
              <Gauge label="Trust Coherence" value={result.trust_coherence} />
              <Gauge label="Manip Risk" value={result.manipulation_risk} invert />
            </div>

            {/* LLM Breakdown — plain-English explanations per score */}
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Score Breakdown</h4>
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-semibold text-gray-600">Cognitive Load — {result.cognitive_load}/100</p>
                  <p className="text-xs text-gray-500 mt-0.5">{explainCognitiveLoad(result.cognitive_load)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-600">Comprehension — {result.comprehension_confidence}/100</p>
                  <p className="text-xs text-gray-500 mt-0.5">{explainComprehension(result.comprehension_confidence)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-600">Trust Coherence — {result.trust_coherence}/100</p>
                  <p className="text-xs text-gray-500 mt-0.5">{explainTrust(result.trust_coherence)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-600">Manipulation Risk — {result.manipulation_risk}/100</p>
                  <p className="text-xs text-gray-500 mt-0.5">{explainManipulation(result.manipulation_risk)}</p>
                </div>
              </div>
              {result.explanation && (
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-xs font-semibold text-gray-600 mb-1">Model Explanation</p>
                  <p className="text-xs text-gray-500">{result.explanation}</p>
                </div>
              )}
            </div>

            {result.top_brain_regions.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 font-medium mb-1.5">Top activated brain regions</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.top_brain_regions.map((r) => (
                    <span key={r} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">{r}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Rewrite Suggestions */}
            <div className="border-t border-gray-100 pt-3">
              {!rewrites && !rewriteLoading && (
                <button
                  onClick={() => void handleGetRewrites()}
                  className="text-xs bg-brand-500 text-white px-3 py-1.5 rounded-lg hover:bg-brand-600 transition-colors"
                >
                  Get Rewrite Suggestions
                </button>
              )}
              {rewriteLoading && (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                  <Spinner />
                  Generating cognitively-safe alternatives…
                </div>
              )}
              {rewriteFallback && (
                <p className="text-xs text-amber-600 mb-2">Rewrite service unavailable. No rewritten scores were generated.</p>
              )}
              {rewrites && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Rewrite Suggestions</h4>
                  {rewrites.map((alt, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CONFIDENCE_COLOR[alt.confidence]}`}>
                          {alt.confidence}
                        </span>
                        <span className="flex-1" />
                        <button
                          onClick={() => { void navigator.clipboard.writeText(alt.text) }}
                          className="text-xs px-2 py-1 rounded border border-teal-500 text-teal-600 hover:bg-teal-50 transition-colors shrink-0"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="text-xs text-gray-700 font-mono leading-relaxed bg-white rounded border border-gray-100 px-2 py-1.5">
                        {alt.text}
                      </p>
                      <p className="text-xs text-gray-400 italic">{alt.rationale}</p>
                      <p className="text-xs text-gray-500">
                        Predicted Load: <strong>{Math.round(alt.scores.cognitiveLoad)}</strong>
                        {' · '}Manip: <strong>{Math.round(alt.scores.manipulationRisk)}</strong>
                        {' · '}CC: <strong>{Math.round(alt.scores.comprehensionConfidence)}</strong>
                        {alt.scoreDelta && (
                          <>
                            {' · '}
                            <span className={alt.scoreDelta.cognitiveLoad < 0 ? 'text-green-600' : 'text-red-500'}>
                              {alt.scoreDelta.cognitiveLoad > 0 ? '+' : ''}{alt.scoreDelta.cognitiveLoad} load
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <span className="text-xs text-gray-400">
                {result.model_version} · {(result.latency_ms / 1000).toFixed(1)}s
              </span>
              <button
                onClick={() => { setText(''); setRewrites(null) }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
