import { Router, type Request, type Response } from 'express'
import { evaluatePrompt, type EvaluatorConfig } from './evaluator.js'
import { handleProxy } from './proxy.js'
import { globalRateLimiter } from './rateLimiter.js'
import type { EvaluatePromptRequest } from './types.js'

const PROXY_TARGETS = {
  openai: {
    upstreamBase: 'https://api.openai.com',
    authHeaderName: 'authorization',
    upstreamAuthHeader: 'authorization',
  },
  anthropic: {
    upstreamBase: 'https://api.anthropic.com',
    authHeaderName: 'x-api-key',
    upstreamAuthHeader: 'x-api-key',
  },
  gemini: {
    upstreamBase: 'https://generativelanguage.googleapis.com',
    authHeaderName: 'x-goog-api-key',
    upstreamAuthHeader: 'x-goog-api-key',
  },
} as const

export function createPromptGateRouter(evaluatorConfig: EvaluatorConfig): Router {
  const router = Router()

  // ── Direct evaluation ──────────────────────────────────────────────────────

  router.post('/evaluate-prompt', (req: Request, res: Response) => {
    const body = req.body as Partial<EvaluatePromptRequest>

    if (typeof body.prompt !== 'string' || body.prompt.trim() === '') {
      res.status(400).json({ error: 'prompt is required' })
      return
    }
    if (typeof body.workspace_id !== 'string' || body.workspace_id.trim() === '') {
      res.status(400).json({ error: 'workspace_id is required' })
      return
    }

    // Rate limit
    const rateResult = globalRateLimiter.consume(body.workspace_id)
    if (!rateResult.allowed) {
      const retryAfterSec = Math.ceil(rateResult.retryAfterMs / 1000)
      res.status(429).set('Retry-After', String(retryAfterSec)).json({
        error: 'Rate limit exceeded',
        retry_after_seconds: retryAfterSec,
      })
      return
    }

    void evaluatePrompt(body as EvaluatePromptRequest, evaluatorConfig).then(
      (result) => res.json(result),
      (err: unknown) => res.status(500).json({ error: err instanceof Error ? err.message : String(err) }),
    )
  })

  // ── Proxy endpoints ────────────────────────────────────────────────────────

  for (const [provider, target] of Object.entries(PROXY_TARGETS)) {
    router.all(`/proxy/${provider}/*`, (req: Request, res: Response) => {
      const workspaceId = (req.get('X-CognArc-Workspace-Id') ?? process.env['COGNARC_WORKSPACE_ID'] ?? 'default')
      void handleProxy(req, res, {
        ...target,
        evaluatorConfig,
        workspaceId,
      })
    })
  }

  // ── Health ─────────────────────────────────────────────────────────────────

  router.get('/prompt-gate/health', (_req, res) => {
    res.json({ status: 'ok', whitelist_size: evaluatorConfig.whitelist.size })
  })

  return router
}
