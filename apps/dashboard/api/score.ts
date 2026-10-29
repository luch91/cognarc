import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyWorkspaceRequest } from './_auth.js'

// Thin deployment adapter. This file deliberately contains no TRIBE or CME logic.
// Cloudflare Pages Functions can replace it without changing the browser contract.
const SERVICE_URL = process.env.COGNARC_SCORING_URL ?? ''
const SERVICE_SECRET = process.env.COGNARC_SCORING_SERVICE_SECRET ?? ''
const TIMEOUT_MS = 100_000

function validScore(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  for (const key of ['cognitive_load', 'comprehension_confidence', 'emotional_valence', 'trust_coherence', 'manipulation_risk']) {
    if (typeof v[key] !== 'number' || !Number.isFinite(v[key]) || (v[key] as number) < 0 || (v[key] as number) > 100) return false
  }
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(String(v.cognitive_risk)) || !Array.isArray(v.top_brain_regions) || typeof v.model_version !== 'string' || v.model_version.toLowerCase().includes('stub')) return false
  if (!v.scoring_provenance || typeof v.scoring_provenance !== 'object') return false
  const p = v.scoring_provenance as Record<string, unknown>
  return ['mathematical', 'tribe', 'mock'].includes(String(p.engine)) &&
    ['uncalibrated', 'validated'].includes(String(p.calibration_status)) &&
    typeof p.policy_eligible === 'boolean' && typeof p.neural_evidence === 'boolean'
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  if (!SERVICE_URL || !SERVICE_SECRET) { res.status(503).json({ error: 'Canonical scoring service is not configured' }); return }
  const access = await verifyWorkspaceRequest(req)
  if (!access.ok) { res.status(access.status).json({ error: access.error }); return }
  const body = req.body as Record<string, unknown> | undefined
  if (!body || typeof body.content !== 'string' || !body.content.trim() || body.content.length > 20_000 ||
      !['text','image','audio','video'].includes(String(body.stimulus_type)) ||
      typeof body.workspace_id !== 'string' || !body.workspace_id.trim()) {
    res.status(400).json({ error: 'Invalid scoring request' }); return
  }
  try {
    const upstream = await fetch(SERVICE_URL.replace(/\/$/, '') + '/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CognArc-Key': SERVICE_SECRET },
      body: JSON.stringify({ ...body, workspace_id: access.workspaceId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!upstream.ok) { res.status(upstream.status).json({ error: 'Canonical scoring service returned ' + upstream.status }); return }
    const data: unknown = await upstream.json()
    if (!validScore(data)) { res.status(502).json({ error: 'Invalid canonical scoring response' }); return }
    res.status(200).json(data)
  } catch (error) {
    const timedOut = error instanceof Error && /abort|timeout/i.test(error.message)
    res.status(timedOut ? 504 : 502).json({ error: timedOut ? 'Canonical scoring request timed out' : 'Canonical scoring service unavailable' })
  }
}
