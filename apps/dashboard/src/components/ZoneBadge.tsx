import type { Zone } from '../api/types.js'

const ZONE_STYLES: Record<Zone, string> = {
  OBSERVE: 'bg-blue-100 text-blue-700',
  RECOMMEND: 'bg-purple-100 text-purple-700',
  ACT_AUTO: 'bg-green-100 text-green-700',
  ACT_GATED: 'bg-orange-100 text-orange-700',
}

export function ZoneBadge({ zone }: { zone: Zone }) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-semibold ${ZONE_STYLES[zone]}`}>
      {zone.replace('_', ' ')}
    </span>
  )
}
