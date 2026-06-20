import { useState } from 'react'
import { scoreTextRemote, type LiveScoreResult } from '../api/scoringApi.js'
import { useAppContext } from '../context/AppContext.js'
import { Card } from './Card.js'
import { CognitiveScoreCard } from './CognitiveScoreCard.js'
import { Spinner } from './Spinner.js'

const TRIAL_PROMPTS = [
  { label: 'High-pressure CTA', text: 'Act now! Only 2 spots left. This once-in-a-lifetime deal expires in 3 minutes. Don\'t miss out or you\'ll regret it forever!' },
  { label: 'Clean onboarding', text: 'Welcome to your new workspace. Here are three simple steps to get started. No rush — you can always come back to this later.' },
  { label: 'Authority appeal', text: 'Leading scientists unanimously agree this is the only framework proven to guarantee success in every situation without exception.' },
]

const SHOW_TRIAL = import.meta.env.VITE_SHOW_TRIAL_SCORING === 'true'
  || !!import.meta.env.VITE_SCORING_PROXY_URL

export function TryLiveScoring() {
  const { recordLiveScore } = useAppContext()
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<LiveScoreResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!SHOW_TRIAL) return null

  async function handleScore() {
    if (!text.trim() || state === 'loading') return
    setState('loading')
    setError(null)
    try {
      const res = await scoreTextRemote(text.trim())
      setResult(res)
      setState('done')
      recordLiveScore(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setState('error')
    }
  }

  return (
    <Card
      title="Try Live TRIBE v2 Scoring"
      action={
        <span className="flex items-center gap-1.5 text-xs font-semibold text-purple-600">
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
          CLOUD RUN
        </span>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Score any text against <strong>TRIBE v2</strong> — a tri-modal foundation model trained on 1,000+ hours of fMRI data.
          Your text is sent to a GPU-backed inference endpoint on Google Cloud Run.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {TRIAL_PROMPTS.map((p) => (
            <button
              key={p.label}
              onClick={() => { setText(p.text); setResult(null); setState('idle') }}
              className="text-xs px-2.5 py-1 rounded-full border border-purple-200 text-purple-500 hover:border-purple-400 hover:text-purple-700 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-start">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste any UI copy, prompt, or marketing text to see how it scores on cognitive load, trust, manipulation risk, and comprehension..."
            rows={3}
            disabled={state === 'loading'}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-60"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleScore()
            }}
          />
          <button
            onClick={() => void handleScore()}
            disabled={!text.trim() || state === 'loading'}
            className="shrink-0 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {state === 'loading' ? <Spinner /> : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684ZM13.949 13.684a1 1 0 0 0-1.898 0l-.184.551a1 1 0 0 1-.632.633l-.551.183a1 1 0 0 0 0 1.898l.551.183a1 1 0 0 1 .633.633l.183.551a1 1 0 0 0 1.898 0l.184-.551a1 1 0 0 1 .632-.633l.551-.183a1 1 0 0 0 0-1.898l-.551-.184a1 1 0 0 1-.633-.632l-.183-.551Z" />
                </svg>
                Try Live Scoring
              </>
            )}
          </button>
        </div>

        {state === 'loading' && (
          <div className="bg-purple-50 border-l-4 border-purple-400 rounded-r-lg px-4 py-3 text-sm text-purple-700 animate-pulse">
            Sending to TRIBE v2 on Cloud Run (GPU inference). First request may take ~5 min due to cold start. Warm requests take ~30s.
          </div>
        )}

        {state === 'error' && error && (
          <div className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">
            {error.includes('429')
              ? 'Trial rate limit reached. Come back tomorrow or contact us for a full account.'
              : error.includes('504') || error.includes('timeout') || error.includes('Timeout')
                ? 'Cloud Run cold start timed out. The GPU instance is warming up — please try again in 1–2 minutes.'
                : error}
          </div>
        )}

        {state === 'done' && result && (
          <div className="space-y-4 pt-1">
            <CognitiveScoreCard
              scores={{
                cognitiveLoad: result.cognitive_load,
                comprehensionConfidence: result.comprehension_confidence,
                trustCoherence: result.trust_coherence,
                manipulationRisk: result.manipulation_risk,
              }}
              context="trial scoring"
              defaultMode="manager"
            />

            {result.top_brain_regions.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 font-medium mb-1.5">Top activated brain regions</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.top_brain_regions.map((r) => (
                    <span key={r} className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{r}</span>
                  ))}
                </div>
              </div>
            )}

            <p className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">{result.explanation}</p>

            <div className="flex items-center justify-between pt-1 border-t border-gray-100">
              <span className="text-xs text-gray-400">
                {result.model_version} · {(result.latency_ms / 1000).toFixed(1)}s
              </span>
              <button
                onClick={() => { setResult(null); setState('idle'); setText('') }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Try another
              </button>
            </div>
          </div>
        )}

        <p className="text-[10px] text-gray-300 text-center">
          Trial scoring is rate-limited. Powered by TRIBE v2 (Meta AI Research) · CC-BY-NC-4.0
        </p>
      </div>
    </Card>
  )
}
