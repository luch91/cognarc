import { useEffect, useState } from 'react'
import { useAdminAuth } from '../context/AdminAuthContext.js'
import { INTEGRATION_PROVIDERS, listAdminIntegrations, saveAdminIntegration,
  disableAdminIntegration, type AdminIntegration, type IntegrationProvider } from '../api/adminApi.js'

export function IntegrationRegistry() {
  const { workspace } = useAdminAuth()
  const [items, setItems] = useState<AdminIntegration[]>([])
  const [provider, setProvider] = useState<IntegrationProvider>('github')
  const [label, setLabel] = useState('')
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function reload() {
    if (!workspace) return
    setLoading(true)
    setError('')
    try { setItems(await listAdminIntegrations(workspace.id)) }
    catch (e) { setItems([]); setError(e instanceof Error ? e.message : 'Could not load configurations') }
    finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [workspace?.id])

  async function save() {
    if (!workspace) return
    setLoading(true); setError(''); setSuccess('')
    try {
      const stored = await saveAdminIntegration(workspace.id, provider, label, reference)
      setLabel(''); setReference('')
      await reload()
      setSuccess(stored.label + ' saved as pending verification. No provider handshake has occurred.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The server did not save this configuration')
    } finally { setLoading(false) }
  }

  async function disable(id: string) {
    if (!workspace) return
    setLoading(true); setError(''); setSuccess('')
    try {
      await disableAdminIntegration(workspace.id, id)
      await reload()
      setSuccess('Configuration disabled and recorded in the audit ledger.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The server did not disable this configuration')
    } finally { setLoading(false) }
  }

  return <div className="space-y-4">
    <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
      Configurations are stored in the workspace database, but they are not connected.
      Verification and credential vault integration need a trusted provider adapter.
      Never enter API keys, passwords, tokens or webhook secrets here.
    </p>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <label htmlFor="integr-provider" className="text-xs text-gray-700 block mb-1">Provider</label>
        <select id="integr-provider" value={provider}
          onChange={e => setProvider(e.target.value as IntegrationProvider)}
          className="w-full border rounded-lg px-3 py-2 text-sm">
          {INTEGRATION_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="integr-label" className="text-xs text-gray-700 block mb-1">Connection label</label>
        <input id="integr-label" value={label} maxLength={100}
          onChange={e => setLabel(e.target.value)} placeholder="e.g. Product analytics"
          className="w-full border rounded-lg px-3 py-2 text-sm"/>
      </div>
      <div>
        <label htmlFor="integr-ref" className="text-xs text-gray-700 block mb-1">Non-secret public identifier (optional)</label>
        <input id="integr-ref" value={reference} maxLength={300}
          onChange={e => setReference(e.target.value)} placeholder="Repo name or public project slug"
          className="w-full border rounded-lg px-3 py-2 text-sm"/>
      </div>
    </div>
    <button type="button" onClick={() => { void save() }}
      disabled={loading || !label.trim()} className="px-4 py-2 text-sm rounded-lg bg-brand-500 text-white disabled:opacity-40">
      Save pending configuration
    </button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="text-sm text-teal-700">{success}</p>}
    {loading && <p className="text-xs text-gray-500">Synchronising workspace records...</p>}
    {!loading && items.length === 0 && <p className="text-sm text-gray-500">No workspace configurations saved.</p>}
    <ul className="space-y-2" aria-label="Persisted integration configurations">
      {items.map(item => <li key={item.id} className="flex gap-3 items-center border border-gray-200 rounded-lg p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">{item.provider}: {item.label}</p>
          <p className="text-xs text-gray-500 truncate">{item.public_reference || 'No public identifier'}</p>
          <p className="text-xs text-amber-800">Status: {item.status.replace(/_/g, ' ')}</p>
        </div>
        {item.status !== 'disabled' && <button type="button" onClick={() => { void disable(item.id) }}
          disabled={loading} className="px-3 py-2 text-xs rounded border border-gray-300 disabled:opacity-40">
          Disable
        </button>}
      </li>)}
    </ul>
  </div>
}
