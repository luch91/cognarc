import { randomUUID } from 'crypto'
import type {
  GovernanceRecord,
  RunId,
  UserId,
  ValidationReport,
  ApprovedRun,
} from './types.js'

// ─── FineTuningGovernanceAudit ────────────────────────────────────────────────
// PERMANENT CONSTRAINT: records are append-only.
// No update/delete operations are exposed. In production this maps to
// INSERT-only on a PostgreSQL table with the same immutability trigger as
// the main audit log.

const records = new Map<string, Readonly<GovernanceRecord>>()

export class FineTuningGovernanceAudit {
  /**
   * Record the approval event when a run is approved by an ML lead.
   * Called by HumanApprovalGate after a successful approve_run().
   */
  recordApproval(run: ApprovedRun): GovernanceRecord {
    return this.append({
      run_id: run.id,
      recommendation_id: run.recommendation_id,
      ml_lead_id: run.ml_lead_id,
      data_hash: run.approved_training_data_hash,
      training_parameters: run.approved_parameters,
      pre_accuracy: 0,
      post_accuracy: null,
      promoting_human_id: null,
      decision: 'approved',
      notes: `Approved by ${run.ml_lead_id}. Expected impact: ${run.expected_accuracy_impact}`,
    })
  }

  /**
   * Record the validation result after a post-run benchmark.
   * Called automatically by PostRunValidator.
   */
  recordValidation(runId: RunId, report: ValidationReport): void {
    const existing = this.findByRunId(runId)
    if (!existing) return

    this.append({
      run_id: runId,
      recommendation_id: existing.recommendation_id,
      ml_lead_id: existing.ml_lead_id,
      data_hash: existing.data_hash,
      training_parameters: existing.training_parameters,
      pre_accuracy: report.baseline_pearson_r,
      post_accuracy: report.new_pearson_r,
      promoting_human_id: null,
      decision: report.quarantined ? 'quarantined' : 'approved',
      notes: report.quarantined
        ? `Model quarantined: ${report.quarantine_reason ?? 'below threshold'}`
        : `Validation passed. Pearson r: ${report.new_pearson_r}`,
    })
  }

  /**
   * Record a production promotion decision.
   * Called by PostRunValidator.promoteModel() after human approval.
   */
  recordPromotion(runId: RunId, promotingHumanId: UserId, notes: string): void {
    const existing = this.findByRunId(runId)
    if (!existing) return

    this.append({
      run_id: runId,
      recommendation_id: existing.recommendation_id,
      ml_lead_id: existing.ml_lead_id,
      data_hash: existing.data_hash,
      training_parameters: existing.training_parameters,
      pre_accuracy: existing.pre_accuracy,
      post_accuracy: existing.post_accuracy,
      promoting_human_id: promotingHumanId,
      decision: 'promoted',
      notes,
    })
  }

  /** Read all records for a specific run (audit trail). */
  getRecordsForRun(runId: RunId): readonly Readonly<GovernanceRecord>[] {
    return Array.from(records.values()).filter((r) => r.run_id === runId)
  }

  /** Read all records (ML team audit view). */
  allRecords(): readonly Readonly<GovernanceRecord>[] {
    return Array.from(records.values())
  }

  /**
   * GUARDRAIL: records are frozen after creation.
   * Attempting to modify a frozen record throws at runtime.
   */
  private append(fields: Omit<GovernanceRecord, 'id' | 'created_at'>): GovernanceRecord {
    const record: GovernanceRecord = Object.freeze({
      id: randomUUID(),
      created_at: new Date().toISOString(),
      ...fields,
    })
    records.set(record.id, record)
    return record
  }

  private findByRunId(runId: RunId): Readonly<GovernanceRecord> | undefined {
    return Array.from(records.values()).find((r) => r.run_id === runId)
  }

  _clearRecords(): void {
    records.clear()
  }
}
