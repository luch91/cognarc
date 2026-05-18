import { useState } from 'react'

const YAML_SNIPPET = `# .cognarc.yml — policy-as-code
version: "1.0"
thresholds:
  cognitive_load:
    max: 80
  manipulation_risk:
    max: 70
on_breach:
  action: fail
  notify: slack`

const TABS = [
  {
    id: 'engineer',
    label: 'AI Engineer',
    icon: '⚙️',
    headline: 'Catch cognitive regressions before they ship',
    sub: 'Every prompt change, scored. Every threshold breach, blocked.',
    features: [
      { name: 'CI/CD Cognitive Gate', desc: 'Fails builds when manipulation_risk or cognitive_load exceeds policy thresholds.' },
      { name: 'Prompt Evaluation Gate', desc: 'Pre-flight scoring before prompts reach your LLM. ALLOW, BLOCK, or WARN.' },
      { name: 'Regression Monitor', desc: 'Detects cognitive drift in your system prompts over time. Alerts on >10pt delta.' },
    ],
    visual: (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
          <code className="font-mono text-teal-400">.cognarc.yml</code>
          <span>— policy-as-code threshold config</span>
        </div>
        <pre className="text-xs font-mono text-slate-300 bg-black/40 rounded-xl p-4 border border-white/[0.08] overflow-x-auto">
          <code>{YAML_SNIPPET}</code>
        </pre>
        <div className="flex gap-2 mt-2">
          <div className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
            Build passed · 3 files scored · 0 breaches
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'pm',
    label: 'Product Manager',
    icon: '📊',
    headline: 'Cognitive intelligence in your existing analytics stack',
    sub: 'Write-back to Segment, Amplitude, Mixpanel, PostHog, and GA4 automatically.',
    features: [
      { name: 'Behavioral SDK', desc: 'Drop-in JS/mobile SDK (<8KB gzipped). Captures rage clicks, dead clicks, form abandons.' },
      { name: 'Analytics Write-Back', desc: 'CognArc enriches your events with cognitive labels before they hit your analytics platform.' },
      { name: 'Alignment Score', desc: 'Single 0–100 score for the cognitive health of any session, funnel, or experiment cohort.' },
    ],
    visual: (
      <div className="space-y-3">
        <p className="text-xs text-slate-400 mb-2">Amplitude event enriched with cognitive labels</p>
        <div className="bg-black/40 rounded-xl p-4 border border-white/[0.08] space-y-2">
          {[
            { event: 'checkout_started', label: 'cognitive_risk: LOW', color: '#10b981' },
            { event: 'form_abandon', label: 'comprehension: failure', color: '#f59e0b' },
            { event: 'rage_click', label: 'confusion_signal: true', color: '#ef4444' },
          ].map(({ event, label, color }) => (
            <div key={event} className="flex items-center justify-between text-xs">
              <code className="font-mono text-slate-300">{event}</code>
              <span className="font-mono px-2 py-0.5 rounded-md text-[11px]"
                style={{ color, backgroundColor: `${color}20` }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'growth',
    label: 'Growth Lead',
    icon: '📈',
    headline: 'Test creative before you spend',
    sub: 'Cognitive pre-flight on every ad, landing page, and email — before a dollar of budget is allocated.',
    features: [
      { name: 'Creative Evaluator', desc: 'Scores copy, images, and video for cognitive load and manipulation risk before launch.' },
      { name: 'Variant Ranker', desc: 'Compare up to 8 variants by predicted cognitive engagement and trust coherence.' },
      { name: 'Brand Trust Monitor', desc: 'Tracks trust_coherence across your campaigns over time. Alerts on erosion.' },
    ],
    visual: (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-black/40 rounded-xl p-4 border border-red-500/20">
            <div className="text-xs text-slate-400 mb-2">Old way</div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Spend $50K on media.<br />Discover the copy wasn&apos;t understood.<br />
              <span className="text-red-400">Weeks too late.</span>
            </p>
          </div>
          <div className="bg-black/40 rounded-xl p-4 border border-teal-500/20">
            <div className="text-xs text-slate-400 mb-2">CognArc way</div>
            <p className="text-sm text-slate-300 leading-relaxed">
              Simulate in 3 minutes.<br />Ship the winner.<br />
              <span className="text-teal-400">Before budget allocated.</span>
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'designer',
    label: 'Designer',
    icon: '🎨',
    headline: 'Cognitive evidence before user research, not from it',
    sub: 'Get fMRI-grounded cognitive scores on any design in under 5 minutes. No participants needed.',
    features: [
      { name: 'Zero-Traffic A/B Engine', desc: 'Compare variants without live traffic. Results in 5 minutes using TRIBE v2 simulation.' },
      { name: 'Onboarding Load Curve', desc: 'Maps cognitive load across each step of a flow. Reveals where users drop before they do.' },
      { name: 'Heatmap', desc: 'Attention and confusion heatmap based on predicted neural activation patterns.' },
    ],
    visual: (
      <div className="space-y-3">
        <div className="flex items-center gap-3 justify-center">
          <div className="card-glass rounded-xl p-4 text-center flex-1">
            <div className="text-2xl font-bold text-teal-400 mb-1">5 min</div>
            <div className="text-xs text-slate-400">Time to results</div>
          </div>
          <div className="text-slate-500 text-lg">vs</div>
          <div className="card-glass rounded-xl p-4 text-center flex-1">
            <div className="text-2xl font-bold text-slate-500 mb-1">3 wks</div>
            <div className="text-xs text-slate-400">User research cycle</div>
          </div>
        </div>
        <p className="text-xs text-center text-slate-500">No traffic required · No participants needed</p>
      </div>
    ),
  },
  {
    id: 'redteam',
    label: 'Red Team',
    icon: '🔴',
    headline: 'Coverage at scale. Evidence that sticks.',
    sub: 'Monitor every AI output — not a sample. Build audit-ready evidence packages automatically.',
    features: [
      { name: 'Continuous Scanner', desc: 'Scores every output against the 6-category manipulation taxonomy. Every output, not a sample.' },
      { name: 'Post-Remediation Monitor', desc: 'Re-emergence detection: alerts if a suppressed pattern returns in any workspace.' },
      { name: 'Audit Trail', desc: 'Immutable append-only log. PostgreSQL trigger. No update, no delete. Ever.' },
    ],
    visual: (
      <div className="space-y-3">
        <div className="bg-black/40 rounded-xl p-4 border border-white/[0.08] space-y-2">
          <div className="text-xs text-slate-400 mb-3">Manipulation taxonomy coverage</div>
          {[
            { cat: 'false_urgency', score: 2, max: 100 },
            { cat: 'social_proof_fabrication', score: 5, max: 100 },
            { cat: 'authority_mimicry', score: 1, max: 100 },
            { cat: 'manipulation_risk', score: 4, max: 100 },
          ].map(({ cat, score }) => (
            <div key={cat} className="flex items-center gap-2">
              <code className="font-mono text-[10px] text-slate-400 w-36 shrink-0">{cat}</code>
              <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${score}%` }}
                />
              </div>
              <span className="text-green-400 text-[10px] font-mono w-4">{score}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-center text-teal-400 font-medium">
          Monitors every output · Not a sample · Every output
        </p>
      </div>
    ),
  },
]

export function UseCases() {
  const [active, setActive] = useState(0)
  const tab = TABS[active]!

  return (
    <section id="use-cases" className="relative py-28 px-4 sm:px-6 lg:px-8">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <p className="section-label mb-4">Use Cases</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Built for the team{' '}
            <span className="gradient-text">that ships AI</span>
          </h2>
          <p className="text-slate-400 text-lg">Choose your role to see what CognArc does for you.</p>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-2 justify-center mb-10">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setActive(i)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                active === i
                  ? 'bg-teal-500 text-navy-900'
                  : 'bg-white/[0.06] text-slate-300 hover:bg-white/[0.10] hover:text-white border border-white/[0.08]'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div key={active} className="grid lg:grid-cols-2 gap-8 items-start animate-[fadeIn_0.3s_ease-out]">
          {/* Left: features */}
          <div>
            <h3 className="text-2xl font-bold text-white mb-2">{tab.headline}</h3>
            <p className="text-slate-400 mb-6">{tab.sub}</p>

            <div className="space-y-3">
              {tab.features.map((f) => (
                <div key={f.name} className="card-glass rounded-xl p-4 flex gap-3">
                  <div className="w-1 h-full min-h-[40px] rounded-full bg-teal-500/50 shrink-0" />
                  <div>
                    <div className="text-white text-sm font-semibold mb-0.5">{f.name}</div>
                    <div className="text-slate-400 text-sm">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: visual */}
          <div className="card-glass rounded-2xl p-6">
            {tab.visual}
          </div>
        </div>
      </div>
    </section>
  )
}
