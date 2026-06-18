import type { CognitivRisk } from './types.js'

export interface LiveScoreResult {
  cognitive_load: number
  comprehension_confidence: number
  emotional_valence: number
  trust_coherence: number
  manipulation_risk: number
  cognitive_risk: CognitivRisk
  top_brain_regions: string[]
  explanation: string
  model_version: string
  latency_ms: number
}

export async function scoreText(text: string, workspaceId = 'ws-dashboard'): Promise<LiveScoreResult> {
  const res = await fetch('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stimulus_type: 'text', content: text, workspace_id: workspaceId }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Scoring failed (${res.status}): ${body}`)
  }
  return res.json() as Promise<LiveScoreResult>
}

const SCORING_PROXY_URL = (import.meta.env.VITE_SCORING_PROXY_URL as string | undefined) ?? ''

export function getScoringProxyUrl(): string {
  return SCORING_PROXY_URL
}

export async function scoreTextRemote(text: string): Promise<LiveScoreResult> {
  if (!SCORING_PROXY_URL) {
    throw new Error('Scoring proxy not configured — set VITE_SCORING_PROXY_URL')
  }

  const res = await fetch(`${SCORING_PROXY_URL}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stimulus_type: 'text', content: text, workspace_id: 'trial' }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Scoring failed (${res.status}): ${body}`)
  }
  return res.json() as Promise<LiveScoreResult>
}
