const PILLARS = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: 'Always On',
    subtitle: 'Continuous by design',
    body: 'Monitors every AI output, UI change, and campaign asset in real time — not when you remember to check. The cognitive layer runs 24/7, automatically, from the first deployment.',
    color: 'teal',
    stat: '24/7',
    statLabel: 'Continuous monitoring',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    title: 'TRIBE v2 Powered',
    subtitle: 'Brain science, not heuristics',
    body: 'Built on Meta AI\'s TRIBE v2 foundation model — trained on 1,000+ hours of fMRI data across 720 subjects. Scores map directly to cortical activity: dlPFC for load, Wernicke\'s for comprehension, amygdala for emotional valence.',
    color: 'violet',
    stat: '1,000+hrs',
    statLabel: 'fMRI training data',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    title: 'Human Oversight',
    subtitle: 'You keep control',
    body: 'Every consequential action requires your explicit approval. The agent monitors and recommends — it never autonomously modifies governance, approves itself, or acts beyond its assigned Trust Gradient zone. Kill switch on every page.',
    color: 'amber',
    stat: '100%',
    statLabel: 'Act-Gated actions require human approval',
  },
]

const colorClasses = {
  teal: {
    icon: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
    border: 'border-teal-500/20',
    stat: 'text-teal-400',
    glow: 'from-teal-500/10',
  },
  violet: {
    icon: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    border: 'border-violet-500/20',
    stat: 'text-violet-400',
    glow: 'from-violet-500/10',
  },
  amber: {
    icon: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    border: 'border-amber-500/20',
    stat: 'text-amber-400',
    glow: 'from-amber-500/10',
  },
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-28 px-4 sm:px-6 lg:px-8">
      {/* Top separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="section-label mb-4">How It Works</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            Three things that{' '}
            <span className="gradient-text">make CognArc different</span>
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {PILLARS.map((pillar) => {
            const c = colorClasses[pillar.color as keyof typeof colorClasses]!
            return (
              <div
                key={pillar.title}
                className={`relative card-glass border ${c.border} rounded-2xl p-7 overflow-hidden
                            hover:border-white/15 transition-colors duration-200`}
              >
                {/* Background glow */}
                <div className={`absolute top-0 left-0 right-0 h-32 bg-gradient-to-b ${c.glow} to-transparent opacity-60`} />

                <div className="relative">
                  <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl border ${c.icon} mb-5`}>
                    {pillar.icon}
                  </div>

                  <div className={`text-3xl font-bold mb-0.5 ${c.stat}`}>{pillar.stat}</div>
                  <div className="text-slate-500 text-xs mb-4">{pillar.statLabel}</div>

                  <h3 className="text-white text-xl font-bold mb-1">{pillar.title}</h3>
                  <p className="text-teal-400/70 text-xs font-medium mb-3">{pillar.subtitle}</p>
                  <p className="text-slate-400 text-sm leading-relaxed">{pillar.body}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Architecture callout */}
        <div className="mt-12 card-glass rounded-2xl p-6 border border-white/[0.06]">
          <div className="flex flex-wrap items-center gap-4 justify-center text-center sm:text-left">
            <div className="text-slate-400 text-sm">
              <span className="text-white font-medium">Architecture rule:</span>{' '}
              Every cognitive score flows from one place —{' '}
              <code className="font-mono text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded text-xs">
                services/cognitive-scoring POST /score
              </code>.
              {' '}Swapping mock for TRIBE v2 is a one-line config change.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
