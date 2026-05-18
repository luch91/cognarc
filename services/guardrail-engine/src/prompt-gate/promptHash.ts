import { createHash } from 'crypto'

// Stable prompt ID: SHA-256 of the system prompt (or full prompt if no system prompt).
// User-variable portions should NOT be included — the system prompt represents
// the stable, reusable part whose cognitive properties we track across deploys.
export function hashPrompt(systemPrompt: string): string {
  return createHash('sha256').update(systemPrompt, 'utf8').digest('hex')
}
