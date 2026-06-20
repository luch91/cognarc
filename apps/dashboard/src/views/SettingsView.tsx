import { useState } from 'react'
import { Card } from '../components/Card.js'
import { Spinner } from '../components/Spinner.js'
import { useAppContext } from '../context/AppContext.js'
import type { ConnectorConfig } from '../context/AppContext.js'

const MASKED_KEYS: Record<string, string> = {
  seg: '••••••••sg-k3x9',
  amp: '••••••••amp-7f2a',
  ph:  '••••••••phog-c1b4',
  ga4: '••••••••ga4-8e5d',
}

function ConfigureModal({
  connector,
  onClose,
  onSave,
}: {
  connector: ConnectorConfig
  onClose: () => void
  onSave: (updates: Partial<ConnectorConfig>) => void
}) {
  const [writeBack, setWriteBack] = useState(connector.writeBack)
  const [eventFilter, setEventFilter] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok'>('idle')
  const [reconnectState, setReconnectState] = useState<'idle' | 'connecting' | 'done'>('idle')
  const [disconnectConfirm, setDisconnectConfirm] = useState(false)
  const [localStatus, setLocalStatus] = useState(connector.status)

  function handleTest() {
    setTestState('testing')
    setTimeout(() => setTestState('ok'), 1000)
  }

  function handleReconnect() {
    setReconnectState('connecting')
    setTimeout(() => {
      setReconnectState('done')
      setLocalStatus('connected')
    }, 1500)
  }

  function handleSave() {
    onSave({ writeBack, status: localStatus })
    onClose()
  }

  function handleDisconnectConfirm() {
    onSave({ status: 'degraded', writeBack: false })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cfg-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-full ${connector.color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
              {connector.initial}
            </span>
            <h2 id="cfg-modal-title" className="text-base font-semibold text-gray-800">
              Configure {connector.name}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">×</button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Platform-specific connection fields */}
          {connector.name === 'Segment' && localStatus !== 'connected' && reconnectState !== 'done' && (
            <>
              <p className="text-xs text-gray-500">Step 1: Add this webhook URL to your Segment source:</p>
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-2 font-mono text-xs text-gray-700 flex items-center justify-between">
                <span>https://api.cognarc.com/webhooks/segment/ws-1</span>
                <button onClick={() => { void navigator.clipboard.writeText('https://api.cognarc.com/webhooks/segment/ws-1') }} className="text-xs text-teal-600 hover:underline shrink-0 ml-2">Copy</button>
              </div>
              <p className="text-xs text-gray-500">Step 2: Enter your Segment webhook signing secret:</p>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Webhook signing secret" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <button onClick={() => { handleReconnect() }} disabled={!apiKey.trim() || reconnectState === 'connecting'} className="w-full text-sm py-2 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {reconnectState === 'connecting' ? <><Spinner /><span>Verifying…</span></> : 'Save & Verify'}
              </button>
            </>
          )}

          {connector.name === 'Amplitude' && localStatus !== 'connected' && reconnectState !== 'done' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">API Key</label>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="From Amplitude → Project Settings" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Secret Key</label>
                <input type="password" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} placeholder="From Amplitude → Project Settings" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <button onClick={() => handleReconnect()} disabled={!apiKey.trim() || reconnectState === 'connecting'} className="w-full text-sm py-2 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {reconnectState === 'connecting' ? <><Spinner /><span>Connecting…</span></> : 'Connect Amplitude'}
              </button>
            </>
          )}

          {connector.name === 'PostHog' && localStatus !== 'connected' && reconnectState !== 'done' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Project API Key</label>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="From PostHog → Project Settings → API Keys" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Host</label>
                <input type="text" value={eventFilter || 'https://us.i.posthog.com'} onChange={(e) => setEventFilter(e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <button onClick={() => handleReconnect()} disabled={!apiKey.trim() || reconnectState === 'connecting'} className="w-full text-sm py-2 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {reconnectState === 'connecting' ? <><Spinner /><span>Connecting…</span></> : 'Connect PostHog'}
              </button>
            </>
          )}

          {connector.name === 'GA4' && localStatus !== 'connected' && reconnectState !== 'done' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Measurement ID</label>
                <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="G-XXXXXXXXXX" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">API Secret</label>
                <input type="password" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} placeholder="From GA4 → Admin → Measurement Protocol" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <button onClick={() => handleReconnect()} disabled={!apiKey.trim() || reconnectState === 'connecting'} className="w-full text-sm py-2 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {reconnectState === 'connecting' ? <><Spinner /><span>Connecting…</span></> : 'Connect GA4'}
              </button>
            </>
          )}

          {connector.name === 'Mixpanel' && localStatus !== 'connected' && reconnectState !== 'done' && (
            <>
              <p className="text-xs text-gray-500">Full Mixpanel OAuth integration requires a registered Mixpanel app. In the meantime, you can use Mixpanel's Ingestion API directly.</p>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Project Token</label>
                <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="From Mixpanel → Project Settings" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <button onClick={() => handleReconnect()} disabled={!apiKey.trim() || reconnectState === 'connecting'} className="w-full text-sm py-2 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {reconnectState === 'connecting' ? <><Spinner /><span>Saving…</span></> : 'Save Token'}
              </button>
            </>
          )}

          {/* Generic degraded flow for unknown connectors */}
          {!['Segment', 'Amplitude', 'PostHog', 'GA4', 'Mixpanel'].includes(connector.name) && localStatus === 'degraded' && reconnectState !== 'done' && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span className="text-xs font-semibold text-amber-700">Degraded — reconnection required</span>
              </div>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your API key to reconnect" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <button onClick={handleReconnect} disabled={reconnectState === 'connecting'} className="w-full text-sm py-2 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {reconnectState === 'connecting' ? <><Spinner /><span>Reconnecting…</span></> : 'Reconnect'}
              </button>
            </>
          )}

          {/* Connected flow */}
          {(localStatus === 'connected' || reconnectState === 'done') && (
            <>
              {reconnectState === 'done' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-xs font-semibold text-green-700">✓ Connected successfully</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">API Key</label>
                <input
                  type="text"
                  readOnly
                  value={MASKED_KEYS[connector.id] ?? '••••••••••••••'}
                  className="w-full text-sm border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-gray-500 cursor-default"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Write-back enabled</span>
                <button
                  onClick={() => setWriteBack((v) => !v)}
                  className={`relative w-8 h-4 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 ${writeBack ? 'bg-brand-500' : 'bg-gray-200'}`}
                  aria-label="Toggle write-back"
                >
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${writeBack ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleTest}
                  disabled={testState === 'testing'}
                  className="text-xs px-3 py-1.5 rounded-lg border border-brand-500 text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {testState === 'testing' && <Spinner />}
                  {testState === 'testing' ? 'Testing…' : 'Test Connection'}
                </button>
                {testState === 'ok' && <span className="text-xs text-green-600 font-medium">Connection healthy ✓</span>}
              </div>

              {disconnectConfirm ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-red-700 font-medium">
                    Disconnect {connector.name}? This will stop event ingestion and write-back.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDisconnectConfirm}
                      className="text-xs px-3 py-1.5 rounded-lg bg-danger text-white font-semibold hover:bg-red-600 transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDisconnectConfirm(false)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setDisconnectConfirm(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-danger text-danger hover:bg-red-50 transition-colors"
                >
                  Disconnect
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="text-sm px-4 py-2 rounded-lg bg-brand-500 text-white font-semibold hover:bg-brand-600 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Eval Platform types & modal ─────────────────────────────────────────────

interface EvalPlatform {
  id: string
  name: string
  subline: string
  authType: 'oauth' | 'apikey'
}

const EVAL_PLATFORMS: EvalPlatform[] = [
  { id: 'braintrust', name: 'Braintrust',      subline: 'Cognitive scores appear as first-class scorer columns',   authType: 'apikey' },
  { id: 'langfuse',   name: 'Langfuse',         subline: 'Scores visible in trace evaluation view',                 authType: 'apikey' },
  { id: 'wandb',      name: 'Weights & Biases', subline: 'Cognitive scorer in W&B Weave evaluations',               authType: 'apikey' },
  { id: 'arize',      name: 'Arize Phoenix',    subline: 'Cognitive dimensions in Phoenix eval dashboard',           authType: 'apikey' },
]

function EvalConnectModal({
  platform,
  onClose,
  onConnect,
}: {
  platform: EvalPlatform
  onClose: () => void
  onConnect: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [host, setHost] = useState(platform.id === 'langfuse' ? 'https://cloud.langfuse.com' : '')
  const [connecting, setConnecting] = useState(false)

  function handleConnect() {
    setConnecting(true)
    setTimeout(() => {
      setConnecting(false)
      onConnect()
      onClose()
    }, 1200)
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="eval-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 id="eval-modal-title" className="text-base font-semibold text-gray-800">
            Connect {platform.name}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {platform.id === 'braintrust' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Braintrust API Key</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="From braintrustdata.com → Settings → API Keys" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          )}

          {platform.id === 'langfuse' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Public Key</label>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="From Langfuse → Project Settings" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Secret Key</label>
                <input type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="Secret key" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Host</label>
                <input type="text" value={host} onChange={(e) => setHost(e.target.value)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </>
          )}

          {platform.id === 'wandb' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">W&B API Key</label>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="From wandb.ai → Settings → API keys" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Entity <span className="font-normal text-gray-400">(optional)</span></label>
                <input type="text" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="Your W&B username or team name" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </>
          )}

          {platform.id === 'arize' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Arize API Key</label>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="From app.arize.com → Settings → API Keys" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Space ID</label>
                <input type="text" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} placeholder="Your Arize Space ID" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            onClick={handleConnect}
            disabled={!apiKey.trim() || connecting}
            className="text-sm px-4 py-2 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {connecting ? <><Spinner />Connecting...</> : `Connect ${platform.name}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Repository modal ─────────────────────────────────────────────────────

interface GithubRepo {
  id: string
  url: string
  name: string
  paths: string
  webhookSecret: string
  lastEvent?: string
}

function AddRepoModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (repo: GithubRepo) => void
}) {
  const [repoUrl, setRepoUrl] = useState('')
  const [token, setToken] = useState('')
  const [paths, setPaths] = useState('prompts/**/*.txt, src/copy/**/*.json')
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok'>('idle')
  const [webhookSecret] = useState(() => crypto.randomUUID() + '-' + Date.now())

  function handleTest() {
    if (!repoUrl) return
    setTestState('testing')
    setTimeout(() => setTestState('ok'), 1200)
  }

  function handleSave() {
    if (!repoUrl.trim()) return
    const name = repoUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '') || repoUrl
    onSave({ id: `repo-${Date.now()}`, url: repoUrl.trim(), name, paths: paths.trim(), webhookSecret })
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="repo-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 id="repo-modal-title" className="text-base font-semibold text-gray-800">Connect GitHub Repository</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="px-6 py-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Repository URL</label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/org/repo"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Personal Access Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              Monitored paths
              <span className="font-normal text-gray-400 ml-1">Files that trigger cognitive evaluation on PR</span>
            </label>
            <input
              type="text"
              value={paths}
              onChange={(e) => setPaths(e.target.value)}
              placeholder="prompts/**/*.txt, src/copy/**"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Webhook Secret <span className="font-normal text-gray-400">(auto-generated)</span></label>
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-2 font-mono text-xs text-gray-700 flex items-center justify-between">
              <span className="truncate">{webhookSecret.slice(0, 32)}…</span>
              <button onClick={() => { void navigator.clipboard.writeText(webhookSecret) }} className="text-xs text-teal-600 hover:underline shrink-0 ml-2">Copy</button>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleTest}
              disabled={!repoUrl.trim() || testState === 'testing'}
              className="text-xs px-3 py-1.5 rounded-lg border border-brand-500 text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {testState === 'testing' && <Spinner />}
              {testState === 'testing' ? 'Testing…' : 'Test Connection'}
            </button>
            {testState === 'ok' && <span className="text-xs text-green-600 font-medium">Repository accessible ✓</span>}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!repoUrl.trim()}
            className="text-sm px-4 py-2 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save Repository
          </button>
        </div>
      </div>
    </div>
  )
}

// ── LLM endpoint type ────────────────────────────────────────────────────────

interface LLMEndpoint {
  id: string
  name: string
  endpoint: string
  status: 'connected' | 'error'
  testResult?: 'testing' | 'healthy' | 'failed'
}

const INITIAL_ENDPOINTS: LLMEndpoint[] = [
  { id: 'ep1', name: 'Production GPT-4o', endpoint: 'api.openai.com', status: 'connected' },
]

export function SettingsView() {
  const { connectors, updateConnector, thresholds, updateThresholds, addAuditEntry } = useAppContext()
  const [evalConnected, setEvalConnected] = useState<Record<string, boolean>>({})
  const [evalModal, setEvalModal] = useState<EvalPlatform | null>(null)
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [repoModalOpen, setRepoModalOpen] = useState(false)

  function handleAddRepo(repo: GithubRepo) {
    setRepos((prev) => [...prev, repo])
    addAuditEntry({
      action_type: 'REPO_CONNECTED',
      zone: 'ACT_AUTO',
      outcome: 'success',
      authorising_human_or_policy: 'user:admin',
      policy_rule: 'repo_connect_v1',
    })
  }

  function handleEvalConnect(platform: EvalPlatform) {
    setEvalConnected((prev) => ({ ...prev, [platform.id]: true }))
    addAuditEntry({
      action_type: 'EVAL_PLATFORM_CONNECTED',
      zone: 'ACT_AUTO',
      outcome: 'success',
      authorising_human_or_policy: 'user:admin',
      policy_rule: 'eval_platform_connect_v1',
    })
  }

  function handleEvalDisconnect(id: string) {
    setEvalConnected((prev) => ({ ...prev, [id]: false }))
  }

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
    addAuditEntry({
      action_type: 'LLM_CONNECTED',
      zone: 'ACT_AUTO',
      outcome: 'success',
      authorising_human_or_policy: 'user:admin',
      policy_rule: 'llm_connect_v1',
    })
  }

  const [configuringId, setConfiguringId] = useState<string | null>(null)
  const configuringConnector = connectors.find((c) => c.id === configuringId) ?? null

  function toggleWriteBack(id: string) {
    const c = connectors.find((c) => c.id === id)
    if (c) updateConnector(c.name, { writeBack: !c.writeBack })
  }

  // Draft threshold values — kept local until Save is clicked
  const [draft, setDraft] = useState({
    cognitiveLoadMax: thresholds.cognitiveLoadMax,
    manipulationRiskMax: thresholds.manipulationRiskMax,
    comprehensionConfidenceMin: thresholds.comprehensionConfidenceMin,
  })
  const [savedMsg, setSavedMsg] = useState(false)
  const [thresholdError, setThresholdError] = useState('')

  function validateThreshold(v: number) { return v >= 1 && v <= 100 }

  function handleSaveThresholds() {
    if (!validateThreshold(draft.cognitiveLoadMax) ||
        !validateThreshold(draft.manipulationRiskMax) ||
        !validateThreshold(draft.comprehensionConfidenceMin)) {
      setThresholdError('All thresholds must be between 1 and 100.')
      return
    }
    setThresholdError('')
    updateThresholds(draft)
    addAuditEntry({
      action_type: 'THRESHOLD_UPDATE',
      zone: 'ACT_AUTO',
      outcome: 'success',
      authorising_human_or_policy: 'user:admin',
      policy_rule: 'threshold_update_v1',
    })
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 3000)
  }

  return (
    <>
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Settings</h1>

      {/* Section 1: LLM Connections */}
      <Card title="LLM Connections">
        <div className="space-y-3">
          {endpoints.map((ep) => (
            <div key={ep.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50">
              <span className={`w-2 h-2 rounded-full shrink-0 ${ep.status === 'connected' ? 'bg-green-500' : 'bg-red-400'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">{ep.name}</p>
                <p className="text-xs text-gray-400">{ep.endpoint}</p>
              </div>
              <span className={`text-xs font-medium ${ep.status === 'connected' ? 'text-green-600' : 'text-red-500'}`}>
                {ep.status === 'connected' ? 'Connected' : 'Error'}
              </span>
              {ep.testResult && (
                <span className={`text-xs font-medium ${ep.testResult === 'healthy' ? 'text-green-600' : 'text-red-500'}`}>
                  {ep.testResult === 'healthy' ? 'Healthy' : 'Failed'}
                </span>
              )}
              <button
                onClick={() => {
                  setEndpoints((prev) => prev.map((e) => e.id === ep.id ? { ...e, testResult: 'testing' } : e))
                  setTimeout(() => {
                    setEndpoints((prev) => prev.map((e) => e.id === ep.id ? { ...e, testResult: 'healthy' } : e))
                    setTimeout(() => {
                      setEndpoints((prev) => prev.map((e) => { if (e.id === ep.id) { const { testResult: _, ...rest } = e; return rest } return e }))
                    }, 3000)
                  }, 1000)
                }}
                className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
              >
                {ep.testResult === 'testing' ? 'Testing…' : 'Test'}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Disconnect ${ep.name}? CognArc will stop using this endpoint.`)) {
                    setEndpoints((prev) => prev.filter((e) => e.id !== ep.id))
                    addAuditEntry({
                      action_type: 'LLM_DISCONNECTED',
                      zone: 'ACT_AUTO',
                      outcome: 'success',
                      authorising_human_or_policy: 'user:admin',
                      policy_rule: 'llm_disconnect_v1',
                    })
                  }
                }}
                className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
              >
                Disconnect
              </button>
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
                <button
                  onClick={() => setConfiguringId(c.id)}
                  className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
                >
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
          {EVAL_PLATFORMS.map((p) => {
            const connected = !!evalConnected[p.id]
            return (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.subline}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {connected ? (
                    <>
                      <span className="text-xs font-medium text-green-600">Connected</span>
                      <button
                        onClick={() => handleEvalDisconnect(p.id)}
                        className="text-xs px-3 py-1 rounded-lg border border-danger text-danger hover:bg-red-50 transition-colors"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-gray-400">Not connected</span>
                      <button
                        onClick={() => setEvalModal(p)}
                        className="text-xs px-3 py-1 rounded-lg border border-teal-500 text-teal-600 hover:bg-teal-50 transition-colors"
                      >
                        Connect via API Key
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-4 bg-gray-50 rounded-lg border border-gray-200 px-4 py-3 text-xs text-gray-500 space-y-1">
          <p className="font-semibold text-gray-600">Cognitive Scorer API endpoint:</p>
          <p className="font-mono text-gray-700">https://api.cognarc.com/v1/score</p>
          <p>Compatible with any platform that supports custom scorers.</p>
          <p className="flex gap-3">
            <a href="https://github.com/cognarc/cognarc-api" target="_blank" rel="noreferrer" className="text-teal-600 hover:underline">OpenAPI spec</a>
            <a href="https://github.com/cognarc/cognarc-python" target="_blank" rel="noreferrer" className="text-teal-600 hover:underline">Python SDK</a>
            <a href="https://github.com/cognarc/cognarc-js" target="_blank" rel="noreferrer" className="text-teal-600 hover:underline">TypeScript SDK</a>
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
              min={1} max={100}
              value={draft.cognitiveLoadMax}
              onChange={(e) => setDraft((d) => ({ ...d, cognitiveLoadMax: Number(e.target.value) }))}
              className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 ${!validateThreshold(draft.cognitiveLoadMax) ? 'border-danger' : 'border-gray-200'}`}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Manipulation Risk Max</label>
            <input
              type="number"
              min={1} max={100}
              value={draft.manipulationRiskMax}
              onChange={(e) => setDraft((d) => ({ ...d, manipulationRiskMax: Number(e.target.value) }))}
              className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 ${!validateThreshold(draft.manipulationRiskMax) ? 'border-danger' : 'border-gray-200'}`}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Comprehension Confidence Min</label>
            <input
              type="number"
              min={1} max={100}
              value={draft.comprehensionConfidenceMin}
              onChange={(e) => setDraft((d) => ({ ...d, comprehensionConfidenceMin: Number(e.target.value) }))}
              className={`w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 ${!validateThreshold(draft.comprehensionConfidenceMin) ? 'border-danger' : 'border-gray-200'}`}
            />
          </div>
        </div>
        {thresholdError && <p className="text-xs text-danger mb-3">{thresholdError}</p>}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveThresholds}
            className="text-xs bg-brand-500 text-white px-4 py-1.5 rounded-lg hover:bg-brand-600 transition-colors"
          >
            Save Thresholds
          </button>
          {savedMsg && (
            <span className="text-xs text-green-600 font-medium">
              ✓ Thresholds saved — changes applied to all connected evaluations
            </span>
          )}
        </div>
      </Card>

      {/* Section 5: GitHub / CI/CD */}
      <Card
        title="GitHub / CI/CD"
        action={
          <button
            onClick={() => setRepoModalOpen(true)}
            className="text-xs px-3 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          >
            + Add Repository
          </button>
        }
      >
        <div className="space-y-2">
          {/* Pre-existing repo */}
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

          {/* Dynamically added repos */}
          {repos.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50">
              <svg className="w-5 h-5 text-gray-600 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{r.name}</p>
                <p className="text-xs text-gray-400 truncate">{r.url}</p>
                {r.paths && <p className="text-xs text-gray-400 truncate">Paths: {r.paths}</p>}
              </div>
              <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Connected
              </span>
              <button
                onClick={() => {
                  setRepos((prev) => prev.filter((p) => p.id !== r.id))
                  addAuditEntry({
                    action_type: 'REPO_DISCONNECTED',
                    zone: 'ACT_AUTO',
                    outcome: 'success',
                    authorising_human_or_policy: 'user:admin',
                    policy_rule: 'repo_disconnect_v1',
                  })
                }}
                className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 transition-colors shrink-0"
              >
                Disconnect
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>

      {configuringConnector && (
        <ConfigureModal
          connector={configuringConnector}
          onClose={() => setConfiguringId(null)}
          onSave={(updates) => updateConnector(configuringConnector.name, updates)}
        />
      )}

      {evalModal && (
        <EvalConnectModal
          platform={evalModal}
          onClose={() => setEvalModal(null)}
          onConnect={() => handleEvalConnect(evalModal)}
        />
      )}

      {repoModalOpen && (
        <AddRepoModal
          onClose={() => setRepoModalOpen(false)}
          onSave={handleAddRepo}
        />
      )}
    </>
  )
}