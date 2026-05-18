// GitHub Actions entrypoint — runs as node20
// Compiled to dist/github-action/index.js by rollup/esbuild

import { execSync } from 'child_process'
import { runGate, buildPRComment, writeAuditEntry } from '../../src/cicd/gate.js'
import { loadConfig } from '../../src/cicd/configLoader.js'

// GitHub Actions core helpers (inlined to avoid @actions/core dep in this stub)
function getInput(name: string): string {
  return process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] ?? ''
}
function setOutput(name: string, value: string): void {
  process.stdout.write(`::set-output name=${name}::${value}\n`)
}
function setFailed(message: string): void {
  process.stderr.write(`::error::${message}\n`)
  process.exit(1)
}
function info(message: string): void {
  process.stdout.write(message + '\n')
}

async function run(): Promise<void> {
  const apiUrl = getInput('cognarc-api-url')
  const workspaceId = getInput('cognarc-workspace-id')
  const configPath = getInput('config-path') || '.cognarc.yml'
  const environment = getInput('environment') || undefined
  const githubToken = getInput('github-token')
  const commitSha = process.env['GITHUB_SHA'] ?? null
  const prNumber = process.env['GITHUB_REF']?.match(/refs\/pull\/(\d+)/)?.[1] ?? null
  const repo = process.env['GITHUB_REPOSITORY'] ?? ''

  // Collect changed files in the PR
  let changedFiles: string[] = []
  try {
    const base = process.env['GITHUB_BASE_REF'] ?? 'main'
    const output = execSync(`git diff --name-only origin/${base}...HEAD`, { encoding: 'utf8' })
    changedFiles = output.trim().split('\n').filter(Boolean)
  } catch {
    info('[cognarc] Could not determine changed files via git diff — evaluating all files')
  }

  // Read PR description for override marker
  let prBody = ''
  if (prNumber !== null && githubToken !== '') {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, {
        headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' },
      })
      const data = await res.json() as { body?: string; user?: { login?: string }; labels?: Array<{ name: string }> }
      prBody = data.body ?? ''
      // Also accept "cognarc-override" label
      if (data.labels?.some((l) => l.name === 'cognarc-override') === true) {
        prBody += '\ncognarc-override: applied via PR label'
      }
    } catch {
      info('[cognarc] Could not fetch PR details — override detection disabled')
    }
  }

  process.env['COGNARC_WORKSPACE_ID'] = workspaceId

  const result = await runGate({
    configPath,
    scoringEndpoint: apiUrl,
    environment,
    changedFiles,
    overrideText: prBody,
    commitSha,
  })

  const config = loadConfig(configPath)

  // Post PR comment
  if (prNumber !== null && githubToken !== '') {
    const comment = buildPRComment(result, config)
    await fetch(`https://api.github.com/repos/${repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body: comment }),
    }).catch((err: unknown) => info(`[cognarc] PR comment failed: ${String(err)}`))
  }

  // Write audit entry for overrides
  const auditEndpoint = process.env['COGNARC_AUDIT_ENDPOINT'] ?? apiUrl
  await writeAuditEntry(
    {
      workspaceId,
      prOrMrId: prNumber ?? 'unknown',
      platform: 'github',
      commitSha,
      result,
      actor: process.env['GITHUB_ACTOR'] ?? null,
    },
    auditEndpoint,
  )

  setOutput('passed', String(result.passed))
  setOutput('overridden', String(result.overridden))
  setOutput('report', result.summary)

  info(result.summary)

  const shouldFail = !result.passed && (config.on_breach?.action ?? 'fail') === 'fail'
  if (shouldFail) {
    setFailed('CognArc Cognitive Gate: threshold breach detected. See PR comment for details.')
  }
}

run().catch((err: unknown) => {
  process.stderr.write(`[cognarc] Fatal error: ${String(err)}\n`)
  process.exit(1)
})
