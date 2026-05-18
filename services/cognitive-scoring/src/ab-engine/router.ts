import { Router, type Request, type Response } from 'express'
import { randomUUID } from 'crypto'
import type { ScoringEngine } from '../engines/ScoringEngine.js'
import { ABComparisonEngine } from './engine.js'
import { createJob, completeJob, failJob, getJob } from './jobStore.js'
import type { Stimulus, StimulusType } from './types.js'

// Synchronous inputs (text) return immediately.
// Async inputs (image, html, url) return a job_id and run in background.
const ASYNC_TYPES = new Set<StimulusType>(['image', 'html', 'url'])

export function createABRouter(scorer: ScoringEngine): Router {
  const router = Router()
  const engine = new ABComparisonEngine(scorer)

  /**
   * POST /ab-compare
   *
   * Body (JSON):
   *   {
   *     variant_a: { type: "text"|"image"|"html"|"url", content: string, label?: string }
   *     variant_b: { type: "text"|"image"|"html"|"url", content: string, label?: string }
   *     workspace_id?: string
   *   }
   *
   * For image inputs, content should be base64-encoded PNG/JPG.
   * For html/url inputs, content is the HTML string or URL.
   *
   * Returns:
   *   - 200 { status: "complete", ...ABComparisonResult } for synchronous (text) inputs
   *   - 202 { status: "pending", job_id: string } for async inputs
   */
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const { variant_a, variant_b, workspace_id } = req.body as {
      variant_a?: Partial<Stimulus>
      variant_b?: Partial<Stimulus>
      workspace_id?: string
    }

    const validationError = validateStimulusInput(variant_a, 'variant_a')
      ?? validateStimulusInput(variant_b, 'variant_b')

    if (validationError) {
      res.status(400).json({ error: validationError })
      return
    }

    const stimA = variant_a as Stimulus
    const stimB = variant_b as Stimulus
    const wsId = workspace_id ?? 'ab-engine'

    const isAsync = ASYNC_TYPES.has(stimA.type) || ASYNC_TYPES.has(stimB.type)

    if (!isAsync) {
      // Synchronous path — text inputs resolve quickly
      try {
        const result = await engine.compare(stimA, stimB, wsId)
        res.json(result)
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Comparison failed' })
      }
      return
    }

    // Async path — return job ID immediately, run in background
    const jobId = randomUUID()
    createJob(jobId)
    res.status(202).json({ status: 'pending', job_id: jobId })

    // Fire-and-forget — errors are stored in job record
    engine.compare(stimA, stimB, wsId).then(
      (result) => completeJob(jobId, { ...result, job_id: jobId }),
      (err: unknown) => failJob(jobId, err instanceof Error ? err.message : 'Unknown error'),
    )
  })

  /**
   * GET /ab-compare/jobs/:jobId
   * Poll for async job status.
   */
  router.get('/jobs/:jobId', (req: Request, res: Response): void => {
    const job = getJob(req.params['jobId'] ?? '')
    if (!job) {
      res.status(404).json({ error: 'Job not found' })
      return
    }

    if (job.status === 'pending') {
      res.status(202).json({ status: 'pending', job_id: job.id, created_at: job.created_at })
      return
    }

    if (job.status === 'error') {
      res.status(500).json({ status: 'error', job_id: job.id, error: job.error })
      return
    }

    res.json({ status: 'complete', job_id: job.id, ...job.result })
  })

  /**
   * GET /ab-compare/health
   */
  router.get('/health', (_req: Request, res: Response): void => {
    res.json({ status: 'ok', engine: scorer.engineName })
  })

  return router
}

function validateStimulusInput(s: Partial<Stimulus> | undefined, field: string): string | null {
  if (!s) return `${field} is required`
  if (!s.type) return `${field}.type is required`
  if (!['text', 'image', 'html', 'url'].includes(s.type)) {
    return `${field}.type must be one of: text, image, html, url`
  }
  if (!s.content && s.content !== '') return `${field}.content is required`
  return null
}
