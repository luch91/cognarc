import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import type { CognitiveScoreResponse } from '@cognarc/types'
import type { BaselineDelta, BaselineEntry, BaselineStore } from './types.js'

const BASELINE_DIR = '.cognarc-baselines'
const BASELINE_FILE = 'baselines.json'

export class BaselineManager {
  private readonly filePath: string
  private store: BaselineStore

  constructor(baseDir = BASELINE_DIR) {
    this.filePath = join(baseDir, BASELINE_FILE)
    this.store = this.load(baseDir)
  }

  private load(baseDir: string): BaselineStore {
    if (!existsSync(this.filePath)) {
      return { version: '1.0', entries: {} }
    }
    try {
      const raw = readFileSync(this.filePath, 'utf8')
      return JSON.parse(raw) as BaselineStore
    } catch {
      return { version: '1.0', entries: {} }
    }
  }

  getBaseline(path: string): BaselineEntry | null {
    return this.store.entries[path] ?? null
  }

  upsertBaseline(path: string, scores: CognitiveScoreResponse, commitSha: string | null): void {
    this.store.entries[path] = {
      path,
      scores: {
        cognitive_load: scores.cognitive_load,
        manipulation_risk: scores.manipulation_risk,
        comprehension_confidence: scores.comprehension_confidence,
        trust_coherence: scores.trust_coherence,
      },
      createdAt: this.store.entries[path]?.createdAt ?? new Date().toISOString(),
      commitSha,
    }
    this.save()
  }

  computeDelta(path: string, current: CognitiveScoreResponse): BaselineDelta | null {
    const baseline = this.getBaseline(path)
    if (baseline === null) return null

    return {
      cognitive_load: parseFloat((current.cognitive_load - baseline.scores.cognitive_load).toFixed(2)),
      manipulation_risk: parseFloat((current.manipulation_risk - baseline.scores.manipulation_risk).toFixed(2)),
      comprehension_confidence: parseFloat((current.comprehension_confidence - baseline.scores.comprehension_confidence).toFixed(2)),
      trust_coherence: parseFloat((current.trust_coherence - baseline.scores.trust_coherence).toFixed(2)),
    }
  }

  private save(): void {
    const dir = join(this.filePath, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), 'utf8')
  }
}
