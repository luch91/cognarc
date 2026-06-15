import { useState } from 'react'
import { scoreText, type LiveScoreResult } from '../api/scoringApi.js'
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

export function LiveScorePanel() {
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<LiveScoreResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleScore() {
    if (!text.trim() || state === 'loading') return
    setState('loading')
    setError(null)
    try {
      const res = await scoreText(text.trim())
      setResult(res)
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setState('error')
    }
  }

  function handleExample(prompt: string) {
    setText(prompt)
    setResult(null)
    setState('idle')
  }

  return (
    <Card
      title="Live Cognitive Score"
      action={
        result ? (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RISK_COLOR[result.cognitive_risk]}`}>
            {result.cognitive_risk} RISK
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
              onClick={() => handleExample(p)}
              className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors truncate max-w-[220px]"
              title={p}
            >
              {p.slice(0, 40)}…
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-2 items-start">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste any text, prompt, or UI copy to score it against TRIBE v2…"
            rows={3}
            disabled={state === 'loading'}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-60"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleScore()
            }}
          />
          <button
            onClick={handleScore}
            disabled={!text.trim() || state === 'loading'}
            className="shrink-0 text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {state === 'loading' ? <Spinner /> : 'Score'}
          </button>
        </div>

        {/* Loading state */}
        {state === 'loading' && (
          <p className="text-xs text-gray-400 animate-pulse">
            Sending to TRIBE v2 on Cloud Run… cold start may take ~5 min, warm requests ~30s.
          </p>
        )}

        {/* Error */}
        {state === 'error' && error && (
          <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        {/* Results */}
        {state === 'done' && result && (
          <div className="space-y-4 pt-1">
            <div className="flex flex-wrap gap-6">
              <Gauge label="Cognitive Load" value={result.cognitive_load} invert />
              <Gauge label="Comprehension" value={result.comprehension_confidence} />
              <Gauge label="Trust Coherence" value={result.trust_coherence} />
              <Gauge label="Manip Risk" value={result.manipulation_risk} invert />
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

            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <span className="text-xs text-gray-400">
                {result.model_version} · {(result.latency_ms / 1000).toFixed(1)}s
              </span>
              <button
                onClick={() => { setResult(null); setState('idle') }}
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
