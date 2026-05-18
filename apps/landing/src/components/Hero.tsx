import { useEffect, useRef, useState } from 'react'

const APP_URL = 'http://localhost:5173'

const LOOP_STAGES = [
  { label: 'Sense', desc: 'AI outputs, UI changes, assets', color: '#14b8a6' },
  { label: 'Perceive', desc: 'Cognitive signals extracted', color: '#2dd4bf' },
  { label: 'Detect', desc: 'Load, manipulation, trust gaps', color: '#0d9488' },
  { label: 'Reason', desc: 'Root cause + severity', color: '#14b8a6' },
  { label: 'Act', desc: 'Auto or gated by zone', color: '#f59e0b' },
  { label: 'Validate', desc: 'Human oversight check', color: '#8b5cf6' },
  { label: 'Learn', desc: 'Baseline updated, loop closes', color: '#14b8a6' },
]

function IntelligenceLoop() {
  const [activeIdx, setActiveIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setActiveIdx((i) => (i + 1) % LOOP_STAGES.length)
    }, 900)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const cx = 200
  const cy = 160
  const rx = 165
  const ry = 130

  return (
    <div className="relative w-full max-w-[420px] mx-auto">
      {/* Glow backdrop */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-teal-500/10 via-transparent to-violet-600/5 blur-2xl" />

      <div className="relative card-glass p-6 rounded-3xl">
        <div className="text-center mb-3">
          <span className="section-label">Continuous Intelligence Loop</span>
        </div>

        <svg viewBox="0 0 400 320" className="w-full" aria-label="CognArc 7-stage intelligence loop diagram">
          {/* Ellipse path for labels */}
          <defs>
            <marker id="arrowTeal" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#14b8a6" opacity="0.7" />
            </marker>
          </defs>

          {/* Connector ring */}
          <ellipse
            cx={cx} cy={cy} rx={rx} ry={ry}
            fill="none"
            stroke="url(#ringGrad)"
            strokeWidth="1.5"
            strokeDasharray="6 4"
            opacity="0.3"
          />
          <defs>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#14b8a6" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#14b8a6" />
            </linearGradient>
          </defs>

          {LOOP_STAGES.map((stage, i) => {
            const angle = (i / LOOP_STAGES.length) * 2 * Math.PI - Math.PI / 2
            const nx = cx + rx * Math.cos(angle)
            const ny = cy + ry * Math.sin(angle)
            const isActive = i === activeIdx

            // Connector to next node
            const nextAngle = ((i + 1) / LOOP_STAGES.length) * 2 * Math.PI - Math.PI / 2
            const nnx = cx + rx * Math.cos(nextAngle)
            const nny = cy + ry * Math.sin(nextAngle)

            return (
              <g key={stage.label}>
                {/* Connector arc indicator */}
                {isActive && (
                  <line
                    x1={nx} y1={ny} x2={nnx} y2={nny}
                    stroke="#14b8a6"
                    strokeWidth="2"
                    opacity="0.6"
                    strokeDasharray="4 3"
                    markerEnd="url(#arrowTeal)"
                  />
                )}

                {/* Node circle */}
                <circle
                  cx={nx} cy={ny} r={isActive ? 22 : 16}
                  fill={isActive ? `${stage.color}22` : '#ffffff08'}
                  stroke={isActive ? stage.color : '#ffffff18'}
                  strokeWidth={isActive ? 2 : 1}
                  style={{ transition: 'all 0.3s ease' }}
                />
                {isActive && (
                  <circle
                    cx={nx} cy={ny} r={28}
                    fill="none"
                    stroke={stage.color}
                    strokeWidth="1"
                    opacity="0.3"
                  />
                )}

                {/* Label */}
                <text
                  x={nx} y={ny + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={isActive ? '9' : '8'}
                  fontWeight={isActive ? '700' : '400'}
                  fill={isActive ? stage.color : '#94a3b8'}
                  style={{ transition: 'all 0.3s ease', fontFamily: 'Inter, sans-serif' }}
                >
                  {stage.label}
                </text>
              </g>
            )
          })}

          {/* Center label */}
          <text x={cx} y={cy - 12} textAnchor="middle" fontSize="11" fontWeight="600" fill="#f8fafc" fontFamily="Inter, sans-serif">
            TRIBE v2
          </text>
          <text x={cx} y={cy + 5} textAnchor="middle" fontSize="9" fill="#64748b" fontFamily="Inter, sans-serif">
            fMRI · Neural
          </text>
          <circle cx={cx} cy={cy} r={40} fill="none" stroke="#14b8a622" strokeWidth="1.5" />
        </svg>

        {/* Active stage description */}
        <div className="text-center mt-1 h-8">
          <p className="text-xs text-slate-400 transition-all duration-300">
            <span className="font-semibold" style={{ color: LOOP_STAGES[activeIdx]!.color }}>
              {LOOP_STAGES[activeIdx]!.label}
            </span>
            {' — '}
            {LOOP_STAGES[activeIdx]!.desc}
          </p>
        </div>
      </div>
    </div>
  )
}

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
              <span className="text-teal-400 text-xs font-medium">Powered by TRIBE v2 · Meta AI Research</span>
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
                { label: 'TRIBE v2', sub: 'Foundation model' },
                { label: '1,000+ hrs', sub: 'fMRI training data' },
                { label: '720 subjects', sub: 'Neural dataset' },
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

          {/* Right: animated loop */}
          <div className="animate-[fadeIn_1s_ease-out_0.3s_forwards] opacity-0">
            <IntelligenceLoop />

            {/* Score preview cards */}
            <div className="grid grid-cols-3 gap-3 mt-6">
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
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-navy-900 to-transparent" />
    </section>
  )
}
