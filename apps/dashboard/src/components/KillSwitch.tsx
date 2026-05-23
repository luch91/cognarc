import { useKillSwitch } from '../context/KillSwitchContext.js'

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

export function KillSwitch() {
  const { active, setActive, setBanner, prependEntry } = useKillSwitch()

  function handleToggle() {
    if (!active) {
      const confirmed = window.confirm(
        'Pause all agent actions across this workspace?\nMonitoring will continue. All queued actions will be cancelled.'
      )
      if (!confirmed) return
      setActive(true)
      setBanner(true)
      prependEntry({
        id: `ks-${Date.now()}`,
        action: 'KILL_SWITCH',
        zone: 'ACT_GATED',
        outcome: 'approved',
        authorisedBy: 'user:admin',
        time: formatTime(new Date()),
      })
    } else {
      const confirmed = window.confirm('Resume agent actions?')
      if (!confirmed) return
      setActive(false)
      setBanner(false)
      prependEntry({
        id: `ks-${Date.now()}`,
        action: 'KILL_SWITCH',
        zone: 'ACT_GATED',
        outcome: 'deactivated',
        authorisedBy: 'user:admin',
        time: formatTime(new Date()),
      })
    }
  }

  return (
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
  )
}
