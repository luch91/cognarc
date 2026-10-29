import { useRef, useState } from 'react'
import { scoreTextRemote } from '../api/scoringApi.js'
import { Card } from '../components/Card.js'
import { Spinner } from '../components/Spinner.js'
import { MessageClarityScorer } from '../components/MessageClarityScorer.js'
import { UrlAnalyser } from '../components/UrlAnalyser.js'
import { CognitiveScoreCard } from '../components/CognitiveScoreCard.js'
import { useAppContext } from '../context/AppContext.js'
import type { CreativeAsset } from '../api/types.js'
import type { LiveScoreResult } from '../api/scoringApi.js'

function isVideo(name: string) {
  return /\.(mp4|mov|webm)$/i.test(name)
}

function isImage(name: string) {
  return /\.(png|jpg|jpeg|webp|gif)$/i.test(name)
}

function TextReport({ item }: { item: CreativeAsset }) {
  const result = item.scoreResult
  if (!result?.scoring_provenance) return <p role="alert">No verified text evaluation exists.</p>
  return (
    <div data-testid="queue-item-report" className="border-t border-gray-100 bg-gray-50 p-4 space-y-2">
      <h4 className="text-sm font-semibold text-gray-700">Text evaluation (advisory)</h4>
      <p className="text-xs text-amber-800">
        Engine: {result.scoring_provenance.engine} ({result.model_version}).
        {result.scoring_provenance.fallback_used ? ' CME fallback: ' + result.scoring_provenance.fallback_reason : ''}
        Uncalibrated. No automatic policy actions.
      </p>
      <CognitiveScoreCard scores={{
        cognitiveLoad: result.cognitive_load,
        comprehensionConfidence: result.comprehension_confidence,
        trustCoherence: result.trust_coherence,
        manipulationRisk: result.manipulation_risk,
      }} defaultMode="manager" showToggle={false} />
    </div>
  )
}

// ── Variant Ranker types ──────────────────────────────────────────────────
type VariantInputMode = 'text' | 'image' | 'url'

interface PendingVariant {
  id: string
  label: string
  mode: VariantInputMode
  content: string
  fileName?: string
}

interface RankedVariant extends PendingVariant {
  scores: LiveScoreResult
  rank: number
  health: 'CLEAR' | 'NEEDS_REVIEW' | 'FLAGGED'
}

function deriveVariantHealth(s: LiveScoreResult): 'FLAGGED' | 'NEEDS_REVIEW' | 'CLEAR' {
  if (s.manipulation_risk > 60 || s.cognitive_load > 75) return 'FLAGGED'
  if (s.manipulation_risk > 40 || s.cognitive_load > 60) return 'NEEDS_REVIEW'
  return 'CLEAR'
}

const VARIANT_HEALTH_BADGE = {
  FLAGGED: { bg: 'bg-red-100 text-red-700', label: 'REVIEW SIGNAL' },
  NEEDS_REVIEW: { bg: 'bg-amber-100 text-amber-700', label: 'CHECK MARKERS' },
  CLEAR: { bg: 'bg-green-100 text-green-700', label: 'FEW MARKERS' },
} as const

function nextLabel(variants: PendingVariant[]): string {
  const letters = 'ABCDEFGH'
  return `Variant ${letters[variants.length] ?? String(variants.length + 1)}`
}

export function GrowthView() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const variantImageRef = useRef<HTMLInputElement>(null)
  const [openReportId, setOpenReportId] = useState<string | null>(null)
  const [copyTab, setCopyTab] = useState<'paste' | 'url'>('paste')

  // Variant Ranker state
  const [variantMode, setVariantMode] = useState<VariantInputMode>('text')
  const [variantText, setVariantText] = useState('')
  const [variantUrl, setVariantUrl] = useState('')
  const [variantLabel, setVariantLabel] = useState('')
  const [pendingVariants, setPendingVariants] = useState<PendingVariant[]>([])
  const [rankedVariants, setRankedVariants] = useState<RankedVariant[]>([])
  const [variantScoring, setVariantScoring] = useState(false)
  const [variantProgress, setVariantProgress] = useState(0)
  const [variantError, setVariantError] = useState<string | null>(null)
  const [lastComparisonDate, setLastComparisonDate] = useState<string | null>(null)

  const { evaluationQueue: queue, addToEvaluationQueue, updateEvaluationItem } = useAppContext()

  async function runVariantComparison() {
    setVariantScoring(true)
    setVariantError(null)
    setRankedVariants([])
    setVariantProgress(0)
    try {
      if (pendingVariants.some(variant => variant.mode !== 'text')) {
        throw new Error('Live comparison supports pasted text only. Use URL Analyser for pages. Image scoring needs a validated modality-specific engine.')
      }
      const results: RankedVariant[] = []
      for (let i = 0; i < pendingVariants.length; i++) {
        const variant = pendingVariants[i]!
        const scores = await scoreTextRemote(variant.content)
        results.push({ ...variant, scores, rank: 0, health: deriveVariantHealth(scores) })
        setVariantProgress(Math.round(((i + 1) / pendingVariants.length) * 100))
      }
      if (results.length === 0) throw new Error('No comparable variants')
      const first = results[0]!.scores.scoring_provenance
      if (results.some(v => v.scores.scoring_provenance.engine !== first.engine ||
            v.scores.scoring_provenance.calibration_status !== first.calibration_status)) {
        throw new Error('Variants were evaluated by different engines. Comparison would be misleading.')
      }
      results.sort((a, b) => {
        const scoreA = a.scores.cognitive_load * 0.4 - a.scores.trust_coherence * 0.4 + a.scores.manipulation_risk * 0.2
        const scoreB = b.scores.cognitive_load * 0.4 - b.scores.trust_coherence * 0.4 + b.scores.manipulation_risk * 0.2
        return scoreA - scoreB
      })
      results.forEach((item, i) => { item.rank = i + 1 })
      setRankedVariants(results)
      setLastComparisonDate(new Date().toLocaleString())
    } catch (error) {
      setVariantError(error instanceof Error ? error.message : 'Comparison unavailable')
      setRankedVariants([])
      setLastComparisonDate(null)
    } finally {
      setVariantScoring(false)
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    const type = file.type.startsWith('image') || isImage(file.name) ? 'image'
      : file.type.startsWith('video') || isVideo(file.name) ? 'video' : 'copy'
    const id = 'upload-' + Date.now()
    const item: CreativeAsset = {
      id, name: file.name, type, uploaded_at: new Date().toISOString(),
      status: type === 'copy' ? 'processing' : 'unsupported',
      risk: 'LOW',
      ...(type !== 'copy' ? { error: 'Verified ' + type + ' scoring is unavailable. No analysis was run.' } : {}),
    }
    addToEvaluationQueue(item)
    if (type !== 'copy') return
    try {
      const content = await file.text()
      if (!content.trim()) throw new Error('Uploaded text is empty')
      if (content.length > 20000) throw new Error('The text exceeds the 20,000-character evaluation limit')
      const result = await scoreTextRemote(content)
      updateEvaluationItem(id, {
        status: 'complete', scoreResult: result,
        cognitive_load: result.cognitive_load,
        trust: result.trust_coherence, risk: result.cognitive_risk,
      })
    } catch (error) {
      updateEvaluationItem(id, { status: 'failed',
        error: error instanceof Error ? error.message : 'Text evaluation failed' })
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Growth View</h1>

      {/* Creative Evaluation Queue */}
      <Card
        title="Creative Evaluation Queue"
        action={
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs bg-brand-500 text-white px-3 py-1 rounded-lg hover:bg-brand-600 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            + Upload asset
          </button>
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,text/*,video/*,.mp4,.mov,.webm"
          className="hidden"
          aria-label="Upload creative asset"
          onChange={handleUpload}
        />
        <div className="space-y-2">
          {queue.map((a) => (
            <div key={a.id}>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                <span className="text-lg" aria-hidden>
                  {a.type === 'image' ? '🖼' : a.type === 'video' ? '🎬' : '📝'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{a.name}</p>
                  <p className="text-xs text-gray-400">{new Date(a.uploaded_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {a.status === 'complete' && a.cognitive_load !== undefined && (
                    <span className="text-xs text-gray-500">
                      Load: <span className="font-semibold">{a.cognitive_load}</span> · Trust: <span className="font-semibold">{a.trust}</span>
                    </span>
                  )}
                  {a.status !== 'complete' && (
                    <span className="text-xs text-gray-400">Load: — · Trust: —</span>
                  )}
                  {a.status === 'complete' && <span className="text-xs text-amber-700">Advisory {a.risk} index</span>}
                  <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                    a.status === 'complete' ? 'bg-green-100 text-green-700' :
                    a.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {a.status}
                  </span>
                  {a.status === 'complete' && (
                    <button
                      onClick={() => setOpenReportId(openReportId === a.id ? null : a.id)}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium underline underline-offset-2 shrink-0"
                    >
                      {openReportId === a.id ? 'Hide report' : 'View Report →'}
                    </button>
                  )}
                </div>
              </div>
              {a.error && <p role="status" className="px-4 pb-3 text-xs text-amber-800">{a.error}</p>}
              {openReportId === a.id && a.status === 'complete' && a.type === 'copy' && (
                <TextReport item={a} />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Copy Health Checker */}
      <Card
        title="Copy Health Checker"
        action={
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5 text-xs">
            <button
              onClick={() => setCopyTab('paste')}
              className={`px-3 py-1 rounded-md font-medium transition-colors ${copyTab === 'paste' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Paste copy
            </button>
            <button
              onClick={() => setCopyTab('url')}
              data-testid="url-tab"
              className={`px-3 py-1 rounded-md font-medium transition-colors ${copyTab === 'url' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Test a URL
            </button>
          </div>
        }
      >
        {copyTab === 'paste' ? <MessageClarityScorer /> : <UrlAnalyser />}
      </Card>

      {/* Variant Ranker */}
      <Card title="Variant Ranker">
        <p className="text-xs text-gray-400 mb-3">Upload up to 8 variants. CognArc ranks them by predicted cognitive engagement and trust coherence.</p>

        {/* Upload area */}
        {rankedVariants.length === 0 && (
          <div className="border border-dashed border-gray-200 rounded-lg p-4 mb-4">
            <p className="text-sm font-medium text-gray-600 mb-3">Add a variant</p>
            <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5 text-xs mb-3 w-fit">
              {(['text', 'image', 'url'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setVariantMode(m)}
                  className={`px-3 py-1 rounded-md font-medium transition-colors capitalize ${variantMode === m ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {m === 'text' ? 'Paste text' : m === 'image' ? 'Upload image' : 'Enter URL'}
                </button>
              ))}
            </div>

            {variantMode === 'text' && (
              <div className="space-y-2">
                <textarea
                  value={variantText}
                  onChange={(e) => setVariantText(e.target.value)}
                  placeholder="Paste your copy — headline, email, ad, CTA..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 h-20 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={variantLabel}
                    onChange={(e) => setVariantLabel(e.target.value)}
                    placeholder={nextLabel(pendingVariants)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-40 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    data-testid="add-variant"
                    onClick={() => {
                      if (!variantText.trim()) return
                      const v: PendingVariant = { id: `pv-${Date.now()}`, label: variantLabel || nextLabel(pendingVariants), mode: 'text', content: variantText.trim() }
                      setPendingVariants((prev) => [...prev, v])
                      setVariantText('')
                      setVariantLabel('')
                    }}
                    disabled={!variantText.trim() || pendingVariants.length >= 8}
                    className="text-xs px-3 py-2 rounded-lg border border-teal-500 text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-40"
                  >
                    Add Variant
                  </button>
                </div>
              </div>
            )}

            {variantMode === 'url' && (
              <div className="space-y-2">
                <input
                  type="url"
                  value={variantUrl}
                  onChange={(e) => setVariantUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={variantLabel}
                    onChange={(e) => setVariantLabel(e.target.value)}
                    placeholder={nextLabel(pendingVariants)}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-40 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    onClick={() => {
                      if (!variantUrl.trim()) return
                      const v: PendingVariant = { id: `pv-${Date.now()}`, label: variantLabel || nextLabel(pendingVariants), mode: 'url', content: variantUrl.trim() }
                      setPendingVariants((prev) => [...prev, v])
                      setVariantUrl('')
                      setVariantLabel('')
                    }}
                    disabled={!variantUrl.trim() || pendingVariants.length >= 8}
                    className="text-xs px-3 py-2 rounded-lg border border-teal-500 text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-40"
                  >
                    Add Variant
                  </button>
                </div>
              </div>
            )}

            {variantMode === 'image' && (
              <div className="space-y-2">
                <div
                  className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-gray-300 transition-colors"
                  onClick={() => variantImageRef.current?.click()}
                >
                  <p className="text-sm text-gray-400">Drop image or click to upload (.png .jpg .webp)</p>
                </div>
                <input
                  ref={variantImageRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    e.target.value = ''
                    const v: PendingVariant = { id: `pv-${Date.now()}`, label: variantLabel || nextLabel(pendingVariants), mode: 'image', content: f.name, fileName: f.name }
                    setPendingVariants((prev) => [...prev, v])
                    setVariantLabel('')
                  }}
                />
                <input
                  type="text"
                  value={variantLabel}
                  onChange={(e) => setVariantLabel(e.target.value)}
                  placeholder={nextLabel(pendingVariants)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 w-40 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}

            {/* Pending variants */}
            {pendingVariants.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pending variants</p>
                {pendingVariants.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 px-3 py-1.5 rounded border border-gray-100 bg-white text-sm">
                    <span className="font-medium text-gray-700">{v.label}</span>
                    <span className="text-gray-300">·</span>
                    <span className="text-gray-400 truncate flex-1">{v.content.slice(0, 60)}{v.content.length > 60 ? '…' : ''}</span>
                    <button
                      onClick={() => setPendingVariants((prev) => prev.filter((p) => p.id !== v.id))}
                      className="text-gray-400 hover:text-red-500 text-xs shrink-0"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Run Comparison button */}
            <button
              onClick={runVariantComparison}
              disabled={pendingVariants.length < 2 || variantScoring}
              className="w-full mt-3 text-sm py-2.5 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {variantScoring ? <><Spinner /> Scoring {pendingVariants.length} variants...</> : 'Run Comparison'}
            </button>
            {variantError && <p role="alert" className="mt-2 text-xs text-red-600">Comparison not completed: {variantError}. No substitute scores were generated.</p>}

            {variantScoring && (
              <div className="mt-2">
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div className="bg-teal-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${variantProgress}%` }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ranked results */}
        {rankedVariants.length > 0 && (
          <div className="space-y-3">
            {lastComparisonDate && (
              <p className="text-xs text-gray-400">Last comparison: {lastComparisonDate}</p>
            )}
            {rankedVariants.length > 0 && rankedVariants[0]?.scores.scoring_provenance.policy_eligible === false && (
              <p className="text-xs text-amber-700">Advisory comparison only. Engine indices are uncalibrated and not suitable for automatic publishing decisions.</p>
            )}
            {rankedVariants.map((v) => {
              const badge = VARIANT_HEALTH_BADGE[v.health]
              return (
                <div key={v.id} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${v.rank === 1 ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                    {v.rank}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">{v.label}</p>
                    <p className="text-xs text-gray-400 truncate">{v.content.slice(0, 60)}{v.content.length > 60 ? '…' : ''}</p>
                  </div>
                  <div className="flex gap-3 text-xs text-gray-500 shrink-0 items-center">
                    <span>Load: <strong className={v.scores.cognitive_load > 60 ? 'text-danger' : 'text-gray-700'}>{Math.round(v.scores.cognitive_load)}</strong></span>
                    <span>Trust: <strong className="text-gray-700">{Math.round(v.scores.trust_coherence)}</strong></span>
                    <span>Manip: <strong className={v.scores.manipulation_risk > 40 ? 'text-danger' : 'text-gray-700'}>{Math.round(v.scores.manipulation_risk)}</strong></span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${badge.bg}`}>{badge.label}</span>
                  </div>
                </div>
              )
            })}
            <p className="text-xs text-gray-400 mt-2">
              Ranking based on: lowest cognitive load (40%) + highest trust coherence (40%) + lowest manipulation risk (20%)
            </p>
            <button
              onClick={() => { setRankedVariants([]); setPendingVariants([]); setLastComparisonDate(null) }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >
              Start New Comparison
            </button>
          </div>
        )}
      </Card>

      <Card title="Campaign Trust Drift and Funnel Metrics">
        <p className="text-sm text-gray-600">No verified campaign time-series or behavioral funnel dataset is connected.</p>
        <p className="text-xs text-gray-500 mt-2">
          Static example charts and fabricated trend insights are excluded from operational reporting.
          Connect measured events and provenance before enabling trend analysis.
        </p>
      </Card>
    </div>
  )
}
