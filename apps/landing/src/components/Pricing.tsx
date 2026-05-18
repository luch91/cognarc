const APP_URL = 'http://localhost:5173'

const TIERS = [
  {
    name: 'Developer',
    badge: null,
    price: 'Free',
    priceSub: 'forever',
    cta: 'Try It Free',
    ctaStyle: 'btn-secondary',
    href: APP_URL,
    features: [
      'Up to 3 connected endpoints',
      'Continuous cognitive scoring',
      'Autonomous Prompt Regression Monitor',
      '30-day audit log',
      '1 analytics connector',
      'Community support',
    ],
    highlight: false,
  },
  {
    name: 'Growth',
    badge: null,
    price: '$799',
    priceSub: 'per month',
    cta: 'Start Trial',
    ctaStyle: 'btn-secondary',
    href: APP_URL,
    features: [
      'Unlimited endpoints',
      'Full Trust Gradient Engine',
      'CI/CD Cognitive Gate',
      'Prompt Evaluation Gate',
      'All analytics connectors + write-back',
      'Creative cognitive evaluator',
      'Zero-traffic A/B engine',
      'Priority support',
    ],
    highlight: false,
  },
  {
    name: 'Business',
    badge: 'Most Popular',
    price: '$3,499',
    priceSub: 'per month',
    cta: 'Contact Sales',
    ctaStyle: 'btn-primary',
    href: null,
    features: [
      'Everything in Growth',
      'Runtime Monitoring Agent',
      'Autonomous prompt remediation',
      'Trust erosion monitor',
      'Regulatory audit reports',
      'Immutable evidence packages',
      'SLA + dedicated success manager',
      'Custom integrations',
    ],
    highlight: true,
  },
]

export function Pricing() {
  const scrollToWaitlist = () =>
    document.getElementById('waitlist')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <section id="pricing" className="relative py-28 px-4 sm:px-6 lg:px-8">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <p className="section-label mb-4">Pricing</p>
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Start free.{' '}
            <span className="gradient-text">Scale when you need it.</span>
          </h2>
          <p className="text-slate-400 text-lg">
            No credit card required for Developer tier. Cancel Growth/Business anytime.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl p-7 flex flex-col ${
                tier.highlight
                  ? 'bg-gradient-to-b from-teal-500/15 to-teal-500/5 border-2 border-teal-500/40'
                  : 'card-glass'
              }`}
            >
              {tier.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-teal-500 text-navy-900 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    {tier.badge}
                  </span>
                </div>
              )}

              <div className="mb-6">
                <div className="text-white font-semibold text-lg mb-3">{tier.name}</div>
                <div className="flex items-end gap-2">
                  <span className={`text-4xl font-bold ${tier.highlight ? 'text-teal-300' : 'text-white'}`}>
                    {tier.price}
                  </span>
                  <span className="text-slate-400 text-sm mb-1">{tier.priceSub}</span>
                </div>
              </div>

              <ul className="space-y-2.5 flex-1 mb-7">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <svg className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              {tier.href ? (
                <a
                  href={tier.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block w-full text-center text-sm font-semibold py-2.5 rounded-xl transition-all duration-200 ${
                    tier.highlight
                      ? 'bg-teal-500 hover:bg-teal-400 text-navy-900 shadow-lg shadow-teal-500/25'
                      : 'bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/[0.12]'
                  }`}
                >
                  {tier.cta}
                </a>
              ) : (
                <button
                  onClick={scrollToWaitlist}
                  className={`w-full text-sm font-semibold py-2.5 rounded-xl transition-all duration-200 ${
                    tier.highlight
                      ? 'bg-teal-500 hover:bg-teal-400 text-navy-900 shadow-lg shadow-teal-500/25'
                      : 'bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/[0.12]'
                  }`}
                >
                  {tier.cta}
                </button>
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-slate-500 text-sm mt-10">
          All plans include the immutable audit log, kill switch, and policy-as-code governance.
          <br />Pricing effective at general availability. Early access via waitlist.
        </p>
      </div>
    </section>
  )
}
