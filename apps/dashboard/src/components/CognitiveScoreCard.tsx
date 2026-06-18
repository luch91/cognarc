import { useState } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CognitiveScores {
  cognitiveLoad: number
  comprehensionConfidence: number
  trustCoherence: number
  manipulationRisk: number
}

export interface CognitiveTaxonomy {
  falseUrgency?: number
  authorityMimicry?: number
  sycophantidDrift?: number
  ambiguityExploitation?: number
  socialProofFabrication?: number
  obfuscation?: number
}

export interface CognitiveScoreCardProps {
  scores: CognitiveScores
  taxonomy?: CognitiveTaxonomy
  showToggle?: boolean
  defaultMode?: 'manager' | 'technical'
  context?: string
  originalScores?: CognitiveScores
}

// ── Health derivation ─────────────────────────────────────────────────────────

type Health = 'FLAGGED' | 'NEEDS_REVIEW' | 'CLEAR'

function deriveHealth(s: CognitiveScores): Health {
  if (s.manipulationRisk > 60 || s.cognitiveLoad > 75 || s.comprehensionConfidence < 40) return 'FLAGGED'
  if (s.manipulationRisk > 40 || s.cognitiveLoad > 60 || s.comprehensionConfidence < 55 || s.trustCoherence < 50)
    return 'NEEDS_REVIEW'
  return 'CLEAR'
}

// ── Radar data conversion — all axes higher = better ─────────────────────────

function toRadarData(s: CognitiveScores) {
  return [
    { axis: 'Readability', value: 100 - s.cognitiveLoad },
    { axis: 'Clarity',     value: s.comprehensionConfidence },
    { axis: 'Trust',       value: s.trustCoherence },
    { axis: 'Safety',      value: 100 - s.manipulationRisk },
  ]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TAXONOMY_PLAIN: Record<string, string> = {
  falseUrgency:           'Artificial urgency — creates unnecessary pressure',
  authorityMimicry:       'Inflated authority — claims that feel unverifiable',
  sycophantidDrift:       'Excessive flattery — agreement without substance',
  ambiguityExploitation:  'Vague language — could be interpreted multiple ways',
  socialProofFabrication: 'Unverified consensus — "everyone agrees" type claims',
  obfuscation:            'Hidden meaning — complexity that obscures the real message',
}

function clColor(v: number) {
  return v < 55 ? 'text-emerald-600' : v <= 70 ? 'text-amber-600' : 'text-red-500'
}
function ccColor(v: number) {
  return v > 65 ? 'text-emerald-600' : v >= 45 ? 'text-amber-600' : 'text-red-500'
}
function tcColor(v: number) {
  return v > 65 ? 'text-emerald-600' : v >= 45 ? 'text-amber-600' : 'text-red-500'
}
function mrColor(v: number) {
  return v < 35 ? 'text-emerald-600' : v <= 60 ? 'text-amber-600' : 'text-red-500'
}

// ── Health badge ──────────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: Health }) {
  const cfg = {
    FLAGGED:     { bg: 'bg-red-500',    label: 'FLAGGED',      icon: '⊘' },
    NEEDS_REVIEW:{ bg: 'bg-amber-400',  label: 'NEEDS REVIEW', icon: '⚠' },
    CLEAR:       { bg: 'bg-emerald-500',label: 'CLEAR',        icon: '✓' },
  }[health]
  return (
    <span data-testid="health-badge" className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-white text-sm font-bold ${cfg.bg}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function verdictText(health: Health): string {
  if (health === 'FLAGGED')
    return 'This content has serious problems. Publishing it as-is risks confusing your audience or damaging trust.'
  if (health === 'NEEDS_REVIEW')
    return 'This content has issues that may affect how your audience responds. Review the details below before publishing.'
  return 'This content is safe to use. Cognitive scores are within acceptable thresholds across all four dimensions.'
}

// ── Custom radar axis label ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RadarLabel(props: any) {
  const { x, y, payload } = props as { x: number; y: number; payload: { value: string } }
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={600} fill="#111827">
      {payload.value}
    </text>
  )
}

// ── Mini radar (for before/after) ─────────────────────────────────────────────

function MiniRadar({ scores, label }: { scores: CognitiveScores; label: string }) {
  const health = deriveHealth(scores)
  const data = toRadarData(scores)
  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <HealthBadge health={health} />
      <ResponsiveContainer width="100%" height={160}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="65%">
          <PolarGrid gridType="polygon" stroke="#E5E7EB" />
          <PolarAngleAxis dataKey="axis" tick={RadarLabel as unknown as React.ReactElement} />
          <Radar dataKey="value" stroke="#00957A" fill="#00957A" fillOpacity={0.25} />
        </RadarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs w-full px-2">
        <span className="text-gray-500">Readability <strong className={clColor(scores.cognitiveLoad)}>{Math.round(100 - scores.cognitiveLoad)}</strong></span>
        <span className="text-gray-500">Clarity <strong className={ccColor(scores.comprehensionConfidence)}>{Math.round(scores.comprehensionConfidence)}</strong></span>
        <span className="text-gray-500">Trust <strong className={tcColor(scores.trustCoherence)}>{Math.round(scores.trustCoherence)}</strong></span>
        <span className="text-gray-500">Safety <strong className={mrColor(scores.manipulationRisk)}>{Math.round(100 - scores.manipulationRisk)}</strong></span>
      </div>
    </div>
  )
}

// ── Plain-English rows ────────────────────────────────────────────────────────

function ReadabilityRow({ load }: { load: number }) {
  const [label, color] =
    load < 40  ? ['Very easy — most readers will process this effortlessly', 'text-emerald-600'] :
    load < 55  ? ['Easy — suitable for a general audience', 'text-emerald-500'] :
    load < 70  ? ['Moderate — some readers may need to re-read sections', 'text-amber-600'] :
    load < 85  ? ['Difficult — consider simplifying before publishing', 'text-red-500'] :
                 ['Very difficult — most readers will not finish this', 'text-red-700']
  return (
    <Row question="How hard is this to read?">
      <span className={`text-sm font-medium ${color}`}>{label}</span>
    </Row>
  )
}

function ComprehensionRow({ cc }: { cc: number }) {
  const [label, color] =
    cc > 75 ? ['Yes — the message is clear and likely to be understood correctly', 'text-emerald-600'] :
    cc > 60 ? ['Probably — most readers will get the main point', 'text-emerald-500'] :
    cc > 45 ? ['Uncertain — some readers may misinterpret the message', 'text-amber-600'] :
              ['Unlikely — the message is unclear and may be misunderstood', 'text-red-500']
  return (
    <Row question="Will your audience understand it?">
      <span className={`text-sm font-medium ${color}`}>{label}</span>
    </Row>
  )
}

function TrustRow({ tc }: { tc: number }) {
  const [label, color] =
    tc > 70 ? ['Yes — the copy feels consistent and credible throughout', 'text-emerald-600'] :
    tc > 55 ? ['Mostly — minor inconsistencies that won\'t damage trust', 'text-emerald-500'] :
    tc > 40 ? ['Somewhat — noticeable inconsistencies that may cause doubt', 'text-amber-600'] :
              ['No — the copy feels inconsistent or incoherent', 'text-red-500']
  return (
    <Row question="Does this feel trustworthy?">
      <span className={`text-sm font-medium ${color}`}>{label}</span>
    </Row>
  )
}

function ManipulationRow({ mr, taxonomy }: { mr: number; taxonomy?: CognitiveTaxonomy | undefined }) {
  const [label, color] =
    mr < 25 ? ['No — no problematic patterns detected', 'text-emerald-600'] :
    mr < 45 ? ['Low risk — minor patterns present but not concerning', 'text-emerald-500'] :
    mr < 65 ? ['Moderate risk — review before publishing', 'text-amber-600'] :
              ['High risk — problematic patterns detected (see details below)', 'text-red-500']

  const detected = taxonomy && mr > 45
    ? Object.entries(taxonomy).filter(([, v]) => typeof v === 'number' && v > 40)
    : []

  return (
    <Row question="Is this pressuring or misleading people?">
      <span className={`text-sm font-medium ${color}`}>{label}</span>
      {detected.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-gray-400 font-medium">What was detected:</p>
          {detected.map(([k]) => (
            <p key={k} className="text-xs text-gray-600">· {TAXONOMY_PLAIN[k] ?? k}</p>
          ))}
        </div>
      )}
    </Row>
  )
}

function Row({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <p className="text-xs font-semibold text-gray-500 mb-1">{question}</p>
      {children}
    </div>
  )
}

// ── Technical mode panels ─────────────────────────────────────────────────────

function TechPanel({ label, value, colorFn }: { label: string; value: number; colorFn: (v: number) => string }) {
  return (
    <div className="flex-1 bg-gray-50 rounded-lg p-3 flex flex-col gap-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${colorFn(value)}`}>{Math.round(value)}</span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function CognitiveScoreCard({
  scores,
  taxonomy,
  showToggle = true,
  defaultMode = 'manager',
  context: _context,
  originalScores,
}: CognitiveScoreCardProps) {
  const [mode, setMode] = useState<'manager' | 'technical'>(defaultMode)
  const health = deriveHealth(scores)
  const radarData = toRadarData(scores)

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header — badge + toggle */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="space-y-1.5">
          <HealthBadge health={health} />
          <p className="text-sm text-gray-600 max-w-md">{verdictText(health)}</p>
        </div>
        {showToggle && (
          <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 p-0.5 shrink-0 text-xs">
            <button
              onClick={() => setMode('manager')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${mode === 'manager' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Manager
            </button>
            <button
              onClick={() => setMode('technical')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${mode === 'technical' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Technical
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      {mode === 'manager' ? (
        <div className="px-5 py-4 space-y-4">
          {/* Before/After or single radar */}
          {originalScores ? (
            <div className="flex gap-4 pt-1">
              <MiniRadar scores={originalScores} label="Before" />
              <div className="flex items-center self-center text-gray-300 text-2xl font-thin">→</div>
              <MiniRadar scores={scores} label="After" />
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                  <PolarGrid gridType="polygon" stroke="#E5E7EB" />
                  <PolarAngleAxis dataKey="axis" tick={RadarLabel as unknown as React.ReactElement} />
                  <Radar dataKey="value" stroke="#00957A" fill="#00957A" fillOpacity={0.25} />
                </RadarChart>
              </ResponsiveContainer>
              {/* Score chips */}
              <div className="flex gap-3 text-xs justify-center">
                <span className="text-gray-500">Readability <strong className={clColor(scores.cognitiveLoad)}>{Math.round(100 - scores.cognitiveLoad)}</strong></span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-500">Clarity <strong className={ccColor(scores.comprehensionConfidence)}>{Math.round(scores.comprehensionConfidence)}</strong></span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-500">Trust <strong className={tcColor(scores.trustCoherence)}>{Math.round(scores.trustCoherence)}</strong></span>
                <span className="text-gray-300">·</span>
                <span className="text-gray-500">Safety <strong className={mrColor(scores.manipulationRisk)}>{Math.round(100 - scores.manipulationRisk)}</strong></span>
              </div>
            </>
          )}

          {/* Plain-English rows */}
          <div className="border-t border-gray-100 pt-2">
            <ReadabilityRow load={scores.cognitiveLoad} />
            <ComprehensionRow cc={scores.comprehensionConfidence} />
            <TrustRow tc={scores.trustCoherence} />
            <ManipulationRow mr={scores.manipulationRisk} {...(taxonomy !== undefined ? { taxonomy } : {})} />
          </div>
        </div>
      ) : (
        <div className="px-5 py-4 space-y-3">
          <div className="flex gap-2">
            <TechPanel label="Cognitive Load"            value={scores.cognitiveLoad}            colorFn={clColor} />
            <TechPanel label="Comprehension Confidence"  value={scores.comprehensionConfidence}  colorFn={ccColor} />
            <TechPanel label="Trust Coherence"           value={scores.trustCoherence}           colorFn={tcColor} />
            <TechPanel label="Manipulation Risk"         value={scores.manipulationRisk}         colorFn={mrColor} />
          </div>
        </div>
      )}
    </div>
  )
}
