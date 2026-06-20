import { useEffect, useRef, useState } from 'react'

const APP_URL = 'https://cognarc-dashboard.vercel.app'

/* ---------- Intelligence Loop (compact) ---------- */

const LOOP_STAGES = [
  { label: 'Sense', desc: 'AI outputs, UI changes, assets', color: '#14b8a6' },
  { label: 'Perceive', desc: 'Cognitive signals extracted', color: '#2dd4bf' },
  { label: 'Detect', desc: 'Load, manipulation, trust gaps', color: '#0d9488' },
  { label: 'Reason', desc: 'Root cause + severity', color: '#14b8a6' },
  { label: 'Act', desc: 'Auto or gated by zone', color: '#f59e0b' },
  { label: 'Validate', desc: 'Human oversight check', color: '#8b5cf6' },
  { label: 'Learn', desc: 'Baseline updated, loop closes', color: '#14b8a6' },
]

function IntelligenceLoopCompact() {
  const [activeIdx, setActiveIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setActiveIdx((i) => (i + 1) % LOOP_STAGES.length)
    }, 900)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  return (
    <div className="flex items-center gap-1.5 justify-center mt-5">
      {LOOP_STAGES.map((stage, i) => {
        const isActive = i === activeIdx
        return (
          <div key={stage.label} className="flex items-center gap-1.5">
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-full transition-all duration-300"
              style={{
                backgroundColor: isActive ? `${stage.color}20` : 'transparent',
                border: `1px solid ${isActive ? stage.color : 'transparent'}`,
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                style={{ backgroundColor: isActive ? stage.color : '#475569' }}
              />
              <span
                className="text-[9px] font-medium transition-all duration-300 hidden sm:inline"
                style={{ color: isActive ? stage.color : '#64748b' }}
              >
                {stage.label}
              </span>
            </div>
            {i < LOOP_STAGES.length - 1 && (
              <svg className="w-2 h-2 text-slate-700 hidden sm:block" viewBox="0 0 8 8" fill="none">
                <path d="M2 4h4M5 2l2 2-2 2" stroke="currentColor" strokeWidth="1" />
              </svg>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ---------- Cycling region label ---------- */

const REGIONS = [
  { label: 'Cognitive Load', color: '#14b8a6' },
  { label: 'Comprehension', color: '#2dd4bf' },
  { label: 'Emotional Valence', color: '#f59e0b' },
  { label: 'Trust Coherence', color: '#5eead4' },
  { label: 'Manipulation Risk', color: '#8b5cf6' },
]

function CyclingRegionLabel() {
  const [idx, setIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setIdx((i) => (i + 1) % REGIONS.length)
    }, 2200)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const region = REGIONS[idx]!

  return (
    <div className="text-center mt-3">
      <span
        className="text-xs font-semibold tracking-wide transition-all duration-500"
        style={{ color: region.color }}
      >
        ● Analyzing: {region.label}
      </span>
    </div>
  )
}

/* ---------- Hero Section ---------- */

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:64px_64px]" />

      {/* Gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
      <div className="absolute top-1/3 right-0 w-80 h-80 bg-violet-600/8 rounded-full blur-3xl" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-32 bg-teal-500/5 blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: copy */}
          <div className="animate-[slideUp_0.7s_ease-out_forwards]">
            <div className="inline-flex items-center gap-2 bg-teal-500/10 border border-teal-500/20 rounded-full px-4 py-1.5 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
              <span className="text-teal-400 text-xs font-medium">Cognitive AI Evaluation Platform</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold text-white leading-[1.12] tracking-tight mb-6">
              Your AI outputs are making{' '}
              <span className="gradient-text">cognitive decisions</span>{' '}
              about your users.{' '}
              <br className="hidden sm:block" />
              Do you know what they are?
            </h1>

            <p className="text-lg text-slate-400 leading-relaxed mb-10 max-w-xl">
              CognArc monitors every AI output, UI change, and campaign asset for cognitive load,
              comprehension failure, trust erosion, and manipulation — continuously, automatically,
              before users encounter them.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-12">
              <a
                href={APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-sm flex items-center justify-center gap-2"
              >
                Try It Free
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <button
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                className="btn-secondary text-sm flex items-center justify-center gap-2"
              >
                <span>See how it works</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>

            {/* Social proof */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {[
                { label: 'Real-time', sub: 'Continuous scoring' },
                { label: '5 dimensions', sub: 'Cognitive analysis' },
                { label: '100% auditable', sub: 'Every decision logged' },
              ].map(({ label, sub }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-teal-400" />
                  <div>
                    <span className="text-white text-sm font-semibold">{label}</span>
                    <span className="text-slate-500 text-xs ml-1.5">{sub}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: animated brain cortex image */}
          <div className="animate-[fadeIn_1s_ease-out_0.3s_forwards] opacity-0">
            <div className="relative w-full max-w-[480px] mx-auto">
              {/* Ambient glow behind brain */}
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-teal-500/15 via-transparent to-violet-600/10 blur-3xl" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-teal-500/8 rounded-full blur-[100px]" />

              {/* Brain GIF */}
              <div className="relative">
                <div className="relative rounded-2xl overflow-hidden bg-[#0f1b2e] border border-white/[0.08]">
                  <img
                    src="/brain-hero.gif"
                    alt="Animated cognitive network — glowing pathways"
                    className="w-full h-auto mix-blend-screen"
                    loading="eager"
                  />
                  {/* Teal color overlay to shift the blue toward CognArc's palette */}
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-500/15 via-transparent to-teal-400/8 mix-blend-overlay pointer-events-none" />
                  {/* Soft vignette matching page background */}
                  <div className="absolute inset-0 shadow-[inset_0_0_60px_20px_rgba(10,22,40,0.5)] pointer-events-none" />
                </div>

                {/* Cycling region label */}
                <CyclingRegionLabel />
              </div>

              {/* Score readout cards */}
              <div className="grid grid-cols-3 gap-3 mt-4 px-2">
                {[
                  { metric: 'Cognitive Load', value: 34, color: '#14b8a6', label: 'LOW' },
                  { metric: 'Manipulation Risk', value: 8, color: '#10b981', label: 'SAFE' },
                  { metric: 'Trust Coherence', value: 82, color: '#14b8a6', label: 'HIGH' },
                ].map(({ metric, value, color, label }) => (
                  <div key={metric} className="card-glass p-3 rounded-xl text-center">
                    <div className="text-2xl font-bold mb-0.5" style={{ color }}>{value}</div>
                    <div className="text-[10px] text-slate-500 leading-tight">{metric}</div>
                    <div className="mt-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full inline-block"
                      style={{ color, backgroundColor: `${color}20` }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Intelligence loop */}
            <IntelligenceLoopCompact />
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-navy-900 to-transparent" />
    </section>
  )
}
