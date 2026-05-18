import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import type { TrustGradientEngine } from '../TrustGradientEngine.js'
import type { AuditLog } from '../AuditLog.js'
import type { GlobalKillSwitch } from '../GlobalKillSwitch.js'
import type { ActGatedWorkflow } from '../ActGatedWorkflow.js'

interface Deps {
  engine: TrustGradientEngine
  auditLog: AuditLog
  killSwitch: GlobalKillSwitch
  actGated: ActGatedWorkflow
}

const ClassifySchema = z.object({
  action: z.string(),
  workspace_id: z.string(),
})

export function createRouter(deps: Deps): Router {
  const router = Router()

  router.post('/classify', async (req: Request, res: Response): Promise<void> => {
    const parsed = ClassifySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
      return
    }
    try {
      const zone = deps.engine.classify(
        parsed.data.action as Parameters<typeof deps.engine.classify>[0],
        { workspace_id: parsed.data.workspace_id },
      )
      res.json({ zone })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Classification error'
      res.status(400).json({ error: message })
    }
  })

  router.get('/audit', async (req: Request, res: Response): Promise<void> => {
    try {
      const entries = await deps.auditLog.query({
        workspace_id: req.query['workspace_id'] as string | undefined,
        limit: req.query['limit'] !== undefined ? Number(req.query['limit']) : undefined,
      })
      res.json(entries)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Query error'
      res.status(500).json({ error: message })
    }
  })

  router.post('/kill-switch/:workspaceId/activate', async (req: Request, res: Response): Promise<void> => {
    await deps.killSwitch.activate(req.params['workspaceId'] ?? '')
    res.json({ status: 'activated' })
  })

  router.post('/kill-switch/:workspaceId/deactivate', async (req: Request, res: Response): Promise<void> => {
    const { humanId } = req.body as { humanId?: string }
    if (!humanId) {
      res.status(400).json({ error: 'humanId required' })
      return
    }
    await deps.killSwitch.deactivate(req.params['workspaceId'] ?? '', humanId)
    res.json({ status: 'deactivated' })
  })

  router.get('/kill-switch/:workspaceId', async (req: Request, res: Response): Promise<void> => {
    const active = await deps.killSwitch.isActiveAsync(req.params['workspaceId'] ?? '')
    res.json({ active })
  })

  router.post('/approvals', (req: Request, res: Response): void => {
    const { action, evidence, alternatives } = req.body as {
      action?: string
      evidence?: unknown
      alternatives?: string[]
    }
    if (!action) {
      res.status(400).json({ error: 'action required' })
      return
    }
    const pkg = deps.actGated.createDecisionPackage(
      action as Parameters<typeof deps.actGated.createDecisionPackage>[0],
      evidence,
      alternatives ?? [],
    )
    const approvalRequestId = deps.actGated.submitForApproval(pkg)
    res.json({ approvalRequestId, package: pkg })
  })

  router.post('/approvals/:id/approve', (req: Request, res: Response): void => {
    const { humanId } = req.body as { humanId?: string }
    if (!humanId) {
      res.status(400).json({ error: 'humanId required' })
      return
    }
    try {
      deps.actGated.approve(req.params['id'] ?? '', humanId)
      res.json({ status: 'approved' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Approval error'
      res.status(400).json({ error: message })
    }
  })

  router.post('/approvals/:id/reject', (req: Request, res: Response): void => {
    const { humanId, reason } = req.body as { humanId?: string; reason?: string }
    if (!humanId || !reason) {
      res.status(400).json({ error: 'humanId and reason required' })
      return
    }
    try {
      deps.actGated.reject(req.params['id'] ?? '', humanId, reason)
      res.json({ status: 'rejected' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rejection error'
      res.status(400).json({ error: message })
    }
  })

  return router
}
