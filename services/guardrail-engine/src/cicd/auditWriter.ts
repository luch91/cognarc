import type { EvaluationResult } from './types.js'

export interface CIAuditPayload {
  workspaceId: string
  prOrMrId: string
  platform: 'github' | 'gitlab' | 'jenkins'
  commitSha: string | null
  result: EvaluationResult
  actor: string | null
}

// Posts an append-only audit entry to the trust-gradient audit log service.
// Write-back failure does not block the gate — CI must not hang on audit issues.
export async function writeAuditEntry(
  payload: CIAuditPayload,
  auditEndpoint: string,
): Promise<void> {
  const body = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    workspace_id: payload.workspaceId,
    action_type: 'CI_GATE_EVALUATION',
    oversight_zone: 'ACT_AUTO',
    policy_rule_applied: 'cicd-cognitive-gate',
    authorising_human_or_policy: payload.result.overridden
      ? `override:${payload.actor ?? 'unknown'}`
      : 'policy:cognarc-cicd-gate',
    outcome: payload.result.passed ? 'PASSED' : 'BLOCKED',
    triggering_scores: payload.result.fileScores[0]?.scores ?? null,
    alternatives_considered: payload.result.overridden
      ? [`Override justification: ${payload.result.overrideJustification ?? 'none'}`]
      : [],
    meta: {
      platform: payload.platform,
      pr_id: payload.prOrMrId,
      commit_sha: payload.commitSha,
      files_evaluated: payload.result.fileScores.length,
      files_breached: payload.result.fileScores.filter((fs) => fs.breaches.length > 0).length,
    },
  }

  try {
    const res = await fetch(`${auditEndpoint}/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn(`[cognarc] Audit write failed: HTTP ${res.status}`)
    }
  } catch (err) {
    console.warn(`[cognarc] Audit write error: ${err instanceof Error ? err.message : String(err)}`)
  }
}
