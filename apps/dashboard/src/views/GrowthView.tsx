import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, ReferenceLine,
} from 'recharts'
import { fetchTrustDrift } from '../api/mock.js'
import { analyzeVideo, makeFallbackVideoAnalysis } from '../api/videoAnalysisApi.js'
import { supabase } from '../api/supabaseClient.js'
import { Card } from '../components/Card.js'
import { RiskBadge } from '../components/RiskBadge.js'
import { Spinner } from '../components/Spinner.js'
import { MessageClarityScorer } from '../components/MessageClarityScorer.js'
import { VideoReport } from '../components/VideoReport.js'
import { useAppContext } from '../context/AppContext.js'
import type { CreativeAsset } from '../api/types.js'

const FUNNEL_STEPS = [
  { step: 'Ad Creative',       load: 34, trust: 81, risk: 'LOW'    },
  { step: 'Landing Page',      load: 52, trust: 74, risk: 'MEDIUM' },
  { step: 'Sign-Up Flow',      load: 71, trust: 58, risk: 'MEDIUM' },
  { step: 'Onboarding',        load: 83, trust: 41, risk: 'HIGH'   },
  { step: 'First Value Moment',load: 44, trust: 69, risk: 'LOW'    },
]

const RISK_BADGE: Record<string, string> = {
  LOW:    'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH:   'bg-red-100 text-red-700',
}

const TRUST_DRIFT_DATA = [
  { date: '5/5',  trust: 72 },
  { date: '5/6',  trust: 74 },
  { date: '5/7',  trust: 71 },
  { date: '5/8',  trust: 69 },
  { date: '5/9',  trust: 68 },
  { date: '5/10', trust: 65 },
  { date: '5/11', trust: 63 },
  { date: '5/12', trust: 61 },
  { date: '5/13', trust: 64 },
  { date: '5/14', trust: 62 },
  { date: '5/15', trust: 60 },
  { date: '5/16', trust: 58 },
  { date: '5/17', trust: 57 },
  { date: '5/18', trust: 55 },
]

const TRUST_DRIFT_X_TICKS = ['5/5', '5/8', '5/11', '5/14', '5/18']

const VARIANT_SCORES = [
  { id: 'v1', name: 'Variant A — "Start your journey"', cognitive_load: 34, trust: 84, manipulation: 8, rank: 1 },
  { id: 'v2', name: 'Variant B — "Unlock your potential"', cognitive_load: 41, trust: 78, manipulation: 14, rank: 2 },
  { id: 'v3', name: 'Variant C — "Act now — limited offer!"', cognitive_load: 65, trust: 43, manipulation: 67, rank: 3 },
]

function isVideo(name: string) {
  return /\.(mp4|mov|webm)$/i.test(name)
}

export function GrowthView() {
  const { data: trustDrift, isLoading: tdLoading } = useQuery({ queryKey: ['trust-drift'], queryFn: fetchTrustDrift })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [openReportId, setOpenReportId] = useState<string | null>(null)
  const {
    evaluationQueue: queue, addToEvaluationQueue, updateEvaluationItem,
    addAgentFeedEntry, addManipulationFeedEntry, addActGatedItem, addAuditEntry,
  } = useAppContext()

  const spring = trustDrift?.filter((d) => d.campaign === 'Spring Launch') ?? []
  const retention = trustDrift?.filter((d) => d.campaign === 'Retention Drive') ?? []
  const chartData = spring.map((s, i) => ({
    date: s.date,
    'Spring Launch': s.trust,
    'Retention Drive': retention[i]?.trust,
  }))

  async function runVideoAnalysis(id: string, file: File) {
    let analysis
    let demoMode = false
    try {
      analysis = await analyzeVideo(file.name, file.size, 30, 'ws-1')
    } catch {
      analysis = makeFallbackVideoAnalysis(file.name)
      demoMode = true
    }

    updateEvaluationItem(id, {
      status: 'complete',
      cognitive_load: Math.round(analysis.overall_cognitive_load),
      trust: Math.round(analysis.overall_trust_coherence),
      risk: analysis.cognitive_risk,
      videoAnalysis: analysis,
      videoAnalysisDemoMode: demoMode,
    })

    // C07: persist video report to Supabase evaluation_queue
    if (supabase) {
      supabase
        .from('evaluation_queue')
        .update({
          video_report: analysis,
          status: 'complete',
          cognitive_load: Math.round(analysis.overall_cognitive_load),
          manipulation_risk: Math.round(analysis.overall_manipulation_risk),
          trust_coherence: Math.round(analysis.overall_trust_coherence),
        })
        .eq('id', id)
        .then(({ error }) => { if (error) console.error('[supabase] evaluation_queue update failed:', error) })
    }

    // B08: feed critical video findings into Safety manipulation feed + audit
    const criticalFindings = analysis.moment_findings.filter(
      (f) => f.severity === 'critical' || f.manipulation_risk > 70,
    )
    for (const f of criticalFindings) {
      addManipulationFeedEntry({
        category: 'false_urgency',
        score: Math.round(f.manipulation_risk),
        time: 'just now',
        excerpt: `[${file.name} at ${f.timestamp_start}s] ${(f.voiceover_segment ?? f.finding).slice(0, 60)}…`,
      })
      addAuditEntry({
        action_type: 'VIDEO_MANIPULATION_DETECTED',
        zone: 'OBSERVE',
        outcome: 'flagged',
        authorising_human_or_policy: 'policy:v1.2',
        policy_rule: 'rule:v1.2',
      })

      // C08: persist audit entry to Supabase
      if (supabase) {
        supabase.from('audit_log').insert({
          workspace_id: 'ws-1',
          action_type: 'VIDEO_MANIPULATION_DETECTED',
          oversight_zone: 'OBSERVE',
          outcome: 'flagged',
          authorising_human_or_policy: 'policy:v1.2',
          policy_rule_applied: 'rule:v1.2',
          metadata: {
            filename: file.name,
            timestamp: f.timestamp_start,
            category: 'false_urgency',
            score: Math.round(f.manipulation_risk),
            excerpt: (f.voiceover_segment ?? f.finding).slice(0, 80),
            source: 'video_analysis',
          },
        }).then(({ error }) => { if (error) console.error('[supabase] audit_log insert failed:', error) })
      }
    }

    // B08: overall manipulation flag → agent feed
    if (analysis.overall_manipulation_risk > 40) {
      addAgentFeedEntry({
        action_type: 'CREATIVE_EVAL',
        zone: 'RECOMMEND',
        description: `Video manipulation risk ${Math.round(analysis.overall_manipulation_risk)}/100 detected in ${file.name} — review recommended.`,
        status: 'executed',
      })
    }

    // C08: overall manipulation > 70 → Act-Gated item (AppContext + Supabase)
    if (analysis.overall_manipulation_risk > 70) {
      addActGatedItem({
        action_type: 'CONTENT_FLAG',
        description: `${file.name} flagged for overall manipulation risk ${Math.round(analysis.overall_manipulation_risk)}/100`,
        proposed_action: 'Remove or remediate high-manipulation video content before publishing.',
        alternatives: [
          'Rewrite voiceover urgency language and resubmit',
          'Request human review only',
          'Auto-remediate by muting identified segments',
        ],
        evidence_summary: `Video "${file.name}" scored ${Math.round(analysis.overall_manipulation_risk)}/100 on manipulation risk during automated video analysis.`,
        cognitive_scores: {
          cognitive_load: Math.round(analysis.overall_cognitive_load),
          comprehension: 60,
          trust: Math.round(analysis.overall_trust_coherence),
          manipulation_risk: Math.round(analysis.overall_manipulation_risk),
        },
        status: 'pending',
      })

      if (supabase) {
        supabase.from('act_gated_queue').insert({
          workspace_id: 'ws-1',
          title: `${file.name} — overall manipulation risk ${Math.round(analysis.overall_manipulation_risk)}/100`,
          type: 'CONTENT_FLAG',
          status: 'pending',
          decision_by: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          package_data: {
            filename: file.name,
            overall_scores: {
              cognitive_load: analysis.overall_cognitive_load,
              manipulation_risk: analysis.overall_manipulation_risk,
              trust_coherence: analysis.overall_trust_coherence,
            },
            critical_findings: criticalFindings.map((cf) => ({
              timestamp: cf.timestamp_start,
              component: cf.component,
              manipulation_risk: cf.manipulation_risk,
              finding: cf.finding,
            })),
          },
        }).then(({ error }) => { if (error) console.error('[supabase] act_gated_queue insert failed:', error) })
      }
    }
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const newId = `upload-${Date.now()}`
    const newItem: CreativeAsset = {
      id: newId,
      name: file.name,
      type: file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : isVideo(file.name) ? 'video' : 'copy',
      uploaded_at: new Date().toISOString(),
      status: 'queued',
      risk: 'LOW',
    }

    addToEvaluationQueue(newItem)

    setTimeout(() => {
      updateEvaluationItem(newId, { status: 'processing' })
    }, 2000)

    if (newItem.type === 'video') {
      // Video: call analysis service after the "processing" delay
      setTimeout(() => {
        void runVideoAnalysis(newId, file)
      }, 2500)
    } else {
      // Non-video: existing scoring simulation
      setTimeout(() => {
        const manipulation = 61
        updateEvaluationItem(newId, { status: 'complete', cognitive_load: 61, trust: 67, risk: 'MEDIUM' })

        if (manipulation > 40) {
          addAgentFeedEntry({
            action_type: 'CREATIVE_EVAL',
            zone: 'RECOMMEND',
            description: `Manipulation risk ${manipulation}/100 detected in ${file.name} — review recommended.`,
            status: 'executed',
          })

          const excerpt = file.name.length > 50
            ? file.name.slice(0, 50) + '…'
            : `${file.name} — Creative asset evaluated`
          addManipulationFeedEntry({
            category: 'false_urgency',
            score: manipulation,
            time: 'just now',
            excerpt,
          })

          if (manipulation > 70) {
            addActGatedItem({
              action_type: 'CONTENT_FLAG',
              description: `${file.name} flagged for manipulation risk ${manipulation}/100`,
              proposed_action: 'Remove or remediate high-manipulation content before publishing.',
              alternatives: ['Rewrite with lower urgency language', 'Request human review only', 'Auto-remediate urgency language'],
              evidence_summary: `Creative asset "${file.name}" scored ${manipulation}/100 on manipulation risk during automated evaluation.`,
              cognitive_scores: { cognitive_load: 61, comprehension: 67, trust: 55, manipulation_risk: manipulation },
              status: 'pending',
            })
          }
        }
      }, 5000)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Growth View</h1>

      {/* Creative Evaluation Queue */}
      <Card
        title="Creative Evaluation Queue"
        action={
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs bg-brand-500 text-white px-3 py-1 rounded-lg hover:bg-brand-600 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            + Upload asset
          </button>
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,text/*,video/*,.mp4,.mov,.webm"
          className="hidden"
          aria-label="Upload creative asset"
          onChange={handleUpload}
        />
        <div className="space-y-2">
          {queue.map((a) => (
            <div key={a.id}>
              <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                <span className="text-lg" aria-hidden>
                  {a.type === 'image' ? '🖼' : a.type === 'video' ? '🎬' : '📝'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{a.name}</p>
                  <p className="text-xs text-gray-400">{new Date(a.uploaded_at).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {a.status === 'complete' && a.cognitive_load !== undefined && (
                    <span className="text-xs text-gray-500">
                      Load: <span className="font-semibold">{a.cognitive_load}</span> · Trust: <span className="font-semibold">{a.trust}</span>
                    </span>
                  )}
                  {a.status !== 'complete' && (
                    <span className="text-xs text-gray-400">Load: — · Trust: —</span>
                  )}
                  <RiskBadge risk={a.risk} />
                  <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                    a.status === 'complete' ? 'bg-green-100 text-green-700' :
                    a.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {a.status}
                  </span>
                  {a.type === 'video' && a.status === 'complete' && a.videoAnalysis && (
                    <button
                      onClick={() => setOpenReportId(openReportId === a.id ? null : a.id)}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium underline underline-offset-2 shrink-0"
                    >
                      {openReportId === a.id ? 'Hide report' : 'View Report →'}
                    </button>
                  )}
                </div>
              </div>
              {/* Inline video report panel */}
              {a.type === 'video' && openReportId === a.id && a.videoAnalysis && (
                <VideoReport
                  report={a.videoAnalysis}
                  {...(a.videoAnalysisDemoMode ? { demoMode: a.videoAnalysisDemoMode } : {})}
                  onClose={() => setOpenReportId(null)}
                />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Copy Health Checker */}
      <Card
        title="Copy Health Checker"
        action={<span className="text-xs text-gray-400">Paste any copy — headline, email, CTA, or landing page section — and see how your audience is likely to respond.</span>}
      >
        <MessageClarityScorer />
      </Card>

      {/* Variant Ranker */}
      <Card title="Variant Ranker">
        <p className="text-xs text-gray-400 mb-3">Ranked by cognitive safety score (lower load + higher trust + lower manipulation = better).</p>
        <div className="space-y-2">
          {VARIANT_SCORES.map((v) => (
            <div key={v.id} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${v.rank === 1 ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'}`}>
                {v.rank}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{v.name}</p>
              </div>
              <div className="flex gap-4 text-xs text-gray-500 shrink-0">
                <span>Load: <strong className={v.cognitive_load > 60 ? 'text-danger' : 'text-gray-700'}>{v.cognitive_load}</strong></span>
                <span>Trust: <strong className="text-gray-700">{v.trust}</strong></span>
                <span>Manip: <strong className={v.manipulation > 40 ? 'text-danger' : 'text-gray-700'}>{v.manipulation}</strong></span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Brand Trust Drift Monitor */}
      <Card title="Brand Trust Drift Monitor">
        <p className="text-xs text-gray-400 mb-4">Longitudinal trust coherence across evaluated campaign assets</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={TRUST_DRIFT_DATA} margin={{ top: 4, right: 16, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="trustFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} ticks={TRUST_DRIFT_X_TICKS} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={65} stroke="#f59e0b" strokeDasharray="4 3" label={{ value: 'Alert threshold', position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }} />
            <Area type="monotone" dataKey="trust" name="Trust Coherence" stroke="#14b8a6" fill="url(#trustFill)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="mt-3 flex items-center gap-1.5 text-sm text-gray-600">
          <span>Current: <strong className="text-gray-800">55</strong></span>
          <span className="text-gray-300">·</span>
          <span>7-day delta: <strong className="text-gray-800">−7</strong></span>
          <span className="text-gray-300">·</span>
          <span>Trend: <strong className="text-red-500">↓ Declining</strong></span>
        </div>
        <div className="mt-3 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg px-4 py-3 text-sm text-amber-800">
          ⚠ Trust coherence has declined 17 points over 14 days. Review recent campaign assets for manipulation patterns.
        </div>
      </Card>

      {/* Cognitive Funnel Mapper */}
      <Card title="Cognitive Funnel Mapper">
        <p className="text-xs text-gray-400 mb-4">Weekly cadence — last updated 5/18/2026</p>

        {/* Step table */}
        <div className="grid grid-cols-5 gap-2 mb-5">
          {FUNNEL_STEPS.map((s, i) => (
            <div key={s.step} className={`rounded-lg border p-2.5 text-center ${s.risk === 'HIGH' ? 'border-red-200 bg-red-50' : s.risk === 'MEDIUM' ? 'border-yellow-200 bg-yellow-50' : 'border-gray-100 bg-gray-50'}`}>
              <div className="text-xs text-gray-400 mb-1">Step {i + 1}</div>
              <div className="text-xs font-semibold text-gray-700 leading-tight mb-2">{s.step}</div>
              <div className="text-xs text-gray-500 space-y-0.5">
                <div>Load: <strong className={s.load > 70 ? 'text-danger' : 'text-gray-700'}>{s.load}</strong></div>
                <div>Trust: <strong className="text-gray-700">{s.trust}</strong></div>
              </div>
              <span className={`mt-1.5 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${RISK_BADGE[s.risk]}`}>{s.risk}</span>
            </div>
          ))}
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={FUNNEL_STEPS} margin={{ top: 4, right: 16, bottom: 0, left: -20 }}>
            <XAxis dataKey="step" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine x="Sign-Up Flow" stroke="#ef4444" strokeDasharray="4 3" label={{ value: 'Load peak', position: 'top', fontSize: 10, fill: '#ef4444' }} />
            <ReferenceLine x="Onboarding"   stroke="#f59e0b" strokeDasharray="4 3" label={{ value: 'Trust gap',  position: 'top', fontSize: 10, fill: '#f59e0b' }} />
            <Line type="monotone" dataKey="load"  name="Cognitive Load"  stroke="#f59e0b" dot={true} strokeWidth={2} />
            <Line type="monotone" dataKey="trust" name="Trust Coherence" stroke="#10b981" dot={true} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>

        {/* Insight callout */}
        <div className="mt-4 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg px-4 py-3 text-sm text-amber-800">
          ⚠ Trust drops 17 points at the Onboarding step. Users are being asked to connect integrations before the product has demonstrated value.
        </div>
      </Card>

      {/* Brand Trust Drift */}
      <Card title="Brand Trust Drift — Campaign Comparison">
        {tdLoading ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={6} />
              <YAxis domain={[40, 100]} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Spring Launch" stroke="#4f6ef7" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="Retention Drive" stroke="#f59e0b" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  )
}
