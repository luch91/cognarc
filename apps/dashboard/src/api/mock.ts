import type {
  HealthPoint, AgentAction, KillSwitchState, ConnectedSurface,
  PromptBaseline, CicdRun, AuditEntry, ConnectorStatus, AlignmentPoint,
  ModelProfile, CreativeAsset, TrustDriftPoint, ManipulationFlag,
  RemediationItem, ActGatedItem, VideoAnalysisResult,
} from './types.js'

function days(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (n - 1 - i))
    return d.toISOString().slice(0, 10)
  })
}

function rand(min: number, max: number) {
  return Math.round(Math.random() * (max - min) + min)
}

export const mockHealthTrend: HealthPoint[] = days(30).map((date) => ({
  date,
  cognitive_load: rand(30, 75),
  comprehension: rand(55, 90),
  trust: rand(60, 95),
  manipulation_risk: rand(5, 40),
}))

export const mockAgentActivity: AgentAction[] = [
  { id: 'a1', timestamp: new Date(Date.now() - 2 * 60000).toISOString(),   action_type: 'CONTENT_FLAG',     zone: 'ACT_GATED', status: 'pending',  description: 'Manipulation risk 84/100 detected in Spring Launch copy — awaiting human approval', workspace_id: 'ws-1' },
  { id: 'a2', timestamp: new Date(Date.now() - 12 * 60000).toISOString(),  action_type: 'PROMPT_EVALUATED', zone: 'OBSERVE',   status: 'executed', description: 'Scored onboarding prompt v7 — cognitive load 71, trust 58, comprehension 62', workspace_id: 'ws-1' },
  { id: 'a3', timestamp: new Date(Date.now() - 23 * 60000).toISOString(),  action_type: 'WRITEBACK_SYNC',   zone: 'ACT_AUTO',  status: 'executed', description: 'Wrote cognitive labels for 342 sessions to Segment (load > 70 cohort)', workspace_id: 'ws-1' },
  { id: 'a4', timestamp: new Date(Date.now() - 41 * 60000).toISOString(),  action_type: 'THRESHOLD_BREACH', zone: 'RECOMMEND', status: 'executed', description: 'Trust dropped 17 pts at Onboarding — recommended delaying integration prompts', workspace_id: 'ws-1' },
  { id: 'a5', timestamp: new Date(Date.now() - 60 * 60000).toISOString(),  action_type: 'BASELINE_UPSERT',  zone: 'OBSERVE',   status: 'executed', description: 'Refreshed cognitive baseline for workspace ws-1 (30-day rolling window)', workspace_id: 'ws-1' },
  { id: 'a6', timestamp: new Date(Date.now() - 120 * 60000).toISOString(), action_type: 'KILL_SWITCH',      zone: 'ACT_GATED', status: 'executed', description: 'Kill switch activated by admin — all ACT_AUTO actions paused for 14 min', workspace_id: 'ws-1' },
  { id: 'a7', timestamp: new Date(Date.now() - 180 * 60000).toISOString(), action_type: 'WRITEBACK_SYNC',   zone: 'ACT_AUTO',  status: 'executed', description: 'Synced manipulation taxonomy labels to Amplitude for Retention Drive campaign', workspace_id: 'ws-1' },
]

export let mockKillSwitch: KillSwitchState = {
  active: false,
  activated_at: null,
  activated_by: null,
}

export const mockSurfaces: ConnectedSurface[] = [
  { id: 's1', name: 'Web App', type: 'web', last_seen: new Date().toISOString(), status: 'healthy' },
  { id: 's2', name: 'iOS SDK', type: 'mobile', last_seen: new Date(Date.now() - 60000).toISOString(), status: 'healthy' },
  { id: 's3', name: 'Admin Portal', type: 'web', last_seen: new Date(Date.now() - 7200000).toISOString(), status: 'degraded' },
]

export const mockPromptBaselines: PromptBaseline[] = [
  { id: 'p1', hash: '8f3a9c...', label: 'Onboarding welcome', cognitive_load: 42, comprehension: 81, delta_cl: +3, delta_cc: -2, last_evaluated: new Date(Date.now() - 3600000).toISOString(), status: 'ok' },
  { id: 'p2', hash: 'b2e1ff...', label: 'Checkout confirmation', cognitive_load: 67, comprehension: 54, delta_cl: +18, delta_cc: -17, last_evaluated: new Date(Date.now() - 7200000).toISOString(), status: 'block' },
  { id: 'p3', hash: 'd99aac...', label: 'Error state message', cognitive_load: 55, comprehension: 62, delta_cl: +7, delta_cc: -8, last_evaluated: new Date(Date.now() - 10800000).toISOString(), status: 'warn' },
  { id: 'p4', hash: '1f4bcd...', label: 'Settings page intro', cognitive_load: 38, comprehension: 88, delta_cl: -1, delta_cc: +3, last_evaluated: new Date(Date.now() - 14400000).toISOString(), status: 'ok' },
]

export const mockCicdRuns: CicdRun[] = [
  { id: 'r1', pr_number: 247, pr_title: 'feat: redesign checkout flow', branch: 'feat/checkout-v2', result: 'fail', overall_score: 82, evaluated_at: new Date(Date.now() - 1800000).toISOString(), breaches: ['cognitive_load > 75', 'comprehension_confidence < 55'] },
  { id: 'r2', pr_number: 246, pr_title: 'fix: correct button label copy', branch: 'fix/button-label', result: 'pass', overall_score: 34, evaluated_at: new Date(Date.now() - 7200000).toISOString(), breaches: [] },
  { id: 'r3', pr_number: 245, pr_title: 'chore: update dependency versions', branch: 'chore/deps', result: 'pass', overall_score: 28, evaluated_at: new Date(Date.now() - 86400000).toISOString(), breaches: [] },
  { id: 'r4', pr_number: 244, pr_title: 'feat: add upsell modal', branch: 'feat/upsell-modal', result: 'warn', overall_score: 61, evaluated_at: new Date(Date.now() - 172800000).toISOString(), breaches: ['manipulation_risk > 50'] },
]

const ACTION_ZONES: Record<string, 'OBSERVE' | 'RECOMMEND' | 'ACT_AUTO' | 'ACT_GATED'> = {
  PROMPT_EVALUATED: 'OBSERVE',
  THRESHOLD_BREACH: 'RECOMMEND',
  WRITEBACK_SYNC:   'ACT_AUTO',
  BASELINE_UPSERT:  'ACT_AUTO',
  KILL_SWITCH:      'ACT_GATED',
  CONTENT_FLAG:     'ACT_GATED',
  FAIL_CICD_BUILD:  'ACT_AUTO',
  PROMPT_REWRITE:   'ACT_GATED',
}

const EXTRA_AUDIT: AuditEntry[] = [
  { id: 'audit-extra-0', timestamp: new Date(Date.now() - 1500000).toISOString(), workspace_id: 'ws-1', action_type: 'FAIL_CICD_BUILD',  zone: 'ACT_AUTO',  policy_rule: 'rule:v1.2', outcome: 'success',  authorising_human_or_policy: 'policy:v1.2' },
  { id: 'audit-extra-1', timestamp: new Date(Date.now() - 3300000).toISOString(), workspace_id: 'ws-1', action_type: 'THRESHOLD_BREACH', zone: 'RECOMMEND', policy_rule: 'rule:v1.2', outcome: 'escalated', authorising_human_or_policy: 'policy:v1.2' },
  { id: 'audit-extra-2', timestamp: new Date(Date.now() - 5100000).toISOString(), workspace_id: 'ws-1', action_type: 'PROMPT_REWRITE',   zone: 'ACT_GATED', policy_rule: 'rule:v1.2', outcome: 'pending',  authorising_human_or_policy: 'user:admin'  },
]

export const mockAuditLog: AuditEntry[] = [
  ...EXTRA_AUDIT,
  ...Array.from({ length: 200 }, (_, i) => {
    const types = ['PROMPT_EVALUATED', 'THRESHOLD_BREACH', 'WRITEBACK_SYNC', 'BASELINE_UPSERT', 'KILL_SWITCH', 'CONTENT_FLAG']
    const outcomes = ['success', 'blocked', 'approved', 'rejected']
    const action_type = types[i % types.length]!
    return {
      id: `audit-${i}`,
      timestamp: new Date(Date.now() - (i + 3) * 900000).toISOString(),
      workspace_id: 'ws-1',
      action_type,
      zone: ACTION_ZONES[action_type] ?? 'OBSERVE',
      policy_rule: `rule:v1.${(i % 5) + 1}`,
      outcome: outcomes[i % outcomes.length]!,
      authorising_human_or_policy: i % 7 === 0 ? 'user:admin' : 'policy:v1.2',
    }
  }),
]

export const mockConnectors: ConnectorStatus[] = [
  { name: 'segment', healthy: true, last_sync: new Date(Date.now() - 120000).toISOString(), events_today: 12847, write_back_enabled: true },
  { name: 'amplitude', healthy: true, last_sync: new Date(Date.now() - 300000).toISOString(), events_today: 8421, write_back_enabled: true },
  { name: 'mixpanel', healthy: false, last_sync: new Date(Date.now() - 3600000).toISOString(), events_today: 0, write_back_enabled: false },
  { name: 'posthog', healthy: true, last_sync: new Date(Date.now() - 60000).toISOString(), events_today: 5503, write_back_enabled: true },
  { name: 'ga4', healthy: true, last_sync: new Date(Date.now() - 240000).toISOString(), events_today: 21004, write_back_enabled: false },
]

export const mockAlignmentTrend: AlignmentPoint[] = days(30).map((date) => ({
  date,
  score: rand(55, 88),
  sessions: rand(200, 1200),
}))

export const mockModelProfiles: ModelProfile[] = [
  { id: 'm1', name: 'claude-sonnet-4-6', provider: 'Anthropic', cognitive_load_avg: 38, comprehension_avg: 82, trust_avg: 87, manipulation_avg: 12, benchmark_date: '2026-05-01' },
  { id: 'm2', name: 'gpt-4o', provider: 'OpenAI', cognitive_load_avg: 42, comprehension_avg: 79, trust_avg: 81, manipulation_avg: 15, benchmark_date: '2026-05-01' },
  { id: 'm3', name: 'gemini-1.5-pro', provider: 'Google', cognitive_load_avg: 45, comprehension_avg: 74, trust_avg: 76, manipulation_avg: 18, benchmark_date: '2026-04-28' },
]

const MOCK_VIDEO_ANALYSIS: VideoAnalysisResult = {
  filename: 'social-ad-v1.mp4',
  duration_seconds: 30,
  analysis_mode: 'demo',
  overall_cognitive_load: 62,
  overall_manipulation_risk: 52,
  overall_trust_coherence: 55,
  overall_attention_engagement: 66,
  cognitive_risk: 'HIGH',
  moment_findings: [
    { timestamp_start: 0,  timestamp_end: 8,  component: 'Opening Hook',    severity: 'warning',  finding: 'Cognitive load spikes in first 8 seconds due to rapid scene cuts and dense text overlay.',   recommendation: 'Slow the opening sequence and limit on-screen text to one claim per scene.',     cognitive_load: 72, manipulation_risk: 38, trust_coherence: 64, attention_engagement: 80 },
    { timestamp_start: 8,  timestamp_end: 16, component: 'Voiceover',       severity: 'critical', finding: 'Voiceover uses urgency language that correlates with elevated manipulation risk.',         recommendation: 'Replace urgency language with benefit-led copy focused on outcome, not scarcity.', cognitive_load: 65, manipulation_risk: 78, trust_coherence: 48, attention_engagement: 62, voiceover_segment: "Act now — only a limited number of spots remain. Don't miss this exclusive opportunity." },
    { timestamp_start: 16, timestamp_end: 20, component: 'Scene Transition', severity: 'warning',  finding: 'Trust coherence drops 12 points at the mid-roll scene transition.',                       recommendation: 'Use a visual bridge to maintain narrative continuity.',                            cognitive_load: 58, manipulation_risk: 42, trust_coherence: 52, attention_engagement: 55 },
    { timestamp_start: 20, timestamp_end: 26, component: 'Product Demo',     severity: 'warning',  finding: 'Attention engagement dips during product demo — no clear focal point.',                    recommendation: 'Add motion arrows or zoom-in to guide attention to key interface elements.',       cognitive_load: 62, manipulation_risk: 31, trust_coherence: 61, attention_engagement: 44 },
    { timestamp_start: 26, timestamp_end: 30, component: 'CTA',              severity: 'critical', finding: 'CTA overlay contains scarcity framing that triggers manipulation detection.',              recommendation: 'Replace countdown timer with social proof to build trust without pressure.',       cognitive_load: 55, manipulation_risk: 71, trust_coherence: 50, attention_engagement: 88 },
  ],
  rewrite_candidates: ["Act now — only a limited number of spots remain. Don't miss this exclusive opportunity."],
  recommended_actions: [
    'Rewrite the voiceover urgency language (see rewrite suggestions above)',
    'Add a focal point guide to the product demo sequence',
    'Align the scene transition visual to the benefit message',
  ],
}

export const mockCreativeAssets: CreativeAsset[] = [
  { id: 'c1', name: 'hero-banner-v3.png', type: 'image', uploaded_at: new Date(Date.now() - 7200000).toISOString(), status: 'complete', cognitive_load: 52, trust: 74, risk: 'MEDIUM' },
  { id: 'c2', name: 'email-body-copy.txt', type: 'copy', uploaded_at: new Date(Date.now() - 3600000).toISOString(), status: 'complete', cognitive_load: 71, trust: 48, risk: 'HIGH' },
  { id: 'c3', name: 'social-ad-v1.mp4', type: 'video', uploaded_at: new Date(Date.now() - 1800000).toISOString(), status: 'complete', cognitive_load: 62, trust: 55, risk: 'HIGH', videoAnalysis: MOCK_VIDEO_ANALYSIS, videoAnalysisDemoMode: true },
  { id: 'c4', name: 'landing-headline-v2.txt', type: 'copy', uploaded_at: new Date(Date.now() - 900000).toISOString(), status: 'queued', risk: 'LOW' },
]

export const mockTrustDrift: TrustDriftPoint[] = [
  ...days(30).map((date) => ({ date, trust: rand(60, 82), campaign: 'Spring Launch' })),
  ...days(30).map((date) => ({ date, trust: rand(55, 78), campaign: 'Retention Drive' })),
]

export const mockManipulationFlags: ManipulationFlag[] = [
  { id: 'mf1', timestamp: new Date(Date.now() - 1800000).toISOString(), source: 'Campaign copy v2', overall_risk: 78, categories: ['false_urgency', 'authority_mimicry'], evidence: ['"Act now — experts unanimously agree"', '"Limited time only"'], status: 'open' },
  { id: 'mf2', timestamp: new Date(Date.now() - 86400000).toISOString(), source: 'Onboarding step 3', overall_risk: 52, categories: ['sycophantic_drift'], evidence: ['"You\'re absolutely right about everything"'], status: 'remediated' },
  { id: 'mf3', timestamp: new Date(Date.now() - 172800000).toISOString(), source: 'Checkout upsell modal', overall_risk: 65, categories: ['false_urgency', 'social_proof_fabrication'], evidence: ['"Only 2 left!"', '"Millions have already upgraded"'], status: 'monitoring' },
]

export const mockRemediations: RemediationItem[] = [
  { id: 're1', original_flag_id: 'mf2', finding: 'Sycophantic drift in onboarding step 3', remediated_at: new Date(Date.now() - 43200000).toISOString(), reemergence_risk: 18, last_check: new Date(Date.now() - 3600000).toISOString(), status: 'clear' },
  { id: 're2', original_flag_id: 'mf3', finding: 'False urgency in checkout upsell', remediated_at: new Date(Date.now() - 86400000).toISOString(), reemergence_risk: 42, last_check: new Date(Date.now() - 1800000).toISOString(), status: 'monitoring' },
]

export const mockActGatedItems: ActGatedItem[] = [
  {
    id: 'ag1',
    requested_at: new Date(Date.now() - 600000).toISOString(),
    action_type: 'CONTENT_FLAG',
    description: 'Campaign copy v2 flagged for manipulation risk 78/100',
    proposed_action: 'Block deployment of campaign copy v2 to production',
    alternatives: ['Deploy with soft-block warning', 'Request human review only', 'Auto-remediate urgency language'],
    evidence_summary: 'Cognitive analysis detected false_urgency (score 84) and authority_mimicry (score 71). Top phrases: "Act now — experts unanimously agree", "Limited time only".',
    cognitive_scores: { cognitive_load: 68, comprehension: 54, trust: 41, manipulation_risk: 78 },
    status: 'pending',
  },
  {
    id: 'ag2',
    requested_at: new Date(Date.now() - 3600000).toISOString(),
    action_type: 'THRESHOLD_BREACH',
    description: 'Onboarding flow step 4 cognitive load 89/100',
    proposed_action: 'Flag step 4 copy for redesign and pause A/B test',
    alternatives: ['Continue test with monitoring', 'Reduce test traffic to 5%'],
    evidence_summary: 'Cognitive load of 89 significantly exceeds threshold of 75. Comprehension confidence at 48 — users likely abandoning due to overload.',
    cognitive_scores: { cognitive_load: 89, comprehension: 48, trust: 62, manipulation_risk: 14 },
    status: 'pending',
  },
  {
    id: 'ag3',
    requested_at: new Date(Date.now() - 86400000).toISOString(),
    action_type: 'BASELINE_DRIFT',
    description: 'Prompt #42 regressed: CL +18pts vs baseline',
    proposed_action: 'Rollback prompt #42 to previous version',
    alternatives: ['Accept new baseline', 'Manual review before decision'],
    evidence_summary: 'Prompt #42 cognitive load increased from 49 to 67 over 3 evaluations. Comprehension dropped from 81 to 54.',
    cognitive_scores: { cognitive_load: 67, comprehension: 54, trust: 71, manipulation_risk: 8 },
    status: 'approved',
    reviewer: 'user:admin',
    justification: 'Load increase confirmed problematic. Rolling back.',
    reviewed_at: new Date(Date.now() - 43200000).toISOString(),
  },
]

// Simulate API delay
function delay(ms = 300) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

// API functions
export async function fetchHealthTrend(): Promise<HealthPoint[]> {
  await delay()
  return mockHealthTrend
}

export async function fetchAgentActivity(): Promise<AgentAction[]> {
  await delay(200)
  return mockAgentActivity
}

export async function fetchKillSwitch(): Promise<KillSwitchState> {
  await delay(100)
  return { ...mockKillSwitch }
}

export async function setKillSwitch(active: boolean): Promise<KillSwitchState> {
  await delay(400)
  mockKillSwitch = {
    active,
    activated_at: active ? new Date().toISOString() : null,
    activated_by: active ? 'user:admin' : null,
  }
  return { ...mockKillSwitch }
}

export async function fetchSurfaces(): Promise<ConnectedSurface[]> {
  await delay()
  return mockSurfaces
}

export async function fetchPromptBaselines(): Promise<PromptBaseline[]> {
  await delay()
  return mockPromptBaselines
}

export async function fetchCicdRuns(): Promise<CicdRun[]> {
  await delay()
  return mockCicdRuns
}

export async function fetchAuditLog(): Promise<AuditEntry[]> {
  await delay(500)
  return mockAuditLog
}

export async function fetchConnectors(): Promise<ConnectorStatus[]> {
  await delay()
  return mockConnectors
}

export async function fetchAlignmentTrend(): Promise<AlignmentPoint[]> {
  await delay()
  return mockAlignmentTrend
}

export async function fetchModelProfiles(): Promise<ModelProfile[]> {
  await delay()
  return mockModelProfiles
}

export async function fetchCreativeAssets(): Promise<CreativeAsset[]> {
  await delay()
  return mockCreativeAssets
}

export async function fetchTrustDrift(): Promise<TrustDriftPoint[]> {
  await delay()
  return mockTrustDrift
}

export async function fetchManipulationFlags(): Promise<ManipulationFlag[]> {
  await delay()
  return mockManipulationFlags
}

export async function fetchRemediations(): Promise<RemediationItem[]> {
  await delay()
  return mockRemediations
}

export async function fetchActGatedItems(): Promise<ActGatedItem[]> {
  await delay()
  return mockActGatedItems
}

export async function approveActGated(id: string, justification: string): Promise<ActGatedItem> {
  await delay(600)
  const item = mockActGatedItems.find((i) => i.id === id)
  if (!item) throw new Error('Not found')
  item.status = 'approved'
  item.reviewer = 'user:admin'
  item.justification = justification
  item.reviewed_at = new Date().toISOString()
  return { ...item }
}

export async function rejectActGated(id: string, justification: string): Promise<ActGatedItem> {
  await delay(600)
  const item = mockActGatedItems.find((i) => i.id === id)
  if (!item) throw new Error('Not found')
  item.status = 'rejected'
  item.reviewer = 'user:admin'
  item.justification = justification
  item.reviewed_at = new Date().toISOString()
  return { ...item }
}
