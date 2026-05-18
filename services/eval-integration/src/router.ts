import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { scoreCognitive } from './scorer.js'
import { checkRegression, upsertBaseline, getBaseline, deleteBaseline } from './regressionGate.js'

const EvalScoreSchema = z.object({
  output: z.string().min(1),
  input: z.string().optional(),
  context: z.record(z.unknown()).optional(),
  workspace_id: z.string().min(1),
})

const RegressionCheckSchema = z.object({
  prompt_id: z.string().min(1),
  output: z.string().min(1),
  input: z.string().optional(),
  workspace_id: z.string().min(1),
})

const BaselineUpsertSchema = z.object({
  prompt_id: z.string().min(1),
  cognitive_load: z.number().int().min(0).max(100),
  comprehension_confidence: z.number().int().min(0).max(100),
})

export function createEvalRouter(): Router {
  const router = Router()

  /**
   * POST /score
   * Generic cognitive scoring endpoint for any eval platform.
   */
  router.post('/score', async (req: Request, res: Response): Promise<void> => {
    const parse = EvalScoreSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ error: parse.error.flatten() })
      return
    }

    try {
      const { output, workspace_id, input, context } = parse.data
      const scoreReq: import('./types.js').EvalScoreRequest = { output, workspace_id }
      if (input !== undefined) scoreReq.input = input
      if (context !== undefined) scoreReq.context = context
      const result = await scoreCognitive(scoreReq)
      res.json(result)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Scoring failed' })
    }
  })

  /**
   * POST /regression/check
   * Checks current scores against stored baseline. Records baseline on first call.
   */
  router.post('/regression/check', async (req: Request, res: Response): Promise<void> => {
    const parse = RegressionCheckSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ error: parse.error.flatten() })
      return
    }

    const { prompt_id, workspace_id, output, input } = parse.data
    const scoreReq: import('./types.js').EvalScoreRequest = { output, workspace_id }
    if (input !== undefined) scoreReq.input = input

    try {
      const result = await checkRegression(prompt_id, scoreReq)
      const status = result.regressed ? 422 : 200
      res.status(status).json(result)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Regression check failed' })
    }
  })

  /**
   * POST /regression/baseline
   * Manually set a baseline for a prompt_id.
   */
  router.post('/regression/baseline', (req: Request, res: Response): void => {
    const parse = BaselineUpsertSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ error: parse.error.flatten() })
      return
    }

    const { prompt_id, cognitive_load, comprehension_confidence } = parse.data
    const baseline = upsertBaseline(prompt_id, cognitive_load, comprehension_confidence)
    res.status(201).json(baseline)
  })

  /**
   * GET /regression/baseline/:promptId
   */
  router.get('/regression/baseline/:promptId', (req: Request, res: Response): void => {
    const baseline = getBaseline(req.params['promptId'] ?? '')
    if (!baseline) {
      res.status(404).json({ error: 'Baseline not found' })
      return
    }
    res.json(baseline)
  })

  /**
   * DELETE /regression/baseline/:promptId
   */
  router.delete('/regression/baseline/:promptId', (req: Request, res: Response): void => {
    const id = req.params['promptId'] ?? ''
    if (!getBaseline(id)) {
      res.status(404).json({ error: 'Baseline not found' })
      return
    }
    deleteBaseline(id)
    res.status(204).end()
  })

  /**
   * GET /health
   */
  router.get('/health', (_req: Request, res: Response): void => {
    res.json({ status: 'ok', service: 'eval-integration' })
  })

  return router
}
