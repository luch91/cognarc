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
      res.status(500).json({ error: message })
    }
  })

  return router
}
