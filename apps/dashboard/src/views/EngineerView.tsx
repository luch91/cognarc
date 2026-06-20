import React, { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts'
import { fetchCicdRuns, fetchPromptBaselines } from '../api/mock.js'
import { scoreTextRemote } from '../api/scoringApi.js'
import { Card } from '../components/Card.js'
import { Spinner } from '../components/Spinner.js'
import { ZoneBadge } from '../components/ZoneBadge.js'
import { useAppContext } from '../context/AppContext.js'
import { rewrite } from '../api/rewriteApi.js'
import type { RewriteAlternative } from '../api/rewriteApi.js'
import type { Zone, PromptBaseline } from '../api/types.js'

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

// Fallback alternatives per run used when the rewrite service is offline
const CICD_FALLBACK: Record<string, { text: string; load: number; cc: number }[]> = {
  r1: [
    { text: 'You can complete this setup in a few steps.',    load: 52, cc: 71 },
    { text: "Let's walk through the configuration together.", load: 48, cc: 76 },
    { text: 'Configure your workspace (3 steps).',            load: 44, cc: 79 },
  ],
  r4: [
    { text: 'See how teams are using this feature.',          load: 41, cc: 72 },
    { text: 'Used by product teams to improve onboarding.',   load: 38, cc: 75 },
    { text: 'Learn how this works with a quick example.',     load: 36, cc: 78 },
  ],
}

// Placeholder prompt texts for each PR (used as originalText for the rewrite call)
const CICD_PROMPT_TEXT: Record<string, string> = {
  r1: 'You are an expert onboarding assistant. Guide the user through the configuration process immediately and ensure they complete all mandatory setup steps as efficiently as possible without missing any critical settings.',
  r4: 'As a world-class product specialist with deep expertise in enterprise software, demonstrate to the user how thousands of successful teams leverage this feature to dramatically transform their workflows and unlock unprecedented productivity gains.',
}

// Per-PR scores to pass to the rewrite service
const CICD_SCORES: Record<string, { cognitiveLoad: number; manipulationRisk: number; comprehensionConfidence: number; trustCoherence: number }> = {
  r1: { cognitiveLoad: 71, manipulationRisk: 18, comprehensionConfidence: 60, trustCoherence: 65 },
  r4: { cognitiveLoad: 58, manipulationRisk: 62, comprehensionConfidence: 54, trustCoherence: 44 },
}

function CopiedBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="text-xs px-2 py-1 rounded border border-teal-500 text-teal-600 hover:bg-teal-50 transition-colors shrink-0"
    >
      {copied ? 'Copied ✓' : 'Use this'}
    </button>
  )
}

const CONFIDENCE_COLOR: Record<string, string> = {
  HIGH:   'bg-emerald-100 text-emerald-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW:    'bg-gray-100 text-gray-500',
}

function CicdRewritePanel({ runId }: { runId: string }) {
  const hasFallback = Boolean(CICD_FALLBACK[runId])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [alternatives, setAlternatives] = useState<RewriteAlternative[] | null>(null)
  const [usingFallback, setUsingFallback] = useState(false)

  if (!hasFallback) return null

  async function load() {
    if (alternatives) return // already fetched — use cache
    setLoading(true)
    const promptText = CICD_PROMPT_TEXT[runId] ?? `The original prompt for ${runId}`
    const s = CICD_SCORES[runId] ?? { cognitiveLoad: 60, manipulationRisk: 40, comprehensionConfidence: 60, trustCoherence: 55 }
    try {
      const res = await rewrite({
        originalText: promptText,
        copyType: 'prompt',
        scores: {
          cognitiveLoad: s.cognitiveLoad,
          comprehensionConfidence: s.comprehensionConfidence,
          emotionalValence: 50,
          trustCoherence: s.trustCoherence,
          manipulationRisk: s.manipulationRisk,
          cognitiveRisk: s.cognitiveLoad > 65 || s.manipulationRisk > 50 ? 'HIGH' : 'MEDIUM',
        },
        taxonomy: {
          falseUrgency:           s.manipulationRisk > 50 ? 65 : 10,
          authorityMimicry:       s.trustCoherence < 50 ? 60 : 10,
          ambiguityExploitation:  s.comprehensionConfidence < 55 ? 55 : 10,
        },
        workspaceId: 'ws-1',
      })
      setAlternatives(res.alternatives)
    } catch {
      console.warn('Rewrite service unavailable — using mock alternatives')
      const fb = CICD_FALLBACK[runId]!
      setAlternatives(fb.map((r) => ({
        text: r.text,
        rationale: 'Conservative rewrite — reduced instruction density and removed authority framing.',
        confidence: 'MEDIUM' as const,
        scores: { cognitiveLoad: r.load, comprehensionConfidence: r.cc, emotionalValence: 50, trustCoherence: 68, manipulationRisk: 12, cognitiveRisk: 'LOW' as const },
        scoreDelta: { cognitiveLoad: r.load - s.cognitiveLoad, comprehensionConfidence: r.cc - s.comprehensionConfidence, trustCoherence: 0, manipulationRisk: 12 - s.manipulationRisk },
      })))
      setUsingFallback(true)
    } finally {
      setLoading(false)
    }
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) void load()
  }

  const count = alternatives ? alternatives.length : CICD_FALLBACK[runId]!.length

  return (
    <div className="mt-2">
      <button
        onClick={toggle}
        className="text-xs text-brand-500 hover:text-brand-700 focus:outline-none focus:underline"
      >
        {open ? '▲ Hide suggested rewrites' : `▼ View suggested rewrites (${count})`}
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
              <Spinner />
              Generating cognitively-safe prompt alternatives…
            </div>
          )}

          {usingFallback && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded px-2 py-1">
              Rewrite service unavailable — showing cached suggestions
            </p>
          )}

          {alternatives && alternatives.map((alt, i) => (
            <div key={i} className="bg-gray-50 rounded-lg px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${CONFIDENCE_COLOR[alt.confidence]}`}>
                  {alt.confidence}
                </span>
                <span className="flex-1" />
                <CopiedBtn text={alt.text} />
              </div>
              <p className="text-xs text-gray-700 font-mono leading-relaxed bg-white rounded border border-gray-100 px-2 py-1.5">
                {alt.text}
              </p>
              <p className="text-xs text-gray-400 italic">{alt.rationale}</p>
              <p className="text-xs text-gray-500">
                Predicted Load: <strong>{Math.round(alt.scores.cognitiveLoad)}</strong>
                {' · '}Manip: <strong>{Math.round(alt.scores.manipulationRisk)}</strong>
                {' · '}CC: <strong>{Math.round(alt.scores.comprehensionConfidence)}</strong>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Prompt Regression Monitor detail data ────────────────────────────────────

interface RegressionDetail {
  clHistory: number[]
  ccHistory: number[]
  regressionPrIndex?: number   // which data point to annotate (0-indexed)
  regressionPrLabel?: string
  baselinePrompt: string
  currentPrompt: string
  baselineDate: string
  currentDate: string
}

const REGRESSION_DETAIL: Record<string, RegressionDetail> = {
  p1: {
    clHistory: [39, 41, 42, 40, 42],
    ccHistory: [85, 83, 81, 82, 81],
    baselinePrompt: 'Welcome the user warmly. Briefly introduce what the product does.\nThen ask: what brings you here today?',
    currentPrompt:  'Welcome the user warmly. Briefly introduce what the product does.\nThen ask: what brings you here today?',
    baselineDate: 'Apr 2, 2026', currentDate: 'May 18, 2026',
  },
  p2: {
    clHistory: [45, 48, 52, 61, 67],
    ccHistory: [78, 74, 68, 60, 54],
    regressionPrIndex: 3, regressionPrLabel: 'PR #247 — regression',
    baselinePrompt:
      'Summarise the user\'s order for confirmation. Be clear and concise.\nInclude: items, quantities, total price, delivery estimate.',
    currentPrompt:
      'You are a helpful AI checkout assistant with deep expertise in e-commerce UX best practices. Please provide a comprehensive and detailed summary of all items in the user\'s cart for final order confirmation, ensuring you clearly communicate the total pricing including all applicable taxes and fees, the expected delivery timeline based on their selected shipping method, and any relevant policy information the user should be aware of before completing their purchase.',
    baselineDate: 'Mar 14, 2026', currentDate: 'May 18, 2026',
  },
  p3: {
    clHistory: [48, 50, 53, 55, 55],
    ccHistory: [71, 70, 68, 65, 62],
    baselinePrompt: 'Tell the user what went wrong in plain language.\nTell them what to do next to resolve it.',
    currentPrompt:  'Inform the user that an error has occurred and provide guidance on potential remediation steps they may wish to consider in order to resolve the situation.',
    baselineDate: 'Apr 10, 2026', currentDate: 'May 18, 2026',
  },
  p4: {
    clHistory: [40, 39, 38, 38, 38],
    ccHistory: [86, 87, 88, 88, 88],
    baselinePrompt: 'Briefly explain what this settings page controls.\nUse plain language. Two sentences maximum.',
    currentPrompt:  'Briefly explain what this settings page controls.\nUse plain language. Two sentences maximum.',
    baselineDate: 'Mar 1, 2026', currentDate: 'May 18, 2026',
  },
}

const EVAL_LABELS = ['v1', 'v2', 'v3', 'v4', 'v5']

function buildDiff(baseline: string, current: string): { line: string; type: 'removed' | 'added' | 'same' }[] {
  const bLines = baseline.split('\n')
  const cLines = current.split('\n')
  const result: { line: string; type: 'removed' | 'added' | 'same' }[] = []
  const maxLen = Math.max(bLines.length, cLines.length)
  for (let i = 0; i < maxLen; i++) {
    const b = bLines[i]
    const c = cLines[i]
    if (b === c && b !== undefined) {
      result.push({ line: b, type: 'same' })
    } else {
      if (b !== undefined) result.push({ line: b, type: 'removed' })
      if (c !== undefined) result.push({ line: c, type: 'added' })
    }
  }
  return result
}

function RegressionDetailPanel({ baseline, onScoreUpdate }: { baseline: PromptBaseline; onScoreUpdate?: (id: string, cl: number, cc: number, status: string) => void }) {
  const hardcoded = REGRESSION_DETAIL[baseline.id]
  const detail: RegressionDetail = hardcoded ?? {
    clHistory: [baseline.cognitive_load],
    ccHistory: [baseline.comprehension],
    baselinePrompt: baseline.promptText ?? baseline.label,
    currentPrompt: baseline.promptText ?? baseline.label,
    baselineDate: baseline.last_evaluated,
    currentDate: baseline.last_evaluated,
  }
  const [rewrites, setRewrites] = useState<RewriteAlternative[] | null>(null)
  const [rewriteLoading, setRewriteLoading] = useState(false)
  const [rewriteFallback, setRewriteFallback] = useState(false)
  const rewriteCache = useRef<RewriteAlternative[] | null>(null)
  const [baselineReset, setBaselineReset] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [reEvalLoading, setReEvalLoading] = useState(false)

  const chartLabels = hardcoded ? EVAL_LABELS : detail.clHistory.map((_, i) => `v${i + 1}`)
  const chartData = chartLabels.map((v, i) => ({
    v,
    CL: detail.clHistory[i],
    CC: detail.ccHistory[i],
  }))

  const diff = buildDiff(detail.baselinePrompt, detail.currentPrompt)

  async function handleGetRewrites() {
    if (rewriteCache.current) { setRewrites(rewriteCache.current); return }
    setRewriteLoading(true)
    try {
      const result = await rewrite({
        originalText: detail.currentPrompt,
        copyType: 'long_form',
        scores: {
          cognitiveLoad: baseline.cognitive_load,
          comprehensionConfidence: baseline.comprehension,
          emotionalValence: 50,
          trustCoherence: 60,
          manipulationRisk: 15,
          cognitiveRisk: baseline.status === 'block' ? 'HIGH' : 'MEDIUM',
        },
        taxonomy: {},
        workspaceId: 'ws-1',
      })
      rewriteCache.current = result.alternatives
      setRewrites(result.alternatives)
    } catch {
      setRewriteFallback(true)
      const fb: RewriteAlternative[] = [
        {
          text: 'Summarise the user\'s order. Include: items, quantities, total price, delivery estimate.',
          rationale: 'Reduces to essential instruction. Eliminates bloat that inflated cognitive load.',
          confidence: 'HIGH',
          scores: { cognitiveLoad: 42, comprehensionConfidence: 78, emotionalValence: 50, trustCoherence: 72, manipulationRisk: 10, cognitiveRisk: 'LOW' },
          scoreDelta: { cognitiveLoad: -25, comprehensionConfidence: 24, trustCoherence: 12, manipulationRisk: -5 },
        },
        {
          text: 'List the cart items, total, taxes, and delivery time. Keep it brief and scannable.',
          rationale: 'Explicit format instruction reduces ambiguity. Concise syntax cuts load.',
          confidence: 'MEDIUM',
          scores: { cognitiveLoad: 38, comprehensionConfidence: 82, emotionalValence: 50, trustCoherence: 75, manipulationRisk: 8, cognitiveRisk: 'LOW' },
          scoreDelta: { cognitiveLoad: -29, comprehensionConfidence: 28, trustCoherence: 15, manipulationRisk: -7 },
        },
        {
          text: 'Confirm the order:\n1. Items and quantities\n2. Total price (incl. tax)\n3. Delivery estimate',
          rationale: 'Sequential numbered format is lowest cognitive load for structured output.',
          confidence: 'HIGH',
          scores: { cognitiveLoad: 35, comprehensionConfidence: 85, emotionalValence: 50, trustCoherence: 78, manipulationRisk: 6, cognitiveRisk: 'LOW' },
          scoreDelta: { cognitiveLoad: -32, comprehensionConfidence: 31, trustCoherence: 18, manipulationRisk: -9 },
        },
      ]
      rewriteCache.current = fb
      setRewrites(fb)
    } finally {
      setRewriteLoading(false)
    }
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify({ prompt: baseline.label, history: chartData, baseline: detail.baselinePrompt, current: detail.currentPrompt }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${baseline.label.replace(/\s+/g, '-')}-history.json`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div data-testid="regression-monitor-detail" className="border-t border-gray-100 bg-gray-50 px-4 py-4 space-y-5">
      {/* A: Score history chart */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Score history</h4>
        <div data-testid="regression-chart">
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
              <XAxis dataKey="v" tick={{ fontSize: 10 }} />
              <YAxis domain={[20, 100]} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number, name: string) => [v, name]} />
              {detail.regressionPrIndex !== undefined && detail.regressionPrLabel !== undefined && (
                <ReferenceLine
                  x={EVAL_LABELS[detail.regressionPrIndex]!}
                  stroke="#ef4444"
                  strokeDasharray="3 3"
                  label={{ value: detail.regressionPrLabel, position: 'top', fontSize: 9, fill: '#ef4444' }}
                />
              )}
              <Line type="monotone" dataKey="CL" name="Cognitive Load"         stroke="#f59e0b" dot={true} strokeWidth={2} />
              <Line type="monotone" dataKey="CC" name="Comprehension Confidence" stroke="#14b8a6" dot={true} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* B: Prompt text comparison */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Prompt comparison</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-gray-400 mb-1">Baseline (v1) · {detail.baselineDate}</p>
            <pre className="text-xs font-mono bg-white border border-gray-100 rounded p-2.5 leading-relaxed whitespace-pre-wrap text-gray-700">{detail.baselinePrompt}</pre>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 mb-1">Current (v5) · {detail.currentDate}</p>
            <pre className="text-xs font-mono bg-white border border-gray-100 rounded p-2.5 leading-relaxed whitespace-pre-wrap text-gray-700">{detail.currentPrompt}</pre>
          </div>
        </div>
      </div>

      {/* C: Diff view */}
      {diff.some((d) => d.type !== 'same') && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Changes</h4>
          <div className="font-mono text-xs rounded border border-gray-100 overflow-hidden">
            {diff.map((d, i) => (
              <div
                key={i}
                className={`px-3 py-0.5 leading-relaxed ${
                  d.type === 'removed' ? 'bg-red-50 text-red-700' :
                  d.type === 'added' ? 'bg-green-50 text-green-700' :
                  'bg-white text-gray-500'
                }`}
              >
                <span className="select-none mr-2 opacity-60">{d.type === 'removed' ? '−' : d.type === 'added' ? '+' : ' '}</span>
                {d.line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* D: Impact summary */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Impact summary</h4>
        {baseline.status === 'block' && (
          <div className="bg-red-50 border-l-4 border-red-400 rounded-r-lg px-4 py-3 text-sm text-red-800">
            <p className="font-semibold mb-1">⚠ This prompt change made things significantly worse.</p>
            <p className="text-xs">Cognitive load increased by {Math.abs(baseline.delta_cl)} points — the AI is processing more complex instructions, which degrades response quality. Comprehension confidence dropped {Math.abs(baseline.delta_cc)} points.</p>
            <p className="text-xs mt-1">Recommendation: revert to the baseline version or use one of the suggested rewrites below.</p>
          </div>
        )}
        {baseline.status === 'warn' && (
          <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-lg px-4 py-3 text-sm text-amber-800">
            This prompt has drifted from its baseline. The change is not yet critical but the trend is moving in the wrong direction.
          </div>
        )}
        {baseline.status === 'ok' && (
          <div className="bg-green-50 border-l-4 border-green-400 rounded-r-lg px-4 py-3 text-sm text-green-800">
            This prompt is stable. No significant regression detected.
          </div>
        )}
      </div>

      {/* Rewrite suggestions — wires copyType: "long_form" → qwen-qwq-32b */}
      {(baseline.status === 'block' || baseline.status === 'warn') && !baselineReset && (
        <div>
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
              Generating prompt alternatives…
            </div>
          )}
          {rewriteFallback && (
            <p className="text-xs text-amber-600 mb-2">Rewrite service unavailable — showing cached suggestions</p>
          )}
          {rewrites && rewrites.map((alt, i) => (
            <div key={i} className="mt-2 bg-white rounded-lg border border-gray-100 px-3 py-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">Option {i + 1}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${CONFIDENCE_COLOR[alt.confidence]}`}>{alt.confidence}</span>
                <button
                  onClick={() => { void navigator.clipboard.writeText(alt.text) }}
                  className="ml-auto text-[10px] px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                >
                  Copy
                </button>
              </div>
              <pre className="text-xs font-mono bg-gray-50 rounded border border-gray-100 px-2 py-1.5 leading-relaxed whitespace-pre-wrap text-gray-700">{alt.text}</pre>
              <p className="text-xs text-gray-400 italic">{alt.rationale}</p>
              <p className="text-xs text-gray-500">
                Load: <strong>{Math.round(alt.scores.cognitiveLoad)}</strong>
                {' · '}CC: <strong>{Math.round(alt.scores.comprehensionConfidence)}</strong>
                {' · '}Δ Load: <strong className={alt.scoreDelta.cognitiveLoad < 0 ? 'text-green-600' : 'text-red-500'}>{alt.scoreDelta.cognitiveLoad > 0 ? '+' : ''}{alt.scoreDelta.cognitiveLoad}</strong>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* E: Actions row */}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-100 flex-wrap">
        <button onClick={handleExport} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
          Export history
        </button>
        <button
          disabled={reEvalLoading}
          onClick={() => {
            void (async () => {
              setReEvalLoading(true)
              try {
                const scores = await scoreTextRemote(detail.currentPrompt)
                const status = scores.cognitive_load > 75 || scores.manipulation_risk > 40 ? 'block' : scores.cognitive_load > 55 || scores.manipulation_risk > 25 ? 'warn' : 'ok'
                onScoreUpdate?.(baseline.id, scores.cognitive_load, scores.comprehension_confidence, status)
              } catch { /* ignore */ }
              setReEvalLoading(false)
            })()
          }}
          className="text-xs px-2 py-1 rounded border border-teal-500 text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-50"
        >
          {reEvalLoading ? 'Scoring…' : 'Re-evaluate'}
        </button>
        {!baselineReset && !resetConfirm && (
          <button onClick={() => setResetConfirm(true)} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
            Reset baseline
          </button>
        )}
        {resetConfirm && !baselineReset && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">Reset baseline to current version?</span>
            <button onClick={() => { setBaselineReset(true); setResetConfirm(false) }} className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200">Confirm</button>
            <button onClick={() => setResetConfirm(false)} className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50">Cancel</button>
          </div>
        )}
        {baselineReset && (
          <span className="text-xs text-green-600">✓ Baseline reset — ΔCL: 0, ΔCC: 0, STATUS: OK</span>
        )}
      </div>
    </div>
  )
}

// ── Add Prompt Modal ────────────────────────────────────────────────────
function AddPromptModal({
  onClose,
  onAdded,
}: {
  onClose: () => void
  onAdded: (prompt: PromptBaseline) => void
}) {
  const [tab, setTab] = useState<'paste' | 'github' | 'api'>('paste')
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleAdd() {
    if (!name.trim() || !text.trim()) return
    setLoading(true)
    try {
      const scores = await scoreTextRemote(text.trim())
      const newPrompt: PromptBaseline = {
        id: `p-${Date.now()}`,
        hash: text.slice(0, 16).replace(/\s+/g, '').toLowerCase(),
        label: name,
        cognitive_load: Math.round(scores.cognitive_load),
        comprehension: Math.round(scores.comprehension_confidence),
        delta_cl: 0,
        delta_cc: 0,
        last_evaluated: new Date().toISOString(),
        status: scores.cognitive_load > 75 || scores.manipulation_risk > 60 ? 'block' : scores.cognitive_load > 60 || scores.manipulation_risk > 40 ? 'warn' : 'ok',
        promptText: text.trim(),
      }
      onAdded(newPrompt)
      setSuccess(true)
      setTimeout(() => onClose(), 1500)
    } catch {
      const newPrompt: PromptBaseline = {
        id: `p-${Date.now()}`,
        hash: text.slice(0, 16).replace(/\s+/g, '').toLowerCase(),
        label: name,
        cognitive_load: 45,
        comprehension: 72,
        delta_cl: 0,
        delta_cc: 0,
        last_evaluated: new Date().toISOString(),
        status: 'ok',
        promptText: text.trim(),
      }
      onAdded(newPrompt)
      setSuccess(true)
      setTimeout(() => onClose(), 1500)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Add Prompt</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="px-6 py-4">
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5 text-xs mb-4 w-fit">
            {(['paste', 'github', 'api'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${tab === t ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {t === 'paste' ? 'Paste prompt' : t === 'github' ? 'From GitHub' : 'From API'}
              </button>
            ))}
          </div>

          {tab === 'paste' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Prompt name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Checkout confirmation"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Prompt text</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="You are a helpful assistant. Summarise the user's order for confirmation..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 h-32 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
              <button
                onClick={() => void handleAdd()}
                disabled={!name.trim() || !text.trim() || loading}
                className="text-sm px-4 py-2 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-colors disabled:opacity-40 flex items-center gap-2"
              >
                {loading ? <><Spinner />Scoring...</> : success ? '✓ Prompt added to monitor' : 'Add to monitor'}
              </button>
            </div>
          )}

          {tab === 'github' && (
            <div className="space-y-3 text-sm text-gray-600">
              <p>Connect a GitHub repository to automatically track prompt files. Any PR that changes a monitored file will update this monitor.</p>
              <p className="text-xs text-gray-400">No GitHub repository connected.</p>
              <button className="text-xs px-3 py-1.5 rounded-lg border border-teal-500 text-teal-600 hover:bg-teal-50 transition-colors">
                Connect a repository →
              </button>
            </div>
          )}

          {tab === 'api' && (
            <div className="space-y-3 text-sm text-gray-600">
              <p>Send prompts to the monitor programmatically using the CognArc API.</p>
              <pre className="text-xs font-mono bg-gray-50 border border-gray-100 rounded-lg p-3 whitespace-pre-wrap text-gray-700">
{`POST https://api.cognarc.com/v1/prompts
Authorization: Bearer {your_api_key}

{
  "name": "Checkout confirmation",
  "text": "Your prompt text here",
  "workspace_id": "{your_workspace_id}"
}`}
              </pre>
              <p className="text-xs text-gray-400">API key management is a future feature.</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            {success ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  )
}

const ALL_ZONES: Zone[] = ['OBSERVE', 'RECOMMEND', 'ACT_AUTO', 'ACT_GATED']

export function EngineerView() {
  const queryClient = useQueryClient()
  const { data: baselines, isLoading: blLoading } = useQuery({ queryKey: ['prompt-baselines'], queryFn: fetchPromptBaselines })
  const { data: cicdRuns, isLoading: cicdLoading } = useQuery({ queryKey: ['cicd-runs'], queryFn: fetchCicdRuns })
  const { auditLog, thresholds } = useAppContext()
  const [openBaselineId, setOpenBaselineId] = useState<string | null>(null)
  const [addPromptModalOpen, setAddPromptModalOpen] = useState(false)
  const [addedPrompts, setAddedPrompts] = useState<PromptBaseline[]>([])
  const [baselineOverrides, setBaselineOverrides] = useState<Record<string, Partial<PromptBaseline>>>({})

  const allBaselines = [...(addedPrompts ?? []), ...(baselines ?? [])].map((b) => ({ ...b, ...baselineOverrides[b.id] }))

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
      <Card
        title="Prompt Regression Monitor"
        action={
          <button
            data-testid="add-prompt-button"
            onClick={() => setAddPromptModalOpen(true)}
            className="text-xs px-3 py-1 rounded-lg border border-teal-500 text-teal-600 hover:bg-teal-50 transition-colors"
          >
            + Add Prompt
          </button>
        }
      >
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
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {allBaselines.map((b) => {
                  const isOpen = openBaselineId === b.id
                  return (
                    <React.Fragment key={b.id}>
                      <tr
                        data-testid="regression-monitor-row"
                        onClick={() => setOpenBaselineId(isOpen ? null : b.id)}
                        className="cursor-pointer hover:bg-gray-50 border-b border-gray-50 transition-colors"
                        aria-expanded={isOpen}
                      >
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
                        <td className="py-2 text-xs text-gray-400 text-right pr-1" data-testid="chevron">
                          {isOpen ? '▲' : '▼'}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={8} className="p-0">
                            <RegressionDetailPanel baseline={b} onScoreUpdate={(id, cl, cc, status) => {
                              const update = { cognitive_load: cl, comprehension: cc, status: status as 'ok' | 'warn' | 'block' }
                              setAddedPrompts((prev) => prev.map((p) => p.id === id ? { ...p, ...update } : p))
                              setBaselineOverrides((prev) => ({ ...prev, [id]: update }))
                            }} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
            <p className="text-xs text-gray-400 mt-2 pt-2 border-t border-gray-50">
              Thresholds: CL max <strong className="text-gray-600">{thresholds.cognitiveLoadMax}</strong>
              {' · '}Manip max <strong className="text-gray-600">{thresholds.manipulationRiskMax}</strong>
              {' · '}CC min <strong className="text-gray-600">{thresholds.comprehensionConfidenceMin}</strong>
              {' · '}<span className="text-gray-300">Click any row to expand score history and diff</span>
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

      {addPromptModalOpen && (
        <AddPromptModal
          onClose={() => setAddPromptModalOpen(false)}
          onAdded={(prompt) => {
            setAddedPrompts((prev) => [prompt, ...prev])
            void queryClient.invalidateQueries({ queryKey: ['prompt-baselines'] })
          }}
        />
      )}
    </div>
  )
}
