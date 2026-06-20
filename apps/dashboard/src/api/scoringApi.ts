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
  const baseUrl = SCORING_PROXY_URL || ''
  const endpoint = baseUrl ? `${baseUrl}/api/score` : '/api/score'

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stimulus_type: 'text', content: text, workspace_id: 'trial' }),
    signal: AbortSignal.timeout(310_000),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Scoring failed (${res.status}): ${body}`)
  }
  return res.json() as Promise<LiveScoreResult>
}

export interface ScoringProgress { phase: string; percent: number; elapsed_s?: number }

export async function scoreTextStream(
  text: string,
  onProgress: (progress: ScoringProgress) => void,
): Promise<LiveScoreResult> {
  const baseUrl = SCORING_PROXY_URL || ''
  const endpoint = baseUrl ? `${baseUrl}/api/score-stream` : '/api/score-stream'

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stimulus_type: 'text', content: text, workspace_id: 'trial' }),
    signal: AbortSignal.timeout(310_000),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Scoring failed (${res.status}): ${body}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('Response body is not readable')

  const decoder = new TextDecoder()
  let buffer = ''
  let result: LiveScoreResult | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    let eventType = ''
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6))
        if (eventType === 'progress') onProgress(data as ScoringProgress)
        else if (eventType === 'result') result = data as LiveScoreResult
        else if (eventType === 'error') throw new Error((data as { error: string }).error)
      }
    }
  }

  if (!result) throw new Error('No result received from scoring stream')
  return result
}
