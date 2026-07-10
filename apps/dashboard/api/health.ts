import type { VercelRequest, VercelResponse } from '@vercel/node'

const PROXY_URL = process.env.SCORING_PROXY_URL ?? 'https://scoring-proxy.vercel.app'
const PROXY_SECRET = process.env.COGNARC_PROXY_SECRET ?? ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  try {
    const upstream = await fetch(`${PROXY_URL}/api/health`, {
      headers: { 'X-CognArc-Key': PROXY_SECRET },
      signal: AbortSignal.timeout(8_000),
    })
    if (!upstream.ok) throw new Error(`proxy returned ${upstream.status}`)
    res.status(200).json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unreachable'
    res.status(502).json({ ok: false, error: message })
  }
}
