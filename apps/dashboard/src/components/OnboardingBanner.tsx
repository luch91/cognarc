import { useState } from 'react'

interface Props {
  onConnected: () => void
}

const STEPS = [
  'Paste your endpoint URL',
  'Add your API key',
  'Receive your first cognitive score',
]

export function OnboardingBanner({ onConnected }: Props) {
  const [url, setUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [state, setState] = useState<'idle' | 'testing' | 'success'>('idle')
  const activeStep = state === 'success' ? 2 : state === 'testing' ? 1 : url ? 1 : 0

  function handleConnect() {
    if (!url) return
    setState('testing')
    setTimeout(() => {
      setState('success')
      setTimeout(() => onConnected(), 2000)
    }, 1500)
  }

  return (
    <div className="border-l-4 border-teal-500 bg-teal-50 rounded-r-xl p-5">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-teal-900">Connect your first LLM endpoint to start monitoring</h2>
        <p className="text-xs text-teal-700 mt-0.5">Takes 5 minutes. No code required.</p>
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

      {/* Form */}
      {state === 'success' ? (
        <p className="text-sm font-semibold text-teal-700 animate-pulse">
          Connected! Generating your first score…
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-teal-700 font-medium mb-1">Endpoint URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              disabled={state === 'testing'}
              className="w-full text-sm border border-teal-200 bg-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-60"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-teal-700 font-medium mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              disabled={state === 'testing'}
              className="w-full text-sm border border-teal-200 bg-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-60"
            />
          </div>
          <button
            onClick={handleConnect}
            disabled={!url || state === 'testing'}
            className="text-sm font-semibold bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {state === 'testing' ? 'Testing connection…' : 'Connect & Start Monitoring'}
          </button>
        </div>
      )}
    </div>
  )
}
