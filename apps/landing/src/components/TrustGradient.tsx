const ZONES = [
  {
    zone: 'OBSERVE',
    color: 'teal',
    icon: '👁',
    tagline: 'Monitors and scores. No action taken.',
    detail: 'Continuously scores every output, event, and asset. Dashboard visibility only. Zero side effects.',
    colorClass: {
      bg: 'bg-teal-500/8',
      border: 'border-teal-500/25',
      text: 'text-teal-300',
      badge: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
      bar: 'bg-teal-500',
    },
  },
  {
    zone: 'RECOMMEND',
    color: 'amber',
    icon: '💡',
    tagline: 'Agent analyzes. You decide.',
    detail: 'Generates ranked options, rationale, and evidence packages. The agent surfaces the decision — you make it.',
    colorClass: {
      bg: 'bg-amber-500/8',
      border: 'border-amber-500/25',
      text: 'text-amber-300',
      badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      bar: 'bg-amber-500',
    },
  },
  {
    zone: 'ACT — AUTO',
    color: 'blue',
    icon: '⚡',
    tagline: 'Low-consequence. Logged. Reversible.',
    detail: 'Executes autonomously for pre-approved low-risk actions. Fully logged. 24-hour reversal window.',
    colorClass: {
      bg: 'bg-blue-500/8',
      border: 'border-blue-500/25',
      text: 'text-blue-300',
      badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
      bar: 'bg-blue-500',
    },
  },
  {
    zone: 'ACT — GATED',
    color: 'violet',
    icon: '🔐',
    tagline: 'Hard stop. Your approval before anything executes.',
    detail: 'The agent prepares a full decision package and halts. No timeout. No auto-approval. No exceptions. Ever.',
    colorClass: {
      bg: 'bg-violet-500/8',
      border: 'border-violet-500/25',
      text: 'text-violet-300',
      badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
      bar: 'bg-violet-500',
    },
  },
]

export function TrustGradient() {
  return (
    <section id="trust" className="relative py-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-600/[0.03] to-transparent pointer-events-none" />

      <div className="relative max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <p className="section-label mb-4">Trust Gradient Engine</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            The agent acts.{' '}
            <span className="gradient-text">You stay in control.</span>
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Every action CognArc takes is classified into one of four zones before execution.
            You configure the zones. The agent enforces them. The agent cannot modify its own governance.
          </p>
        </div>

        {/* Zone cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          {ZONES.map((z, i) => (
            <div
              key={z.zone}
              className={`${z.colorClass.bg} border ${z.colorClass.border} rounded-2xl p-6
                          hover:scale-[1.02] transition-transform duration-200`}
            >
              {/* Progress indicator */}
              <div className="flex gap-1 mb-5">
                {ZONES.map((_, j) => (
                  <div
                    key={j}
                    className={`h-1 rounded-full flex-1 transition-all ${
                      j <= i ? z.colorClass.bar : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>

              <div className="text-3xl mb-3">{z.icon}</div>

              <div className={`inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full border mb-3 ${z.colorClass.badge}`}>
                {z.zone}
              </div>

              <p className={`text-sm font-semibold mb-2 ${z.colorClass.text}`}>{z.tagline}</p>
              <p className="text-slate-400 text-sm leading-relaxed">{z.detail}</p>
            </div>
          ))}
        </div>

        {/* Governance guarantee */}
        <div className="card-glass rounded-2xl p-8 border border-violet-500/15">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="text-white text-xl font-bold mb-4">Three immutable governance rules</h3>
              <div className="space-y-3">
                {[
                  { num: '01', rule: 'The agent never modifies its own governance.', sub: 'Trust Gradient config and kill switch behaviour are human-configured. The agent enforces them — never edits them.' },
                  { num: '02', rule: 'Act-Gated actions never execute without recorded human approval.', sub: 'No timeout-based auto-approval. No fallback execution. No exceptions.' },
                  { num: '03', rule: 'The audit log is append-only.', sub: 'No UPDATE. No DELETE. Not in application code. Not via direct DB access. PostgreSQL trigger enforces this at the database level.' },
                ].map(({ num, rule, sub }) => (
                  <div key={num} className="flex gap-4">
                    <span className="text-teal-400 font-mono text-sm font-bold shrink-0 mt-0.5">{num}</span>
                    <div>
                      <p className="text-white text-sm font-medium">{rule}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card-glass rounded-xl p-5 border border-white/[0.06]">
              <div className="text-xs text-slate-400 mb-3 font-mono">policy-as-code</div>
              <pre className="text-xs font-mono text-slate-300 overflow-x-auto">
                <code>{`# .cognarc.yml — human-authored
# The agent reads this. It cannot write it.

trust_gradient:
  SCORE_STIMULUS: OBSERVE
  EXECUTE_FINE_TUNING: ACT_GATED
  SEND_SLACK_ALERT: ACT_AUTO
  GENERATE_REPORT: RECOMMEND

kill_switch:
  enabled: true
  scope: workspace`}</code>
              </pre>
            </div>
          </div>
        </div>

        {/* Footer line */}
        <p className="text-center text-slate-500 text-sm mt-8">
          Kill switch on every page · Immutable audit log · Policy-as-code you control
          <br />
          <span className="text-slate-600">The agent cannot modify its own governance.</span>
        </p>
      </div>
    </section>
  )
}
