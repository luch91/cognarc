import { useState } from 'react'
import { Card } from '../components/Card.js'
import { Spinner } from '../components/Spinner.js'
import { useAppContext } from '../context/AppContext.js'

const ANALYTICS = [
  { name: 'Segment', detail: 'Event ingestion and write-back' },
  { name: 'Amplitude', detail: 'Product analytics events' },
  { name: 'Mixpanel', detail: 'Behavioral analytics events' },
  { name: 'PostHog', detail: 'Product usage analytics' },
  { name: 'Google Analytics 4', detail: 'Web analytics data' },
] as const

const EVAL_PLATFORMS = [
  { name: 'Braintrust', detail: 'Custom scoring integration' },
  { name: 'Langfuse', detail: 'Trace evaluator integration' },
  { name: 'Weights & Biases', detail: 'Weave evaluation integration' },
  { name: 'Arize Phoenix', detail: 'Model observability integration' },
] as const

type Probe = { status: 'unchecked' | 'checking' | 'healthy' | 'unavailable'; engine?: string; error?: string }

export function SettingsView() {
  const { thresholds, updateThresholds } = useAppContext()
  const [probe, setProbe] = useState<Probe>({ status: 'unchecked' })
  const [draft, setDraft] = useState({ ...thresholds })
  const [saveMessage, setSaveMessage] = useState('')
  const [thresholdError, setThresholdError] = useState('')

  async function checkScoringService() {
    setProbe({ status: 'checking' })
    try {
      const response = await fetch('/api/health', {
        method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(10_000),
      })
      const result: unknown = await response.json()
      if (!response.ok || !result || typeof result !== 'object' ||
          !('ok' in result) || result.ok !== true ||
          !('engine' in result) || typeof result.engine !== 'string' || !result.engine.trim()) {
        throw new Error('Canonical scoring service did not provide a verified engine')
      }
      setProbe({ status: 'healthy', engine: result.engine })
    } catch (error) {
      setProbe({
        status: 'unavailable',
        error: error instanceof Error ? error.message : 'Scoring service could not be reached',
      })
    }
  }

  function saveSessionThresholds() {
    const values = Object.values(draft)
    if (!values.every(v => Number.isFinite(v) && Number.isInteger(v) && v >= 1 && v <= 100)) {
      setThresholdError('All local threshold values must be whole numbers between 1 and 100.')
      setSaveMessage('')
      return
    }
    setThresholdError('')
    updateThresholds(draft)
    setSaveMessage('Session preview thresholds updated. No server policy or connected integration was changed.')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Only verified services are reported as connected. Integration credentials and production policy
          changes will be enabled once authenticated server-side configuration is available.
        </p>
      </div>

      <Card title="Canonical Cognitive Scoring Service">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {probe.status === 'healthy' ? 'Service reachable' :
                probe.status === 'unavailable' ? 'Service unavailable' :
                probe.status === 'checking' ? 'Checking service' : 'Not checked'}
            </p>
            <p className="text-xs text-gray-500">
              {probe.status === 'healthy'
                ? 'Engine configured: ' + probe.engine
                : 'Checks the server-side canonical scoring origin. This does not configure an LLM endpoint.'}
            </p>
          </div>
          <button type="button" onClick={() => { void checkScoringService() }} disabled={probe.status === 'checking'}
            className="text-sm bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-brand-500">
            {probe.status === 'checking' ? <><Spinner /> Checking...</> : 'Check service health'}
          </button>
        </div>
        {probe.error && <p role="alert" className="mt-3 text-sm text-red-700">{probe.error}</p>}
        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-3 mt-4">
          A healthy service does not prove a live TRIBE inference, calibrated evaluation, or
          successful integration with third-party analytics. Run a text evaluation to verify scoring.
        </p>
      </Card>

      <Card title="LLM Endpoint Connections">
        <p className="text-sm text-gray-600">No LLM endpoints have been verified for this workspace.</p>
        <p className="text-xs text-gray-500 mt-2">
          Adding arbitrary endpoints and storing API keys in browser state is disabled.
          Connection testing will require an authenticated server-side integration and secret storage.
        </p>
      </Card>

      <Card title="Analytics Connectors">
        <p className="text-xs text-gray-500 mb-3">
          No provider credentials, ingestion handshakes or write-back permissions are verified.
          Setup controls are unavailable until backend integration is ready.
        </p>
        <ul className="space-y-2" aria-label="Analytics integration availability">
          {ANALYTICS.map(connector => (
            <li key={connector.name} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">{connector.name}</p>
                <p className="text-xs text-gray-500">{connector.detail}</p>
              </div>
              <span className="text-xs font-semibold text-gray-500">Not configured</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Evaluation Platform Integrations">
        <p className="text-xs text-gray-500 mb-3">
          No Braintrust, Langfuse, W&B or Phoenix connection will be marked successful
          without a verified server-side handshake and persisted configuration.
        </p>
        <ul className="space-y-2" aria-label="Evaluation platform availability">
          {EVAL_PLATFORMS.map(platform => (
            <li key={platform.name} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50">
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">{platform.name}</p>
                <p className="text-xs text-gray-500">{platform.detail}</p>
              </div>
              <span className="text-xs font-semibold text-gray-500">Not configured</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Thresholds: session preview only">
        <p className="text-xs text-amber-800 mb-4">
          These thresholds affect only this browser session's advisory display.
          They are not stored, and are not enforced by the scoring server or connected agents.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {([
            ['cognitiveLoadMax', 'Cognitive Load Max'],
            ['manipulationRiskMax', 'Manipulation Risk Max'],
            ['comprehensionConfidenceMin', 'Comprehension Proxy Min'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label htmlFor={'threshold-' + key} className="text-xs text-gray-600 block mb-1">{label}</label>
              <input id={'threshold-' + key} type="number" min={1} max={100} step={1}
                value={draft[key]} onChange={event => {
                  setDraft(previous => ({ ...previous, [key]: Number(event.target.value) }))
                  setSaveMessage('')
                }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"/>
            </div>
          ))}
        </div>
        <button type="button" onClick={saveSessionThresholds}
          className="mt-4 text-sm bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500">
          Apply to session preview
        </button>
        {thresholdError && <p role="alert" className="text-sm text-red-700 mt-2">{thresholdError}</p>}
        {saveMessage && <p role="status" className="text-sm text-teal-700 mt-2">{saveMessage}</p>}
      </Card>

      <Card title="GitHub / CI-CD">
        <p className="text-sm text-gray-700">No GitHub repositories have been verified or connected through this admin.</p>
        <p className="text-xs text-gray-500 mt-2">
          Repository access, webhook verification and CI checks require a server-side installation
          with authenticated GitHub permissions. The previous sample repository has been removed.
        </p>
      </Card>
    </div>
  )
}
