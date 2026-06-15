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
