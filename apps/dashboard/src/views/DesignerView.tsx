import { useState } from 'react'
import { Card } from '../components/Card.js'
import { Spinner } from '../components/Spinner.js'
import { CognitiveScoreCard } from '../components/CognitiveScoreCard.js'
import { OnboardingFlowManager } from '../components/OnboardingFlowManager.js'
import { extractUrl } from '../api/urlExtractorApi.js'
import { scorePage } from '../api/pageScorerApi.js'
import type { PageScoringResult, SectionScores } from '../api/pageScorerApi.js'

function urlSectionHealth(s: SectionScores): 'FLAGGED' | 'NEEDS_REVIEW' | 'CLEAR' {
  if (s.manipulationRisk > 60 || s.cognitiveLoad > 75 || s.comprehensionConfidence < 40) return 'FLAGGED'
  if (s.manipulationRisk > 40 || s.cognitiveLoad > 60 || s.comprehensionConfidence < 55 || s.trustCoherence < 50) return 'NEEDS_REVIEW'
  return 'CLEAR'
}

const URL_HEALTH_BADGE = {
  FLAGGED: { bg: 'bg-red-500', icon: '⊘' },
  NEEDS_REVIEW: { bg: 'bg-amber-400', icon: '⚠' },
  CLEAR: { bg: 'bg-emerald-500', icon: '✓' },
} as const

function UrlAbComparison() {
  const [urlA, setUrlA] = useState('')
  const [urlB, setUrlB] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorA, setErrorA] = useState<string | null>(null)
  const [errorB, setErrorB] = useState<string | null>(null)
  const [resultA, setResultA] = useState<PageScoringResult | null>(null)
  const [resultB, setResultB] = useState<PageScoringResult | null>(null)

  const validA = urlA.startsWith('http://') || urlA.startsWith('https://')
  const validB = urlB.startsWith('http://') || urlB.startsWith('https://')
  const canCompare = validA && validB && !loading

  async function handleCompare() {
    setLoading(true)
    setErrorA(null)
    setErrorB(null)
    setResultA(null)
    setResultB(null)

    const [resA, resB] = await Promise.allSettled([
      (async () => {
        const ext = await extractUrl(urlA, 'ws-1', 10)
        return scorePage(ext, 'ws-1')
      })(),
      (async () => {
        const ext = await extractUrl(urlB, 'ws-1', 10)
        return scorePage(ext, 'ws-1')
      })(),
    ])

    if (resA.status === 'fulfilled') setResultA(resA.value)
    else setErrorA(resA.reason instanceof Error ? resA.reason.message : 'Failed to analyse Page A')

    if (resB.status === 'fulfilled') setResultB(resB.value)
    else setErrorB(resB.reason instanceof Error ? resB.reason.message : 'Failed to analyse Page B')

    if (resA.status === 'fulfilled' && resB.status === 'fulfilled') {
      if (resA.value.scoring_provenance.engine !== resB.value.scoring_provenance.engine ||
          resA.value.scoring_provenance.calibration_status !== resB.value.scoring_provenance.calibration_status) {
        setResultA(null)
        setResultB(null)
        setErrorB('Pages used different scoring engines. Paired comparison is unavailable without matching provenance.')
      }
    }

    setLoading(false)
  }

  const hasResults = resultA && resultB

  let winner: 'A' | 'B' | 'inconclusive' = 'inconclusive'
  const dims: { label: string; a: number; b: number; lower: boolean }[] = []

  if (hasResults) {
    dims.push(
      { label: 'Load', a: resultA.overallScores.cognitiveLoad, b: resultB.overallScores.cognitiveLoad, lower: true },
      { label: 'Comprehension', a: resultA.overallScores.comprehensionConfidence, b: resultB.overallScores.comprehensionConfidence, lower: false },
      { label: 'Trust', a: resultA.overallScores.trustCoherence, b: resultB.overallScores.trustCoherence, lower: false },
      { label: 'Manipulation', a: resultA.overallScores.manipulationRisk, b: resultB.overallScores.manipulationRisk, lower: true },
    )
    let bWins = 0, aWins = 0
    for (const d of dims) {
      const better = d.lower ? d.b < d.a : d.b > d.a
      const delta = Math.abs(d.b - d.a)
      if (better) { bWins++ } else if (delta > 0) { aWins++ }
    }
    if (bWins >= 3) winner = 'B'
    else if (aWins >= 3) winner = 'A'
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">Compare two URLs side by side — your page vs a competitor, or two versions of the same page.</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Page A</label>
          <input
            type="url"
            value={urlA}
            onChange={(e) => setUrlA(e.target.value)}
            placeholder="https://yoursite.com/landing-v1"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-[10px] text-gray-400 mt-1">Your page, current version, or option A</p>
          {errorA && <p className="text-xs text-red-500 mt-1">Could not analyse Page A — {errorA}</p>}
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mb-1 block">Page B</label>
          <input
            type="url"
            value={urlB}
            onChange={(e) => setUrlB(e.target.value)}
            placeholder="https://competitor.com or https://yoursite.com/landing-v2"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="text-[10px] text-gray-400 mt-1">Competitor, new version, or option B</p>
          {errorB && <p className="text-xs text-red-500 mt-1">Could not analyse Page B — {errorB}</p>}
        </div>
      </div>
      <button
        onClick={() => { void handleCompare() }}
        disabled={!canCompare}
        className="w-full text-sm py-2.5 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading && <Spinner />}
        {loading ? 'Analysing both pages...' : 'Compare Pages'}
      </button>

      {loading && (
        <div className="flex gap-4 justify-center py-4">
          <div className="flex items-center gap-2 text-sm text-gray-500"><Spinner /> Analysing Page A...</div>
          <div className="flex items-center gap-2 text-sm text-gray-500"><Spinner /> Analysing Page B...</div>
        </div>
      )}

      {hasResults && (
        <div className="space-y-4">
          <p className="text-xs text-amber-800 bg-amber-50 rounded p-2">
            Engine: {resultA.scoring_provenance.engine}. The comparison uses uncalibrated scores
            and does not establish which page performs better with people.
          </p>
          <div className="grid grid-cols-3 gap-4">
            {/* Page A */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-700 truncate">{resultA.pageTitle}</p>
              <p className="text-xs text-gray-400 truncate">{new URL(resultA.url).hostname}</p>
              {(() => { const h = urlSectionHealth(resultA.overallScores); const b = URL_HEALTH_BADGE[h]; return (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[10px] font-bold ${b.bg}`}>{b.icon} {h === 'NEEDS_REVIEW' ? 'NEEDS REVIEW' : h}</span>
              ) })()}
              <CognitiveScoreCard scores={{
                cognitiveLoad: resultA.overallScores.cognitiveLoad,
                comprehensionConfidence: resultA.overallScores.comprehensionConfidence,
                trustCoherence: resultA.overallScores.trustCoherence,
                manipulationRisk: resultA.overallScores.manipulationRisk,
              }} showToggle={false} />
            </div>

            {/* Delta column */}
            <div className="flex flex-col items-center justify-center gap-3 py-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">A vs B</p>
              <div className="space-y-3 text-center">
                {dims.map(d => {
                  const delta = d.b - d.a
                  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '—'
                  const better = d.lower ? delta < 0 : delta > 0
                  return (
                    <div key={d.label}>
                      <p className="text-xs text-gray-400">{d.label}</p>
                      <p className="text-xs">
                        <span className="text-gray-600">A: {Math.round(d.a)}</span>
                        <span className="text-gray-300 mx-1">→</span>
                        <span className="text-gray-600">B: {Math.round(d.b)}</span>
                        <span className={`ml-1 font-semibold ${better ? 'text-emerald-600' : delta === 0 ? 'text-gray-400' : 'text-red-500'}`}>
                          ({arrow} {Math.abs(delta)})
                        </span>
                      </p>
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 text-center space-y-1">
                <p className={`text-sm font-bold ${winner === 'inconclusive' ? 'text-gray-500' : 'text-teal-600'}`}>
                  {winner === 'A' ? 'A: lower heuristic indices' : winner === 'B' ? 'B: lower heuristic indices' : 'Inconclusive'}
                </p>
                <span className="text-xs text-amber-700">Heuristic comparison only; no statistical confidence estimate.</span>
              </div>
            </div>

            {/* Page B */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-700 truncate">{resultB.pageTitle}</p>
              <p className="text-xs text-gray-400 truncate">{new URL(resultB.url).hostname}</p>
              {(() => { const h = urlSectionHealth(resultB.overallScores); const b = URL_HEALTH_BADGE[h]; return (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[10px] font-bold ${b.bg}`}>{b.icon} {h === 'NEEDS_REVIEW' ? 'NEEDS REVIEW' : h}</span>
              ) })()}
              <CognitiveScoreCard scores={{
                cognitiveLoad: resultB.overallScores.cognitiveLoad,
                comprehensionConfidence: resultB.overallScores.comprehensionConfidence,
                trustCoherence: resultB.overallScores.trustCoherence,
                manipulationRisk: resultB.overallScores.manipulationRisk,
              }} showToggle={false} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AbComparison() {
  return (
    <div className="p-5 rounded-xl border border-amber-200 bg-amber-50 space-y-2">
      <p className="text-sm font-semibold text-amber-900">File-based A/B analysis unavailable</p>
      <p className="text-sm text-amber-800">
        A validated image/file evaluation service is not connected. No uploaded
        files will be assigned fixed scores or an invented winner.
      </p>
      <p className="text-xs text-amber-800">
        Use Compare URLs for actual text extraction and canonical scoring, or
        select text inputs in the Growth comparison tool.
      </p>
    </div>
  )
}

export function DesignerView() {
  const [abMode, setAbMode] = useState<'upload' | 'url'>('upload')

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Designer View</h1>

      {/* A/B Comparison Tool */}
      <Card
        title="A/B Cognitive Comparison"
        action={
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5 text-xs">
            <button
              onClick={() => setAbMode('upload')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${abMode === 'upload' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Upload files
            </button>
            <button
              onClick={() => setAbMode('url')}
              data-testid="url-ab-tab"
              className={`px-3 py-1 rounded-md font-medium transition-colors ${abMode === 'url' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Compare URLs
            </button>
          </div>
        }
      >
        {abMode === 'upload' ? <AbComparison /> : <UrlAbComparison />}
      </Card>

      <Card title="Attention and Load Heatmap">
        <p className="text-sm text-gray-600">No measured attention data is connected.</p>
        <p className="text-xs text-gray-500 mt-2">
          Screenshot uploads and heatmaps are disabled until a verified analysis
          endpoint can return spatial measurements with provenance. Synthetic
          hotspots are not shown as observed attention.
        </p>
      </Card>

      {/* Onboarding Flow Analyzer */}
      <Card title="Onboarding Flow Analyzer — Step-by-Step Load Curve">
        <OnboardingFlowManager />
      </Card>
    </div>
  )
}
