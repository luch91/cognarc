import type { VercelRequest, VercelResponse } from '@vercel/node'

const PROXY_URL = process.env.SCORING_PROXY_URL ?? 'https://scoring-proxy.vercel.app'
const PROXY_SECRET = process.env.COGNARC_PROXY_SECRET ?? ''

export const config = { maxDuration: 310 }

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
    const upstreamRes = await fetch(`${PROXY_URL}/api/score-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CognArc-Key': PROXY_SECRET,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(305_000),
    })

    if (!upstreamRes.ok) {
      const errBody = await upstreamRes.text()
      res.status(upstreamRes.status).json({ error: errBody })
      return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const reader = upstreamRes.body?.getReader()
    if (!reader) { res.end(); return }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
    res.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scoring proxy unreachable'
    if (!res.headersSent) {
      res.status(502).json({ error: message })
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`)
      res.end()
    }
  }
}
