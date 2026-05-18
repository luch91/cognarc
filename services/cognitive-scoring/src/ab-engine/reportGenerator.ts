import { randomUUID } from 'crypto'
import { writeFile, mkdir, readFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import type { CognitiveScoreResponse } from '@cognarc/types'
import type { Winner, Confidence } from './types.js'

// Storage: local filesystem under /tmp/cognarc-ab-reports/
// In production this would be GCS/S3 — swappable by replacing the save/load functions.
const REPORT_DIR = join(process.env['TMPDIR'] ?? process.env['TMP'] ?? '/tmp', 'cognarc-ab-reports')
const TTL_DAYS = 30

interface ReportInput {
  winner: Winner
  confidence: Confidence
  scores_a: CognitiveScoreResponse
  scores_b: CognitiveScoreResponse
  delta: Record<string, number>
  rationale: string
  recommended_action: string
  labelA: string
  labelB: string
  stimulusTypeA: string
  stimulusTypeB: string
}

export interface StoredReport extends ReportInput {
  id: string
  created_at: string
  expires_at: string
}

export async function generateReport(input: ReportInput): Promise<string | undefined> {
  try {
    if (!existsSync(REPORT_DIR)) {
      await mkdir(REPORT_DIR, { recursive: true })
    }

    const id = randomUUID()
    const now = new Date()
    const expires = new Date(now.getTime() + TTL_DAYS * 86_400_000)

    const report: StoredReport = {
      ...input,
      id,
      created_at: now.toISOString(),
      expires_at: expires.toISOString(),
    }

    const reportPath = join(REPORT_DIR, `${id}.json`)
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')

    const htmlPath = join(REPORT_DIR, `${id}.html`)
    await writeFile(htmlPath, renderHtml(report), 'utf8')

    // In production: return the GCS/S3 signed URL.
    // For local dev: return a file URI for the HTML report.
    return `file://${htmlPath}`
  } catch {
    // Non-blocking — report generation failures must not break the comparison
    return undefined
  }
}

export async function loadReport(id: string): Promise<StoredReport | null> {
  const reportPath = join(REPORT_DIR, `${id}.json`)
  try {
    const raw = await readFile(reportPath, 'utf8')
    const report: StoredReport = JSON.parse(raw) as StoredReport
    if (new Date(report.expires_at) < new Date()) return null
    return report
  } catch {
    return null
  }
}

function renderHtml(r: StoredReport): string {
  const scoreRow = (label: string, a: number, b: number, delta: number, lowerIsBetter = false) => {
    const aWins = lowerIsBetter ? a < b : a > b
    const bWins = lowerIsBetter ? b < a : b > a
    const absDelta = Math.abs(delta)
    return `
      <tr>
        <td class="dim">${label}</td>
        <td class="score ${aWins ? 'winner' : ''}">${a}</td>
        <td class="score ${bWins ? 'winner' : ''}">${b}</td>
        <td class="delta ${absDelta > 15 ? 'large' : absDelta > 10 ? 'medium' : ''}">${delta > 0 ? '+' : ''}${delta}</td>
      </tr>`
  }

  const winnerBadge = r.winner === 'inconclusive'
    ? `<div class="badge inconclusive">INCONCLUSIVE</div>`
    : `<div class="badge winner-badge">🏆 Variant ${r.winner} wins</div>`

  const confidenceBar = r.confidence === 'HIGH'
    ? `<span class="conf high">HIGH confidence</span>`
    : r.confidence === 'MEDIUM'
    ? `<span class="conf medium">MEDIUM confidence</span>`
    : `<span class="conf low">LOW confidence</span>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CognArc A/B Report — ${r.labelA} vs ${r.labelB}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; background: #f8fafc; color: #1e293b; }
    .container { max-width: 760px; margin: 48px auto; padding: 0 24px; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 4px; }
    .meta { font-size: 0.8rem; color: #64748b; margin-bottom: 32px; }
    .badge { display: inline-block; padding: 8px 20px; border-radius: 999px; font-weight: 700; font-size: 1rem; margin-bottom: 12px; }
    .winner-badge { background: #dcfce7; color: #166534; }
    .inconclusive { background: #f1f5f9; color: #475569; }
    .conf { display: inline-block; padding: 3px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; margin-left: 10px; }
    .conf.high { background: #dcfce7; color: #166534; }
    .conf.medium { background: #fef9c3; color: #854d0e; }
    .conf.low { background: #f1f5f9; color: #475569; }
    table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    th { text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; }
    td.dim { font-weight: 500; color: #475569; }
    td.score { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    td.score.winner { color: #16a34a; }
    td.delta { text-align: right; font-variant-numeric: tabular-nums; color: #94a3b8; }
    td.delta.large { color: #ef4444; font-weight: 700; }
    td.delta.medium { color: #f59e0b; font-weight: 600; }
    .section { background: white; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px; margin-bottom: 20px; }
    h2 { font-size: 1rem; font-weight: 600; margin: 0 0 12px; color: #334155; }
    p { font-size: 0.9rem; line-height: 1.6; color: #475569; margin: 0 0 12px; }
    .methodology { font-size: 0.8rem; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 12px; margin-top: 12px; }
    footer { text-align: center; font-size: 0.75rem; color: #94a3b8; margin-top: 48px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>CognArc A/B Cognitive Comparison</h1>
    <div class="meta">
      ${r.labelA} (${r.stimulusTypeA}) vs ${r.labelB} (${r.stimulusTypeB}) ·
      Generated ${new Date(r.created_at).toLocaleString()} ·
      Expires ${new Date(r.expires_at).toLocaleDateString()}
    </div>

    <div class="section">
      ${winnerBadge} ${confidenceBar}
      <p style="margin-top:12px">${r.rationale}</p>
      <p><strong>Recommended action:</strong> ${r.recommended_action}</p>
    </div>

    <div class="section">
      <h2>Score Comparison</h2>
      <table>
        <thead>
          <tr>
            <th>Dimension</th>
            <th style="text-align:right">${r.labelA}</th>
            <th style="text-align:right">${r.labelB}</th>
            <th style="text-align:right">Δ (B−A)</th>
          </tr>
        </thead>
        <tbody>
          ${scoreRow('Cognitive Load', r.scores_a.cognitive_load, r.scores_b.cognitive_load, r.delta['cognitive_load'] ?? 0, true)}
          ${scoreRow('Comprehension Confidence', r.scores_a.comprehension_confidence, r.scores_b.comprehension_confidence, r.delta['comprehension_confidence'] ?? 0)}
          ${scoreRow('Emotional Valence', r.scores_a.emotional_valence, r.scores_b.emotional_valence, r.delta['emotional_valence'] ?? 0)}
          ${scoreRow('Trust Coherence', r.scores_a.trust_coherence, r.scores_b.trust_coherence, r.delta['trust_coherence'] ?? 0)}
          ${scoreRow('Manipulation Risk', r.scores_a.manipulation_risk, r.scores_b.manipulation_risk, r.delta['manipulation_risk'] ?? 0, true)}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>Cognitive Risk Classification</h2>
      <p>
        ${r.labelA}: <strong>${r.scores_a.cognitive_risk}</strong> ·
        ${r.labelB}: <strong>${r.scores_b.cognitive_risk}</strong>
      </p>

      <div class="methodology">
        <strong>Methodology note:</strong> Scores are produced by CognArc's cognitive scoring engine,
        which uses NLP heuristic analysis (mock mode) or TRIBE v2 — a tri-modal fMRI foundation model
        (Meta AI Research, CC-BY-NC-4.0) trained on 1,000+ hours of neuroimaging data across 720 subjects.
        Confidence is determined by delta magnitude: HIGH ≥15pts on ≥2 dimensions,
        MEDIUM ≥10pts on ≥1 dimension, LOW &lt;10pts on all dimensions.
      </div>
    </div>

    <footer>CognArc · Report ID ${r.id} · Valid for ${TTL_DAYS} days</footer>
  </div>
</body>
</html>`
}
