import type { VercelRequest, VercelResponse } from '@vercel/node'

// Same canonical /score endpoint as the synchronous adapter.
// SSE stages indicate observed request lifecycle, never invented model activity.
const SERVICE_URL = process.env.COGNARC_SCORING_URL ?? ''
const SERVICE_SECRET = process.env.COGNARC_SCORING_SERVICE_SECRET ?? ''

function validScore(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  for (const key of ['cognitive_load', 'comprehension_confidence', 'emotional_valence', 'trust_coherence', 'manipulation_risk']) {
    if (typeof v[key] !== 'number' || !Number.isFinite(v[key]) || (v[key] as number) < 0 || (v[key] as number) > 100) return false
  }
  const p = v.scoring_provenance as Record<string, unknown> | undefined
  return ['LOW','MEDIUM','HIGH'].includes(String(v.cognitive_risk)) &&
    Array.isArray(v.top_brain_regions) &&
    typeof v.model_version === 'string' && !v.model_version.toLowerCase().includes('stub') &&
    !!p && ['mathematical','tribe','mock'].includes(String(p.engine)) &&
    ['uncalibrated','validated'].includes(String(p.calibration_status)) &&
    typeof p.policy_eligible === 'boolean' && typeof p.neural_evidence === 'boolean'
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  if (!process.env.COGNARC_PROXY_SECRET || req.headers['x-cognarc-key'] !== process.env.COGNARC_PROXY_SECRET) { res.status(401).json({ error: 'Unauthorized' }); return }
  if (!SERVICE_URL || !SERVICE_SECRET) { res.status(503).json({ error: 'Canonical scoring service is not configured' }); return }
  const body = req.body as Record<string, unknown> | undefined
  if (!body || typeof body.content !== 'string' || !body.content.trim() ||
      !['text','image','audio','video'].includes(String(body.stimulus_type)) ||
      typeof body.workspace_id !== 'string' || !body.workspace_id.trim()) {
    res.status(400).json({ error: 'Invalid scoring request' }); return
  }
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Connection', 'keep-alive')
  function emit(type: string, data: unknown) {
    res.write('event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n')
  }
  emit('progress', { phase: 'Request submitted to canonical scoring service', percent: 5 })
  try {
    const upstream = await fetch(SERVICE_URL.replace(/\/$/, '') + '/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CognArc-Key': SERVICE_SECRET },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(100_000),
    })
    if (!upstream.ok) { emit('error', { error: 'Canonical scoring service returned ' + upstream.status }); res.end(); return }
    const data: unknown = await upstream.json()
    if (!validScore(data)) { emit('error', { error: 'Invalid canonical scoring response' }); res.end(); return }
    emit('progress', { phase: 'Scoring response verified', percent: 100 })
    emit('result', data)
  } catch (error) {
    const timedOut = error instanceof Error && /abort|timeout/i.test(error.message)
    emit('error', { error: timedOut ? 'Canonical scoring timed out' : 'Canonical scoring service unavailable' })
  }
  res.end()
}
