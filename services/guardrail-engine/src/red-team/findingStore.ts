import { randomUUID } from 'crypto'
import type { Finding, FindingStatus, ManipulationPattern } from './types.js'
import type { ManipulationCategory } from '../manipulation/types.js'

// In-memory store — production would be PostgreSQL (same DB as audit log).
const findings = new Map<string, Finding>()

// Synthetic weekly detection history for coverage report (keyed by ISO week string).
// Each entry: Map<category, count[]> where count[0] = this week, count[1] = last week.
const weeklyStats = new Map<ManipulationCategory, [number, number]>()
let totalReviewed = 0

export function createFinding(
  workspaceId: string,
  pattern: ManipulationPattern,
  score: number,
  sourceSnippet: string,
): Finding {
  const finding: Finding = {
    id: randomUUID(),
    workspace_id: workspaceId,
    created_at: new Date().toISOString(),
    status: 'open',
    pattern,
    overall_score: score,
    source_output_snippet: sourceSnippet,
    re_emergences: 0,
  }
  findings.set(finding.id, finding)
  recordDetection(pattern.taxonomy_category, score)
  return finding
}

export function getFinding(id: string): Finding | undefined {
  return findings.get(id)
}

export function markRemediated(id: string, by: string): Finding | null {
  const f = findings.get(id)
  if (!f) return null
  f.status = 'monitoring'
  f.remediated_at = new Date().toISOString()
  f.remediated_by = by
  return f
}

export function updateStatus(id: string, status: FindingStatus): void {
  const f = findings.get(id)
  if (f) f.status = status
}

export function recordReEmergence(id: string): void {
  const f = findings.get(id)
  if (f) {
    f.re_emergences++
    f.last_check = new Date().toISOString()
    f.status = 'open'
  }
}

export function recordCheck(id: string): void {
  const f = findings.get(id)
  if (f) f.last_check = new Date().toISOString()
}

export function allFindings(): Finding[] {
  return [...findings.values()]
}

export function recordDetection(category: ManipulationCategory, _score: number): void {
  const entry = weeklyStats.get(category) ?? [0, 0]
  entry[0]++
  weeklyStats.set(category, entry)
  totalReviewed++
}

export function getWeeklyStats(): Map<ManipulationCategory, [number, number]> {
  return weeklyStats
}

export function getTotalReviewed(): number {
  return totalReviewed
}

/** For test isolation */
export function _clearAll(): void {
  findings.clear()
  weeklyStats.clear()
  totalReviewed = 0
}
