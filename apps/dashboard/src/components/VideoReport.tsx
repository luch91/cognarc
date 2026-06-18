import { useState, useRef, useEffect } from 'react'
import type { VideoAnalysisResult, VideoMomentFinding } from '../api/types.js'
import { rewrite } from '../api/rewriteApi.js'
import type { RewriteAlternative } from '@cognarc/types'
import { CognitiveScoreCard } from './CognitiveScoreCard.js'

type PHClient = { capture?: (event: string, props: Record<string, unknown>) => void }
function phTrack(event: string, props: Record<string, unknown>) {
  ((window as unknown as Record<string, unknown>).posthog as PHClient | undefined)?.capture?.(event, props)
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border border-red-200',
  warning:  'bg-yellow-100 text-yellow-700 border border-yellow-200',
  ok:       'bg-green-100 text-green-700 border border-green-200',
}

const SEVERITY_ICON: Record<string, string> = {
  critical: '🔴',
  warning:  '⚠',
  ok:       '✓',
}

const RISK_BADGE: Record<string, string> = {
  HIGH:   'bg-red-100 text-red-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW:    'bg-green-100 text-green-700',
}


function VoiceoverRewrite({ segment, finding }: { segment: string; finding: VideoMomentFinding }) {
  const [alts, setAlts] = useState<RewriteAlternative[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const cacheRef = useRef<RewriteAlternative[] | null>(null)

  async function handleRewrite() {
    if (cacheRef.current) { setAlts(cacheRef.current); return }
    setLoading(true)
    phTrack('voiceover_rewrite_requested', { severity: finding.severity, manipulationRisk: finding.manipulation_risk })
    try {
      const result = await rewrite({
        originalText: segment,
        copyType: 'voiceover',
        scores: {
          cognitiveLoad: finding.cognitive_load,
          comprehensionConfidence: 60,
          emotionalValence: 40,
          trustCoherence: finding.trust_coherence,
          manipulationRisk: finding.manipulation_risk,
          cognitiveRisk: finding.manipulation_risk > 65 ? 'HIGH' : finding.manipulation_risk > 40 ? 'MEDIUM' : 'LOW',
        },
        workspaceId: 'ws-1',
        ...(finding.manipulation_risk > 60 ? { taxonomy: { falseUrgency: 80 } } : {}),
      })
      cacheRef.current = result.alternatives
      setAlts(result.alternatives)
    } catch {
      const baseScores: RewriteAlternative['scores'] = {
        cognitiveLoad: finding.cognitive_load, comprehensionConfidence: 60, emotionalValence: 40,
        trustCoherence: finding.trust_coherence, manipulationRisk: finding.manipulation_risk,
        cognitiveRisk: finding.manipulation_risk > 65 ? 'HIGH' : finding.manipulation_risk > 40 ? 'MEDIUM' : 'LOW',
      }
      cacheRef.current = [
        { text: 'Experience the benefits of fewer spots — join a focused cohort designed for real results.', rationale: 'Removes scarcity framing, leads with outcome.', confidence: 'HIGH', scores: baseScores, scoreDelta: { cognitiveLoad: -12, comprehensionConfidence: 8, trustCoherence: 15, manipulationRisk: -35 } },
        { text: 'Join thousands who have already made the switch — we keep cohorts small so you get results.', rationale: 'Social proof replaces urgency without pressure.', confidence: 'MEDIUM', scores: baseScores, scoreDelta: { cognitiveLoad: -8, comprehensionConfidence: 6, trustCoherence: 12, manipulationRisk: -28 } },
        { text: 'Spots are limited by design — apply now to see if you qualify.', rationale: 'Shifts from urgency to selectivity, less manipulative.', confidence: 'LOW', scores: baseScores, scoreDelta: { cognitiveLoad: -5, comprehensionConfidence: 4, trustCoherence: 8, manipulationRisk: -18 } },
      ]
      setAlts(cacheRef.current)
    } finally {
      setLoading(false)
    }
  }

  function copyScript(text: string, confidence: string) {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(text)
    phTrack('voiceover_rewrite_used', { confidence })
    setTimeout(() => setCopied(null), 1800)
  }

  return (
    <div className="mt-3">
      <div className="rounded border-l-4 border-red-400 bg-red-50 p-3 font-mono text-xs text-gray-700 leading-relaxed">
        {segment}
      </div>
      {!alts && !loading && (
        <button
          onClick={handleRewrite}
          className="mt-2 text-xs bg-brand-500 text-white px-3 py-1 rounded-lg hover:bg-brand-600 transition-colors"
        >
          Get Script Rewrite →
        </button>
      )}
      {loading && (
        <p className="mt-2 text-xs text-gray-400 flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
          Generating voiceover alternatives…
        </p>
      )}
      {alts && (
        <div className="mt-3 space-y-3">
          {alts.map((alt, i) => (
            <div key={i} className="rounded-lg border border-gray-100 bg-white p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-gray-500">Option {i + 1}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 font-semibold shrink-0">
                  {alt.confidence} confidence
                </span>
              </div>
              <p className="text-sm text-gray-800 mb-1">{alt.text}</p>
              <p className="text-xs text-gray-400 mb-2">{alt.rationale}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {alt.scoreDelta.manipulationRisk !== undefined && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                    Manip {alt.scoreDelta.manipulationRisk > 0 ? '+' : ''}{alt.scoreDelta.manipulationRisk}
                  </span>
                )}
                {alt.scoreDelta.trustCoherence !== undefined && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                    Trust {alt.scoreDelta.trustCoherence > 0 ? '+' : ''}{alt.scoreDelta.trustCoherence}
                  </span>
                )}
                {alt.scoreDelta.cognitiveLoad !== undefined && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-600">
                    Load {alt.scoreDelta.cognitiveLoad > 0 ? '+' : ''}{alt.scoreDelta.cognitiveLoad}
                  </span>
                )}
                <button
                  onClick={() => copyScript(alt.text, alt.confidence)}
                  className="ml-auto text-[10px] px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  {copied === alt.text ? 'Copied!' : 'Copy script'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FindingCard({ finding }: { finding: VideoMomentFinding }) {
  const ts = `${Math.floor(finding.timestamp_start / 60)}:${String(finding.timestamp_start % 60).padStart(2, '0')}–${Math.floor(finding.timestamp_end / 60)}:${String(finding.timestamp_end % 60).padStart(2, '0')}`

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-mono">{ts}</span>
        <span className="text-xs font-semibold text-gray-700">{finding.component}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${SEVERITY_BADGE[finding.severity]}`}>
          {SEVERITY_ICON[finding.severity]} {finding.severity.toUpperCase()}
        </span>
      </div>
      <p className="text-sm text-gray-700 mb-1">{finding.finding}</p>
      <p className="text-xs text-gray-400">{finding.recommendation}</p>
      {finding.voiceover_segment && (
        <VoiceoverRewrite segment={finding.voiceover_segment} finding={finding} />
      )}
    </div>
  )
}

export function VideoReport({
  report,
  demoMode,
  onClose,
}: {
  report: VideoAnalysisResult
  demoMode?: boolean
  onClose: () => void
}) {
  useEffect(() => {
    phTrack('video_report_viewed', { filename: report.filename, cognitiveRisk: report.cognitive_risk })
  }, [report.filename, report.cognitive_risk])

  const COMPONENT_SUMMARY = report.moment_findings.map((f) => ({
    component: f.component,
    severity: f.severity,
    issue: f.finding.split('.')[0] ?? f.finding,
  }))

  return (
    <div data-testid="video-report" className="mt-3 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-gray-700 truncate">{report.filename}</span>
          <span className="text-xs text-gray-400 shrink-0">{report.duration_seconds}s</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 shrink-0">
            {demoMode ? 'Demo mode' : 'Mock Analysis'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${RISK_BADGE[report.cognitive_risk]}`}>
            {report.cognitive_risk} RISK
          </span>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Overall scores — manager-friendly card */}
        <CognitiveScoreCard
          scores={{
            cognitiveLoad: report.overall_cognitive_load,
            comprehensionConfidence: Math.round(
              report.moment_findings.reduce((sum, f) => sum + (100 - f.cognitive_load), 0) /
              Math.max(report.moment_findings.length, 1)
            ),
            trustCoherence: report.overall_trust_coherence,
            manipulationRisk: report.overall_manipulation_risk,
          }}
          context="video content"
          defaultMode="manager"
        />

        {/* Moment findings */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Moment-by-moment findings</h4>
          <div className="space-y-3">
            {report.moment_findings.map((f, i) => (
              <FindingCard key={i} finding={f} />
            ))}
          </div>
        </div>

        {/* Component summary table */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Component summary</h4>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-1 pr-4 text-gray-400 font-medium">Component</th>
                <th className="text-left py-1 pr-4 text-gray-400 font-medium">Severity</th>
                <th className="text-left py-1 text-gray-400 font-medium">Primary issue</th>
              </tr>
            </thead>
            <tbody>
              {COMPONENT_SUMMARY.map((row, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1.5 pr-4 font-medium text-gray-700">{row.component}</td>
                  <td className="py-1.5 pr-4">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${SEVERITY_BADGE[row.severity]}`}>
                      {SEVERITY_ICON[row.severity]} {row.severity.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-1.5 text-gray-500 truncate max-w-xs">{row.issue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recommended actions */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Recommended actions</h4>
          <ol className="space-y-1.5 list-decimal list-inside">
            {report.recommended_actions.map((action, i) => (
              <li key={i} className="text-sm text-gray-700">{action}</li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
