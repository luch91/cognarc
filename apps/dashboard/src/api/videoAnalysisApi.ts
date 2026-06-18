import type { VideoAnalysisResult, VideoMomentFinding } from './types.js'

const VIDEO_ANALYSIS_URL = import.meta.env.VITE_VIDEO_ANALYSIS_URL ?? 'http://localhost:3007'

export async function analyzeVideo(
  filename: string,
  fileSizeBytes: number,
  durationEstimateSeconds = 30,
  workspaceId = 'ws-1',
): Promise<VideoAnalysisResult> {
  const res = await fetch(`${VIDEO_ANALYSIS_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename,
      file_size_bytes: fileSizeBytes,
      duration_estimate_seconds: durationEstimateSeconds,
      workspace_id: workspaceId,
    }),
  })
  if (!res.ok) throw new Error(`Video analysis failed: ${res.status}`)
  return res.json() as Promise<VideoAnalysisResult>
}

// Fallback used when the video-analysis service is unreachable
export function makeFallbackVideoAnalysis(filename: string): VideoAnalysisResult {
  const findings: VideoMomentFinding[] = [
    {
      timestamp_start: 0, timestamp_end: 8, component: 'Opening Hook', severity: 'warning',
      finding: 'Cognitive load spikes in first 8 seconds due to rapid scene cuts and dense text overlay.',
      recommendation: 'Slow the opening sequence and limit on-screen text to one claim per scene.',
      cognitive_load: 72, manipulation_risk: 38, trust_coherence: 64, attention_engagement: 80,
    },
    {
      timestamp_start: 8, timestamp_end: 16, component: 'Voiceover', severity: 'critical',
      finding: 'Voiceover uses urgency language that correlates with elevated manipulation risk.',
      recommendation: 'Replace urgency language with benefit-led copy focused on outcome, not scarcity.',
      cognitive_load: 65, manipulation_risk: 78, trust_coherence: 48, attention_engagement: 62,
      voiceover_segment: "Act now — only a limited number of spots remain. Don't miss this exclusive opportunity.",
    },
    {
      timestamp_start: 16, timestamp_end: 20, component: 'Scene Transition', severity: 'warning',
      finding: 'Trust coherence drops 12 points at the mid-roll scene transition.',
      recommendation: 'Use a visual bridge to maintain narrative continuity.',
      cognitive_load: 58, manipulation_risk: 42, trust_coherence: 52, attention_engagement: 55,
    },
    {
      timestamp_start: 20, timestamp_end: 26, component: 'Product Demo', severity: 'warning',
      finding: 'Attention engagement dips during product demo — no clear focal point.',
      recommendation: 'Add motion arrows or zoom-in to guide attention to key interface elements.',
      cognitive_load: 62, manipulation_risk: 31, trust_coherence: 61, attention_engagement: 44,
    },
    {
      timestamp_start: 26, timestamp_end: 30, component: 'CTA', severity: 'critical',
      finding: 'CTA overlay contains scarcity framing that triggers manipulation detection.',
      recommendation: 'Replace countdown timer with social proof to build trust without pressure.',
      cognitive_load: 55, manipulation_risk: 71, trust_coherence: 50, attention_engagement: 88,
    },
  ]

  return {
    filename,
    duration_seconds: 30,
    analysis_mode: 'demo',
    overall_cognitive_load: 62,
    overall_manipulation_risk: 52,
    overall_trust_coherence: 55,
    overall_attention_engagement: 66,
    cognitive_risk: 'HIGH',
    moment_findings: findings,
    rewrite_candidates: [
      "Act now — only a limited number of spots remain. Don't miss this exclusive opportunity.",
    ],
    recommended_actions: [
      'Rewrite the voiceover urgency language (see rewrite suggestions above)',
      'Add a focal point guide to the product demo sequence',
      'Align the scene transition visual to the benefit message',
    ],
  }
}
