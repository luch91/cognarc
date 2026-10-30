import { useState } from 'react'
import { Card } from '../components/Card.js'
import { Spinner } from '../components/Spinner.js'
import { useAppContext } from '../context/AppContext.js'
import { IntegrationRegistry } from '../components/IntegrationRegistry.js'
import { getWorkspaceRequestAuth } from '../api/workspaceSession.js'

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
      const auth = await getWorkspaceRequestAuth()
      const response = await fetch('/api/health', {
        method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(10_000),
        headers: { Authorization: auth.authorization, 'X-Workspace-Id': auth.workspaceId },
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
          Workspace configuration is stored behind Supabase authentication and database access controls.
          Provider credentials and verification require trusted server-side integrations.
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

      <Card title="Persisted Integration Registry">
        <IntegrationRegistry />
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

    </div>
  )
}
