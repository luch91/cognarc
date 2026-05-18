import { randomUUID } from 'crypto'
import type {
  ValidationReport,
  BenchmarkResult,
  RunId,
  UserId,
  ApprovedRun,
  PromotionPayload,
} from './types.js'
import { UnapprovedRunError } from './humanApprovalGate.js'
import type { HumanApprovalGate } from './humanApprovalGate.js'
import type { FineTuningGovernanceAudit } from './governanceAudit.js'

// Minimum Pearson r required to avoid quarantine
const QUARANTINE_THRESHOLD = 0.70

// In-memory validation report store (append-only)
const reports = new Map<RunId, ValidationReport>()

// Baseline Pearson r from Phase 1 (read-only, set at service init)
let phase1BaselinePearsonR = 0.85

export function setPhase1Baseline(pearsonR: number): void {
  phase1BaselinePearsonR = pearsonR
}

// ─── PostRunValidator ─────────────────────────────────────────────────────────

export class PostRunValidator {
  constructor(
    private readonly approvalGate: HumanApprovalGate,
    private readonly governanceAudit: FineTuningGovernanceAudit,
  ) {}

  /**
   * Validate a completed fine-tuning run.
   *
   * GUARDRAILS:
   *   1. Run must have an approval record (cannot bypass).
   *   2. If new Pearson r < 0.70: model is automatically quarantined.
   *   3. Production promotion requires a separate human approval call.
   *
   * Returns the ValidationReport.
   */
  validateRun(runId: RunId, benchmark: BenchmarkResult): ValidationReport {
    const approvedRun = this.approvalGate.getApprovedRun(runId)
    if (!approvedRun) throw new UnapprovedRunError(runId)

    const quarantined = benchmark.pearson_r < QUARANTINE_THRESHOLD
    let quarantine_reason: string | undefined

    if (quarantined) {
      quarantine_reason =
        `Pearson r ${benchmark.pearson_r.toFixed(3)} is below quarantine threshold ${QUARANTINE_THRESHOLD}. ` +
        `Model quarantined automatically. Human review required before any further action.`
      this.approvalGate.updateRunStatus(runId, 'quarantined')
    }

    const report: ValidationReport = {
      run_id: runId,
      baseline_pearson_r: phase1BaselinePearsonR,
      new_pearson_r: benchmark.pearson_r,
      delta: Math.round((benchmark.pearson_r - phase1BaselinePearsonR) * 10000) / 10000,
      benchmark,
      quarantined,
      status: quarantined ? 'quarantined' : 'pending_promotion',
      generated_at: new Date().toISOString(),
    }

    if (quarantine_reason !== undefined) {
      report.quarantine_reason = quarantine_reason
    }

    reports.set(runId, report)

    // Record in governance audit
    this.governanceAudit.recordValidation(runId, report)

    return report
  }

  /**
   * Promote a validated model to production.
   *
   * GUARDRAIL: requires explicit human approval — no auto-promotion path exists.
   * Quarantined models cannot be promoted directly.
   */
  promoteModel(runId: RunId, payload: PromotionPayload): ValidationReport {
    const report = reports.get(runId)
    if (!report) throw new Error(`No validation report found for run ${runId}`)

    if (report.quarantined) {
      throw new QuarantinedModelError(
        `Run ${runId} is quarantined (Pearson r ${report.new_pearson_r}). ` +
        `Cannot promote a quarantined model to production.`,
      )
    }

    if (report.status !== 'pending_promotion') {
      throw new Error(
        `Run ${runId} has status '${report.status}'; only 'pending_promotion' models can be promoted.`,
      )
    }

    report.status = 'promoted'
    this.approvalGate.updateRunStatus(runId, 'completed')
    this.governanceAudit.recordPromotion(runId, payload.promoting_human_id, payload.notes)

    return report
  }

  getReport(runId: RunId): ValidationReport | undefined {
    return reports.get(runId)
  }

  _clearReports(): void {
    reports.clear()
    setPhase1Baseline(0.85)
  }
}

export class QuarantinedModelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuarantinedModelError'
  }
}
