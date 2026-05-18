export class CognArcError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'CognArcError'
  }
}

export class TrustGradientViolation extends CognArcError {
  constructor(message: string) {
    super(message, 'TRUST_GRADIENT_VIOLATION')
    this.name = 'TrustGradientViolation'
  }
}

export class UnregisteredActionError extends CognArcError {
  constructor(actionType: string) {
    super(`Action "${actionType}" is not registered in the action registry`, 'UNREGISTERED_ACTION')
    this.name = 'UnregisteredActionError'
  }
}

export class KillSwitchActiveError extends CognArcError {
  constructor(workspaceId: string) {
    super(`Kill switch is active for workspace "${workspaceId}"`, 'KILL_SWITCH_ACTIVE')
    this.name = 'KillSwitchActiveError'
  }
}

export class ActGatedApprovalRequired extends CognArcError {
  constructor(approvalRequestId: string) {
    super(
      `Action requires human approval. Approval request: ${approvalRequestId}`,
      'ACT_GATED_APPROVAL_REQUIRED',
    )
    this.name = 'ActGatedApprovalRequired'
  }
}
