// Operational guardrail: do not claim agent suspension unless an
// authenticated server confirms it and persists that state.
export function KillSwitch() {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50"
      aria-label="Kill switch not configured">
      <span className="text-xs font-semibold text-gray-600">Kill switch</span>
      <button type="button" disabled
        title="Unavailable until the server-side agent control API and audit trail are connected"
        aria-label="Kill switch unavailable"
        className="px-2 py-1 rounded bg-gray-200 text-gray-500 text-xs cursor-not-allowed">
        Unavailable
      </button>
    </div>
  )
}
