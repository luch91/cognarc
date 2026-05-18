import {
  detectFalseUrgency,
  detectSocialProofFabrication,
  detectAmbiguityExploitation,
  detectAuthorityMimicry,
  detectSycophancyDrift,
  detectObfuscation,
} from '../manipulation/detectors.js'
import type { ManipulationCategory } from '../manipulation/types.js'
import {
  getFinding,
  markRemediated,
  recordCheck,
  recordReEmergence,
} from './findingStore.js'
import type { ManipulationPattern, ReEmergenceResult } from './types.js'

const SLACK_WEBHOOK_URL = process.env['SLACK_WEBHOOK_URL']

// Debounce: map of `${findingId}:${workspaceId}` → timestamp of last alert
const alertDebounce = new Map<string, number>()
const DEBOUNCE_MS = 60_000

// Active monitors: findingId → pattern
const activeMonitors = new Map<string, ManipulationPattern>()

// ─── Detector dispatch ────────────────────────────────────────────────────────

function runDetector(category: ManipulationCategory, text: string): { score: number; evidence: string[] } {
  switch (category) {
    case 'false_urgency':            return detectFalseUrgency(text)
    case 'social_proof_fabrication': return detectSocialProofFabrication(text)
    case 'ambiguity_exploitation':   return detectAmbiguityExploitation(text)
    case 'authority_mimicry':        return detectAuthorityMimicry(text)
    case 'sycophantic_drift':        return detectSycophancyDrift(text)
    case 'obfuscation':              return detectObfuscation(text)
  }
}

// ─── PostRemediationMonitor ───────────────────────────────────────────────────

export class PostRemediationMonitor {
  /**
   * Activate monitoring for a finding that has been marked remediated.
   * Subsequent calls to checkOutput() will scan for the associated pattern.
   */
  activate(findingId: string, pattern: ManipulationPattern): void {
    activeMonitors.set(findingId, pattern)
  }

  deactivate(findingId: string): void {
    activeMonitors.delete(findingId)
  }

  isActive(findingId: string): boolean {
    return activeMonitors.has(findingId)
  }

  /**
   * Check a new output against all active monitors.
   * Returns an array of ReEmergenceResults (one per active monitor that triggered).
   * Idempotent within the 60s debounce window per finding+workspace.
   */
  async checkOutput(output: string, workspaceId: string): Promise<ReEmergenceResult[]> {
    const results: ReEmergenceResult[] = []

    for (const [findingId, pattern] of activeMonitors) {
      const result = await this.checkPattern(findingId, pattern, output, workspaceId)
      results.push(result)
    }

    return results
  }

  /**
   * Check a single output against a single monitor.
   * Used for targeted checks when only one pattern is of interest.
   */
  async checkPattern(
    findingId: string,
    pattern: ManipulationPattern,
    output: string,
    workspaceId: string,
  ): Promise<ReEmergenceResult> {
    recordCheck(findingId)

    const detection = runDetector(pattern.taxonomy_category, output)
    const reEmerged = detection.score >= pattern.score_threshold

    // Match evidence snippets: which known phrases appear in this output?
    const matchingSnippets = findMatchingSnippets(output, pattern.evidence_snippets)

    // Require both score threshold AND at least one known snippet (reduces FP rate)
    const confirmed = reEmerged && matchingSnippets.length > 0

    const confidence = confirmed
      ? Math.min(100, Math.round(detection.score * 0.6 + matchingSnippets.length * 15))
      : 0

    let alertSent = false
    if (confirmed) {
      recordReEmergence(findingId)
      alertSent = await this.sendAlert(findingId, pattern, matchingSnippets, workspaceId)
    }

    return {
      re_emerged: confirmed,
      confidence,
      matching_snippets: matchingSnippets,
      original_finding_id: findingId,
      alert_sent: alertSent,
    }
  }

  private async sendAlert(
    findingId: string,
    pattern: ManipulationPattern,
    snippets: string[],
    workspaceId: string,
  ): Promise<boolean> {
    const debounceKey = `${findingId}:${workspaceId}`
    const lastAlert = alertDebounce.get(debounceKey) ?? 0
    const now = Date.now()

    // Idempotent: skip alert if sent within debounce window
    if (now - lastAlert < DEBOUNCE_MS) return false

    alertDebounce.set(debounceKey, now)

    const finding = getFinding(findingId)
    const message = buildSlackMessage(findingId, pattern, snippets, workspaceId, finding?.overall_score)

    if (SLACK_WEBHOOK_URL) {
      try {
        await fetch(SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message }),
          signal: AbortSignal.timeout(5000),
        })
      } catch {
        // Non-blocking — alert delivery failures must not crash the monitor
      }
    } else {
      // Dev fallback: structured log
      console.warn(`[cognarc:red-team] RE-EMERGENCE workspace=${workspaceId} finding=${findingId} category=${pattern.taxonomy_category} snippets="${snippets.join('", "')}"`)
    }

    return true
  }

  /** Reset debounce state — for testing only */
  _resetDebounce(): void {
    alertDebounce.clear()
  }

  /** Reset all active monitors — for testing only */
  _resetMonitors(): void {
    activeMonitors.clear()
  }
}

function findMatchingSnippets(output: string, knownSnippets: string[]): string[] {
  const lower = output.toLowerCase()
  return knownSnippets.filter((snippet) => lower.includes(snippet.toLowerCase()))
}

function buildSlackMessage(
  findingId: string,
  pattern: ManipulationPattern,
  snippets: string[],
  workspaceId: string,
  originalScore?: number,
): string {
  const snippetList = snippets.map((s) => `• "${s}"`).join('\n')
  return [
    `🚨 *CognArc Red Team — Pattern Re-Emergence*`,
    `Finding: \`${findingId}\`  |  Workspace: \`${workspaceId}\``,
    `Category: \`${pattern.taxonomy_category.replace(/_/g, ' ')}\``,
    originalScore !== undefined ? `Original score: ${originalScore}/100` : '',
    ``,
    `*Matching evidence:*`,
    snippetList,
    ``,
    `<https://dashboard.cognarc.ai/safety|View in CognArc Dashboard>`,
  ].filter((l) => l !== '' || l === '').join('\n')
}

// Activate a monitor after a finding is marked remediated via the API
export function activateMonitorForFinding(
  findingId: string,
  monitor: PostRemediationMonitor,
): void {
  const finding = getFinding(findingId)
  if (!finding) throw new Error(`Finding ${findingId} not found`)
  if (finding.status !== 'monitoring') throw new Error(`Finding ${findingId} is not in monitoring state`)
  monitor.activate(findingId, finding.pattern)
}

// Singleton used by the router
export const globalMonitor = new PostRemediationMonitor()

/** Reset the global monitor state — for testing only */
export function _resetGlobalMonitor(): void {
  globalMonitor._resetMonitors()
  globalMonitor._resetDebounce()
}
