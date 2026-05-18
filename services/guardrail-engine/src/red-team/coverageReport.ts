import { allFindings, getWeeklyStats, getTotalReviewed } from './findingStore.js'
import type { CategoryStat, ScaleCoverageReport } from './types.js'
import type { ManipulationCategory } from '../manipulation/types.js'

// Estimated human reviewer capacity: ~200 outputs/week per analyst with thorough review
const HUMAN_TEAM_CAPACITY_PER_ANALYST = 200
const ASSUMED_ANALYSTS = 3

function severityFromScore(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 70) return 'HIGH'
  if (score >= 45) return 'MEDIUM'
  return 'LOW'
}

function isoWeekStart(date: Date): string {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() + 1) // Monday
  return d.toISOString().slice(0, 10)
}

export function generateCoverageReport(): ScaleCoverageReport {
  const now = new Date()
  const periodEnd = now.toISOString()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000)
  const periodStart = sevenDaysAgo.toISOString()

  const allF = allFindings()

  // Filter to this week
  const thisWeekFindings = allF.filter((f) => new Date(f.created_at) >= sevenDaysAgo)
  const total = thisWeekFindings.length

  // Severity distribution
  const severityDist = { HIGH: 0, MEDIUM: 0, LOW: 0 }
  for (const f of thisWeekFindings) {
    severityDist[severityFromScore(f.overall_score)]++
  }

  // Per-category stats from weekly store
  const weeklyStore = getWeeklyStats()
  const allCategories: ManipulationCategory[] = [
    'false_urgency',
    'social_proof_fabrication',
    'ambiguity_exploitation',
    'authority_mimicry',
    'sycophantic_drift',
    'obfuscation',
  ]

  const byCategory: CategoryStat[] = allCategories.map((cat) => {
    const [thisWeek = 0, lastWeek = 0] = weeklyStore.get(cat) ?? [0, 0]
    const catFindings = thisWeekFindings.filter((f) => f.pattern.taxonomy_category === cat)
    const avgScore = catFindings.length > 0
      ? Math.round(catFindings.reduce((sum, f) => sum + f.overall_score, 0) / catFindings.length)
      : 0

    const trend: 'up' | 'down' | 'stable' =
      thisWeek > lastWeek + 1 ? 'up' : thisWeek < lastWeek - 1 ? 'down' : 'stable'

    return { category: cat, count: thisWeek, avg_score: avgScore, trend }
  })

  const reviewed = getTotalReviewed()
  const humanCapacity = HUMAN_TEAM_CAPACITY_PER_ANALYST * ASSUMED_ANALYSTS
  const coverageGap = Math.min(100, Math.round((reviewed / Math.max(1, humanCapacity)) * 100))

  // Week-over-week delta: sum current vs prior
  const currentTotal = byCategory.reduce((s, c) => s + c.count, 0)
  const priorTotal = allCategories.reduce((s, cat) => s + (weeklyStore.get(cat)?.[1] ?? 0), 0)
  const wowDelta = currentTotal - priorTotal

  // Top patterns: categories with highest counts this week
  const topPatterns = [...byCategory]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .filter((c) => c.count > 0)
    .map((c) => c.category.replace(/_/g, ' '))

  return {
    generated_at: now.toISOString(),
    period_start: periodStart,
    period_end: periodEnd,
    total_detections: total,
    severity_distribution: severityDist,
    by_category: byCategory,
    outputs_reviewed: reviewed,
    human_team_capacity: humanCapacity,
    coverage_gap_closed_pct: coverageGap,
    week_over_week_delta: wowDelta,
    top_patterns: topPatterns.length > 0 ? topPatterns : ['No patterns detected this week'],
  }
}

// ─── Weekly scheduler (autonomous) ───────────────────────────────────────────
// Registers a setInterval that fires every 7 days.
// Does NOT block startup — call startWeeklyScheduler() to activate.

let weeklyTimer: ReturnType<typeof setInterval> | null = null

export function startWeeklyScheduler(
  onReport?: (report: ScaleCoverageReport) => void,
): void {
  if (weeklyTimer) return  // idempotent
  weeklyTimer = setInterval(() => {
    const report = generateCoverageReport()
    const defaultHandler = () => {
      console.log(JSON.stringify({
        level: 'info',
        msg: 'Weekly coverage report generated',
        week: isoWeekStart(new Date()),
        total: report.total_detections,
        coverage_pct: report.coverage_gap_closed_pct,
      }))
    }
    ;(onReport ?? defaultHandler)(report)
  }, 7 * 24 * 60 * 60 * 1000)

  // Allow Node to exit even if scheduler is running
  weeklyTimer.unref?.()
}

export function stopWeeklyScheduler(): void {
  if (weeklyTimer) {
    clearInterval(weeklyTimer)
    weeklyTimer = null
  }
}
