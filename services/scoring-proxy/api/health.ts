import type { VercelRequest, VercelResponse } from '@vercel/node'

const PROXY_SECRET = process.env.COGNARC_PROXY_SECRET ?? ''

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://cognarc-dashboard.vercel.app')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CognArc-Key')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  if (PROXY_SECRET && req.headers['x-cognarc-key'] !== PROXY_SECRET) {
    res.status(401).json({ ok: false, error: 'Unauthorized' })
    return
  }

  res.status(200).json({ ok: true, service: 'scoring-proxy' })
}
