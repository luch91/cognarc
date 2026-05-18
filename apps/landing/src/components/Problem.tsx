const BUYERS = [
  {
    role: 'AI Engineer',
    icon: '⚙️',
    pain: 'Cognitive regressions in prompts are invisible to accuracy-only eval.',
    color: 'teal',
  },
  {
    role: 'Product Manager',
    icon: '📊',
    pain: 'No cognitive visibility into onboarding until behavioral data arrives — weeks too late.',
    color: 'blue',
  },
  {
    role: 'Growth Lead',
    icon: '📈',
    pain: 'No way to know if your copy is understood before you spend media budget.',
    color: 'amber',
  },
  {
    role: 'Designer',
    icon: '🎨',
    pain: 'Cognitive evidence only available after user research, not before.',
    color: 'violet',
  },
  {
    role: 'Red Team',
    icon: '🔴',
    pain: 'Manual periodic testing at a fraction of output volume.',
    color: 'rose',
  },
]

const colorMap: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  teal: { bg: 'bg-teal-500/8', border: 'border-teal-500/20', text: 'text-teal-300', badge: 'bg-teal-500/15 text-teal-300' },
  blue: { bg: 'bg-blue-500/8', border: 'border-blue-500/20', text: 'text-blue-300', badge: 'bg-blue-500/15 text-blue-300' },
  amber: { bg: 'bg-amber-500/8', border: 'border-amber-500/20', text: 'text-amber-300', badge: 'bg-amber-500/15 text-amber-300' },
  violet: { bg: 'bg-violet-500/8', border: 'border-violet-500/20', text: 'text-violet-300', badge: 'bg-violet-500/15 text-violet-300' },
  rose: { bg: 'bg-rose-500/8', border: 'border-rose-500/20', text: 'text-rose-300', badge: 'bg-rose-500/15 text-rose-300' },
}

export function Problem() {
  return (
    <section id="problem" className="relative py-28 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="section-label mb-4">The Problem</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Five teams.{' '}
            <span className="gradient-text">One shared blind spot.</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Every team that ships AI features, UI, or content faces the same gap —
            no cognitive visibility until it&apos;s too late.
          </p>
        </div>

        {/* Buyer cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-16">
          {BUYERS.map((buyer) => {
            const c = colorMap[buyer.color]!
            return (
              <div
                key={buyer.role}
                className={`${c.bg} border ${c.border} rounded-2xl p-5 flex flex-col gap-3
                            hover:scale-[1.02] transition-transform duration-200 cursor-default`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{buyer.icon}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.badge}`}>
                    {buyer.role}
                  </span>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">{buyer.pain}</p>
              </div>
            )
          })}
        </div>

        {/* Closing statement */}
        <div className="relative text-center">
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-teal-500/30 to-transparent" />
          <div className="card-glass rounded-2xl px-8 py-8 inline-block max-w-3xl">
            <p className="text-white text-xl font-medium leading-relaxed">
              CognArc is the first platform that gives{' '}
              <span className="gradient-text font-bold">all five teams</span>{' '}
              a shared, continuous cognitive intelligence layer.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
