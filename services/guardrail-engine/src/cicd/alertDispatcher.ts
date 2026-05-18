import type { CognArcConfig, EvaluationResult } from './types.js'

export async function dispatchAlerts(
  result: EvaluationResult,
  config: CognArcConfig,
): Promise<void> {
  if (result.passed || config.on_breach?.alert === undefined) return

  const alert = config.on_breach.alert
  const promises: Promise<void>[] = []

  if (alert.slack !== undefined && alert.slack !== '') {
    promises.push(sendSlackAlert(alert.slack, result))
  }

  // Email alerts are out-of-scope for this service (requires SMTP/SES setup)
  // Logged here for operator awareness
  if (alert.email !== undefined && alert.email !== '') {
    console.warn(`[cognarc] Email alert configured for ${alert.email} but email dispatch requires external SMTP configuration`)
  }

  await Promise.allSettled(promises)
}

async function sendSlackAlert(webhookUrl: string, result: EvaluationResult): Promise<void> {
  const breachedFiles = result.fileScores.filter((fs) => fs.breaches.length > 0)
  const text = [
    `🚨 *CognArc Cognitive Gate: ${result.passed ? 'PASSED' : 'FAILED'}*`,
    `${breachedFiles.length} file(s) breached thresholds:`,
    ...breachedFiles.map((fs) =>
      `• \`${fs.path}\` — ${fs.breaches.map((b) => `${b.metric} ${b.value.toFixed(1)} (limit ${b.threshold})`).join(', ')}`,
    ),
  ].join('\n')

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  }).then((res) => {
    if (!res.ok) throw new Error(`Slack alert HTTP ${res.status}`)
  })
}
