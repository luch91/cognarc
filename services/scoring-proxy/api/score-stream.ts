import type { VercelRequest, VercelResponse } from '@vercel/node'

const TRIBE_ENDPOINT = process.env.GCP_TRIBE_ENDPOINT ?? ''

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

const PHASES = [
  { t: 0,  msg: 'Authenticating with Cloud Run…' },
  { t: 2,  msg: 'Request accepted — warming inference engine…' },
  { t: 8,  msg: 'Loading model weights to GPU…' },
  { t: 18, msg: 'Running tri-modal inference pipeline…' },
  { t: 30, msg: 'Computing cortical surface predictions…' },
  { t: 45, msg: 'Mapping ROI activations to cognitive dimensions…' },
  { t: 60, msg: 'Generating confidence intervals…' },
  { t: 90, msg: 'Still processing — large stimulus may take longer…' },
]

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  if (!TRIBE_ENDPOINT) { res.status(500).json({ error: 'TRIBE endpoint not configured' }); return }

  const body = req.body as Record<string, unknown> | undefined
  if (!body || typeof body.content !== 'string' || !body.content.trim()) {
    res.status(400).json({ error: 'Missing required field: content' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  function sendEvent(type: string, data: unknown) {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  sendEvent('progress', { phase: PHASES[0]!.msg, percent: 0 })

  const startTime = Date.now()
  let phaseIndex = 1
  const phaseTimer = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000
    while (phaseIndex < PHASES.length && PHASES[phaseIndex]!.t <= elapsed) {
      const phase = PHASES[phaseIndex]!
      const percent = Math.min(90, Math.round((elapsed / 120) * 90))
      sendEvent('progress', { phase: phase.msg, percent, elapsed_s: Math.round(elapsed) })
      phaseIndex++
    }
  }, 2000)

  try {
    const authHeaders = await getAuthHeaders()
    sendEvent('progress', { phase: 'Request accepted — warming inference engine…', percent: 5, elapsed_s: Math.round((Date.now() - startTime) / 1000) })

    const tribeRes = await fetch(`${TRIBE_ENDPOINT}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        stimulus_type: body.stimulus_type ?? 'text',
        content: body.content,
        modality: body.stimulus_type ?? 'text',
      }),
      signal: AbortSignal.timeout(300_000),
    })

    clearInterval(phaseTimer)

    if (!tribeRes.ok) {
      const errBody = await tribeRes.text()
      sendEvent('error', { error: `Inference error (${tribeRes.status})`, details: errBody })
      res.end()
      return
    }

    const prediction = await tribeRes.json()
    sendEvent('progress', { phase: 'Scoring complete', percent: 100, elapsed_s: Math.round((Date.now() - startTime) / 1000) })
    sendEvent('result', prediction)
    res.end()
  } catch (err) {
    clearInterval(phaseTimer)
    const message = err instanceof Error ? err.message : 'Internal server error'
    sendEvent('error', { error: message })
    res.end()
  }
}
