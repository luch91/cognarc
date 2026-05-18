import { readFileSync, existsSync } from 'fs'
import { minimatch } from 'minimatch'
import type { CognitiveScoreRequest, CognitiveScoreResponse } from '@cognarc/types'
import { BaselineManager } from './baselineManager.js'
import { loadConfig } from './configLoader.js'
import { evaluateThresholds, formatScoreTable } from './thresholdEvaluator.js'
import type { CognArcConfig, EvaluationResult, FileScore } from './types.js'

export interface GateOptions {
  configPath?: string | undefined
  scoringEndpoint?: string | undefined
  environment?: string | undefined
  changedFiles: string[]
  // Override detection: PR description / MR description text
  overrideText?: string | undefined
  commitSha?: string | undefined
  baselineDir?: string | undefined
}

const OVERRIDE_MARKER = 'cognarc-override'
const OVERRIDE_JUSTIFICATION_PATTERN = /cognarc-override:\s*(.+)/i

export async function runGate(options: GateOptions): Promise<EvaluationResult> {
  const scoringEndpoint = options.scoringEndpoint ?? process.env['COGNARC_SCORING_ENDPOINT'] ?? 'http://localhost:3001'
  const config = loadConfig(options.configPath)
  const baseline = new BaselineManager(options.baselineDir)

  // Determine which changed files match configured paths
  const monitoredPaths = config.paths ?? ['**/*']
  const filesToEvaluate = options.changedFiles.filter((f) =>
    monitoredPaths.some((pattern) => minimatch(f, pattern, { matchBase: true })),
  )

  // Check for human override
  const overrideText = options.overrideText ?? ''
  const overridden = overrideText.toLowerCase().includes(OVERRIDE_MARKER)
  const justificationMatch = OVERRIDE_JUSTIFICATION_PATTERN.exec(overrideText)
  const overrideJustification = justificationMatch?.[1]?.trim() ?? null

  // Score each file
  const fileScores: FileScore[] = []
  for (const filePath of filesToEvaluate) {
    if (!existsSync(filePath)) continue

    let content: string
    try {
      content = readFileSync(filePath, 'utf8')
    } catch {
      continue
    }

    let scores: CognitiveScoreResponse
    try {
      scores = await scoreFile(filePath, content, scoringEndpoint)
    } catch (err) {
      console.error(`[cognarc] Failed to score ${filePath}: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }

    const breaches = overridden ? [] : evaluateThresholds(scores, config, options.environment)
    const baselineDelta = baseline.computeDelta(filePath, scores)

    // First run creates baseline; subsequent runs update it after scoring
    baseline.upsertBaseline(filePath, scores, options.commitSha ?? null)

    fileScores.push({ path: filePath, scores, breaches, baselineDelta })
  }

  const anyBreach = fileScores.some((fs) => fs.breaches.length > 0)
  const passed = !anyBreach || overridden
  const summary = formatScoreTable(fileScores)

  return { passed, overridden, overrideJustification, fileScores, summary }
}

async function scoreFile(
  path: string,
  content: string,
  endpoint: string,
): Promise<CognitiveScoreResponse> {
  const req: CognitiveScoreRequest = {
    stimulus_type: 'text',
    content,
    workspace_id: process.env['COGNARC_WORKSPACE_ID'] ?? 'default',
  }

  const res = await fetch(`${endpoint}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })

  if (!res.ok) throw new Error(`Scoring service HTTP ${res.status} for ${path}`)
  return res.json() as Promise<CognitiveScoreResponse>
}

export function buildPRComment(result: EvaluationResult, config: CognArcConfig): string {
  const lines: string[] = [result.summary, '']

  if (result.overridden) {
    lines.push(`> ⚠️ **Override active.** Justification: ${result.overrideJustification ?? '(none provided)'}`)
    lines.push('')
  }

  if (result.passed) {
    lines.push('✅ **All cognitive thresholds passed.** This PR is cleared to merge.')
  } else {
    const action = config.on_breach?.action ?? 'fail'
    lines.push(action === 'fail'
      ? '❌ **Cognitive threshold breach detected.** This PR is blocked from merging.'
      : '⚠️ **Cognitive threshold warning.** Review scores before merging.')

    const breachedFiles = result.fileScores.filter((fs) => fs.breaches.length > 0)
    for (const fs of breachedFiles) {
      lines.push(`\n**${fs.path}**`)
      for (const b of fs.breaches) {
        const dir = b.direction === 'above_max' ? `exceeds max of ${b.threshold}` : `below min of ${b.threshold}`
        lines.push(`- \`${b.metric}\`: ${b.value.toFixed(1)} — ${dir}`)
      }
    }

    lines.push('\nTo override: add `cognarc-override: <justification>` to your PR description. Override is logged to the audit trail.')
  }

  return lines.join('\n')
}
