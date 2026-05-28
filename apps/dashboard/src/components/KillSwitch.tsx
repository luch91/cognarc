import { useState } from 'react'
import { useKillSwitch } from '../context/KillSwitchContext.js'
import { useAppContext } from '../context/AppContext.js'

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  confirmClass: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ks-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 id="ks-modal-title" className="text-base font-semibold text-gray-800">{title}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="Close">×</button>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm text-gray-600">{body}</p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`text-sm px-4 py-2 rounded-lg font-semibold text-white transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function KillSwitch() {
  const { active, setActive, setBanner } = useKillSwitch()
  const { addAuditEntry, addAgentFeedEntry } = useAppContext()
  const [modal, setModal] = useState<'activate' | 'deactivate' | null>(null)

  function handleToggle() {
    setModal(active ? 'deactivate' : 'activate')
  }

  function handleActivate() {
    setModal(null)
    setActive(true)
    setBanner(true)
    addAuditEntry({
      action_type: 'KILL_SWITCH',
      zone: 'ACT_GATED',
      outcome: 'approved',
      authorising_human_or_policy: 'user:admin',
      policy_rule: 'kill_switch_v1',
    })
    addAgentFeedEntry({
      action_type: 'KILL_SWITCH',
      zone: 'ACT_GATED',
      description: 'Kill switch activated — all agent actions paused.',
      status: 'executed',
    })
  }

  function handleDeactivate() {
    setModal(null)
    setActive(false)
    setBanner(false)
    addAuditEntry({
      action_type: 'KILL_SWITCH',
      zone: 'ACT_GATED',
      outcome: 'deactivated',
      authorising_human_or_policy: 'user:admin',
      policy_rule: 'kill_switch_v1',
    })
  }

  return (
    <>
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 transition-colors ${active ? 'border-danger bg-red-50' : 'border-gray-200 bg-white'}`}>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Kill Switch</span>
        <button
          onClick={handleToggle}
          aria-pressed={active}
          aria-label={active ? 'Deactivate kill switch' : 'Activate kill switch'}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-danger ${active ? 'bg-danger' : 'bg-gray-300'}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${active ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
        {active && (
          <span className="text-xs text-danger font-semibold animate-pulse">ACTIVE</span>
        )}
      </div>

      {modal === 'activate' && (
        <ConfirmModal
          title="Pause all agent actions?"
          body="All Act-Auto and Act-Gated actions will be paused across this workspace. Monitoring continues. All queued actions will be cancelled."
          confirmLabel="Pause Agent"
          confirmClass="bg-danger hover:bg-red-600"
          onConfirm={handleActivate}
          onCancel={() => setModal(null)}
        />
      )}

      {modal === 'deactivate' && (
        <ConfirmModal
          title="Resume agent actions?"
          body="Act-Auto and Act-Gated actions will resume according to workspace policy."
          confirmLabel="Resume"
          confirmClass="bg-teal-500 hover:bg-teal-600"
          onConfirm={handleDeactivate}
          onCancel={() => setModal(null)}
        />
      )}
    </>
  )
}
