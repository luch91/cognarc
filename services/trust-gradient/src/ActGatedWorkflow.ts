import { randomUUID } from 'crypto'
import type { AgentActionType, OversightZone } from '@cognarc/types'
import { CognArcError } from '@cognarc/types'

export interface DecisionPackage {
  id: string
  action: AgentActionType
  zone: OversightZone
  evidence: unknown
  alternatives: string[]
  created_at: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  resolved_at?: string | undefined
  resolved_by?: string | undefined
  rejection_reason?: string | undefined
}

// In production this would be backed by PostgreSQL, but the logic is storage-agnostic.
export class ActGatedWorkflow {
  private readonly packages = new Map<string, DecisionPackage>()

  createDecisionPackage(
    action: AgentActionType,
    evidence: unknown,
    alternatives: string[],
  ): DecisionPackage {
    const pkg: DecisionPackage = {
      id: randomUUID(),
      action,
      zone: 'ACT_GATED',
      evidence,
      alternatives,
      created_at: new Date().toISOString(),
      status: 'PENDING',
    }
    this.packages.set(pkg.id, pkg)
    return pkg
  }

  submitForApproval(pkg: DecisionPackage): string {
    // Idempotent — package is already stored from createDecisionPackage.
    // Returns the approvalRequestId for the caller to surface to a human.
    return pkg.id
  }

  approve(approvalRequestId: string, humanId: string): void {
    const pkg = this.requirePending(approvalRequestId)
    pkg.status = 'APPROVED'
    pkg.resolved_at = new Date().toISOString()
    pkg.resolved_by = humanId
  }

  reject(approvalRequestId: string, humanId: string, reason: string): void {
    const pkg = this.requirePending(approvalRequestId)
    pkg.status = 'REJECTED'
    pkg.resolved_at = new Date().toISOString()
    pkg.resolved_by = humanId
    pkg.rejection_reason = reason
  }

  getPackage(approvalRequestId: string): DecisionPackage | undefined {
    return this.packages.get(approvalRequestId)
  }

  private requirePending(approvalRequestId: string): DecisionPackage {
    const pkg = this.packages.get(approvalRequestId)
    if (pkg === undefined) {
      throw new CognArcError(
        `No approval request found: ${approvalRequestId}`,
        'APPROVAL_NOT_FOUND',
      )
    }
    if (pkg.status !== 'PENDING') {
      throw new CognArcError(
        `Approval request ${approvalRequestId} is already ${pkg.status}`,
        'APPROVAL_ALREADY_RESOLVED',
      )
    }
    return pkg
  }
}
