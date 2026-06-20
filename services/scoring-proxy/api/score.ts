import type { VercelRequest, VercelResponse } from '@vercel/node'

const TRIBE_ENDPOINT = process.env.GCP_TRIBE_ENDPOINT ?? ''
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX ?? '10', 10)
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '86400000', 10) // 24h

const rateLimitStore = new Map<string, { count: number; reset: number }>()

function getRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)

  if (!entry || now > entry.reset) {
    rateLimitStore.set(ip, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 }
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 }
  }

  entry.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const keyJson = process.env.GCP_SERVICE_ACCOUNT_KEY
  if (!keyJson) return {}

  const { GoogleAuth } = await import('google-auth-library')
  const credentials = JSON.parse(keyJson) as Record<string, unknown>
  const auth = new GoogleAuth({ credentials, scopes: [] })
  const client = await auth.getIdTokenClient(TRIBE_ENDPOINT)
  const headers = await client.getRequestHeaders()
  return headers as Record<string, string>
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!TRIBE_ENDPOINT) {
    res.status(500).json({ error: 'TRIBE endpoint not configured' })
    return
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'unknown'
  const { allowed, remaining } = getRateLimit(ip)

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX.toString())
  res.setHeader('X-RateLimit-Remaining', remaining.toString())

  if (!allowed) {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Trial accounts are limited to ${RATE_LIMIT_MAX} scores per day. Contact us for higher limits.`,
    })
    return
  }

  const body = req.body as Record<string, unknown> | undefined
  if (!body || typeof body.content !== 'string' || !body.content.trim()) {
    res.status(400).json({ error: 'Missing required field: content' })
    return
  }

  try {
    const authHeaders = await getAuthHeaders()

    const mode = (body.mode as string) ?? 'accurate'
    const tribeRes = await fetch(`${TRIBE_ENDPOINT}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        stimulus_type: body.stimulus_type ?? 'text',
        content: body.content,
        modality: body.stimulus_type ?? 'text',
        mode,
      }),
      signal: AbortSignal.timeout(mode === 'fast' ? 60_000 : 120_000),
    })

    if (!tribeRes.ok) {
      const errBody = await tribeRes.text()
      res.status(tribeRes.status).json({
        error: `TRIBE inference error (${tribeRes.status})`,
        details: errBody,
      })
      return
    }

    const prediction = await tribeRes.json()
    res.status(200).json(prediction)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(500).json({ error: message })
  }
}
