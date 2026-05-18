import { useState } from 'react'
import { Card } from '../components/Card.js'
import { ScoreGauge } from '../components/ScoreGauge.js'

const VARIANT_A = { label: 'Variant A', cognitive_load: 38, comprehension: 82, trust: 86, manipulation: 9 }
const VARIANT_B = { label: 'Variant B', cognitive_load: 67, comprehension: 58, trust: 61, manipulation: 28 }

const ONBOARDING_STEPS = [
  { step: 'Welcome', load: 28, comprehension: 88, drop: 0 },
  { step: 'Profile', load: 42, comprehension: 79, drop: 4 },
  { step: 'Connect SDK', load: 71, comprehension: 54, drop: 22 },
  { step: 'Configure', load: 83, comprehension: 41, drop: 39 },
  { step: 'First Score', load: 55, comprehension: 62, drop: 10 },
  { step: 'Complete', load: 32, comprehension: 84, drop: 4 },
]

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

export function DesignerView() {
  const [heatmapFile, setHeatmapFile] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Designer View</h1>

      {/* A/B Comparison Tool */}
      <Card title="A/B Cognitive Comparison">
        <p className="text-xs text-gray-400 mb-4">
          Upload two variants to compare. Showing demo data — connect via SDK for live evaluation.
        </p>
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
            <p className="text-xs font-semibold text-danger mt-2">Variant A preferred</p>
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
          <div className="relative inline-block max-w-full">
            <img
              src={heatmapFile}
              alt="Uploaded UI screenshot"
              className="max-h-96 rounded-lg border border-gray-200 object-contain"
            />
            <div
              className="absolute inset-0 rounded-lg pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 40% 30% at 35% 45%, rgba(239,68,68,0.35) 0%, rgba(245,158,11,0.2) 40%, transparent 70%), radial-gradient(ellipse 25% 20% at 70% 30%, rgba(245,158,11,0.3) 0%, transparent 60%)',
              }}
              aria-hidden
            />
            <p className="text-xs text-gray-400 mt-2">
              Simulated attention heatmap overlay. Connect TRIBE for live cortical mapping.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
            <span className="text-3xl mb-2" aria-hidden>🖼</span>
            <p className="text-sm">Upload a UI screenshot to see the attention / load overlay</p>
          </div>
        )}
      </Card>

      {/* Onboarding Flow Analyzer */}
      <Card title="Onboarding Flow Analyzer — Step-by-Step Load Curve">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Onboarding flow cognitive scores">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left py-2 pr-4 font-semibold">Step</th>
                <th className="text-right py-2 px-2 font-semibold">Cognitive Load</th>
                <th className="text-right py-2 px-2 font-semibold">Comprehension</th>
                <th className="text-right py-2 pl-2 font-semibold">Drop-off %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ONBOARDING_STEPS.map((s) => (
                <tr key={s.step}>
                  <td className="py-2 pr-4 font-medium text-gray-700">{s.step}</td>
                  <td className="py-2 px-2 text-right">
                    <span className={`font-semibold tabular-nums ${s.load > 70 ? 'text-danger' : s.load > 50 ? 'text-warning' : 'text-success'}`}>
                      {s.load}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span className={`font-semibold tabular-nums ${s.comprehension < 55 ? 'text-danger' : s.comprehension < 70 ? 'text-warning' : 'text-success'}`}>
                      {s.comprehension}
                    </span>
                  </td>
                  <td className="py-2 pl-2 text-right tabular-nums text-gray-500">
                    {s.drop > 0 ? `-${s.drop}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Steps with load &gt; 70 are highlighted in red. Steps with comprehension &lt; 55 indicate likely abandonment.
        </p>
      </Card>
    </div>
  )
}
