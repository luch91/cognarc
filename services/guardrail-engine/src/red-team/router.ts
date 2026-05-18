import { Router, type Request, type Response } from 'express'
import { randomUUID } from 'crypto'
import { createFinding, getFinding, markRemediated, allFindings } from './findingStore.js'
import { globalMonitor, activateMonitorForFinding } from './monitor.js'
import { globalEvidenceGenerator } from './evidencePackage.js'
import { generateCoverageReport } from './coverageReport.js'
import type { ManipulationCategory } from '../manipulation/types.js'
import type { ManipulationDetection } from './types.js'

// In-memory detection store for evidence package generation
const detections = new Map<string, ManipulationDetection>()

function isManipulationCategory(v: unknown): v is ManipulationCategory {
  return typeof v === 'string' && [
    'false_urgency', 'social_proof_fabrication', 'ambiguity_exploitation',
    'authority_mimicry', 'sycophantic_drift', 'obfuscation',
  ].includes(v)
}

export function createRedTeamRouter(): Router {
  const router = Router()

  /**
   * POST /findings
   * Create a new finding (typically called by ManipulationScanner on hard block).
   */
  router.post('/findings', (req: Request, res: Response): void => {
    const { workspace_id, taxonomy_category, score, source_snippet, evidence_snippets } = req.body as {
      workspace_id?: string
      taxonomy_category?: unknown
      score?: number
      source_snippet?: string
      evidence_snippets?: string[]
    }

    if (!workspace_id) { res.status(400).json({ error: 'workspace_id required' }); return }
    if (!isManipulationCategory(taxonomy_category)) {
      res.status(400).json({ error: 'valid taxonomy_category required' }); return
    }
    if (typeof score !== 'number') { res.status(400).json({ error: 'score required' }); return }

    const finding = createFinding(
      workspace_id,
      {
        taxonomy_category,
        evidence_snippets: evidence_snippets ?? [],
        score_threshold: Math.max(30, score - 10),
      },
      score,
      source_snippet ?? '',
    )

    // Also create a detection record for evidence package generation
    const detection: ManipulationDetection = {
      id: randomUUID(),
      workspace_id,
      source_output: source_snippet ?? '',
      taxonomy_category,
      overall_score: score,
      evidence_snippets: evidence_snippets ?? [],
      detected_at: finding.created_at,
    }
    detections.set(detection.id, detection)

    res.status(201).json({ finding, detection_id: detection.id })
  })

  /**
   * POST /findings/:id/remediate
   * Mark a finding as remediated; activates the post-remediation monitor.
   */
  router.post('/findings/:id/remediate', (req: Request, res: Response): void => {
    const id = req.params['id'] ?? ''
    const { remediated_by } = req.body as { remediated_by?: string }

    const finding = getFinding(id)
    if (!finding) { res.status(404).json({ error: 'Finding not found' }); return }
    if (finding.status === 'closed') { res.status(409).json({ error: 'Finding is closed' }); return }

    const updated = markRemediated(id, remediated_by ?? 'unknown')
    if (!updated) { res.status(404).json({ error: 'Finding not found' }); return }

    try {
      activateMonitorForFinding(id, globalMonitor)
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Monitor activation failed' })
      return
    }

    res.json({ finding: updated, monitor_active: true })
  })

  /**
   * GET /findings/:id/status
   */
  router.get('/findings/:id/status', (req: Request, res: Response): void => {
    const finding = getFinding(req.params['id'] ?? '')
    if (!finding) { res.status(404).json({ error: 'Not found' }); return }

    res.json({
      id: finding.id,
      status: finding.status,
      pattern: finding.pattern,
      overall_score: finding.overall_score,
      re_emergences: finding.re_emergences,
      last_check: finding.last_check ?? null,
      monitor_active: globalMonitor.isActive(finding.id),
    })
  })

  /**
   * GET /findings
   * List all findings (with optional status filter).
   */
  router.get('/findings', (req: Request, res: Response): void => {
    const { status } = req.query as { status?: string }
    const list = allFindings().filter((f) => !status || f.status === status)
    res.json(list)
  })

  /**
   * POST /check-output
   * Run a new output string through all active monitors.
   */
  router.post('/check-output', async (req: Request, res: Response): Promise<void> => {
    const { output, workspace_id } = req.body as { output?: string; workspace_id?: string }
    if (!output) { res.status(400).json({ error: 'output required' }); return }
    if (!workspace_id) { res.status(400).json({ error: 'workspace_id required' }); return }

    const results = await globalMonitor.checkOutput(output, workspace_id)
    res.json({
      checked_monitors: results.length,
      re_emergences: results.filter((r) => r.re_emerged),
      results,
    })
  })

  /**
   * GET /coverage-report
   * Returns the weekly scale coverage report.
   */
  router.get('/coverage-report', (_req: Request, res: Response): void => {
    const report = generateCoverageReport()
    res.json(report)
  })

  /**
   * POST /evidence-package/:detectionId
   * Generate a neural evidence package for a detection.
   */
  router.post('/evidence-package/:detectionId', (req: Request, res: Response): void => {
    const detection = detections.get(req.params['detectionId'] ?? '')
    if (!detection) { res.status(404).json({ error: 'Detection not found' }); return }

    const pkg = globalEvidenceGenerator.generatePackage(detection)
    res.json(pkg)
  })

  return router
}
