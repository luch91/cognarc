import { randomUUID } from 'crypto'
import type {
  ApprovalPayload,
  ApprovedRun,
  RunRecommendation,
  RunId,
  TrainingConfig,
} from './types.js'
import { TRAINING_CONFIG_BOUNDS } from './types.js'

// ─── HumanApprovalGate ────────────────────────────────────────────────────────
// PERMANENT CONSTRAINT: no run can execute without an ApprovedRun record.
// Timeout-based auto-approval is structurally impossible: there is no timer.

const approvedRuns = new Map<RunId, ApprovedRun>()

export class HumanApprovalGate {
  /**
   * Approve a fine-tuning run.
   *
   * GUARDRAILS (enforced in code, not policy):
   *   1. Data hash must match the recommendation exactly.
   *   2. Training parameters must be within safe bounds.
   *
   * Returns ApprovedRun on success. Throws a typed error on any rejection.
   */
  approve_run(
    recommendation: RunRecommendation,
    ml_lead_id: string,
    payload: ApprovalPayload,
  ): ApprovedRun {
    this.assertHashMatch(recommendation.training_data_hash, payload.approved_training_data_hash)
    this.assertParameterBounds(payload.approved_parameters)
    this.assertRecommendationPending(recommendation)

    const run: ApprovedRun = {
      id: randomUUID() as RunId,
      recommendation_id: recommendation.id,
      ml_lead_id,
      approved_training_data_hash: payload.approved_training_data_hash,
      approved_parameters: payload.approved_parameters,
      expected_accuracy_impact: payload.expected_accuracy_impact,
      approved_at: new Date().toISOString(),
      status: 'approved',
    }

    approvedRuns.set(run.id, run)
    return run
  }

  /** Check whether a run ID has a valid approval record. */
  isApproved(runId: RunId): boolean {
    return approvedRuns.has(runId)
  }

  getApprovedRun(runId: RunId): ApprovedRun | undefined {
    return approvedRuns.get(runId)
  }

  /** Called by PostRunValidator to mark a run as running/completed/quarantined. */
  updateRunStatus(runId: RunId, status: ApprovedRun['status']): void {
    const run = approvedRuns.get(runId)
    if (run) run.status = status
  }

  _clearApprovals(): void {
    approvedRuns.clear()
  }

  // ─── Guardrail assertions ───────────────────────────────────────────────────

  private assertHashMatch(expected: string, provided: string): void {
    if (expected !== provided) {
      throw new HashMismatchError(
        `Data hash mismatch: recommendation has ${expected}, approval provides ${provided}. ` +
        `The training data may have changed since the recommendation was generated.`,
      )
    }
  }

  private assertParameterBounds(params: TrainingConfig): void {
    const { learning_rate, epochs, batch_size, max_gradient_norm } = params
    const b = TRAINING_CONFIG_BOUNDS

    if (learning_rate < b.learning_rate.min || learning_rate > b.learning_rate.max) {
      throw new ParameterOutOfBoundsError(
        `learning_rate ${learning_rate} is outside safe bounds [${b.learning_rate.min}, ${b.learning_rate.max}]`,
      )
    }
    if (epochs < b.epochs.min || epochs > b.epochs.max) {
      throw new ParameterOutOfBoundsError(
        `epochs ${epochs} is outside safe bounds [${b.epochs.min}, ${b.epochs.max}]`,
      )
    }
    if (batch_size < b.batch_size.min || batch_size > b.batch_size.max) {
      throw new ParameterOutOfBoundsError(
        `batch_size ${batch_size} is outside safe bounds [${b.batch_size.min}, ${b.batch_size.max}]`,
      )
    }
    if (max_gradient_norm > b.max_gradient_norm.max) {
      throw new ParameterOutOfBoundsError(
        `max_gradient_norm ${max_gradient_norm} exceeds safe maximum of ${b.max_gradient_norm.max}`,
      )
    }
  }

  private assertRecommendationPending(recommendation: RunRecommendation): void {
    if (recommendation.status !== 'pending') {
      throw new ApprovalRejectedError(
        `Recommendation ${recommendation.id} has status '${recommendation.status}'; only 'pending' recommendations can be approved.`,
      )
    }
  }
}

// ─── Typed errors ─────────────────────────────────────────────────────────────

export class HashMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HashMismatchError'
  }
}

export class ParameterOutOfBoundsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParameterOutOfBoundsError'
  }
}

export class ApprovalRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApprovalRejectedError'
  }
}

export class UnapprovedRunError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} has no approval record. Fine-tuning cannot execute without human approval.`)
    this.name = 'UnapprovedRunError'
  }
}
