import { useState, useRef, useEffect, useCallback } from 'react'
import { Card } from '../components/Card.js'
import { ScoreGauge } from '../components/ScoreGauge.js'
import { Spinner } from '../components/Spinner.js'
import { CognitiveScoreCard } from '../components/CognitiveScoreCard.js'
import { OnboardingFlowManager } from '../components/OnboardingFlowManager.js'
import { extractUrl } from '../api/urlExtractorApi.js'
import { scorePage } from '../api/pageScorerApi.js'
import type { PageScoringResult, SectionScores } from '../api/pageScorerApi.js'

const SHARE_URL = 'https://cognarc.app/reports/ab-comparison-demo-001'

const VARIANT_A = { label: 'Variant A', cognitive_load: 38, comprehension: 82, trust: 86, manipulation: 9 }
const VARIANT_B = { label: 'Variant B', cognitive_load: 67, comprehension: 58, trust: 61, manipulation: 28 }


function Delta({ a, b, invert = false }: { a: number; b: number; invert?: boolean }) {
  const diff = b - a
  const bad = invert ? diff > 0 : diff < 0
  if (diff === 0) return <span className="text-gray-400 text-xs">—</span>
  return (
    <span className={`text-xs font-semibold ${bad ? 'text-danger' : 'text-success'}`}>
      {diff > 0 ? '+' : ''}{diff}
    </span>
  )
}

const HOTSPOTS = [
  { cx: 0.25, cy: 0.20, r: 0.22, color: [255, 50,  50]  as [number,number,number], alpha: 0.45 },
  { cx: 0.65, cy: 0.35, r: 0.16, color: [255, 165, 0]   as [number,number,number], alpha: 0.32 },
  { cx: 0.45, cy: 0.67, r: 0.12, color: [255, 255, 0]   as [number,number,number], alpha: 0.22 },
]

function drawHeatmap(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: w, height: h } = canvas
  ctx.clearRect(0, 0, w, h)
  for (const hs of HOTSPOTS) {
    const x = hs.cx * w
    const y = hs.cy * h
    const r = hs.r * w
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    const [r0, g0, b0] = hs.color
    grad.addColorStop(0,   `rgba(${r0},${g0},${b0},${hs.alpha})`)
    grad.addColorStop(0.5, `rgba(${r0},${g0},${b0},${hs.alpha * 0.5})`)
    grad.addColorStop(1,   `rgba(${r0},${g0},${b0},0)`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function HeatmapViewer({ src }: { src: string }) {
  const imgRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [processing, setProcessing] = useState(true)
  const [ready, setReady] = useState(false)

  const syncCanvas = useCallback(() => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return
    const w = img.offsetWidth || img.naturalWidth || 400
    const h = img.offsetHeight || img.naturalHeight || 300
    canvas.width = w
    canvas.height = h
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    drawHeatmap(canvas)
  }, [])

  useEffect(() => {
    setProcessing(true)
    setReady(false)
    const timer = setTimeout(() => {
      setProcessing(false)
      setReady(true)
      requestAnimationFrame(() => syncCanvas())
    }, 1500)
    return () => clearTimeout(timer)
  }, [src, syncCanvas])

  useEffect(() => {
    if (!ready) return
    const img = imgRef.current
    if (!img) return
    const ro = new ResizeObserver(syncCanvas)
    ro.observe(img)
    return () => ro.disconnect()
  }, [ready, syncCanvas])

  return (
    <div className="inline-block max-w-full">
      <div className="relative inline-block">
        <img
          ref={imgRef}
          src={src}
          alt="Uploaded UI screenshot"
          className="max-h-96 rounded-lg border-2 border-yellow-400 object-contain"
          onLoad={() => ready && syncCanvas()}
        />
        {processing && (
          <div className="absolute inset-0 rounded-lg flex flex-col items-center justify-center bg-black/30 gap-2">
            <Spinner />
            <span className="text-xs text-white font-medium">Analyzing attention patterns…</span>
          </div>
        )}
        {ready && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 rounded-lg"
            style={{ pointerEvents: 'none' }}
            aria-hidden
          />
        )}
      </div>
      <div className="flex items-center justify-end gap-3 mt-2 text-xs text-gray-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />High attention</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />Medium</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-300 inline-block" />Low</span>
      </div>
    </div>
  )
}

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

    setLoading(false)
  }

  const hasResults = resultA && resultB

  let winner: 'A' | 'B' | 'inconclusive' = 'inconclusive'
  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW'
  const dims: { label: string; a: number; b: number; lower: boolean }[] = []

  if (hasResults) {
    dims.push(
      { label: 'Load', a: resultA.overallScores.cognitiveLoad, b: resultB.overallScores.cognitiveLoad, lower: true },
      { label: 'Comprehension', a: resultA.overallScores.comprehensionConfidence, b: resultB.overallScores.comprehensionConfidence, lower: false },
      { label: 'Trust', a: resultA.overallScores.trustCoherence, b: resultB.overallScores.trustCoherence, lower: false },
      { label: 'Manipulation', a: resultA.overallScores.manipulationRisk, b: resultB.overallScores.manipulationRisk, lower: true },
    )
    let bWins = 0, aWins = 0, totalDelta = 0
    for (const d of dims) {
      const better = d.lower ? d.b < d.a : d.b > d.a
      const delta = Math.abs(d.b - d.a)
      if (better) { bWins++; totalDelta += delta } else if (delta > 0) { aWins++; totalDelta += delta }
    }
    if (bWins >= 3) winner = 'B'
    else if (aWins >= 3) winner = 'A'
    if ((bWins >= 3 || aWins >= 3) && totalDelta / Math.max(bWins + aWins, 1) > 15) confidence = 'HIGH'
    else if (bWins >= 2 || aWins >= 2) confidence = 'MEDIUM'
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
                  {winner === 'A' ? 'Page A preferred' : winner === 'B' ? 'Page B preferred' : 'Inconclusive'}
                </p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                  confidence === 'HIGH' ? 'bg-green-100 text-green-700' : confidence === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                }`}>{confidence} confidence</span>
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

type AbPhase = 'upload' | 'processing' | 'results'

function UploadZone({ label, file, onFile }: { label: string; file: File | null; onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <label
      className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors"
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.html,.txt"
        className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }}
        aria-label={`Upload ${label}`}
      />
      <span className="text-2xl" aria-hidden>📁</span>
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      {file ? (
        <span className="text-xs text-brand-600 font-medium truncate max-w-full px-2">{file.name}</span>
      ) : (
        <span className="text-xs text-gray-400 text-center">Drop a file or click to upload<br />PNG · JPG · HTML · TXT</span>
      )}
    </label>
  )
}

function AbComparison() {
  const [phase, setPhase] = useState<AbPhase>('upload')
  const [fileA, setFileA] = useState<File | null>(null)
  const [fileB, setFileB] = useState<File | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  function handleRun() {
    setPhase('processing')
    setTimeout(() => setPhase('results'), 1500)
  }

  function handleReset() {
    setPhase('upload')
    setFileA(null)
    setFileB(null)
    setShareCopied(false)
  }

  function handleShare() {
    navigator.clipboard.writeText(SHARE_URL)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  if (phase === 'upload') {
    return (
      <div className="space-y-4">
        <p className="text-xs text-gray-400">Upload two variants to compare cognitive impact.</p>
        <div className="grid grid-cols-2 gap-4">
          <UploadZone label="Variant A" file={fileA} onFile={setFileA} />
          <UploadZone label="Variant B" file={fileB} onFile={setFileB} />
        </div>
        <button
          onClick={handleRun}
          disabled={!fileA || !fileB}
          className="w-full text-sm py-2.5 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Run Cognitive Comparison
        </button>
      </div>
    )
  }

  if (phase === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Spinner />
        <p className="text-sm font-medium text-gray-600">Running cognitive comparison…</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Variant A */}
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">{VARIANT_A.label}</p>
          <div className="flex flex-wrap gap-4 justify-around">
            <ScoreGauge label="Load" value={VARIANT_A.cognitive_load} invert size="sm" />
            <ScoreGauge label="Comprehension" value={VARIANT_A.comprehension} size="sm" />
            <ScoreGauge label="Trust" value={VARIANT_A.trust} size="sm" />
            <ScoreGauge label="Manipulation" value={VARIANT_A.manipulation} invert size="sm" />
          </div>
        </div>

        {/* Delta column */}
        <div className="flex flex-col items-center justify-center gap-3 py-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">B vs A</p>
          <div className="space-y-3 text-center">
            <div>
              <p className="text-xs text-gray-400">Load</p>
              <Delta a={VARIANT_A.cognitive_load} b={VARIANT_B.cognitive_load} invert />
            </div>
            <div>
              <p className="text-xs text-gray-400">Comprehension</p>
              <Delta a={VARIANT_A.comprehension} b={VARIANT_B.comprehension} />
            </div>
            <div>
              <p className="text-xs text-gray-400">Trust</p>
              <Delta a={VARIANT_A.trust} b={VARIANT_B.trust} />
            </div>
            <div>
              <p className="text-xs text-gray-400">Manipulation</p>
              <Delta a={VARIANT_A.manipulation} b={VARIANT_B.manipulation} invert />
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 mt-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-danger">Variant A preferred</p>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 uppercase tracking-wide">High Confidence</span>
            </div>
            <button
              onClick={handleShare}
              className="text-xs px-3 py-1 rounded-lg border border-teal-500 text-teal-600 hover:bg-teal-50 transition-colors"
            >
              {shareCopied ? 'Link copied!' : 'Share Report'}
            </button>
            <p className="text-[10px] text-gray-400">Shareable link · Valid for 30 days</p>
            <button
              onClick={handleReset}
              className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >
              New Comparison
            </button>
          </div>
        </div>

        {/* Variant B */}
        <div className="border border-gray-200 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">{VARIANT_B.label}</p>
          <div className="flex flex-wrap gap-4 justify-around">
            <ScoreGauge label="Load" value={VARIANT_B.cognitive_load} invert size="sm" />
            <ScoreGauge label="Comprehension" value={VARIANT_B.comprehension} size="sm" />
            <ScoreGauge label="Trust" value={VARIANT_B.trust} size="sm" />
            <ScoreGauge label="Manipulation" value={VARIANT_B.manipulation} invert size="sm" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function DesignerView() {
  const [heatmapFile, setHeatmapFile] = useState<string | null>(null)
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

      {/* Heatmap Viewer */}
      <Card
        title="Attention / Load Heatmap Viewer"
        action={
          <label className="text-xs bg-brand-500 text-white px-3 py-1 rounded-lg hover:bg-brand-600 transition-colors cursor-pointer focus-within:ring-2 focus-within:ring-brand-500">
            Upload screenshot
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) setHeatmapFile(URL.createObjectURL(file))
              }}
              aria-label="Upload UI screenshot for heatmap overlay"
            />
          </label>
        }
      >
        {heatmapFile ? (
          <HeatmapViewer key={heatmapFile} src={heatmapFile} />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
            <span className="text-3xl mb-2" aria-hidden>🖼</span>
            <p className="text-sm">Upload a UI screenshot to see the attention / load overlay</p>
          </div>
        )}
      </Card>

      {/* Onboarding Flow Analyzer */}
      <Card title="Onboarding Flow Analyzer — Step-by-Step Load Curve">
        <OnboardingFlowManager />
      </Card>
    </div>
  )
}
