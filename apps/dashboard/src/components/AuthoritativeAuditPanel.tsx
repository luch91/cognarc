import { useEffect, useState } from 'react'
import { useAdminAuth } from '../context/AdminAuthContext.js'
import { listAdminAudit, type AdminAuditEvent } from '../api/adminApi.js'
import { Card } from './Card.js'

export function AuthoritativeAuditPanel() {
  const { workspace } = useAdminAuth()
  const [rows, setRows] = useState<AdminAuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  async function refresh() {
    if (!workspace) return
    setLoading(true); setError('')
    try { setRows(await listAdminAudit(workspace.id)) }
    catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : 'Audit ledger unavailable')
    } finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [workspace?.id])
  return <Card title="Authoritative Workspace Audit Ledger">
    <div className="space-y-3">
      <div className="flex justify-between items-start gap-3">
        <p className="text-xs text-gray-500">
          Append-only database events for approvals and saved integration metadata.
          Browser session activity is not part of this ledger.
        </p>
        <button className="border rounded px-3 py-1 text-xs shrink-0"
          onClick={() => { void refresh() }} disabled={loading}>Refresh</button>
      </div>
      {loading && <p role="status" className="text-sm text-gray-500">Loading audit events...</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!loading && !error && rows.length === 0 && <p className="text-sm text-gray-500">
        No authoritative events recorded in this workspace.
      </p>}
      {rows.map(row => <div key={row.id} className="border-t pt-3">
        <p className="text-sm font-semibold text-gray-700">{row.event_type}</p>
        <p className="text-xs text-gray-500">
          {new Date(row.created_at).toLocaleString()} | Actor: {row.actor_id ?? 'trusted service'}
        </p>
        <details className="mt-1 text-xs text-gray-600">
          <summary className="cursor-pointer">Recorded details</summary>
          <pre className="whitespace-pre-wrap break-all overflow-auto bg-gray-50 p-2 rounded">
            {JSON.stringify(row.payload, null, 2)}
          </pre>
        </details>
      </div>)}
    </div>
  </Card>
}
