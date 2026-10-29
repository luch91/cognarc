import { useState } from 'react'

interface Props {
  onConnected: () => void
}

const STEPS = [
  'Verify connection',
  'Run a separate text evaluation',
]

export function OnboardingBanner({ onConnected }: Props) {
  const [state, setState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const activeStep = state === 'success' ? 1 : state === 'testing' ? 0 : 0

  async function handleConnect() {
    setState('testing')
    setErrorMsg('')
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setState('success')
      setTimeout(() => onConnected(), 1500)
    } catch {
      setErrorMsg('Could not reach the scoring service. Try again in a moment.')
      setState('error')
    }
  }

  return (
    <div className="border-l-4 border-teal-500 bg-teal-50 rounded-r-xl p-5">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-teal-900">Check the scoring service connection</h2>
        <p className="text-xs text-teal-700 mt-0.5">A healthy API does not imply an LLM endpoint is connected.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-5">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 ${i <= activeStep ? 'text-teal-700' : 'text-gray-400'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                i < activeStep ? 'bg-teal-500 text-white' :
                i === activeStep ? 'bg-teal-500 text-white' :
                'bg-gray-200 text-gray-400'
              }`}>
                {i < activeStep ? '✓' : i + 1}
              </span>
              <span className="text-xs font-medium whitespace-nowrap">{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={`w-8 h-px shrink-0 ${i < activeStep ? 'bg-teal-400' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      {state === 'success' ? (
        <p className="text-sm font-semibold text-teal-700 animate-pulse">
          Scoring service reachable. Run a text evaluation to check scoring.
        </p>
      ) : (
        <div className="space-y-2">
          <button
            onClick={() => { void handleConnect() }}
            disabled={state === 'testing'}
            className="text-sm font-semibold bg-teal-500 hover:bg-teal-600 text-white px-5 py-2 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {state === 'testing' ? 'Testing connection…' : 'Check Service Health'}
          </button>
          {state === 'error' && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{errorMsg}</p>
          )}
        </div>
      )}
    </div>
  )
}
