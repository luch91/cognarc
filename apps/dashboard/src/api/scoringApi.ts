import type { CognitiveScoreResponse, ScoringProvenance } from '@cognarc/types'
import type { CognitivRisk } from './types.js'

export interface LiveScoreResult extends CognitiveScoreResponse {
  cognitive_risk: CognitivRisk
  scoring_provenance: ScoringProvenance
}

export type ScoringMode = 'fast' | 'accurate'
export interface ScoringProgress { phase: string; percent: number; elapsed_s?: number }

const METRICS = ['cognitive_load', 'comprehension_confidence', 'emotional_valence', 'trust_coherence', 'manipulation_risk'] as const

// All dashboard score entry points consume the same strict transport contract.
// Refuse raw TRIBE activations, synthetic stubs and score objects without provenance.
export function parseScoreResult(payload: unknown): LiveScoreResult {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid scoring response: expected an object')
  const o = payload as Record<string, unknown>
  for (const key of METRICS) {
    const value = o[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error('Invalid scoring response: ' + key)
    }
  }
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(String(o.cognitive_risk)) ||
      typeof o.model_version !== 'string' || !o.model_version.trim() ||
      o.model_version.toLowerCase().includes('stub') ||
      typeof o.explanation !== 'string' ||
      typeof o.latency_ms !== 'number' || !Number.isFinite(o.latency_ms) || o.latency_ms < 0 ||
      !Array.isArray(o.top_brain_regions) || !o.top_brain_regions.every(x => typeof x === 'string')) {
    throw new Error('Invalid scoring response: result metadata')
  }
  const provenance = o.scoring_provenance
  if (!provenance || typeof provenance !== 'object') throw new Error('Invalid scoring response: provenance is missing')
  const p = provenance as Record<string, unknown>
  if (!['mathematical', 'tribe', 'mock'].includes(String(p.engine)) ||
      !['uncalibrated', 'validated'].includes(String(p.calibration_status)) ||
      typeof p.policy_eligible !== 'boolean' || typeof p.neural_evidence !== 'boolean' ||
      !['linguistic_heuristics','predicted_cortical_activations','synthetic_test_data'].includes(String(p.evidence_type)) ||
      (p.fallback_used === true && (p.engine !== 'mathematical' ||
        !['TRIBE_TIMEOUT','TRIBE_UNAVAILABLE','TRIBE_INVALID_OUTPUT'].includes(String(p.fallback_reason))))) {
    throw new Error('Invalid scoring response: provenance fields')
  }
  // Mock scores cannot be accepted as real evaluations.
  if (p.engine === 'mock') throw new Error('Synthetic test scores cannot be displayed as live evaluations')
  if (p.engine === 'mathematical' && (p.neural_evidence !== false || p.policy_eligible !== false)) {
    throw new Error('Invalid CME provenance: mathematical scores are uncalibrated')
  }
  if (p.engine === 'tribe' && p.evidence_type !== 'predicted_cortical_activations') {
    throw new Error('Invalid TRIBE provenance')
  }
  return payload as LiveScoreResult
}

async function readResponse(res: Response): Promise<LiveScoreResult> {
  if (!res.ok) {
    const body = await res.text()
    throw new Error('Scoring unavailable (' + res.status + '): ' + body.slice(0, 250))
  }
  return parseScoreResult(await res.json())
}

function postBody(text: string, mode: ScoringMode, workspaceId: string) {
  return JSON.stringify({ stimulus_type: 'text', content: text, workspace_id: workspaceId, mode })
}

export async function scoreText(text: string, workspaceId = 'ws-1'): Promise<LiveScoreResult> {
  const res = await fetch('/api/score', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: postBody(text, 'accurate', workspaceId),
    signal: AbortSignal.timeout(110_000),
  })
  return readResponse(res)
}

export async function scoreTextRemote(text: string, mode: ScoringMode = 'accurate'): Promise<LiveScoreResult> {
  const res = await fetch('/api/score', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: postBody(text, mode, 'ws-1'),
    signal: AbortSignal.timeout(110_000),
  })
  return readResponse(res)
}

// SSE is parsed by message boundaries, not by chunk lines. Network packets may
// split "event:" and "data:" across reads; never lose or mislabel a result.
export async function scoreTextStream(
  text: string,
  onProgress: (progress: ScoringProgress) => void,
  mode: ScoringMode = 'accurate',
): Promise<LiveScoreResult> {
  const res = await fetch('/api/score-stream', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: postBody(text, mode, 'ws-1'),
    signal: AbortSignal.timeout(110_000),
  })
  if (!res.ok) throw new Error('Scoring stream unavailable (' + res.status + '): ' + (await res.text()).slice(0, 250))
  const reader = res.body?.getReader()
  if (!reader) throw new Error('Scoring stream response is unreadable')
  let buffer = ''
  let result: LiveScoreResult | null = null
  const decoder = new TextDecoder()
  function consume(message: string) {
    const fields = message.split('\n')
    const event = fields.find(line => line.startsWith('event:'))?.slice(6).trim() ?? ''
    const data = fields.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (!data) return
    const payload: unknown = JSON.parse(data)
    if (event === 'result') result = parseScoreResult(payload)
    else if (event === 'progress') {
      const p = payload as ScoringProgress
      if (typeof p.phase === 'string' && Number.isFinite(p.percent)) onProgress(p)
    } else if (event === 'error') {
      const reason = payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as {error:unknown}).error) : 'Stream failed'
      throw new Error(reason)
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let at: number
      while ((at = buffer.indexOf('\n\n')) >= 0) {
        consume(buffer.slice(0, at))
        buffer = buffer.slice(at + 2)
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) consume(buffer.trim())
  } finally {
    reader.releaseLock()
  }
  if (!result) throw new Error('Scoring stream ended without a validated result')
  return result
}
