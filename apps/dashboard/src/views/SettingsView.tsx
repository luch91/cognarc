import { useState } from 'react'
import { Card } from '../components/Card.js'

interface LLMEndpoint {
  id: string
  name: string
  endpoint: string
  status: 'connected' | 'error'
}

interface AnalyticsConnector {
  id: string
  name: string
  initial: string
  color: string
  status: 'connected' | 'degraded'
  writeBack: boolean
}

const INITIAL_ENDPOINTS: LLMEndpoint[] = [
  { id: 'ep1', name: 'Production GPT-4o', endpoint: 'api.openai.com', status: 'connected' },
]

const INITIAL_CONNECTORS: AnalyticsConnector[] = [
  { id: 'seg', name: 'Segment',   initial: 'S', color: 'bg-green-500',  status: 'connected', writeBack: true  },
  { id: 'amp', name: 'Amplitude', initial: 'A', color: 'bg-blue-500',   status: 'connected', writeBack: true  },
  { id: 'mix', name: 'Mixpanel',  initial: 'M', color: 'bg-purple-500', status: 'degraded',  writeBack: false },
  { id: 'ph',  name: 'PostHog',   initial: 'P', color: 'bg-orange-500', status: 'connected', writeBack: true  },
  { id: 'ga4', name: 'GA4',       initial: 'G', color: 'bg-yellow-500', status: 'connected', writeBack: false },
]

export function SettingsView() {
  // LLM Connections
  const [endpoints, setEndpoints] = useState<LLMEndpoint[]>(INITIAL_ENDPOINTS)
  const [epUrl, setEpUrl] = useState('')
  const [epKey, setEpKey] = useState('')
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success'>('idle')

  function handleTest() {
    if (!epUrl) return
    setTestState('testing')
    setTimeout(() => setTestState('success'), 1500)
  }

  function handleSaveEndpoint() {
    if (!epUrl) return
    const name = new URL(epUrl.startsWith('http') ? epUrl : `https://${epUrl}`).hostname
    setEndpoints((prev) => [
      ...prev,
      { id: `ep-${Date.now()}`, name, endpoint: name, status: 'connected' },
    ])
    setEpUrl('')
    setEpKey('')
    setTestState('idle')
  }

  // Analytics Connectors
  const [connectors, setConnectors] = useState<AnalyticsConnector[]>(INITIAL_CONNECTORS)

  function toggleWriteBack(id: string) {
    setConnectors((prev) => prev.map((c) => c.id === id ? { ...c, writeBack: !c.writeBack } : c))
  }

  // Workspace Thresholds
  const [thresholds, setThresholds] = useState({ cogLoad: 80, manipRisk: 40, compConf: 50 })
  const [savedMsg, setSavedMsg] = useState(false)

  function handleSaveThresholds() {
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 2000)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Settings</h1>

      {/* Section 1: LLM Connections */}
      <Card title="LLM Connections">
        <div className="space-y-3">
          {endpoints.map((ep) => (
            <div key={ep.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50">
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">{ep.name}</p>
                <p className="text-xs text-gray-400">{ep.endpoint}</p>
              </div>
              <span className="text-xs font-medium text-green-600">Connected</span>
            </div>
          ))}

          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Add Endpoint</p>
            <div className="space-y-2">
              <input
                type="text"
                value={epUrl}
                onChange={(e) => setEpUrl(e.target.value)}
                placeholder="Endpoint URL"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <input
                type="password"
                value={epKey}
                onChange={(e) => setEpKey(e.target.value)}
                placeholder="API Key"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTest}
                  disabled={testState === 'testing'}
                  className="text-xs px-3 py-1.5 rounded-lg border border-brand-500 text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
                >
                  {testState === 'testing' ? 'Testing…' : 'Test Connection'}
                </button>
                <button
                  onClick={handleSaveEndpoint}
                  className="text-xs px-3 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
                >
                  Save
                </button>
                {testState === 'success' && (
                  <span className="text-xs text-green-600 font-medium">Connection successful</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Section 2: Analytics Connectors */}
      <Card title="Analytics Connectors">
        <div className="space-y-2">
          {connectors.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
              <span className={`w-8 h-8 rounded-full ${c.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                {c.initial}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">{c.name}</p>
                <span className={`text-xs font-medium ${c.status === 'connected' ? 'text-green-600' : 'text-amber-600'}`}>
                  {c.status === 'connected' ? 'Connected' : 'Degraded'}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">Write-back</span>
                  <button
                    onClick={() => toggleWriteBack(c.id)}
                    className={`relative w-8 h-4 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${c.writeBack ? 'bg-brand-500' : 'bg-gray-200'}`}
                    aria-label={`Toggle write-back for ${c.name}`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${c.writeBack ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <button className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors">
                  Configure
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Section 3: Eval Platform Integrations */}
      <Card title="Eval Platform Integrations">
        <div className="space-y-2">
          {[
            { id: 'braintrust', name: 'Braintrust',        subline: 'Cognitive scores appear as first-class scorer columns',      btn: 'Connect via OAuth'   },
            { id: 'langfuse',   name: 'Langfuse',           subline: 'Scores visible in trace evaluation view',                    btn: 'Connect via OAuth'   },
            { id: 'wandb',      name: 'Weights & Biases',   subline: 'Cognitive scorer in W&B Weave evaluations',                  btn: 'Connect via API Key' },
            { id: 'arize',      name: 'Arize Phoenix',      subline: 'Cognitive dimensions in Phoenix eval dashboard',             btn: 'Connect via API Key' },
          ].map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">{p.name}</p>
                <p className="text-xs text-gray-400">{p.subline}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-gray-400">Not connected</span>
                <button className="text-xs px-3 py-1 rounded-lg border border-teal-500 text-teal-600 hover:bg-teal-50 transition-colors">
                  {p.btn}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 bg-gray-50 rounded-lg border border-gray-200 px-4 py-3 text-xs text-gray-500 space-y-1">
          <p className="font-semibold text-gray-600">Cognitive Scorer API endpoint:</p>
          <p className="font-mono text-gray-700">https://api.cognarc.com/v1/score</p>
          <p>Compatible with any platform that supports custom scorers.</p>
          <p className="flex gap-3">
            <span className="text-brand-500 cursor-pointer hover:underline">OpenAPI spec</span>
            <span className="text-brand-500 cursor-pointer hover:underline">Python SDK</span>
            <span className="text-brand-500 cursor-pointer hover:underline">TypeScript SDK</span>
          </p>
        </div>
      </Card>

      {/* Section 4: Workspace Thresholds */}
      <Card title="Workspace Thresholds">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cognitive Load Max</label>
            <input
              type="number"
              value={thresholds.cogLoad}
              onChange={(e) => setThresholds((t) => ({ ...t, cogLoad: Number(e.target.value) }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Manipulation Risk Max</label>
            <input
              type="number"
              value={thresholds.manipRisk}
              onChange={(e) => setThresholds((t) => ({ ...t, manipRisk: Number(e.target.value) }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Comprehension Confidence Min</label>
            <input
              type="number"
              value={thresholds.compConf}
              onChange={(e) => setThresholds((t) => ({ ...t, compConf: Number(e.target.value) }))}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveThresholds}
            className="text-xs bg-brand-500 text-white px-4 py-1.5 rounded-lg hover:bg-brand-600 transition-colors"
          >
            Save Thresholds
          </button>
          {savedMsg && <span className="text-xs text-green-600 font-medium">Thresholds saved</span>}
        </div>
      </Card>

      {/* Section 4: GitHub / CI/CD */}
      <Card
        title="GitHub / CI/CD"
        action={
          <button className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
            + Add Repository
          </button>
        }
      >
        <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50">
          <svg className="w-5 h-5 text-gray-600 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700">cognarc-app</p>
            <p className="text-xs text-gray-400">github.com/your-org/cognarc-app</p>
          </div>
          <span className="flex items-center gap-1 text-xs font-medium text-green-600">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Connected
          </span>
        </div>
      </Card>
    </div>
  )
}