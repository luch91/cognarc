import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import type { ScoringEngine } from '../engines/ScoringEngine.js'

const ScoreRequestSchema = z.object({
  stimulus_type: z.enum(['text', 'image', 'audio', 'video']),
  content: z.string().min(1),
  workspace_id: z.string().min(1),
  options: z
    .object({
      manipulation_check: z.boolean().optional(),
      population_model: z.boolean().optional(),
      async: z.boolean().optional(),
    })
    .optional(),
})

export function createScoreRouter(engine: ScoringEngine): Router {
  const router = Router()

  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const secret = process.env.COGNARC_SCORING_SERVICE_SECRET
    if (secret && req.header('x-cognarc-key') !== secret) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    // Restrict anonymous scoring in deployed environments. Other internal
    // services must send the same configured service secret.
    if (process.env.NODE_ENV === 'production' && !secret) {
      res.status(503).json({ error: 'Scoring service authentication not configured' })
      return
    }
    const parsed = ScoreRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
      return
    }

    try {
      const result = await engine.score(parsed.data as Parameters<typeof engine.score>[0])
      res.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal scoring error'
      const unsupported = message.startsWith('CME_UNSUPPORTED_MODALITY')
      const invalid = message.startsWith('CME_EMPTY_INPUT')
      res.status(unsupported ? 422 : invalid ? 400 : 500).json({ error: message })
    }
  })

  return router
}
