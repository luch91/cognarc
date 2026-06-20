import { useState, useEffect, useCallback } from 'react'
import { extractUrl } from '../api/urlExtractorApi.js'
import { scorePage } from '../api/pageScorerApi.js'
import { rewrite } from '../api/rewriteApi.js'
import { supabase } from '../api/supabaseClient.js'
import type { PageScoringResult, ScoredSection, SectionScores } from '../api/pageScorerApi.js'
import type { RewriteAlternative } from '../api/rewriteApi.js'
import { Spinner } from './Spinner.js'
import { CognitiveScoreCard } from './CognitiveScoreCard.js'
import type { CognitiveScores } from './CognitiveScoreCard.js'

const RECENT_KEY = 'cognarc-recent-urls'

function loadRecentUrls(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveRecentUrl(url: string) {
  const recent = loadRecentUrls().filter(u => u !== url)
  recent.unshift(url)
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 5)))
}

const SECTION_BADGE: Record<string, string> = {
  hero: 'bg-navy-700 text-white',
  cta: 'bg-teal-600 text-white',
  value_prop: 'bg-indigo-600 text-white',
  headline: 'bg-slate-600 text-white',
  feature: 'bg-blue-600 text-white',
  body: 'bg-gray-200 text-gray-700',
  meta: 'bg-gray-200 text-gray-700',
}

function sectionHealth(s: SectionScores): 'FLAGGED' | 'NEEDS_REVIEW' | 'CLEAR' {
  if (s.manipulationRisk > 60 || s.cognitiveLoad > 75 || s.comprehensionConfidence < 40) return 'FLAGGED'
  if (s.manipulationRisk > 40 || s.cognitiveLoad > 60 || s.comprehensionConfidence < 55 || s.trustCoherence < 50) return 'NEEDS_REVIEW'
  return 'CLEAR'
}

const HEALTH_BADGE = {
  FLAGGED: { bg: 'bg-red-500', icon: '⊘' },
  NEEDS_REVIEW: { bg: 'bg-amber-400', icon: '⚠' },
  CLEAR: { bg: 'bg-emerald-500', icon: '✓' },
} as const

function healthLabel(h: string) {
  return h === 'NEEDS_REVIEW' ? 'NEEDS REVIEW' : h
}

function recommendation(s: SectionScores): string {
  if (s.manipulationRisk > 60)
    return 'Reduce urgency language — this section is triggering pressure signals that undermine trust.'
  if (s.cognitiveLoad > 70)
    return 'Simplify this copy — it is processing-heavy and may cause readers to disengage.'
  if (s.comprehensionConfidence < 45)
    return 'Rewrite for clarity — this section is likely to be misunderstood by your audience.'
  if (s.trustCoherence < 45)
    return 'Fix the trust signals — this section feels inconsistent with the rest of the page.'
  return 'Minor improvements possible — review the score breakdown.'
}

type CopyType = 'campaign' | 'landing_page' | 'microcopy' | 'voiceover' | 'prompt' | 'long_form'

function copyTypeFromSection(sectionType: string): CopyType {
  if (['hero', 'value_prop', 'cta', 'feature', 'headline'].includes(sectionType)) return 'landing_page'
  if (sectionType === 'meta') return 'microcopy'
  return 'campaign'
}

function SectionCard({ section, index }: { section: ScoredSection; index: number }) {
  const [rewriting, setRewriting] = useState(false)
  const [alternatives, setAlternatives] = useState<RewriteAlternative[] | null>(null)

  if (!section.scores) return null
  const health = sectionHealth(section.scores)
  const badge = HEALTH_BADGE[health]
  const needsRewrite = health === 'FLAGGED' || health === 'NEEDS_REVIEW'

  async function handleRewrite() {
    if (!section.scores) return
    setRewriting(true)
    try {
      const result = await rewrite({
        originalText: section.text,
        copyType: copyTypeFromSection(section.sectionType),
        scores: {
          cognitiveLoad: section.scores.cognitiveLoad,
          comprehensionConfidence: section.scores.comprehensionConfidence,
          emotionalValence: 50,
          trustCoherence: section.scores.trustCoherence,
          manipulationRisk: section.scores.manipulationRisk,
          cognitiveRisk: section.scores.cognitiveRisk,
        },
        workspaceId: 'ws-1',
      })
      setAlternatives(result.alternatives)
    } catch {
      setAlternatives(null)
    } finally {
      setRewriting(false)
    }
  }

  const sectionBadge = SECTION_BADGE[section.sectionType] ?? SECTION_BADGE.body

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sectionBadge}`}>
          {section.sectionType}
        </span>
        <span className="text-xs font-medium text-gray-600 flex-1 truncate">{section.label}</span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[10px] font-bold ${badge.bg}`}>
          {badge.icon} {healthLabel(health)}
        </span>
      </div>
      <div className="px-4 py-3 space-y-2">
        <p className="text-sm text-gray-800 leading-relaxed bg-gray-50 rounded-lg px-3 py-2 border-l-4 border-gray-300">
          "{section.text}"
        </p>
        <div className="flex gap-4 text-xs text-gray-500">
          <span>Load: <strong>{Math.round(section.scores.cognitiveLoad)}</strong></span>
          <span>Comprehension: <strong>{Math.round(section.scores.comprehensionConfidence)}</strong></span>
          <span>Trust: <strong>{Math.round(section.scores.trustCoherence)}</strong></span>
          <span>Manipulation: <strong>{Math.round(section.scores.manipulationRisk)}</strong></span>
        </div>
        {needsRewrite && !alternatives && (
          <button
            onClick={() => { void handleRewrite() }}
            disabled={rewriting}
            className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
          >
            {rewriting ? <><Spinner /> Finding better alternatives...</> : 'Get safer alternative →'}
          </button>
        )}
        {alternatives && (
          <div className="space-y-2 pt-1">
            {alternatives.map((alt, i) => {
              const after: CognitiveScores = {
                cognitiveLoad: alt.scores.cognitiveLoad,
                comprehensionConfidence: alt.scores.comprehensionConfidence,
                trustCoherence: alt.scores.trustCoherence,
                manipulationRisk: alt.scores.manipulationRisk,
              }
              const before: CognitiveScores = {
                cognitiveLoad: section.scores!.cognitiveLoad,
                comprehensionConfidence: section.scores!.comprehensionConfidence,
                trustCoherence: section.scores!.trustCoherence,
                manipulationRisk: section.scores!.manipulationRisk,
              }
              return (
                <div key={i} className="rounded-lg border border-gray-100 p-3 space-y-2">
                  <p className="text-sm text-gray-800 bg-teal-50 rounded px-2 py-1.5 border-l-4 border-teal-400">
                    {alt.text}
                  </p>
                  <p className="text-xs text-gray-400 italic">{alt.rationale}</p>
                  <CognitiveScoreCard scores={after} originalScores={before} showToggle={false} defaultMode="manager" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const LOADING_STEPS = [
  { label: 'Fetching page...', delay: 0 },
  { label: 'Extracting copy sections...', delay: 500 },
  { label: 'Scoring sections...', delay: 1500 },
]

interface SavedAnalysis {
  id: string
  url: string
  page_title: string
  overall_scores: SectionScores
  analysed_at: string
}

export function UrlAnalyser() {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState(0)
  const [result, setResult] = useState<PageScoringResult | null>(null)
  const [recentUrls, setRecentUrls] = useState<string[]>(loadRecentUrls)
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([])

  useEffect(() => {
    if (!supabase) return
    supabase
      .from('url_analyses')
      .select('id, url, page_title, overall_scores, analysed_at')
      .eq('workspace_id', 'ws-1')
      .order('analysed_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (data) setSavedAnalyses(data as SavedAnalysis[])
      })
  }, [])

  const isValidUrl = url.startsWith('http://') || url.startsWith('https://')

  const handleAnalyse = useCallback(async (targetUrl?: string) => {
    const analysisUrl = targetUrl ?? url
    if (!analysisUrl.startsWith('http://') && !analysisUrl.startsWith('https://')) {
      setError('Please enter a valid URL starting with http:// or https://')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    setLoadingStep(0)

    const timers = LOADING_STEPS.map((step, i) =>
      setTimeout(() => setLoadingStep(i), step.delay)
    )

    try {
      const extraction = await extractUrl(analysisUrl, 'ws-1', 10)
      setLoadingStep(2)
      const scored = await scorePage(extraction, 'ws-1')
      setResult(scored)
      saveRecentUrl(analysisUrl)
      setRecentUrls(loadRecentUrls())

      if (supabase) {
        supabase.from('url_analyses').insert({
          workspace_id: 'ws-1',
          url: scored.url,
          page_title: scored.pageTitle,
          overall_scores: scored.overallScores,
          sections: scored.scoredSections,
          warning: scored.warning,
        }).then(({ error: err }) => {
          if (err) console.error('[supabase] url_analyses insert failed:', err)
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      timers.forEach(clearTimeout)
      setLoading(false)
    }
  }, [url])

  const overallHealth = result
    ? sectionHealth(result.overallScores)
    : null

  const sortedSections = result
    ? [...result.scoredSections]
        .filter(s => s.scoreThis && s.scores)
        .sort((a, b) =>
          (b.scores!.manipulationRisk + b.scores!.cognitiveLoad)
          - (a.scores!.manipulationRisk + a.scores!.cognitiveLoad)
        )
    : []

  const topFixes = sortedSections.slice(0, 3).filter(s => s.scores && sectionHealth(s.scores) !== 'CLEAR')

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-gray-400 mb-3">
          Paste any public page URL — landing page, blog post, product page, or competitor site — and see how the copy scores.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yoursite.com/landing-page"
            className={`flex-1 text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 ${
              url && !isValidUrl ? 'border-red-400' : 'border-gray-200'
            }`}
          />
          <button
            onClick={() => { void handleAnalyse() }}
            disabled={loading || !isValidUrl}
            className="flex items-center gap-1.5 text-sm bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="analyse-page-btn"
          >
            {loading && <Spinner />}
            {loading ? 'Analysing...' : 'Analyse Page'}
          </button>
        </div>
        {url && !isValidUrl && (
          <p className="text-xs text-red-500 mt-1">Please enter a valid URL starting with http:// or https://</p>
        )}
      </div>

      {!result && !loading && (recentUrls.length > 0 || savedAnalyses.length > 0) && (
        <div className="space-y-2">
          {recentUrls.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400">Recent:</span>
              {recentUrls.map(u => {
                let domain = u
                try { domain = new URL(u).hostname } catch { /* keep full url */ }
                return (
                  <button
                    key={u}
                    onClick={() => { setUrl(u); void handleAnalyse(u) }}
                    className="text-xs text-brand-600 hover:text-brand-700 bg-brand-50 px-2 py-1 rounded-full"
                  >
                    {domain}
                  </button>
                )
              })}
            </div>
          )}
          {savedAnalyses.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Recently analysed</p>
              <div className="space-y-1">
                {savedAnalyses.map(sa => {
                  const health = sectionHealth(sa.overall_scores)
                  const badge = HEALTH_BADGE[health]
                  let domain = sa.url
                  try { domain = new URL(sa.url).hostname } catch { /* keep */ }
                  return (
                    <button
                      key={sa.id}
                      onClick={() => { setUrl(sa.url); void handleAnalyse(sa.url) }}
                      className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-white text-[9px] font-bold ${badge.bg}`}>
                        {badge.icon}
                      </span>
                      <span className="text-xs font-medium text-gray-700 truncate flex-1">{sa.page_title || domain}</span>
                      <span className="text-[10px] text-gray-400">{domain}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="space-y-2 py-4">
          {LOADING_STEPS.map((step, i) => (
            <div key={i} className={`flex items-center gap-2 text-sm ${i <= loadingStep ? 'text-gray-700' : 'text-gray-300'}`}>
              {i < loadingStep ? (
                <span className="text-emerald-500">✓</span>
              ) : i === loadingStep ? (
                <Spinner />
              ) : (
                <span className="w-4 h-4" />
              )}
              {step.label}
              {i === 2 && result === null && loadingStep >= 2 && sortedSections.length > 0 && (
                <span className="text-xs text-gray-400">({sortedSections.length} sections)</span>
              )}
            </div>
          ))}
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
            <div
              className="bg-brand-500 h-1.5 rounded-full transition-all duration-1000"
              style={{ width: `${((loadingStep + 1) / LOADING_STEPS.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {result.warning && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
              ⚠ {result.warning}
            </div>
          )}

          {/* Page header */}
          <div className="flex items-center gap-3">
            <img
              src={`https://www.google.com/s2/favicons?domain=${new URL(result.url).hostname}&sz=32`}
              alt=""
              className="w-5 h-5 rounded"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{result.pageTitle}</p>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-600 hover:underline truncate block"
              >
                {result.url} ↗
              </a>
            </div>
            <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              Static analysis
            </span>
          </div>

          {/* Overall health */}
          {overallHealth && (
            <div>
              <p className={`text-sm font-bold mb-2 ${
                overallHealth === 'CLEAR' ? 'text-emerald-700' : 'text-amber-700'
              }`}>
                {overallHealth === 'FLAGGED' && '⚠ This page has content that needs fixing before it converts.'}
                {overallHealth === 'NEEDS_REVIEW' && '⚠ This page has some issues worth addressing.'}
                {overallHealth === 'CLEAR' && '✓ This page\'s copy is cognitively safe.'}
              </p>
              <CognitiveScoreCard
                scores={{
                  cognitiveLoad: result.overallScores.cognitiveLoad,
                  comprehensionConfidence: result.overallScores.comprehensionConfidence,
                  trustCoherence: result.overallScores.trustCoherence,
                  manipulationRisk: result.overallScores.manipulationRisk,
                }}
                context="landing page"
              />
            </div>
          )}

          {/* Section breakdown */}
          {sortedSections.length > 0 && (
            <div data-testid="section-breakdown">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Section breakdown</h3>
              <p className="text-xs text-gray-400 mb-3">Scored from most to least impactful. Fix the top items first.</p>
              <div className="space-y-3">
                {sortedSections.map((section, i) => (
                  <SectionCard key={i} section={section} index={i} />
                ))}
              </div>
            </div>
          )}

          {/* Priority fix list */}
          {topFixes.length > 0 && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">
                Top {topFixes.length} fix{topFixes.length > 1 ? 'es' : ''} for this page:
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                {topFixes.map((s, i) => (
                  <li key={i}>
                    <strong className="text-gray-800">{s.label}:</strong>{' '}
                    {recommendation(s.scores!)}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
