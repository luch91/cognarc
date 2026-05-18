import type { CognitivRisk } from '../api/types.js'

const STYLES: Record<CognitivRisk, string> = {
  LOW: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-red-100 text-red-700',
}

export function RiskBadge({ risk }: { risk: CognitivRisk }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${STYLES[risk]}`}>
      {risk}
    </span>
  )
}
