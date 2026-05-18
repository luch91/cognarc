interface Props {
  label: string
  value: number
  invert?: boolean // if true, high is bad (e.g. cognitive load, manipulation)
  size?: 'sm' | 'md'
}

function color(value: number, invert: boolean) {
  const bad = invert ? value > 70 : value < 40
  const warn = invert ? value > 45 : value < 65
  if (bad) return 'text-danger'
  if (warn) return 'text-warning'
  return 'text-success'
}

export function ScoreGauge({ label, value, invert = false, size = 'md' }: Props) {
  const cls = color(value, invert)
  return (
    <div className="flex flex-col items-center">
      <span className={`font-bold tabular-nums ${size === 'sm' ? 'text-2xl' : 'text-4xl'} ${cls}`}>
        {value}
      </span>
      <span className="text-xs text-gray-500 mt-0.5 text-center">{label}</span>
    </div>
  )
}
