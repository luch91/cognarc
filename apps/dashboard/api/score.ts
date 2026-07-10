import type { VercelRequest, VercelResponse } from '@vercel/node'

const PROXY_URL = process.env.SCORING_PROXY_URL ?? 'https://scoring-proxy.vercel.app'
const PROXY_SECRET = process.env.COGNARC_PROXY_SECRET ?? ''

export const config = { maxDuration: 120 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const body = req.body as Record<string, unknown> | undefined
  if (!body || typeof body.content !== 'string' || !body.content.trim()) {
    res.status(400).json({ error: 'Missing required field: content' })
    return
  }

  try {
    const upstreamRes = await fetch(`${PROXY_URL}/api/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CognArc-Key': PROXY_SECRET,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(115_000),
    })

    const data = await upstreamRes.json()
    res.status(upstreamRes.status).json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scoring proxy unreachable'
    res.status(502).json({ error: message })
  }
}
