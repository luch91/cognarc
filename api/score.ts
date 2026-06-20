import type { VercelRequest, VercelResponse } from '@vercel/node'

const TRIBE_ENDPOINT = process.env.GCP_TRIBE_ENDPOINT ?? ''
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX ?? '10', 10)
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '86400000', 10)

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

// --- ROI mapping (inlined from services/cognitive-scoring/src/tribe/roi-mapping.ts) ---

type VertexRange = [number, number]
interface ROIDef { name: string; vertex_ranges: VertexRange[] }

const ROI_MAP: Record<string, ROIDef[]> = {
  cognitive_load: [
    { name: 'dorsolateral prefrontal cortex', vertex_ranges: [[1200, 1800], [11442, 12042]] },
    { name: 'anterior cingulate cortex', vertex_ranges: [[800, 1100], [11040, 11340]] },
  ],
  comprehension_confidence: [
    { name: "Wernicke's area", vertex_ranges: [[3200, 3900]] },
    { name: 'left superior temporal gyrus', vertex_ranges: [[2900, 3500]] },
  ],
  emotional_valence: [
    { name: 'amygdala', vertex_ranges: [[4200, 4500], [14442, 14742]] },
    { name: 'ventromedial prefrontal cortex', vertex_ranges: [[600, 900], [10840, 11140]] },
  ],
  trust_coherence: [
    { name: 'medial prefrontal cortex', vertex_ranges: [[400, 750], [10640, 10990]] },
    { name: 'posterior cingulate cortex', vertex_ranges: [[5100, 5600], [15342, 15842]] },
  ],
}

function extractROI(activations: number[], rois: ROIDef[]): number {
  let sum = 0, count = 0
  for (const roi of rois) {
    for (const [start, end] of roi.vertex_ranges) {
      for (let v = start; v <= end && v < activations.length; v++) {
        sum += activations[v] ?? 0
        count++
      }
    }
  }
  return count > 0 ? sum / count : 0
}

function normalise(raw: number, baseline = 0.0, scale = 2.0): number {
  const sigmoid = 1 / (1 + Math.exp(-(raw - baseline) / scale))
  return Math.max(0, Math.min(100, Math.round(sigmoid * 100)))
}

function mapToCognitiveScore(prediction: { cortical_activations: number[]; model_version: string; latency_ms: number }) {
  const a = prediction.cortical_activations

  const cognitive_load = normalise(extractROI(a, ROI_MAP.cognitive_load))
  const comprehension_confidence = normalise(extractROI(a, ROI_MAP.comprehension_confidence))
  const emotional_valence = normalise(extractROI(a, ROI_MAP.emotional_valence))
  const trust_coherence = normalise(extractROI(a, ROI_MAP.trust_coherence))

  const limbicPrefrontalRatio = emotional_valence / Math.max(1, trust_coherence)
  const manipulation_risk = Math.max(0, Math.min(100, Math.round(
    Math.min(100, limbicPrefrontalRatio * 25) + (cognitive_load > 70 ? 10 : 0)
  )))

  const cognitive_risk = cognitive_load >= 70 ? 'HIGH' : cognitive_load >= 45 ? 'MEDIUM' : 'LOW'

  const ci = (v: number, w: number) => ({ low: Math.max(0, v - w), high: Math.min(100, v + w) })

  const regions = [
    { name: 'dorsolateral prefrontal cortex', val: a[1500] ?? 0 },
    { name: 'anterior cingulate cortex', val: a[950] ?? 0 },
    { name: "Wernicke's area", val: a[3500] ?? 0 },
    { name: 'amygdala', val: a[4350] ?? 0 },
    { name: 'ventromedial prefrontal cortex', val: a[750] ?? 0 },
    { name: 'posterior cingulate cortex', val: a[5350] ?? 0 },
  ]

  const parts = ['TRIBE v2 cortical surface analysis.']
  if (cognitive_load >= 70) parts.push('Elevated dorsolateral prefrontal activation indicates high cognitive load.')
  if (comprehension_confidence < 45) parts.push('Reduced left temporal activation suggests comprehension difficulty.')
  if (manipulation_risk >= 50) parts.push('High limbic-to-prefrontal ratio signals potential manipulation.')

  return {
    cognitive_load,
    comprehension_confidence,
    emotional_valence,
    trust_coherence,
    manipulation_risk,
    cognitive_risk,
    confidence_intervals: {
      cognitive_load: ci(cognitive_load, 6),
      comprehension_confidence: ci(comprehension_confidence, 6),
      manipulation_risk: ci(manipulation_risk, 5),
    },
    top_brain_regions: regions.sort((a, b) => b.val - a.val).slice(0, 3).map(r => r.name),
    explanation: parts.join(' '),
    model_version: prediction.model_version,
    latency_ms: prediction.latency_ms,
  }
}

// --- Handler ---

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method === 'GET') {
    res.status(200).json({ status: 'ok', engine: TRIBE_ENDPOINT ? 'tribe-gcp' : 'not-configured' })
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
        workspace_id: body.workspace_id ?? 'trial',
      }),
      signal: AbortSignal.timeout(290_000),
    })

    if (!tribeRes.ok) {
      const errBody = await tribeRes.text()
      res.status(tribeRes.status).json({
        error: `TRIBE inference error (${tribeRes.status})`,
        details: errBody,
      })
      return
    }

    const prediction = await tribeRes.json() as { cortical_activations: number[]; model_version: string; latency_ms: number }
    res.status(200).json(mapToCognitiveScore(prediction))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    res.status(500).json({ error: message })
  }
}
