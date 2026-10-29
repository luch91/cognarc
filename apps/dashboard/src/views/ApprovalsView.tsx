import { useEffect, useState } from 'react'
import { Card } from '../components/Card.js'
import { useAdminAuth } from '../context/AdminAuthContext.js'
import {
  listAdminApprovals, decideAdminApproval, type AdminApproval,
} from '../api/adminApi.js'

export function ApprovalsView() {
  const { workspace, user } = useAdminAuth()
  const [items, setItems] = useState<AdminApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<AdminApproval | null>(null)
  const [decision, setDecision] = useState<'approved' | 'rejected'>('rejected')
  const [justification, setJustification] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function reload() {
    if (!workspace) return
    setError('')
    setLoading(true)
    try {
      setItems(await listAdminApprovals(workspace.id))
    } catch (err) {
      setItems([])
      setError(err instanceof Error ? err.message : 'Cannot load authoritative approvals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [workspace?.id])

  async function submitDecision() {
    if (!workspace || !selected || saving) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await decideAdminApproval(workspace.id, selected.id, decision, justification)
      setSelected(null)
      setJustification('')
      await reload()
      setMessage(result.status === 'approved'
        ? 'Approval recorded by the database. No automated action was executed.'
        : 'Rejection recorded by the database.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decision was not confirmed')
      await reload()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-gray-800">Act-Gated Approvals</h1>
        <button onClick={() => { void reload() }} disabled={loading || saving}
          className="px-3 py-2 text-xs border rounded-lg disabled:opacity-40">Refresh records</button>
      </div>
      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 p-3 rounded-lg">
        Only requests submitted by trusted server-side workflows are displayed. Review decisions
        are atomic database transactions with immutable audit entries. Recording an approval
        does not execute the proposed action or override model-calibration restrictions.
      </p>
      {workspace && <p className="text-xs text-gray-500">Workspace: {workspace.name} ({workspace.id})</p>}
      {loading && <p role="status" className="text-sm text-gray-500">Loading authoritative approval records...</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-teal-700">{message}</p>}
      {!loading && !error && items.length === 0 && (
        <Card title="No approval requests"><p className="text-sm text-gray-500">
          No requests were submitted by an authorised server-side workflow.
        </p></Card>
      )}
      <div className="space-y-3">
        {items.map(item => (
          <Card key={item.id} title={item.action_type}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-sm font-medium text-gray-800">{item.description}</p>
                <p className="text-xs text-gray-500">Requested {new Date(item.created_at).toLocaleString()}</p>
                <span className="inline-flex px-2 py-0.5 text-xs bg-gray-100 rounded">Status: {item.status}</span>
                {item.evidence && Object.keys(item.evidence).length > 0 && (
                  <details className="text-xs text-gray-600">
                    <summary className="cursor-pointer">Evidence package</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-all bg-gray-50 rounded p-2 overflow-auto">
                      {JSON.stringify(item.evidence, null, 2)}
                    </pre>
                  </details>
                )}
                {item.status !== 'pending' && (
                  <p className="text-xs text-gray-600">
                    Reviewed by {item.reviewer_id === user?.id ? 'you' : item.reviewer_id ?? 'unknown'}:
                    {' '}{item.justification} ({item.decided_at ? new Date(item.decided_at).toLocaleString() : 'unknown date'})
                  </p>
                )}
              </div>
              {item.status === 'pending' && <div className="flex gap-2">
                <button onClick={() => { setSelected(item); setDecision('rejected'); setJustification('') }}
                  className="text-xs px-3 py-2 rounded-lg border border-red-300 text-red-700">Reject</button>
                <button onClick={() => { setSelected(item); setDecision('approved'); setJustification('') }}
                  className="text-xs px-3 py-2 rounded-lg border border-teal-400 text-teal-800">Approve review</button>
              </div>}
            </div>
          </Card>
        ))}
      </div>
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="approval-title"
            className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <h2 id="approval-title" className="text-lg font-semibold">{decision === 'approved' ? 'Record approval' : 'Record rejection'}</h2>
            <p className="text-sm text-gray-700">{selected.description}</p>
            <p className="text-xs text-amber-800">This review does not execute the action.</p>
            <label htmlFor="decision-justification" className="text-sm font-medium block">Required justification (12 to 2000 characters)</label>
            <textarea id="decision-justification" rows={4} value={justification}
              onChange={e => setJustification(e.target.value)} maxLength={2000}
              className="w-full rounded-lg border border-gray-300 p-3 text-sm"/>
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => setSelected(null)} disabled={saving}
                className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button disabled={saving || justification.trim().length < 12}
                onClick={() => { void submitDecision() }}
                className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm disabled:opacity-40">
                {saving ? 'Saving...' : 'Confirm decision'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
