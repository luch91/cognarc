import type { VercelRequest, VercelResponse } from '@vercel/node'
const SERVICE_URL = process.env.COGNARC_SCORING_URL ?? ''
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') { res.status(405).json({ ok: false, error: 'Method not allowed' }); return }
  if (!SERVICE_URL) { res.status(503).json({ ok: false, error: 'Canonical scoring service is not configured' }); return }
  try {
    const upstream = await fetch(SERVICE_URL.replace(/\/$/, '') + '/health', { signal: AbortSignal.timeout(5_000) })
    const payload: unknown = upstream.ok ? await upstream.json() : null
    if (!upstream.ok || !payload || typeof payload !== 'object' || (payload as {status?:string}).status !== 'ok') {
      res.status(503).json({ ok: false, error: 'Canonical scoring service unhealthy' }); return
    }
    res.status(200).json({ ok: true, service: 'cognitive-scoring', engine: (payload as {engine?:string}).engine ?? 'unknown' })
  } catch {
    res.status(503).json({ ok: false, error: 'Canonical scoring service unreachable' })
  }
}
